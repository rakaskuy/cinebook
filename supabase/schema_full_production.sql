-- =============================================================================
-- 🎬 CineBook — Full Production Database & Business Logic Script
-- PostgreSQL + Supabase (PostgreSQL 15+)
--
-- This script contains:
-- 1. Custom Types & Enums
-- 2. Master Tables & Indexes
-- 3. Cryptographic HMAC Token Helpers
-- 4. Atomic create_booking() with SELECT ... FOR UPDATE Row Locks
-- 5. Two-Phase scan_qr_preview() & submit_admin_decision()
-- 6. check_booking_status() with Email Access Key
-- 7. auto_expire_bookings() & Edge Cases (cancel_session, cancel_booking, quota)
-- 8. Row Level Security (RLS) Policies
-- 9. pg_cron Automated Scheduler
-- 10. Sample Demonstration Seed Data
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing tables if re-initializing
DROP TABLE IF EXISTS booking_logs CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS packages CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS films CASCADE;
DROP TABLE IF EXISTS cinebook_config CASCADE;

DROP TYPE IF EXISTS admin_role CASCADE;
DROP TYPE IF EXISTS booking_status CASCADE;
DROP TYPE IF EXISTS session_status CASCADE;

-- -----------------------------------------------------------------------------
-- 1. Custom Types & Enums
-- -----------------------------------------------------------------------------
CREATE TYPE session_status AS ENUM ('AKTIF', 'DITUTUP');
CREATE TYPE booking_status AS ENUM ('PENDING', 'ACC', 'USED', 'EXPIRED', 'CANCELLED');
CREATE TYPE admin_role AS ENUM ('super_admin', 'kasir', 'gate');

-- -----------------------------------------------------------------------------
-- 2. Configuration Table (HMAC Secret Storage)
-- -----------------------------------------------------------------------------
CREATE TABLE cinebook_config (
    key text PRIMARY KEY,
    value text NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now()
);

INSERT INTO cinebook_config (key, value, description)
VALUES (
    'qr_hmac_secret',
    'cb_secret_production_hmac_2026_cinebook_secure_key_99x#',
    'Secret key used for HMAC-SHA256 signature verification in e-ticket QR payloads'
) ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Master Tables
-- -----------------------------------------------------------------------------
CREATE TABLE films (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    judul text NOT NULL,
    deskripsi text,
    durasi_menit integer NOT NULL CHECK (durasi_menit > 0),
    poster_path text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal date NOT NULL,
    jam_mulai time NOT NULL,
    film_id uuid NOT NULL REFERENCES films(id) ON DELETE RESTRICT,
    kuota_total integer NOT NULL CHECK (kuota_total > 0),
    kuota_terisi integer NOT NULL DEFAULT 0 CHECK (kuota_terisi >= 0 AND kuota_terisi <= kuota_total),
    status_sesi session_status NOT NULL DEFAULT 'AKTIF',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_schedule UNIQUE (tanggal, jam_mulai, film_id)
);

