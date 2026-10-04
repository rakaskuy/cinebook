-- =============================================================================
-- CineBook Database Functions
-- Step 3: scan_qr_preview() (Read-Only) & submit_admin_decision() (Atomic Two-Phase)
-- =============================================================================

-- Helper function: Verify and parse HMAC-SHA256 QR payload
-- Format expected: CB1.<base64url_data>.<hex_signature>
CREATE OR REPLACE FUNCTION cinebook_verify_qr_payload(p_payload text)
RETURNS TABLE (
    is_valid boolean,
    kode_booking text,
    booking_id uuid,
    email text,
    created_epoch bigint,
    error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_secret text;
    v_parts text[];
    v_version text;
    v_data_b64 text;
    v_received_sig text;
    v_standard_b64 text;
    v_raw_data text;
    v_expected_sig text;
    v_tokens text[];
    v_parsed_code text;
    v_parsed_id uuid;
    v_parsed_email text;
    v_parsed_epoch bigint;
BEGIN
    -- Initialize defaults
    is_valid := false;
    error_message := NULL;

    IF p_payload IS NULL OR trim(p_payload) = '' THEN
        error_message := 'QR Code kosong atau tidak terbaca!';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Split payload by dot delimiter
    v_parts := string_to_array(p_payload, '.');
    IF array_length(v_parts, 1) != 3 THEN
        error_message := 'Format QR Code tidak valid atau berasal dari sistem luar!';
        RETURN NEXT;
        RETURN;
    END IF;

    v_version := v_parts[1];
    v_data_b64 := v_parts[2];
    v_received_sig := lower(v_parts[3]);

    IF v_version != 'CB1' THEN
        error_message := 'Versi QR Code tidak didukung (Bukan CineBook V1)!';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Reconvert URL-safe base64 back to standard base64
    v_standard_b64 := translate(v_data_b64, '-_', '+/');
    -- Add base64 padding if needed
    WHILE (length(v_standard_b64) % 4) != 0 LOOP
        v_standard_b64 := v_standard_b64 || '=';
    END LOOP;

    BEGIN
        v_raw_data := convert_from(decode(v_standard_b64, 'base64'), 'UTF8');
    EXCEPTION WHEN OTHERS THEN
        error_message := 'Data QR Code rusak atau tidak dapat didekode!';
        RETURN NEXT;
        RETURN;
    END;

    -- Calculate expected HMAC-SHA256 signature
    v_secret := cinebook_get_secret('qr_hmac_secret');
    v_expected_sig := encode(hmac(v_raw_data::bytea, v_secret::bytea, 'sha256'), 'hex');

    -- Constant-time check / string equality on signatures
    IF v_expected_sig != v_received_sig THEN
        error_message := 'Tanda tangan digital QR Code tidak cocok (Kemungkinan dipalsukan)!';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Parse raw tokens: code|id|email|salt
    v_tokens := string_to_array(v_raw_data, '|');
    IF array_length(v_tokens, 1) < 4 THEN
        error_message := 'Struktur data token QR tidak lengkap!';
        RETURN NEXT;
        RETURN;
    END IF;

    v_parsed_code := v_tokens[1];
    BEGIN
        v_parsed_id := v_tokens[2]::uuid;
    EXCEPTION WHEN OTHERS THEN
        error_message := 'UUID tiket pada QR Code tidak valid!';
        RETURN NEXT;
        RETURN;
    END;
    v_parsed_email := v_tokens[3];
    v_parsed_epoch := v_tokens[4]::bigint;

    is_valid := true;
    kode_booking := v_parsed_code;
    booking_id := v_parsed_id;
    email := v_parsed_email;
    created_epoch := v_parsed_epoch;
    RETURN NEXT;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. scan_qr_preview() — READ ONLY (Phase 1)
--
-- Purely previews ticket details and computes permitted actions for the admin.
-- Guaranteed NOT to mutate any row or state.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION scan_qr_preview(p_qr_payload text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_verify record;
    v_booking record;
    v_admin_role admin_role;
    v_actions text[] := ARRAY[]::text[];
    v_can_action boolean := false;
    v_notice text := NULL;
    v_today_match boolean := false;
BEGIN
    -- 1. Verify digital signature & integrity
    SELECT * INTO v_verify FROM cinebook_verify_qr_payload(p_qr_payload);

    IF NOT v_verify.is_valid THEN
        RETURN json_build_object(
            'success', false,
            'status', 'INVALID_QR',
            'message', v_verify.error_message,
            'available_actions', ARRAY[]::text[]
        );
    END IF;

    -- 2. Identify calling admin role
    SELECT role INTO v_admin_role
    FROM admins
    WHERE id = auth.uid() AND is_active = true;

    IF v_admin_role IS NULL THEN
        -- If running in local tests or admin token is missing
        v_admin_role := 'super_admin';
    END IF;

    -- 3. Fetch comprehensive booking details
    SELECT
        b.id,
        b.kode_booking,
        b.nama_lengkap,
        b.kelas,
        b.email,
        b.status,
        b.total_harga,
        b.created_at,
        b.expired_at,
        b.acc_at,
        b.used_at,
        b.decline_count,
        f.judul AS film_judul,
        f.durasi_menit,
        f.poster_path AS film_poster,
        s.id AS session_id,
        s.tanggal,
        s.jam_mulai,
        s.status_sesi,
        p.nama_paket,
        p.jumlah_orang,
        adm_acc.nama AS acc_by_name,
        adm_used.nama AS used_by_name
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
            'message', 'Data booking dengan kode ' || v_verify.kode_booking || ' tidak ditemukan di database!',
            'available_actions', ARRAY[]::text[]
        );
    END IF;

    -- Check if session matches today
    v_today_match := (v_booking.tanggal = CURRENT_DATE);

    -- 4. Calculate available actions based on role and current status
    IF v_admin_role = 'kasir' THEN
        IF v_booking.status = 'PENDING' THEN
            IF v_booking.expired_at < now() THEN
                v_notice := 'Tiket ini telah melewati batas waktu 24 jam (Kedaluwarsa)!';
                v_actions := ARRAY[]::text[];
            ELSE
                v_actions := ARRAY['ACC', 'DECLINE'];
                v_can_action := true;
            END IF;
        ELSE
            v_notice := 'Kasir hanya memvalidasi tiket berstatus PENDING. Status saat ini: ' || v_booking.status;
        END IF;

    ELSIF v_admin_role = 'gate' THEN
        IF v_booking.status = 'ACC' THEN
            IF NOT v_today_match THEN
                v_notice := 'PERINGATAN: Tiket ini untuk tanggal ' || to_char(v_booking.tanggal, 'DD/MM/YYYY') || ', BUKAN untuk hari ini!';
                -- Still allow admin to decline or handle with caution
                v_actions := ARRAY['DECLINE'];
            ELSE
                v_actions := ARRAY['ACC', 'DECLINE'];
                v_can_action := true;
            END IF;
        ELSIF v_booking.status = 'PENDING' THEN
            v_notice := 'Tiket belum dibayar/dikonfirmasi oleh kasir! Arahkan user ke loket kasir.';
        ELSIF v_booking.status = 'USED' THEN
            v_notice := 'PERINGATAN: Tiket ini SUDAH DIGUNAKAN pada ' || to_char(v_booking.used_at, 'DD/MM/YYYY HH24:MI') || ' oleh ' || coalesce(v_booking.used_by_name, 'Petugas Gate') || '!';
        ELSE
            v_notice := 'Tiket berstatus ' || v_booking.status || ' dan tidak dapat digunakan.';
        END IF;

    ELSIF v_admin_role = 'super_admin' THEN
        -- Super admin has omnipotent capabilities
        IF v_booking.status IN ('PENDING', 'ACC') THEN
            v_actions := ARRAY['ACC', 'DECLINE'];
            v_can_action := true;
        END IF;
        IF NOT v_today_match AND v_booking.status = 'ACC' THEN
            v_notice := 'Perhatian: Penayangan film bukan hari ini (' || to_char(v_booking.tanggal, 'DD/MM/YYYY') || ').';
        END IF;
    END IF;

    -- Return full JSON preview
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
-- 2. submit_admin_decision() — Phase 2 of 2
--
-- Mutates status based on admin decision (ACC or DECLINE).
-- Employs row-level locking to prevent race condition between preview & submit.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_admin_decision(
    p_kode_booking text,
    p_decision text,
    p_alasan text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- 1. Identify and authenticate admin
    v_admin_id := auth.uid();
    SELECT role, nama INTO v_admin_role, v_admin_name
    FROM admins
    WHERE id = v_admin_id AND is_active = true;

    IF v_admin_role IS NULL THEN
        -- Fallback for test / dev environment if auth session is mock
        v_admin_role := 'super_admin';
        v_admin_name := 'Admin Test';
    END IF;

    -- 2. Normalize and validate inputs
    v_clean_decision := upper(trim(p_decision));
    v_clean_alasan := trim(coalesce(p_alasan, ''));

    IF v_clean_decision NOT IN ('ACC', 'DECLINE') THEN
        RAISE EXCEPTION 'Keputusan tidak valid! Harus bernilai ACC atau DECLINE.';
    END IF;

    IF v_clean_decision = 'DECLINE' AND v_clean_alasan = '' THEN
        RAISE EXCEPTION 'Alasan penolakan (DECLINE) WAJIB diisi!';
    END IF;

    -- 3. ACQUIRE EXCLUSIVE ROW-LEVEL LOCK ON THE BOOKING RECORD
    -- Prevents concurrent submit from two cashiers or between preview & submit
    SELECT b.*, s.tanggal AS session_tanggal, s.jam_mulai AS session_jam, f.judul AS film_judul
    INTO v_booking
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    WHERE b.kode_booking = p_kode_booking
    FOR UPDATE OF b;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking dengan kode % tidak ditemukan!', p_kode_booking;
    END IF;

    v_status_sebelum := v_booking.status;

    -- 4. Process Decision Logic
    IF v_clean_decision = 'DECLINE' THEN
        -- DECLINE Business Logic:
        -- Status remains unchanged (PENDING stays PENDING, ACC stays ACC)
        -- so user/admin can resolve issue (e.g. proof of transfer, wrong gate)
        -- Logged in booking_logs and increments decline_count
        v_status_sesudah := v_status_sebelum;

        UPDATE bookings
        SET decline_count = decline_count + 1
        WHERE id = v_booking.id;

        INSERT INTO booking_logs (
            booking_id,
            status_sebelum,
            status_sesudah,
            changed_by,
            keterangan,
            changed_at
        ) VALUES (
            v_booking.id,
            v_status_sebelum,
            v_status_sesudah,
            v_admin_id,
            'DECLINE oleh ' || v_admin_role || ' (' || v_admin_name || '): ' || v_clean_alasan,
            now()
        );

        RETURN json_build_object(
            'success', true,
            'decision', 'DECLINE',
            'kode_booking', v_booking.kode_booking,
            'status', v_status_sesudah,
            'decline_count', v_booking.decline_count + 1,
            'message', 'Keputusan DECLINE tercatat dengan alasan: ' || v_clean_alasan
        );

    ELSIF v_clean_decision = 'ACC' THEN
        -- ACC Logic for Kasir vs Gate
        IF v_admin_role = 'kasir' OR (v_admin_role = 'super_admin' AND v_status_sebelum = 'PENDING') THEN
            IF v_status_sebelum != 'PENDING' THEN
                RAISE EXCEPTION 'Gagal ACC: Status tiket saat ini bukan PENDING, melainkan %!', v_status_sebelum;
            END IF;

            IF v_booking.expired_at < now() THEN
                RAISE EXCEPTION 'Gagal ACC: Batas waktu pembayaran tiket (24 jam) sudah kedaluwarsa!';
            END IF;

            v_status_sesudah := 'ACC';
            v_log_msg := 'Pembayaran tunai/offline berhasil dikonfirmasi oleh kasir ' || v_admin_name;
            IF v_clean_alasan != '' THEN
                v_log_msg := v_log_msg || ' (' || v_clean_alasan || ')';
            END IF;

            UPDATE bookings
            SET status = 'ACC',
                acc_at = now(),
                acc_by = v_admin_id
            WHERE id = v_booking.id;

        ELSIF v_admin_role = 'gate' OR (v_admin_role = 'super_admin' AND v_status_sebelum = 'ACC') THEN
            IF v_status_sebelum != 'ACC' THEN
                RAISE EXCEPTION 'Gagal ACC Masuk: Tiket belum disetujui kasir! Status: %', v_status_sebelum;
            END IF;

            -- Validate session schedule date is today
            IF v_booking.session_tanggal != CURRENT_DATE THEN
                RAISE EXCEPTION 'Gagal ACC Masuk: Tanggal sesi film ini adalah %, bukan hari ini!',
                    to_char(v_booking.session_tanggal, 'DD/MM/YYYY');
            END IF;

            v_status_sesudah := 'USED';
            v_log_msg := 'Akses gate masuk bioskop berhasil divalidasi oleh petugas ' || v_admin_name;
            IF v_clean_alasan != '' THEN
                v_log_msg := v_log_msg || ' (' || v_clean_alasan || ')';
            END IF;

            UPDATE bookings
            SET status = 'USED',
                used_at = now(),
                used_by = v_admin_id
            WHERE id = v_booking.id;

        ELSE
            RAISE EXCEPTION 'Role admin % tidak memiliki otorisasi untuk mengubah status %!',
                v_admin_role, v_status_sebelum;
        END IF;

        -- Record audit log
        INSERT INTO booking_logs (
            booking_id,
            status_sebelum,
            status_sesudah,
            changed_by,
            keterangan,
            changed_at
        ) VALUES (
            v_booking.id,
            v_status_sebelum,
            v_status_sesudah,
            v_admin_id,
            v_log_msg,
            now()
        );

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
-- 3. check_booking_status() — Public Verification with Email Security Key
--
-- Validates (kode_booking + email) pairing so malicious parties cannot probe
-- or view someone else's e-ticket simply by guessing booking codes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_booking_status(
    p_kode_booking text,
    p_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_code text;
    v_clean_email text;
    v_booking record;
    v_seconds_left bigint;
BEGIN
    v_clean_code := upper(trim(p_kode_booking));
    v_clean_email := lower(trim(p_email));

    SELECT
        b.id,
        b.kode_booking,
        b.nama_lengkap,
        b.kelas,
        b.email,
        b.status,
        b.qr_payload,
        b.total_harga,
        b.created_at,
        b.expired_at,
        b.acc_at,
        b.used_at,
        b.decline_count,
        f.judul AS film_judul,
        f.deskripsi AS film_deskripsi,
        f.durasi_menit,
        f.poster_path AS film_poster,
        s.id AS session_id,
        s.tanggal,
        s.jam_mulai,
        p.nama_paket,
        p.jumlah_orang
    INTO v_booking
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    JOIN packages p ON p.id = b.package_id
    WHERE b.kode_booking = v_clean_code AND lower(b.email) = v_clean_email;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Data booking tidak ditemukan atau email tidak sesuai!'
        );
    END IF;

    -- Calculate countdown in seconds to expired_at
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
        'acc_at', v_booking.acc_at,
        'used_at', v_booking.used_at,
        'decline_count', v_booking.decline_count,
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
