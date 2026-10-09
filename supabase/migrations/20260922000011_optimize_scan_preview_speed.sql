-- =============================================================================
-- CineBook Database Functions
-- Step 11: Optimize scan_qr_preview() performance (eliminate 1.8MB base64 poster serialization overhead)
-- =============================================================================

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
        b.id, b.kode_booking, b.nama_lengkap, b.kelas, b.email, b.status, b.total_harga,
        b.created_at, b.expired_at, b.acc_at, b.used_at, b.decline_count,
        f.judul AS film_judul, f.durasi_menit,
        CASE WHEN length(f.poster_path) > 500 THEN NULL ELSE f.poster_path END AS film_poster,
        s.id AS session_id, s.tanggal, s.jam_mulai, s.status_sesi,
        p.nama_paket, p.jumlah_orang,
        adm_acc.nama AS acc_by_name, adm_used.nama AS used_by_name
    INTO v_booking
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    JOIN packages p ON p.id = b.package_id
    LEFT JOIN admins adm_acc ON adm_acc.id = b.acc_by
    LEFT JOIN admins adm_used ON adm_used.id = b.used_by
    WHERE upper(b.kode_booking) = upper(trim(v_target_code))
       OR b.qr_payload = p_qr_payload;

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