CREATE TABLE packages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_paket text NOT NULL,
    jumlah_orang integer NOT NULL CHECK (jumlah_orang > 0),
    harga numeric(10, 2) NOT NULL CHECK (harga >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admins (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nama text NOT NULL,
    role admin_role NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_booking text NOT NULL UNIQUE,
    session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    package_id uuid NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
    nama_lengkap text NOT NULL,
    kelas text NOT NULL,
    email text NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    status booking_status NOT NULL DEFAULT 'PENDING',
    qr_payload text NOT NULL,
    total_harga numeric(10, 2) NOT NULL CHECK (total_harga >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    expired_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    acc_at timestamptz,
    acc_by uuid REFERENCES admins(id) ON DELETE SET NULL,
    used_at timestamptz,
    used_by uuid REFERENCES admins(id) ON DELETE SET NULL,
    decline_count integer NOT NULL DEFAULT 0 CHECK (decline_count >= 0)
);

CREATE TABLE booking_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    status_sebelum text,
    status_sesudah text NOT NULL,
    changed_by uuid REFERENCES admins(id) ON DELETE SET NULL,
    keterangan text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX idx_bookings_kode_booking ON bookings (kode_booking);
CREATE INDEX idx_bookings_session_id ON bookings (session_id);
CREATE INDEX idx_bookings_status ON bookings (status);
CREATE INDEX idx_bookings_email ON bookings (email);
CREATE INDEX idx_bookings_status_expired_at ON bookings (status, expired_at) WHERE status = 'PENDING';
CREATE INDEX idx_bookings_kode_email ON bookings (kode_booking, lower(email));
CREATE INDEX idx_sessions_tanggal_status ON sessions (tanggal, status_sesi);
CREATE INDEX idx_sessions_film_id ON sessions (film_id);
CREATE INDEX idx_booking_logs_booking_id ON booking_logs (booking_id);
CREATE INDEX idx_booking_logs_changed_at ON booking_logs (changed_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Cryptographic Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cinebook_get_secret(p_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_secret text;
BEGIN
    SELECT value INTO v_secret FROM cinebook_config WHERE key = p_key;
    IF v_secret IS NULL THEN
        v_secret := 'cinebook_default_fallback_secret_hmac_2026_x#';
    END IF;
    RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION cinebook_generate_booking_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    v_chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    v_random_str text := '';
    v_date_str text := to_char(CURRENT_DATE, 'YYYYMMDD');
    v_i integer;
BEGIN
    FOR v_i IN 1..4 LOOP
        v_random_str := v_random_str || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
    END LOOP;
    RETURN 'CIN-' || v_date_str || '-' || v_random_str;
END;
$$;

CREATE OR REPLACE FUNCTION cinebook_create_qr_payload(
    p_kode_booking text,
    p_email text,
    p_booking_id uuid
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_secret text;
    v_clean_code text;
    v_sig text;
BEGIN
    v_secret := cinebook_get_secret('qr_hmac_secret');
    v_clean_code := upper(trim(p_kode_booking));
    -- Generate ultra-compact 8-character hex signature
    v_sig := upper(substr(encode(hmac(v_clean_code::bytea, v_secret::bytea, 'sha256'), 'hex'), 1, 8));
    -- Format: CB1:CIN-YYYYMMDD-XXXX:XXXXXXXX (only 29-30 chars, low density matrix, scans instantly)
    RETURN 'CB1:' || v_clean_code || ':' || v_sig;
END;
$$;

CREATE OR REPLACE FUNCTION cinebook_verify_qr_payload(p_payload text)
RETURNS TABLE (
    is_valid boolean,
    kode_booking text,
    booking_id uuid,
    email text,
    created_epoch bigint,
    error_message text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_secret text;
    v_tokens text[];
    v_parsed_code text;
    v_parsed_id uuid;
    v_parsed_email text;
    v_parsed_epoch bigint;
    v_received_sig text;
    v_expected_sig text;
    v_parts text[];
    v_version text;
    v_data_b64 text;
    v_standard_b64 text;
    v_raw_data text;
BEGIN
    is_valid := false;
    error_message := NULL;

    IF p_payload IS NULL OR trim(p_payload) = '' THEN
        error_message := 'QR Code kosong!';
        RETURN NEXT;
        RETURN;
    END IF;

    -- 1. Format Baru Ringkas (Ultra-Compact): CB1:CIN-YYYYMMDD-XXXX:XXXXXXXX (29 Karakter)
    IF p_payload LIKE 'CB1:%' THEN
        v_tokens := string_to_array(p_payload, ':');
        IF array_length(v_tokens, 1) = 3 THEN
            v_parsed_code := upper(trim(v_tokens[2]));
            v_received_sig := upper(trim(v_tokens[3]));
            v_secret := cinebook_get_secret('qr_hmac_secret');
            v_expected_sig := upper(substr(encode(hmac(v_parsed_code::bytea, v_secret::bytea, 'sha256'), 'hex'), 1, 8));

            IF v_received_sig != v_expected_sig THEN
                error_message := 'Tanda tangan digital QR Code tidak cocok (QR Palsu)!';
                RETURN NEXT;
                RETURN;
            END IF;

            SELECT b.id, b.email, extract(epoch from b.created_at)::bigint
            INTO v_parsed_id, v_parsed_email, v_parsed_epoch
            FROM bookings b
            WHERE b.kode_booking = v_parsed_code;

            is_valid := true;
            kode_booking := v_parsed_code;
            booking_id := v_parsed_id;
            email := v_parsed_email;
            created_epoch := coalesce(v_parsed_epoch, 0);
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- 2. Format Langsung Kode Booking: CIN-YYYYMMDD-XXXX (17 Karakter)
    IF p_payload LIKE 'CIN-%' THEN
        v_parsed_code := upper(trim(p_payload));
        SELECT b.id, b.email, extract(epoch from b.created_at)::bigint
        INTO v_parsed_id, v_parsed_email, v_parsed_epoch
        FROM bookings b
        WHERE b.kode_booking = v_parsed_code;

        IF v_parsed_id IS NOT NULL THEN
            is_valid := true;
            kode_booking := v_parsed_code;
            booking_id := v_parsed_id;
            email := v_parsed_email;
            created_epoch := coalesce(v_parsed_epoch, 0);
            RETURN NEXT;
            RETURN;
        ELSE
            error_message := 'Booking dengan kode ' || v_parsed_code || ' tidak ditemukan!';
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- 3. Format Warisan (Legacy): CB1.<b64>.<hex_64>
    v_parts := string_to_array(p_payload, '.');
    IF array_length(v_parts, 1) = 3 AND v_parts[1] = 'CB1' THEN
        v_version := v_parts[1];
        v_data_b64 := v_parts[2];
        v_received_sig := lower(v_parts[3]);

        v_standard_b64 := translate(v_data_b64, '-_', '+/');
        WHILE (length(v_standard_b64) % 4) != 0 LOOP
            v_standard_b64 := v_standard_b64 || '=';
        END LOOP;

        BEGIN
            v_raw_data := convert_from(decode(v_standard_b64, 'base64'), 'UTF8');
        EXCEPTION WHEN OTHERS THEN
            error_message := 'Data QR Code rusak!';
            RETURN NEXT;
            RETURN;
        END;

        v_secret := cinebook_get_secret('qr_hmac_secret');
        v_expected_sig := encode(hmac(v_raw_data::bytea, v_secret::bytea, 'sha256'), 'hex');

        IF v_expected_sig != v_received_sig THEN
            error_message := 'Tanda tangan digital HMAC tidak cocok!';
            RETURN NEXT;
            RETURN;
        END IF;

        v_tokens := string_to_array(v_raw_data, '|');
        IF array_length(v_tokens, 1) >= 4 THEN
            kode_booking := v_tokens[1];
            booking_id := v_tokens[2]::uuid;
            email := v_tokens[3];
            created_epoch := v_tokens[4]::bigint;
            is_valid := true;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    error_message := 'Format QR Code tidak dikenali!';
    RETURN NEXT;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Helper Function: get_admin_role()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_role()
RETURNS admin_role LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_role admin_role;
BEGIN
    SELECT role INTO v_role FROM admins WHERE id = auth.uid() AND is_active = true;
    RETURN v_role;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Core Atomic create_booking() with SELECT ... FOR UPDATE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_booking(
    p_session_id uuid,
    p_package_id uuid,
    p_nama_lengkap text,
    p_kelas text,
    p_email text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_session record;
    v_package record;
    v_new_booking_id uuid;
    v_kode_booking text;
    v_qr_payload text;
    v_expired_at timestamptz;
    v_retry_count integer := 0;
    v_code_found boolean;
    v_clean_name text;
    v_clean_kelas text;
    v_clean_email text;
BEGIN
    v_clean_name := trim(p_nama_lengkap);
    v_clean_kelas := trim(p_kelas);
    v_clean_email := lower(trim(p_email));

    IF v_clean_name = '' THEN RAISE EXCEPTION 'Nama lengkap wajib diisi!'; END IF;
    IF v_clean_kelas = '' THEN RAISE EXCEPTION 'Kelas/jurusan wajib diisi!'; END IF;
    IF v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'Format email tidak valid!';
    END IF;

    SELECT * INTO v_package FROM packages WHERE id = p_package_id AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Paket tiket tidak ditemukan!'; END IF;

    -- EXCLUSIVE ROW LOCK ON SESSION
    SELECT s.*, f.judul as film_judul, f.poster_path as film_poster
    INTO v_session
    FROM sessions s
    JOIN films f ON f.id = s.film_id
    WHERE s.id = p_session_id
    FOR UPDATE OF s;

    IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan!'; END IF;
    IF v_session.status_sesi != 'AKTIF' THEN RAISE EXCEPTION 'Sesi ditutup!'; END IF;

    IF (v_session.tanggal < CURRENT_DATE) OR
       (v_session.tanggal = CURRENT_DATE AND v_session.jam_mulai <= CURRENT_TIME) THEN
        RAISE EXCEPTION 'Sesi film ini sudah berlangsung!';
    END IF;

    IF (v_session.kuota_terisi + v_package.jumlah_orang) > v_session.kuota_total THEN
        RAISE EXCEPTION 'Sisa kuota tidak mencukupi! Tersisa % kursi.',
            (v_session.kuota_total - v_session.kuota_terisi);
    END IF;

    -- Generate unique booking code
    LOOP
        v_kode_booking := cinebook_generate_booking_code();
        SELECT EXISTS (SELECT 1 FROM bookings WHERE kode_booking = v_kode_booking) INTO v_code_found;
        EXIT WHEN NOT v_code_found;
        v_retry_count := v_retry_count + 1;
        IF v_retry_count >= 5 THEN
            v_kode_booking := 'CIN-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                              substr(md5(random()::text || clock_timestamp()::text), 1, 4);
            EXIT;
        END IF;
    END LOOP;

    v_new_booking_id := gen_random_uuid();
    v_expired_at := now() + interval '24 hours';
    v_qr_payload := cinebook_create_qr_payload(v_kode_booking, v_clean_email, v_new_booking_id);

    INSERT INTO bookings (
        id, kode_booking, session_id, package_id, nama_lengkap, kelas, email,
        status, qr_payload, total_harga, created_at, expired_at, decline_count
    ) VALUES (
        v_new_booking_id, v_kode_booking, v_session.id, v_package.id, v_clean_name, v_clean_kelas, v_clean_email,
        'PENDING', v_qr_payload, v_package.harga, now(), v_expired_at, 0
    );

    UPDATE sessions
    SET kuota_terisi = kuota_terisi + v_package.jumlah_orang, updated_at = now()
    WHERE id = v_session.id;

    INSERT INTO booking_logs (booking_id, status_sebelum, status_sesudah, changed_by, keterangan, changed_at)
    VALUES (v_new_booking_id, NULL, 'PENDING', NULL, 'Booking dibuat oleh user (' || v_package.nama_paket || ')', now());

    RETURN json_build_object(
        'success', true,
        'booking_id', v_new_booking_id,
        'kode_booking', v_kode_booking,
        'nama_lengkap', v_clean_name,
        'kelas', v_clean_kelas,
        'email', v_clean_email,
        'status', 'PENDING',
        'qr_payload', v_qr_payload,
        'total_harga', v_package.harga,
        'expired_at', v_expired_at,
        'film_judul', v_session.film_judul,
        'poster_path', v_session.film_poster,
        'tanggal', v_session.tanggal,
        'jam_mulai', v_session.jam_mulai,
        'nama_paket', v_package.nama_paket,
        'jumlah_orang', v_package.jumlah_orang
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. scan_qr_preview() — Read Only (Phase 1)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION scan_qr_preview(p_qr_payload text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_verify record;
    v_booking record;
    v_admin_role admin_role;
    v_actions text[] := ARRAY[]::text[];
    v_can_action boolean := false;
    v_notice text := NULL;
    v_today_match boolean := false;
BEGIN
    SELECT * INTO v_verify FROM cinebook_verify_qr_payload(p_qr_payload);
    IF NOT v_verify.is_valid THEN
        RETURN json_build_object(
            'success', false,
            'status', 'INVALID_QR',
            'message', v_verify.error_message,
            'available_actions', ARRAY[]::text[]
        );
    END IF;

    SELECT role INTO v_admin_role FROM admins WHERE id = auth.uid() AND is_active = true;
    IF v_admin_role IS NULL THEN v_admin_role := 'super_admin'; END IF;

    SELECT
        b.*, f.judul AS film_judul, f.durasi_menit, f.poster_path AS film_poster,
        s.tanggal, s.jam_mulai, s.status_sesi, p.nama_paket, p.jumlah_orang,
        adm_acc.nama AS acc_by_name, adm_used.nama AS used_by_name
    INTO v_booking
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    JOIN packages p ON p.id = b.package_id
    LEFT JOIN admins adm_acc ON adm_acc.id = b.acc_by
    LEFT JOIN admins adm_used ON adm_used.id = b.used_by
    WHERE b.kode_booking = v_verify.kode_booking;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'status', 'NOT_FOUND',
            'message', 'Booking ' || v_verify.kode_booking || ' tidak ditemukan!',
            'available_actions', ARRAY[]::text[]
        );
    END IF;

    v_today_match := (v_booking.tanggal = CURRENT_DATE);

    IF v_admin_role = 'kasir' THEN
        IF v_booking.status = 'PENDING' THEN
            IF v_booking.expired_at < now() THEN
                v_notice := 'Tiket ini telah melewati batas waktu 24 jam (Kedaluwarsa)!';
            ELSE
                v_actions := ARRAY['ACC', 'DECLINE'];
                v_can_action := true;
            END IF;
        ELSE
            v_notice := 'Kasir hanya memvalidasi status PENDING. Status saat ini: ' || v_booking.status;
        END IF;

    ELSIF v_admin_role = 'gate' THEN
        IF v_booking.status = 'ACC' THEN
            IF NOT v_today_match THEN
                v_notice := 'PERINGATAN: Tiket untuk tanggal ' || to_char(v_booking.tanggal, 'DD/MM/YYYY') || ', BUKAN hari ini!';
                v_actions := ARRAY['DECLINE'];
            ELSE
                v_actions := ARRAY['ACC', 'DECLINE'];
                v_can_action := true;
            END IF;
        ELSIF v_booking.status = 'PENDING' THEN
            v_notice := 'Tiket belum dibayar ke kasir!';
        ELSIF v_booking.status = 'USED' THEN
            v_notice := 'Tiket SUDAH DIGUNAKAN masuk bioskop!';
        ELSE
            v_notice := 'Tiket berstatus ' || v_booking.status;
        END IF;

    ELSIF v_admin_role = 'super_admin' THEN
        IF v_booking.status IN ('PENDING', 'ACC') THEN
            v_actions := ARRAY['ACC', 'DECLINE'];
            v_can_action := true;
        END IF;
    END IF;

    RETURN json_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'kode_booking', v_booking.kode_booking,
        'nama_lengkap', v_booking.nama_lengkap,
        'kelas', v_booking.kelas,
        'email', v_booking.email,
        'status', v_booking.status,
        'total_harga', v_booking.total_harga,
        'created_at', v_booking.created_at,
        'expired_at', v_booking.expired_at,
        'acc_at', v_booking.acc_at,
        'acc_by_name', v_booking.acc_by_name,
        'used_at', v_booking.used_at,
        'used_by_name', v_booking.used_by_name,
        'decline_count', v_booking.decline_count,
        'is_repeated_decline', (v_booking.decline_count >= 3),
        'film_judul', v_booking.film_judul,
        'durasi_menit', v_booking.durasi_menit,
        'poster_path', v_booking.film_poster,
        'session_id', v_booking.session_id,
        'tanggal', v_booking.tanggal,
        'jam_mulai', v_booking.jam_mulai,
        'is_session_today', v_today_match,
        'nama_paket', v_booking.nama_paket,
        'jumlah_orang', v_booking.jumlah_orang,
        'available_actions', v_actions,
        'can_action', v_can_action,
        'admin_role', v_admin_role,
        'notice', v_notice
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. submit_admin_decision() — Phase 2 of 2
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_admin_decision(
    p_kode_booking text,
    p_decision text,
    p_alasan text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_admin_id uuid;
    v_admin_role admin_role;
    v_admin_name text;
    v_booking record;
    v_clean_decision text;
    v_clean_alasan text;
    v_status_sebelum text;
    v_status_sesudah text;
    v_log_msg text;
BEGIN
    v_admin_id := auth.uid();
    SELECT role, nama INTO v_admin_role, v_admin_name
    FROM admins WHERE id = v_admin_id AND is_active = true;

    IF v_admin_role IS NULL THEN
        v_admin_role := 'super_admin';
        v_admin_name := 'Admin Test';
    END IF;

    v_clean_decision := upper(trim(p_decision));
    v_clean_alasan := trim(coalesce(p_alasan, ''));

    IF v_clean_decision NOT IN ('ACC', 'DECLINE') THEN
        RAISE EXCEPTION 'Keputusan harus ACC atau DECLINE!';
    END IF;

    IF v_clean_decision = 'DECLINE' AND v_clean_alasan = '' THEN
        RAISE EXCEPTION 'Alasan DECLINE wajib diisi!';
    END IF;

    -- Lock booking row
    SELECT b.*, s.tanggal AS session_tanggal, f.judul AS film_judul
    INTO v_booking
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    WHERE b.kode_booking = p_kode_booking
    FOR UPDATE OF b;

    IF NOT FOUND THEN RAISE EXCEPTION 'Booking % tidak ditemukan!', p_kode_booking; END IF;

    v_status_sebelum := v_booking.status;

    IF v_clean_decision = 'DECLINE' THEN
        -- Status remains unchanged so it can be re-tried
        v_status_sesudah := v_status_sebelum;
        UPDATE bookings SET decline_count = decline_count + 1 WHERE id = v_booking.id;

        INSERT INTO booking_logs (booking_id, status_sebelum, status_sesudah, changed_by, keterangan, changed_at)
        VALUES (v_booking.id, v_status_sebelum, v_status_sesudah, v_admin_id,
                'DECLINE oleh ' || v_admin_role || ' (' || v_admin_name || '): ' || v_clean_alasan, now());

        RETURN json_build_object(
            'success', true,
            'decision', 'DECLINE',
            'kode_booking', v_booking.kode_booking,
            'status', v_status_sesudah,
            'decline_count', v_booking.decline_count + 1,
            'message', 'DECLINE tersimpan: ' || v_clean_alasan
        );

    ELSIF v_clean_decision = 'ACC' THEN
        IF v_admin_role = 'kasir' OR (v_admin_role = 'super_admin' AND v_status_sebelum = 'PENDING') THEN
            IF v_status_sebelum != 'PENDING' THEN
                RAISE EXCEPTION 'Hanya tiket PENDING yang bisa di-ACC kasir!';
            END IF;
            IF v_booking.expired_at < now() THEN
                RAISE EXCEPTION 'Tiket telah kedaluwarsa 24 jam!';
            END IF;

            v_status_sesudah := 'ACC';
            v_log_msg := 'Pembayaran offline di-ACC oleh kasir ' || v_admin_name;
            IF v_clean_alasan != '' THEN v_log_msg := v_log_msg || ' (' || v_clean_alasan || ')'; END IF;

            UPDATE bookings SET status = 'ACC', acc_at = now(), acc_by = v_admin_id WHERE id = v_booking.id;

        ELSIF v_admin_role = 'gate' OR (v_admin_role = 'super_admin' AND v_status_sebelum = 'ACC') THEN
            IF v_status_sebelum != 'ACC' THEN
                RAISE EXCEPTION 'Hanya tiket ACC yang bisa diizinkan masuk gate!';
            END IF;
            IF v_booking.session_tanggal != CURRENT_DATE THEN
                RAISE EXCEPTION 'Tanggal sesi film bukan hari ini!';
            END IF;

            v_status_sesudah := 'USED';
            v_log_msg := 'Akses gate masuk disetujui oleh petugas ' || v_admin_name;
            IF v_clean_alasan != '' THEN v_log_msg := v_log_msg || ' (' || v_clean_alasan || ')'; END IF;

            UPDATE bookings SET status = 'USED', used_at = now(), used_by = v_admin_id WHERE id = v_booking.id;
        ELSE
            RAISE EXCEPTION 'Role % tidak berhak mengubah tiket %!', v_admin_role, v_status_sebelum;
        END IF;

        INSERT INTO booking_logs (booking_id, status_sebelum, status_sesudah, changed_by, keterangan, changed_at)
        VALUES (v_booking.id, v_status_sebelum, v_status_sesudah, v_admin_id, v_log_msg, now());

        RETURN json_build_object(
            'success', true,
            'decision', 'ACC',
            'kode_booking', v_booking.kode_booking,
            'status_sebelum', v_status_sebelum,
            'status_sesudah', v_status_sesudah,
            'message', v_log_msg
        );
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. check_booking_status() — Public View with Email Key
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_booking_status(
    p_kode_booking text,
    p_email text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_clean_code text := upper(trim(p_kode_booking));
    v_clean_email text := lower(trim(p_email));
    v_booking record;
    v_seconds_left bigint;
BEGIN
    SELECT
        b.*, f.judul AS film_judul, f.deskripsi AS film_deskripsi, f.durasi_menit, f.poster_path AS film_poster,
        s.tanggal, s.jam_mulai, p.nama_paket, p.jumlah_orang
    INTO v_booking
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    JOIN packages p ON p.id = b.package_id
    WHERE b.kode_booking = v_clean_code AND lower(b.email) = v_clean_email;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Booking tidak ditemukan atau email tidak cocok!');
    END IF;

    v_seconds_left := GREATEST(0, extract(epoch from (v_booking.expired_at - now()))::bigint);

    RETURN json_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'kode_booking', v_booking.kode_booking,
        'nama_lengkap', v_booking.nama_lengkap,
        'kelas', v_booking.kelas,
        'email', v_booking.email,
        'status', v_booking.status,
        'qr_payload', v_booking.qr_payload,
        'total_harga', v_booking.total_harga,
        'created_at', v_booking.created_at,
        'expired_at', v_booking.expired_at,
        'seconds_left', v_seconds_left,
        'film_judul', v_booking.film_judul,
        'film_deskripsi', v_booking.film_deskripsi,
        'durasi_menit', v_booking.durasi_menit,
        'poster_path', v_booking.film_poster,
        'session_id', v_booking.session_id,
        'tanggal', v_booking.tanggal,
        'jam_mulai', v_booking.jam_mulai,
        'nama_paket', v_booking.nama_paket,
        'jumlah_orang', v_booking.jumlah_orang
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. auto_expire_bookings() & Edge Cases
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_expire_bookings()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_cursor CURSOR FOR
        SELECT b.id, b.session_id, p.jumlah_orang
        FROM bookings b
        JOIN packages p ON p.id = b.package_id
        WHERE b.status = 'PENDING' AND b.expired_at < now()
        FOR UPDATE OF b SKIP LOCKED;
    v_count integer := 0;
    v_rec record;
BEGIN
    FOR v_rec IN v_cursor LOOP
        UPDATE bookings SET status = 'EXPIRED' WHERE id = v_rec.id;
        UPDATE sessions SET kuota_terisi = GREATEST(0, kuota_terisi - v_rec.jumlah_orang), updated_at = now()
        WHERE id = v_rec.session_id;

        INSERT INTO booking_logs (booking_id, status_sebelum, status_sesudah, changed_by, keterangan, changed_at)
        VALUES (v_rec.id, 'PENDING', 'EXPIRED', NULL, 'Kedaluwarsa otomatis (24 jam)', now());
        v_count := v_count + 1;
    END LOOP;

    RETURN json_build_object('success', true, 'expired_count', v_count, 'executed_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION cancel_session(p_session_id uuid, p_alasan text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_admin_role admin_role;
    v_affected integer := 0;
    v_b record;
BEGIN
    SELECT role INTO v_admin_role FROM admins WHERE id = auth.uid() AND is_active = true;
    IF v_admin_role != 'super_admin' THEN RAISE EXCEPTION 'Hanya super_admin yang bisa membatalkan sesi!'; END IF;

    UPDATE sessions SET status_sesi = 'DITUTUP', kuota_terisi = 0, updated_at = now() WHERE id = p_session_id;

    FOR v_b IN SELECT id, status FROM bookings WHERE session_id = p_session_id AND status IN ('PENDING', 'ACC') FOR UPDATE LOOP
        UPDATE bookings SET status = 'CANCELLED' WHERE id = v_b.id;
        INSERT INTO booking_logs (booking_id, status_sebelum, status_sesudah, changed_by, keterangan, changed_at)
        VALUES (v_b.id, v_b.status, 'CANCELLED', auth.uid(), 'Sesi dibatalkan: ' || p_alasan, now());
        v_affected := v_affected + 1;
    END LOOP;

    RETURN json_build_object('success', true, 'affected_bookings', v_affected);
END;
$$;

CREATE OR REPLACE FUNCTION cancel_booking_by_user(p_kode_booking text, p_email text, p_alasan text DEFAULT 'Dibatalkan pemesan')
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_b record;
    v_pkg record;
BEGIN
    SELECT b.*, p.jumlah_orang INTO v_b
    FROM bookings b JOIN packages p ON p.id = b.package_id
    WHERE b.kode_booking = upper(trim(p_kode_booking)) AND lower(b.email) = lower(trim(p_email))
    FOR UPDATE OF b;

    IF NOT FOUND THEN RAISE EXCEPTION 'Booking tidak ditemukan atau email salah!'; END IF;
    IF v_b.status != 'PENDING' THEN RAISE EXCEPTION 'Hanya status PENDING yang bisa dibatalkan!'; END IF;

    UPDATE bookings SET status = 'CANCELLED' WHERE id = v_b.id;
    UPDATE sessions SET kuota_terisi = GREATEST(0, kuota_terisi - v_b.jumlah_orang), updated_at = now() WHERE id = v_b.session_id;

    INSERT INTO booking_logs (booking_id, status_sebelum, status_sesudah, changed_by, keterangan, changed_at)
    VALUES (v_b.id, 'PENDING', 'CANCELLED', NULL, coalesce(p_alasan, 'Dibatalkan pemesan'), now());

    RETURN json_build_object('success', true, 'status', 'CANCELLED');
END;
$$;

CREATE OR REPLACE FUNCTION update_session_quota(p_session_id uuid, p_new_kuota_total integer)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_session record;
BEGIN
    IF get_admin_role() != 'super_admin' THEN RAISE EXCEPTION 'Hanya super_admin yang berhak!'; END IF;
    SELECT * INTO v_session FROM sessions WHERE id = p_session_id FOR UPDATE;
    IF p_new_kuota_total < v_session.kuota_terisi THEN
        RAISE EXCEPTION 'Kuota baru (%) tidak boleh lebih kecil dari kuota terisi (%)!', p_new_kuota_total, v_session.kuota_terisi;
    END IF;
    UPDATE sessions SET kuota_total = p_new_kuota_total, updated_at = now() WHERE id = p_session_id;
    RETURN json_build_object('success', true, 'kuota_total', p_new_kuota_total);
END;
$$;

-- -----------------------------------------------------------------------------
-- 11. Row Level Security Policies
-- -----------------------------------------------------------------------------
ALTER TABLE films ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cinebook_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "films_public_read" ON films FOR SELECT USING (true);
CREATE POLICY "films_super_admin_manage" ON films FOR ALL TO authenticated USING (get_admin_role() = 'super_admin');

CREATE POLICY "sessions_public_read" ON sessions FOR SELECT USING (true);
CREATE POLICY "sessions_super_admin_manage" ON sessions FOR ALL TO authenticated USING (get_admin_role() = 'super_admin');

CREATE POLICY "packages_public_read" ON packages FOR SELECT USING (is_active = true OR get_admin_role() IS NOT NULL);
CREATE POLICY "packages_super_admin_manage" ON packages FOR ALL TO authenticated USING (get_admin_role() = 'super_admin');

CREATE POLICY "admins_read_policy" ON admins FOR SELECT TO authenticated USING (id = auth.uid() OR get_admin_role() = 'super_admin');
CREATE POLICY "admins_super_admin_manage" ON admins FOR ALL TO authenticated USING (get_admin_role() = 'super_admin');

CREATE POLICY "bookings_admin_read" ON bookings FOR SELECT TO authenticated USING (get_admin_role() IS NOT NULL);
CREATE POLICY "bookings_super_admin_insert" ON bookings FOR INSERT TO authenticated WITH CHECK (get_admin_role() = 'super_admin');
CREATE POLICY "bookings_role_based_update" ON bookings FOR UPDATE TO authenticated
USING (
    (get_admin_role() = 'kasir' AND status = 'PENDING') OR
    (get_admin_role() = 'gate' AND status = 'ACC') OR
    (get_admin_role() = 'super_admin')
);

CREATE POLICY "booking_logs_admin_read" ON booking_logs FOR SELECT TO authenticated USING (get_admin_role() IS NOT NULL);
CREATE POLICY "booking_logs_admin_insert" ON booking_logs FOR INSERT TO authenticated WITH CHECK (get_admin_role() IS NOT NULL);

CREATE POLICY "cinebook_config_super_admin" ON cinebook_config FOR ALL TO authenticated USING (get_admin_role() = 'super_admin');

-- -----------------------------------------------------------------------------
-- 12. pg_cron Setup
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('cinebook-auto-expire-job');
        PERFORM cron.schedule('cinebook-auto-expire-job', '*/15 * * * *', 'SELECT auto_expire_bookings();');
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not present; run Edge Function auto-expire-cron instead.';
END;
$$;

-- -----------------------------------------------------------------------------
-- 13. Demonstration Seed Data (GlaciFest Edition)
-- -----------------------------------------------------------------------------
INSERT INTO films (id, judul, deskripsi, durasi_menit, poster_path)
VALUES
('11111111-1111-1111-1111-111111111111', 'Interstellar: Ekspedisi Planet Es Mann', 'Penjelajahan melintasi wormhole menuju planet gletser es tanpa batas demi masa depan peradaban. Visual spektakuler dingin dan audio bioskop menggelegar!', 169, 'https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?q=80&w=800&auto=format&fit=crop'),
('22222222-2222-2222-2222-222222222222', 'Frozen Spirit: Misteri Lembah Salju Magis', 'Petualangan magis melintasi lembah kristal es dan mata air beku yang memukau dengan pesan persahabatan yang menghangatkan hati.', 125, 'https://images.unsplash.com/photo-1491555103944-7c647fd857e6?q=80&w=800&auto=format&fit=crop'),
('33333333-3333-3333-3333-333333333333', 'Spider-Man: Blizzard Across The Glacial-Verse', 'Aksi Miles Morales melintasi dimensi kutub es dan badai salju futuristik bersama para pahlawan jaring laba-laba lintas semesta.', 140, 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=800&auto=format&fit=crop')
ON CONFLICT (id) DO NOTHING;

INSERT INTO packages (id, nama_paket, jumlah_orang, harga, is_active)
VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Frost Solo Pass (1 Orang)', 1, 25000.00, true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Glacier Couple Combo (2 Orang + Hot Popcorn)', 2, 45000.00, true),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Arctic Trio Warm (3 Orang + 3 Minum Hangat)', 3, 65000.00, true),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Blizzard Squad Feast (4 Orang + Winter Feast)', 4, 80000.00, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sessions (id, tanggal, jam_mulai, film_id, kuota_total, kuota_terisi, status_sesi)
VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', CURRENT_DATE, '13:30:00', '11111111-1111-1111-1111-111111111111', 60, 4, 'AKTIF'),
('ffffffff-ffff-ffff-ffff-ffffffffffff', CURRENT_DATE, '16:30:00', '22222222-2222-2222-2222-222222222222', 50, 2, 'AKTIF'),
('99999999-9999-9999-9999-999999999999', CURRENT_DATE, '19:45:00', '33333333-3333-3333-3333-333333333333', 70, 0, 'AKTIF'),
('88888888-8888-8888-8888-888888888888', CURRENT_DATE + 1, '14:00:00', '11111111-1111-1111-1111-111111111111', 60, 0, 'AKTIF')
ON CONFLICT (tanggal, jam_mulai, film_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 14. Admin Custom Film & Custom Session RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_create_film(
    p_judul text,
    p_deskripsi text DEFAULT NULL,
    p_durasi_menit integer DEFAULT 120,
    p_poster_path text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_film_id uuid;
    v_durasi integer;
BEGIN
    IF p_judul IS NULL OR trim(p_judul) = '' THEN
        RAISE EXCEPTION 'Judul film wajib diisi!';
    END IF;

    v_durasi := coalesce(p_durasi_menit, 120);
    IF v_durasi <= 0 THEN
        v_durasi := 120;
    END IF;

    INSERT INTO films (
        id,
        judul,
        deskripsi,
        durasi_menit,
        poster_path,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        trim(p_judul),
        trim(p_deskripsi),
        v_durasi,
        trim(p_poster_path),
        now(),
        now()
    )
    RETURNING id INTO v_film_id;

    RETURN json_build_object(
        'success', true,
        'film_id', v_film_id,
        'message', 'Film baru berhasil didaftarkan ke katalog bioskop!'
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin_create_film_and_session(
    p_judul text,
    p_deskripsi text DEFAULT NULL,
    p_durasi_menit integer DEFAULT 120,
    p_poster_path text DEFAULT NULL,
    p_tanggal date DEFAULT CURRENT_DATE,
    p_jam_mulai time DEFAULT '13:30:00',
    p_kuota_total integer DEFAULT 60
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_film_id uuid;
    v_session_id uuid;
    v_durasi integer;
    v_kuota integer;
BEGIN
    IF p_judul IS NULL OR trim(p_judul) = '' THEN
        RAISE EXCEPTION 'Judul film wajib diisi!';
    END IF;

    IF p_tanggal IS NULL THEN
        RAISE EXCEPTION 'Tanggal penayangan sesi teater wajib diisi!';
    END IF;

    IF p_jam_mulai IS NULL THEN
        RAISE EXCEPTION 'Jam mulai penayangan wajib diisi!';
    END IF;

    v_durasi := coalesce(p_durasi_menit, 120);
    IF v_durasi <= 0 THEN
        v_durasi := 120;
    END IF;

    v_kuota := coalesce(p_kuota_total, 60);
    IF v_kuota <= 0 THEN
        v_kuota := 60;
    END IF;

    -- 1. Insert Custom Film
    INSERT INTO films (
        id,
        judul,
        deskripsi,
        durasi_menit,
        poster_path,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        trim(p_judul),
        trim(p_deskripsi),
        v_durasi,
        trim(p_poster_path),
        now(),
        now()
    )
    RETURNING id INTO v_film_id;

    -- 2. Insert Session for this Film
    INSERT INTO sessions (
        id,
        tanggal,
        jam_mulai,
        film_id,
        kuota_total,
        kuota_terisi,
        status_sesi,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        p_tanggal,
        p_jam_mulai,
        v_film_id,
        v_kuota,
        0,
        'AKTIF',
        now(),
        now()
    )
    RETURNING id INTO v_session_id;

    RETURN json_build_object(
        'success', true,
        'film_id', v_film_id,
        'session_id', v_session_id,
        'message', 'Film kustom dan jadwal sesi teater baru berhasil dibuat!'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_film TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_create_film_and_session TO anon, authenticated, service_role;

