-- =============================================================================
-- CineBook Security Hardening: Step 15
-- Revoke EXECUTE on all Admin RPCs from Anon & Public + Strict is_admin() Guard
-- =============================================================================

-- 1. Helper function: is_admin_or_service()
-- Validates whether current database session belongs to an active administrator or service_role
CREATE OR REPLACE FUNCTION public.is_admin_or_service()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_jwt_role text;
BEGIN
    -- Check if service_role (used by server-side backend API / cron)
    BEGIN
        v_jwt_role := current_setting('request.jwt.claim.role', true);
    EXCEPTION WHEN OTHERS THEN
        v_jwt_role := NULL;
    END;

    IF v_jwt_role = 'service_role' THEN
        RETURN true;
    END IF;

    -- Check if authenticated admin user (via Supabase Auth Google SSO)
    IF auth.uid() IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM public.admins
            WHERE id = auth.uid() AND is_active = true
        );
    END IF;

    RETURN false;
END;
$$;

-- 2. Guard get_admin_dashboard_data() with is_admin_or_service()
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_total_revenue numeric;
    v_total_bookings integer;
    v_counts json;
    v_bookings json;
BEGIN
    IF NOT public.is_admin_or_service() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya administrator yang memiliki hak akses!' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(sum(total_harga), 0)
    INTO v_total_revenue
    FROM bookings
    WHERE status IN ('ACC', 'USED');

    SELECT count(*)
    INTO v_total_bookings
    FROM bookings;

    SELECT json_build_object(
        'PENDING', count(*) FILTER (WHERE status = 'PENDING'),
        'ACC', count(*) FILTER (WHERE status = 'ACC'),
        'USED', count(*) FILTER (WHERE status = 'USED'),
        'EXPIRED', count(*) FILTER (WHERE status = 'EXPIRED'),
        'CANCELLED', count(*) FILTER (WHERE status = 'CANCELLED')
    )
    INTO v_counts
    FROM bookings;

    SELECT json_agg(
        json_build_object(
            'id', b.id,
            'kode_booking', b.kode_booking,
            'nama_lengkap', b.nama_lengkap,
            'kelas', b.kelas,
            'email', b.email,
            'status', b.status,
            'total_harga', b.total_harga,
            'created_at', b.created_at,
            'film_judul', coalesce(f.judul, 'Film'),
            'tanggal', s.tanggal,
            'jam_mulai', s.jam_mulai,
            'nama_paket', p.nama_paket
        ) ORDER BY b.created_at DESC
    )
    INTO v_bookings
    FROM bookings b
    LEFT JOIN sessions s ON s.id = b.session_id
    LEFT JOIN films f ON f.id = s.film_id
    LEFT JOIN packages p ON p.id = b.package_id;

    RETURN json_build_object(
        'totalRevenue', v_total_revenue,
        'totalBookings', v_total_bookings,
        'counts', v_counts,
        'bookings', coalesce(v_bookings, '[]'::json)
    );
END;
$$;

