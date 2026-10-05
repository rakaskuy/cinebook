-- =============================================================================
-- CineBook Database Functions
-- Step 8: Cashier POS Scanner & Queue RPCs + Security & Type Casting Hardening
-- =============================================================================

-- 1. Ensure last_scanned_at exists on bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS last_scanned_at timestamptz DEFAULT NULL;

-- 2. Hardened admin_update_session with explicit ENUM casting
CREATE OR REPLACE FUNCTION public.admin_update_session(
    p_session_id uuid,
    p_kuota_total integer,
    p_status text,
    p_tanggal date DEFAULT NULL::date,
    p_jam_mulai time without time zone DEFAULT NULL::time without time zone
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_status text;
    v_enum_status session_status;
BEGIN
    v_clean_status := upper(trim(coalesce(p_status, 'AKTIF')));
    IF v_clean_status NOT IN ('AKTIF', 'DITUTUP') THEN
        RAISE EXCEPTION 'Status sesi tidak valid! Harus bernilai AKTIF atau DITUTUP.';
    END IF;
    v_enum_status := v_clean_status::session_status;

    UPDATE sessions
    SET
        kuota_total = p_kuota_total,
        status_sesi = v_enum_status,
        tanggal = coalesce(p_tanggal, tanggal),
        jam_mulai = coalesce(p_jam_mulai, jam_mulai),
        updated_at = now()
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesi dengan ID % tidak ditemukan!', p_session_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Sesi berhasil diperbarui!'
    );
END;
$$;

-- 3. Cashier Scan Register: register_cashier_scan()
CREATE OR REPLACE FUNCTION public.register_cashier_scan(p_qr_payload text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_payload text;
    v_verify record;
    v_booking record;
    v_target_code text;
    v_parts text[];
BEGIN
    v_clean_payload := trim(coalesce(p_qr_payload, ''));
    IF v_clean_payload = '' THEN
        RETURN json_build_object(
            'success', false,
            'message', 'QR payload kosong!'
        );
    END IF;

    -- 1. Try cryptographic verification
    SELECT * INTO v_verify FROM cinebook_verify_qr_payload(v_clean_payload);
    IF v_verify.is_valid THEN
        v_target_code := v_verify.kode_booking;
    ELSE
        -- 2. Fallback to format CB1:CODE:SIG or plain code
        IF v_clean_payload LIKE 'CB1:%' THEN
            v_parts := string_to_array(v_clean_payload, ':');
            IF array_length(v_parts, 1) >= 2 THEN
                v_target_code := v_parts[2];
            END IF;
        ELSE
            v_target_code := upper(v_clean_payload);
        END IF;
    END IF;

    IF v_target_code IS NULL OR trim(v_target_code) = '' THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Format QR Code tidak valid atau rusak.'
        );
    END IF;

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
        b.decline_count,
        f.judul AS film_judul,
        s.tanggal,
        s.jam_mulai,
        p.nama_paket,
        p.jumlah_orang
    INTO v_booking
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    JOIN packages p ON p.id = b.package_id
    WHERE upper(b.kode_booking) = upper(trim(v_target_code));

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Tiket dengan kode ' || v_target_code || ' tidak ditemukan di database!'
        );
    END IF;

    UPDATE bookings
    SET last_scanned_at = now()
    WHERE id = v_booking.id;

    RETURN json_build_object(
        'success', true,
        'kode_booking', v_booking.kode_booking,
        'nama_lengkap', v_booking.nama_lengkap,
        'kelas', v_booking.kelas,
        'film_judul', v_booking.film_judul,
        'nama_paket', v_booking.nama_paket,
        'jumlah_orang', v_booking.jumlah_orang,
        'total_harga', v_booking.total_harga,
        'status', v_booking.status,
        'message', 'QR Berhasil Di-scan! Data telah dikirim ke antrean Kasir.'
    );
END;
$$;

-- 4. Real-time Cashier Queue: get_cashier_queue()
CREATE OR REPLACE FUNCTION public.get_cashier_queue()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_result json;
BEGIN
    SELECT json_agg(
        json_build_object(
            'id', b.id,
            'kode_booking', b.kode_booking,
            'nama_lengkap', b.nama_lengkap,
            'kelas', b.kelas,
            'email', b.email,
            'total_harga', b.total_harga,
            'status', b.status,
            'created_at', b.created_at,
            'expired_at', b.expired_at,
            'last_scanned_at', b.last_scanned_at,
            'decline_count', coalesce(b.decline_count, 0),
            'film_judul', f.judul,
            'nama_paket', p.nama_paket,
            'jumlah_orang', p.jumlah_orang,
            'tanggal', s.tanggal,
            'jam_mulai', s.jam_mulai,
            'is_recently_scanned', (b.last_scanned_at IS NOT NULL)
        ) ORDER BY
            (CASE WHEN b.last_scanned_at IS NOT NULL THEN 0 ELSE 1 END) ASC,
            b.last_scanned_at DESC NULLS LAST,
            b.created_at DESC
    ) INTO v_result
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    JOIN packages p ON p.id = b.package_id
    WHERE b.status = 'PENDING';

    RETURN coalesce(v_result, '[]'::json);
END;
$$;

-- 5. Harden scan_qr_preview() with WIB Jakarta Date & Safe Fallbacks
CREATE OR REPLACE FUNCTION public.scan_qr_preview(p_qr_payload text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_verify record;
    v_booking record;
    v_admin_role admin_role;
    v_actions text[] := ARRAY[]::text[];
    v_can_action boolean := false;
    v_notice text := NULL;
    v_today_match boolean := false;
    v_target_code text;
    v_parts text[];
BEGIN
    SELECT * INTO v_verify FROM cinebook_verify_qr_payload(p_qr_payload);
    IF v_verify.is_valid THEN
        v_target_code := v_verify.kode_booking;
    ELSE
        -- Fallback parsing
        IF p_qr_payload LIKE 'CB1:%' THEN
            v_parts := string_to_array(p_qr_payload, ':');
            IF array_length(v_parts, 1) >= 2 THEN
                v_target_code := v_parts[2];
            END IF;
        ELSE
            v_target_code := upper(trim(p_qr_payload));
        END IF;
    END IF;

    IF v_target_code IS NULL OR trim(v_target_code) = '' THEN
        RETURN json_build_object(
            'success', false,
            'status', 'INVALID_QR',
            'message', 'Format QR Code tidak sah / rusak!',
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
    WHERE upper(b.kode_booking) = upper(trim(v_target_code));

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'status', 'NOT_FOUND',
            'message', 'Booking ' || v_target_code || ' tidak ditemukan di database!',
            'available_actions', ARRAY[]::text[]
        );
    END IF;

    -- Compare against Indonesian WIB Local Time
    v_today_match := (v_booking.tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date);

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
            v_notice := 'Tiket belum dibayar ke kasir! Arahkan penonton ke loket kasir.';
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

-- 6. Harden admin functions search_path
ALTER FUNCTION public.admin_create_film(text, text, integer, text) SET search_path = public, extensions;
ALTER FUNCTION public.admin_create_film_and_session(text, text, integer, text, date, time without time zone, integer) SET search_path = public, extensions;
ALTER FUNCTION public.admin_fetch_all_sessions() SET search_path = public, extensions;
ALTER FUNCTION public.admin_verify_google_user(text, text) SET search_path = public, extensions;
ALTER FUNCTION public.get_admin_dashboard_data() SET search_path = public, extensions;
