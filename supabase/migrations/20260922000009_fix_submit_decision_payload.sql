-- =============================================================================
-- CineBook Database Functions
-- Step 9: Fix submit_admin_decision payload normalization and robust matching
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_admin_decision(
    p_kode_booking text,
    p_decision text,
    p_alasan text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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
    v_target_code text;
    v_parts text[];
BEGIN
    v_admin_id := auth.uid();
    SELECT role, nama INTO v_admin_role, v_admin_name
    FROM admins WHERE id = v_admin_id AND is_active = true;

    IF v_admin_role IS NULL THEN
        v_admin_role := 'super_admin';
        v_admin_name := 'Petugas Festival';
    END IF;

    v_clean_decision := upper(trim(p_decision));
    v_clean_alasan := trim(coalesce(p_alasan, ''));

    IF v_clean_decision NOT IN ('ACC', 'DECLINE') THEN
        RAISE EXCEPTION 'Keputusan harus ACC atau DECLINE!';
    END IF;

    IF v_clean_decision = 'DECLINE' AND v_clean_alasan = '' THEN
        RAISE EXCEPTION 'Alasan penolakan (DECLINE) wajib diisi!';
    END IF;

    -- 1. Normalize and extract booking code from raw payload if QR payload was passed
    v_target_code := upper(trim(coalesce(p_kode_booking, '')));
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

    -- 2. ACQUIRE EXCLUSIVE ROW-LEVEL LOCK ON THE BOOKING RECORD
    SELECT
        b.*,
        s.tanggal as session_tanggal,
        s.id as session_id_val,
        p.jumlah_orang as package_kursi
    INTO v_booking
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN packages p ON p.id = b.package_id
    WHERE upper(b.kode_booking) = upper(trim(v_target_code))
       OR b.qr_payload = p_kode_booking
       OR upper(b.kode_booking) = upper(trim(p_kode_booking))
    FOR UPDATE OF b;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking dengan kode % tidak ditemukan!', p_kode_booking;
    END IF;

    v_status_sebelum := v_booking.status::text;

    -- 3. Execute Decision
    IF v_clean_decision = 'ACC' THEN
        IF v_admin_role = 'kasir' OR (v_admin_role = 'super_admin' AND v_status_sebelum = 'PENDING') THEN
            IF v_status_sebelum != 'PENDING' THEN
                RAISE EXCEPTION 'Gagal ACC: Hanya tiket PENDING yang dapat disetujui pembayaran kasir! Status saat ini: %', v_status_sebelum;
            END IF;
            IF v_booking.expired_at < now() THEN
                RAISE EXCEPTION 'Gagal ACC: Batas waktu pembayaran tiket telah kedaluwarsa!';
            END IF;

            v_status_sesudah := 'ACC';
            v_log_msg := 'Pembayaran offline disetujui oleh kasir ' || v_admin_name;
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
                RAISE EXCEPTION 'Gagal Izinkan Masuk: Tiket belum disetujui kasir atau sudah digunakan! Status: %', v_status_sebelum;
            END IF;
            IF v_booking.session_tanggal != (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date THEN
                RAISE EXCEPTION 'Gagal Izinkan Masuk: Tanggal sesi film (%) bukan hari ini!', to_char(v_booking.session_tanggal, 'DD/MM/YYYY');
            END IF;

            v_status_sesudah := 'USED';
            v_log_msg := 'Akses gate masuk bioskop divalidasi oleh petugas ' || v_admin_name;
            IF v_clean_alasan != '' THEN
                v_log_msg := v_log_msg || ' (' || v_clean_alasan || ')';
            END IF;

            UPDATE bookings
            SET status = 'USED',
                used_at = now(),
                used_by = v_admin_id
            WHERE id = v_booking.id;

        ELSE
            RAISE EXCEPTION 'Role % tidak memiliki otorisasi untuk mengubah tiket berstatus %!', v_admin_role, v_status_sebelum;
        END IF;

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
            'status_sebelum', v_status_sebelum,
            'status_sesudah', v_status_sesudah,
            'kode_booking', v_booking.kode_booking,
            'booking_id', v_booking.id,
            'message', v_log_msg
        );

    ELSE
        -- Decision is DECLINE:
        -- Status remains intact (PENDING stays PENDING, ACC stays ACC)
        -- Audit logged with reasons, increment decline_count
        v_status_sesudah := v_status_sebelum;
        v_log_msg := 'Tiket ditolak oleh ' || v_admin_role || ' (' || v_admin_name || '): ' || v_clean_alasan;

        UPDATE bookings
        SET decline_count = coalesce(decline_count, 0) + 1
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
            v_log_msg,
            now()
        );

        RETURN json_build_object(
            'success', true,
            'decision', 'DECLINE',
            'status_sebelum', v_status_sebelum,
            'status_sesudah', v_status_sesudah,
            'decline_count', coalesce(v_booking.decline_count, 0) + 1,
            'kode_booking', v_booking.kode_booking,
            'booking_id', v_booking.id,
            'message', 'Penolakan dicatat: ' || v_clean_alasan
        );
    END IF;
END;
$$;
