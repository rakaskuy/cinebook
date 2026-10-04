-- =============================================================================
-- CineBook Database Functions
-- Step 4: auto_expire_bookings(), Edge Cases Handling, and pg_cron Scheduling
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. auto_expire_bookings() — Automated Lifecycle Garbage Collector
--
-- Uses FOR UPDATE SKIP LOCKED to prevent lock contention with active users or
-- other workers running in parallel.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_expire_bookings()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cursor CURSOR FOR
        SELECT
            b.id AS booking_id,
            b.kode_booking,
            b.session_id,
            p.jumlah_orang
        FROM bookings b
        JOIN packages p ON p.id = b.package_id
        WHERE b.status = 'PENDING'
          AND b.expired_at < now()
        FOR UPDATE OF b SKIP LOCKED;

    v_count integer := 0;
    v_record record;
BEGIN
    FOR v_record IN v_cursor LOOP
        -- 1. Transition status to EXPIRED
        UPDATE bookings
        SET status = 'EXPIRED'
        WHERE id = v_record.booking_id;

        -- 2. Atomically restore session quota
        UPDATE sessions
        SET kuota_terisi = GREATEST(0, kuota_terisi - v_record.jumlah_orang),
            updated_at = now()
        WHERE id = v_record.session_id;

        -- 3. Append to immutable audit log (changed_by is NULL for automated scheduler)
        INSERT INTO booking_logs (
            booking_id,
            status_sebelum,
            status_sesudah,
            changed_by,
            keterangan,
            changed_at
        ) VALUES (
            v_record.booking_id,
            'PENDING',
            'EXPIRED',
            NULL,
            'Kedaluwarsa otomatis oleh sistem: Tidak ada konfirmasi pembayaran kasir dalam batas 24 jam',
            now()
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'expired_count', v_count,
        'executed_at', now()
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Edge Case 5: Emergency Session Cancellation (cancel_session)
--
-- Cascades cancellation to all PENDING & ACC bookings, updates logs,
-- and locks the session as DITUTUP.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_session(
    p_session_id uuid,
    p_alasan text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id uuid;
    v_admin_role admin_role;
    v_affected_bookings integer := 0;
    v_b record;
    v_clean_alasan text;
BEGIN
    v_admin_id := auth.uid();
    SELECT role INTO v_admin_role FROM admins WHERE id = v_admin_id AND is_active = true;

    IF v_admin_role != 'super_admin' THEN
        RAISE EXCEPTION 'Hanya super_admin yang memiliki izin untuk membatalkan seluruh sesi film!';
    END IF;

    v_clean_alasan := trim(coalesce(p_alasan, ''));
    IF v_clean_alasan = '' THEN
        RAISE EXCEPTION 'Alasan pembatalan sesi wajib disertakan!';
    END IF;

    -- Lock session
    UPDATE sessions
    SET status_sesi = 'DITUTUP',
        kuota_terisi = 0,
        updated_at = now()
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesi dengan ID % tidak ditemukan!', p_session_id;
    END IF;

    -- Cancel all active bookings
    FOR v_b IN
        SELECT id, status FROM bookings
        WHERE session_id = p_session_id AND status IN ('PENDING', 'ACC')
        FOR UPDATE
    LOOP
        UPDATE bookings
        SET status = 'CANCELLED'
        WHERE id = v_b.id;

        INSERT INTO booking_logs (
            booking_id,
            status_sebelum,
            status_sesudah,
            changed_by,
            keterangan,
            changed_at
        ) VALUES (
            v_b.id,
            v_b.status,
            'CANCELLED',
            v_admin_id,
            'Sesi dibatalkan oleh super_admin: ' || v_clean_alasan,
            now()
        );

        v_affected_bookings := v_affected_bookings + 1;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'session_id', p_session_id,
        'status_sesi', 'DITUTUP',
        'affected_bookings', v_affected_bookings,
        'reason', v_clean_alasan
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Edge Case 6: User-Initiated Cancellation (cancel_booking_by_user)
--
-- Allows booking creator to cancel their PENDING booking before it is processed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_booking_by_user(
    p_kode_booking text,
    p_email text,
    p_alasan text DEFAULT 'Dibatalkan oleh pemesan'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking record;
    v_package record;
BEGIN
    -- Lock booking record
    SELECT b.*, p.jumlah_orang
    INTO v_booking
    FROM bookings b
    JOIN packages p ON p.id = b.package_id
    WHERE b.kode_booking = upper(trim(p_kode_booking))
      AND lower(b.email) = lower(trim(p_email))
    FOR UPDATE OF b;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking tidak ditemukan atau verifikasi email tidak sesuai!';
    END IF;

    IF v_booking.status != 'PENDING' THEN
        RAISE EXCEPTION 'Tiket berstatus % tidak dapat dibatalkan mandiri. Hubungi panitia.', v_booking.status;
    END IF;

    -- Transition status
    UPDATE bookings
    SET status = 'CANCELLED'
    WHERE id = v_booking.id;

    -- Restore session quota
    UPDATE sessions
    SET kuota_terisi = GREATEST(0, kuota_terisi - v_booking.jumlah_orang),
        updated_at = now()
    WHERE id = v_booking.session_id;

    -- Insert log
    INSERT INTO booking_logs (
        booking_id,
        status_sebelum,
        status_sesudah,
        changed_by,
        keterangan,
        changed_at
    ) VALUES (
        v_booking.id,
        'PENDING',
        'CANCELLED',
        NULL,
        coalesce(p_alasan, 'Dibatalkan mandiri oleh pemesan'),
        now()
    );

    RETURN json_build_object(
        'success', true,
        'kode_booking', v_booking.kode_booking,
        'status', 'CANCELLED',
        'message', 'Booking berhasil dibatalkan.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Edge Case 7: Admin Session Quota Modification (update_session_quota)
--
-- Validates that new kuota_total cannot be less than currently occupied seats.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_session_quota(
    p_session_id uuid,
    p_new_kuota_total integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_role admin_role;
    v_session record;
BEGIN
    SELECT role INTO v_admin_role FROM admins WHERE id = auth.uid() AND is_active = true;
    IF v_admin_role != 'super_admin' THEN
        RAISE EXCEPTION 'Hanya super_admin yang berwenang mengubah kuota sesi!';
    END IF;

    SELECT * INTO v_session
    FROM sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesi tidak ditemukan!';
    END IF;

    IF p_new_kuota_total < v_session.kuota_terisi THEN
        RAISE EXCEPTION 'Kuota total baru (%) tidak boleh lebih kecil dari kuota yang sudah terisi (% kursi)!',
            p_new_kuota_total, v_session.kuota_terisi;
    END IF;

    UPDATE sessions
    SET kuota_total = p_new_kuota_total,
        updated_at = now()
    WHERE id = p_session_id;

    RETURN json_build_object(
        'success', true,
        'session_id', p_session_id,
        'kuota_total', p_new_kuota_total,
        'kuota_terisi', v_session.kuota_terisi
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. pg_cron Scheduling Setup Instructions & Migration
--
-- In Supabase, pg_cron is enabled via Database > Extensions > pg_cron.
-- Once enabled, run the cron.schedule command below to run auto_expire every 15 mins.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- Only attempt schedule if the cron extension exists in pg_catalog/cron schema
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        -- Remove existing job if already registered to prevent duplicates
        PERFORM cron.unschedule('cinebook-auto-expire-job');
        -- Schedule every 15 minutes: at minutes 0, 15, 30, 45
        PERFORM cron.schedule(
            'cinebook-auto-expire-job',
            '*/15 * * * *',
            'SELECT auto_expire_bookings();'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- In environments without pg_cron preloaded, gracefully continue without crashing migration
    RAISE NOTICE 'pg_cron is not enabled or available in this PostgreSQL instance. Use Supabase Edge Function auto-expire-cron with HTTP webhook as alternative.';
END;
$$;
