-- =============================================================================
-- CineBook Database Functions
-- Step 10: Gate Pass Queue & Mobile Access RPCs (get_gate_queue & register_gate_scan)
-- =============================================================================

-- 1. Real-time Gate Queue: get_gate_queue()
CREATE OR REPLACE FUNCTION public.get_gate_queue()
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
            'acc_at', b.acc_at,
            'last_scanned_at', b.last_scanned_at,
            'decline_count', coalesce(b.decline_count, 0),
            'film_judul', f.judul,
            'nama_paket', p.nama_paket,
            'jumlah_orang', p.jumlah_orang,
            'tanggal', s.tanggal,
            'jam_mulai', s.jam_mulai,
            'is_session_today', (s.tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date),
            'is_recently_scanned', (b.last_scanned_at IS NOT NULL)
        ) ORDER BY
            (CASE WHEN b.last_scanned_at IS NOT NULL THEN 0 ELSE 1 END) ASC,
            b.last_scanned_at DESC NULLS LAST,
            b.acc_at DESC NULLS LAST,
            b.created_at DESC
    ) INTO v_result
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    JOIN packages p ON p.id = b.package_id
    WHERE b.status = 'ACC';

    RETURN coalesce(v_result, '[]'::json);
END;
$$;

-- 2. Gate Scan Registration: register_gate_scan()
CREATE OR REPLACE FUNCTION public.register_gate_scan(p_qr_payload text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_payload text;
    v_target_code text;
    v_parts text[];
    v_booking record;
    v_today_match boolean;
BEGIN
    v_clean_payload := trim(coalesce(p_qr_payload, ''));
    IF v_clean_payload = '' THEN
        RETURN json_build_object('success', false, 'message', 'QR payload kosong!');
    END IF;

    -- Extract code from CB1:CODE:SIG or CB1.ey... or plain code
    v_target_code := upper(v_clean_payload);
    IF v_target_code LIKE 'CB1:%' THEN
        v_parts := string_to_array(v_target_code, ':');
        IF array_length(v_parts, 1) >= 2 THEN
            v_target_code := v_parts[2];
        END IF;
    ELSIF v_target_code LIKE 'CB1.%' THEN
        BEGIN
            v_target_code := split_part(convert_from(decode(translate(split_part(v_target_code, '.', 2), '-_', '+/'), 'base64'), 'UTF8'), '|', 1);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    SELECT
        b.id, b.kode_booking, b.nama_lengkap, b.kelas, b.status, b.total_harga,
        f.judul AS film_judul, s.tanggal, s.jam_mulai, p.nama_paket, p.jumlah_orang
    INTO v_booking
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    JOIN packages p ON p.id = b.package_id
    WHERE upper(b.kode_booking) = upper(trim(v_target_code))
       OR b.qr_payload = p_qr_payload;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Tiket ' || v_target_code || ' tidak ditemukan!');
    END IF;

    UPDATE bookings
    SET last_scanned_at = now()
    WHERE id = v_booking.id;

    v_today_match := (v_booking.tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date);

    RETURN json_build_object(
        'success', true,
        'kode_booking', v_booking.kode_booking,
        'nama_lengkap', v_booking.nama_lengkap,
        'kelas', v_booking.kelas,
        'film_judul', v_booking.film_judul,
        'nama_paket', v_booking.nama_paket,
        'jumlah_orang', v_booking.jumlah_orang,
        'status', v_booking.status,
        'tanggal', v_booking.tanggal,
        'jam_mulai', v_booking.jam_mulai,
        'is_session_today', v_today_match,
        'message', 'QR Berhasil Di-scan! Tiket siap diizinkan masuk.'
    );
END;
$$;
