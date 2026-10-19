-- =============================================================================
-- CineBook Database Functions
-- Step 13: Strict Scan Queue Isolation (gate_scanned_at & cashier_scanned_at)
--          + Purge Dummy Film & Dummy Packages + Full Clean Reset to 0
-- =============================================================================

-- 1. Add dedicated timestamp columns for gate and cashier scans
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cashier_scanned_at timestamptz DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gate_scanned_at timestamptz DEFAULT NULL;

-- 2. Update register_cashier_scan() to populate cashier_scanned_at
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
    SET cashier_scanned_at = now(),
        last_scanned_at = now()
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

-- 3. Update get_cashier_queue() to ONLY return tickets scanned at cashier desk
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
            'last_scanned_at', b.cashier_scanned_at,
            'decline_count', coalesce(b.decline_count, 0),
            'film_judul', f.judul,
            'nama_paket', p.nama_paket,
            'jumlah_orang', p.jumlah_orang,
            'tanggal', s.tanggal,
            'jam_mulai', s.jam_mulai,
            'is_recently_scanned', (b.cashier_scanned_at IS NOT NULL)
        ) ORDER BY
            b.cashier_scanned_at DESC
    ) INTO v_result
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    JOIN packages p ON p.id = b.package_id
    WHERE b.status = 'PENDING'
      AND b.cashier_scanned_at IS NOT NULL;

    RETURN coalesce(v_result, '[]'::json);
END;
$$;

-- 4. Update register_gate_scan() to populate gate_scanned_at
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
    SET gate_scanned_at = now(),
        last_scanned_at = now()
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

-- 5. Update get_gate_queue() to ONLY return tickets where status = 'ACC' AND gate_scanned_at IS NOT NULL
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
            'last_scanned_at', b.gate_scanned_at,
            'decline_count', coalesce(b.decline_count, 0),
            'film_judul', f.judul,
            'nama_paket', p.nama_paket,
            'jumlah_orang', p.jumlah_orang,
            'tanggal', s.tanggal,
            'jam_mulai', s.jam_mulai,
            'is_session_today', (s.tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date),
            'is_recently_scanned', true
        ) ORDER BY
            b.gate_scanned_at DESC
    ) INTO v_result
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN films f ON f.id = s.film_id
    JOIN packages p ON p.id = b.package_id
    WHERE b.status = 'ACC'
      AND b.gate_scanned_at IS NOT NULL;

    RETURN coalesce(v_result, '[]'::json);
END;
$$;
