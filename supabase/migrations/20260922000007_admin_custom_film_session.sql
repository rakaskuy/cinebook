-- =============================================================================
-- CineBook Database Migration
-- Step 7: Support for Custom Film Creation & Custom Session Scheduling
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Function: admin_create_film
-- Allows admin to register a custom film with title, synopsis, duration, and poster
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

-- -----------------------------------------------------------------------------
-- Function: admin_create_film_and_session
-- Atomic creation of a custom film and its corresponding theater schedule session
-- -----------------------------------------------------------------------------
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

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION admin_create_film TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_create_film_and_session TO anon, authenticated, service_role;