-- 3. Guard admin_upsert_package() with is_admin_or_service()
CREATE OR REPLACE FUNCTION public.admin_upsert_package(
    p_id uuid DEFAULT NULL,
    p_nama_paket text DEFAULT '',
    p_jumlah_orang integer DEFAULT 1,
    p_harga numeric DEFAULT 25000,
    p_is_active boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_name text;
    v_target_id uuid;
BEGIN
    IF NOT public.is_admin_or_service() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya administrator yang memiliki hak akses!' USING ERRCODE = '42501';
    END IF;

    v_clean_name := trim(coalesce(p_nama_paket, ''));
    IF v_clean_name = '' THEN
        RAISE EXCEPTION 'Nama paket tiket wajib diisi!';
    END IF;

    IF p_jumlah_orang <= 0 THEN
        RAISE EXCEPTION 'Jumlah orang minimal 1 orang!';
    END IF;

    IF p_harga < 0 THEN
        RAISE EXCEPTION 'Harga paket tidak boleh negatif!';
    END IF;

    IF p_id IS NOT NULL THEN
        UPDATE packages
        SET
            nama_paket = v_clean_name,
            jumlah_orang = p_jumlah_orang,
            harga = p_harga,
            is_active = p_is_active,
            updated_at = now()
        WHERE id = p_id
        RETURNING id INTO v_target_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Paket dengan ID % tidak ditemukan!', p_id;
        END IF;

        RETURN json_build_object(
            'success', true,
            'package_id', v_target_id,
            'message', 'Paket tiket berhasil diperbarui!'
        );
    ELSE
        INSERT INTO packages (
            id,
            nama_paket,
            jumlah_orang,
            harga,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_clean_name,
            p_jumlah_orang,
            p_harga,
            p_is_active,
            now(),
            now()
        )
        RETURNING id INTO v_target_id;

        RETURN json_build_object(
            'success', true,
            'package_id', v_target_id,
            'message', 'Paket tiket baru berhasil ditambahkan!'
        );
    END IF;
END;
$$;

-- 4. Guard admin_delete_package() with is_admin_or_service()
CREATE OR REPLACE FUNCTION public.admin_delete_package(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_has_bookings boolean;
BEGIN
    IF NOT public.is_admin_or_service() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya administrator yang memiliki hak akses!' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM bookings WHERE package_id = p_id
    ) INTO v_has_bookings;

    IF v_has_bookings THEN
        UPDATE packages
        SET is_active = false, updated_at = now()
        WHERE id = p_id;

        RETURN json_build_object(
            'success', true,
            'deactivated', true,
            'message', 'Paket dinonaktifkan karena telah memiliki riwayat pesanan siswa.'
        );
    ELSE
        DELETE FROM packages WHERE id = p_id;
        RETURN json_build_object(
            'success', true,
            'deactivated', false,
            'message', 'Paket tiket berhasil dihapus permanen.'
        );
    END IF;
END;
$$;

-- 5. Guard admin_create_film_and_session() with is_admin_or_service()
CREATE OR REPLACE FUNCTION public.admin_create_film_and_session(
    p_judul text,
    p_deskripsi text DEFAULT NULL::text,
    p_durasi_menit integer DEFAULT 120,
    p_poster_path text DEFAULT NULL::text,
    p_tanggal date DEFAULT CURRENT_DATE,
    p_jam_mulai time without time zone DEFAULT '13:30:00'::time without time zone,
    p_kuota_total integer DEFAULT 60
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_film_id uuid;
    v_session_id uuid;
    v_durasi integer;
    v_kuota integer;
BEGIN
    IF NOT public.is_admin_or_service() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya administrator yang memiliki hak akses!' USING ERRCODE = '42501';
    END IF;

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
    IF v_durasi <= 0 THEN v_durasi := 120; END IF;

    v_kuota := coalesce(p_kuota_total, 60);
    IF v_kuota <= 0 THEN v_kuota := 60; END IF;

    INSERT INTO films (
        id, judul, deskripsi, durasi_menit, poster_path, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), trim(p_judul), trim(p_deskripsi), v_durasi, trim(p_poster_path), now(), now()
    )
    RETURNING id INTO v_film_id;

    INSERT INTO sessions (
        id, tanggal, jam_mulai, film_id, kuota_total, kuota_terisi, status_sesi, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), p_tanggal, p_jam_mulai, v_film_id, v_kuota, 0, 'AKTIF', now(), now()
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

-- 6. Guard admin_update_session() with is_admin_or_service()
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
    IF NOT public.is_admin_or_service() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya administrator yang memiliki hak akses!' USING ERRCODE = '42501';
    END IF;

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

-- 7. Guard cancel_session() with is_admin_or_service()
CREATE OR REPLACE FUNCTION public.cancel_session(p_session_id uuid, p_alasan text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_admin_role admin_role;
    v_affected integer := 0;
    v_b record;
BEGIN
    IF NOT public.is_admin_or_service() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya administrator yang memiliki hak akses!' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_admin_role FROM admins WHERE id = auth.uid() AND is_active = true;
    IF v_admin_role != 'super_admin' AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Hanya super_admin yang berhak membatalkan sesi!';
    END IF;

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

-- 8. REVOKE EXECUTE on all Admin RPCs from PUBLIC and anon
REVOKE ALL ON FUNCTION public.get_admin_dashboard_data() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_upsert_package(uuid, text, integer, numeric, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_package(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_packages() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_fetch_all_sessions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_session(uuid, integer, text, date, time without time zone) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_film_and_session(text, text, integer, text, date, time without time zone, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_session(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_admin_decision(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_cashier_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_gate_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_cashier_scan(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_gate_scan(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.scan_qr_preview(text) FROM PUBLIC, anon;

-- GRANT EXECUTE only to authenticated users (logged-in admins) and service_role
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_package(uuid, text, integer, numeric, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_package(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_packages() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_fetch_all_sessions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_session(uuid, integer, text, date, time without time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_film_and_session(text, text, integer, text, date, time without time zone, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_admin_decision(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cashier_queue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_gate_queue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_cashier_scan(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_gate_scan(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scan_qr_preview(text) TO authenticated, service_role;
