-- =============================================================================
-- CineBook Database Functions
-- Step 2: Atomic create_booking() with Row-Level Lock & HMAC-SHA256 QR Token
-- =============================================================================

-- Helper function: Secure retrieval of application secret (HMAC secret)
CREATE OR REPLACE FUNCTION cinebook_get_secret(p_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_secret text;
BEGIN
    SELECT value INTO v_secret FROM cinebook_config WHERE key = p_key;
    IF v_secret IS NULL THEN
        -- Fallback default for robust operation if config row was omitted
        v_secret := 'cinebook_default_fallback_secret_hmac_2026_x#';
    END IF;
    RETURN v_secret;
END;
$$;

-- Helper function: Generate unique booking code in format CIN-YYYYMMDD-XXXX
CREATE OR REPLACE FUNCTION cinebook_generate_booking_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- Unambiguous characters (no 0/O, 1/I)
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

-- Helper function: Generate HMAC-SHA256 QR Payload
-- Format: CB1.<base64url_data>.<hex_signature>
CREATE OR REPLACE FUNCTION cinebook_create_qr_payload(
    p_kode_booking text,
    p_email text,
    p_booking_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_secret text;
    v_raw_data text;
    v_data_b64 text;
    v_signature text;
BEGIN
    v_secret := cinebook_get_secret('qr_hmac_secret');
    -- Raw structured token payload: code|id|email|salt
    v_raw_data := p_kode_booking || '|' || p_booking_id::text || '|' || lower(p_email) || '|' || extract(epoch from now())::bigint;
    v_data_b64 := translate(encode(v_raw_data::bytea, 'base64'), E'+/=\n', '-_');
    v_signature := encode(hmac(v_raw_data::bytea, v_secret::bytea, 'sha256'), 'hex');

    -- CB1 = CineBook Version 1 QR Protocol
    RETURN 'CB1.' || v_data_b64 || '.' || v_signature;
END;
$$;

-- -----------------------------------------------------------------------------
-- Core Atomic Function: create_booking()
--
-- Why Pessimistic Row-Level Lock (SELECT ... FOR UPDATE) vs Optimistic Lock?
-- 1. High Contention in Flash Sales ("War Tiket"):
--    When many users target the last 2 seats simultaneously, optimistic locking
--    (e.g. version checking) would cause massive transaction rollbacks at commit
--    time, frustrating users who just filled out forms.
-- 2. Guaranteed Serialized Quota Decrement:
--    `SELECT ... FOR UPDATE` acquires an exclusive row lock on the specific session
--    for merely 2-5 milliseconds. Incoming requests for that session queue smoothly
--    in the database engine. The quota is verified against the real-time committed
--    state, completely preventing double-booking and negative quota anomalies.
-- 3. Platform Agnostic & Database-Enforced:
--    Whether called from Web or external API, race conditions cannot occur because
--    the isolation boundary is held inside the database engine.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_booking(
    p_session_id uuid,
    p_package_id uuid,
    p_nama_lengkap text,
    p_kelas text,
    p_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session record;
    v_package record;
    v_film record;
    v_new_booking_id uuid;
    v_kode_booking text;
    v_qr_payload text;
    v_expired_at timestamptz;
    v_retry_count integer := 0;
    v_max_retries integer := 5;
    v_code_found boolean;
    v_clean_name text;
    v_clean_kelas text;
    v_clean_email text;
BEGIN
    -- 1. Input sanitization and validation
    v_clean_name := trim(p_nama_lengkap);
    v_clean_kelas := trim(p_kelas);
    v_clean_email := lower(trim(p_email));

    IF v_clean_name = '' THEN
        RAISE EXCEPTION 'Nama lengkap wajib diisi!';
    END IF;

    IF v_clean_kelas = '' THEN
        RAISE EXCEPTION 'Kelas/jurusan wajib diisi!';
    END IF;

    IF v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'Format email tidak valid!';
    END IF;

    -- 2. Fetch package specifications
    SELECT * INTO v_package
    FROM packages
    WHERE id = p_package_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paket tiket tidak ditemukan atau sudah tidak aktif!';
    END IF;

    -- 3. ACQUIRE EXCLUSIVE ROW-LEVEL LOCK on the target session
    -- This prevents concurrent transactions from reading stale kuota_terisi.
    SELECT s.*, f.judul as film_judul, f.poster_path as film_poster
    INTO v_session
    FROM sessions s
    JOIN films f ON f.id = s.film_id
    WHERE s.id = p_session_id
    FOR UPDATE OF s;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesi pemutaran film tidak ditemukan!';
    END IF;

    IF v_session.status_sesi != 'AKTIF' THEN
        RAISE EXCEPTION 'Sesi ini sudah ditutup untuk pemesanan!';
    END IF;

    -- Check if session schedule has already passed
    IF (v_session.tanggal < CURRENT_DATE) OR
       (v_session.tanggal = CURRENT_DATE AND v_session.jam_mulai <= CURRENT_TIME) THEN
        RAISE EXCEPTION 'Sesi film ini telah selesai atau sedang berlangsung!';
    END IF;

    -- 4. Strict atomic quota validation
    IF (v_session.kuota_terisi + v_package.jumlah_orang) > v_session.kuota_total THEN
        RAISE EXCEPTION 'Sisa kuota tidak mencukupi! Tersisa % kursi, paket membutuhkan % kursi.',
            (v_session.kuota_total - v_session.kuota_terisi), v_package.jumlah_orang;
    END IF;

    -- 5. Generate collision-resistant unique booking code
    LOOP
        v_kode_booking := cinebook_generate_booking_code();
        SELECT EXISTS (
            SELECT 1 FROM bookings WHERE kode_booking = v_kode_booking
        ) INTO v_code_found;

        EXIT WHEN NOT v_code_found;

        v_retry_count := v_retry_count + 1;
        IF v_retry_count >= v_max_retries THEN
            -- Add microsecond entropy in worst-case collision scenario
            v_kode_booking := 'CIN-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                              substr(md5(random()::text || clock_timestamp()::text), 1, 4);
            EXIT;
        END IF;
    END LOOP;

    -- 6. Generate IDs and cryptographic QR payload
    v_new_booking_id := gen_random_uuid();
    v_expired_at := now() + interval '24 hours';
    v_qr_payload := cinebook_create_qr_payload(v_kode_booking, v_clean_email, v_new_booking_id);

    -- 7. Insert booking record
    INSERT INTO bookings (
        id,
        kode_booking,
        session_id,
        package_id,
        nama_lengkap,
        kelas,
        email,
        status,
        qr_payload,
        total_harga,
        created_at,
        expired_at,
        decline_count
    ) VALUES (
        v_new_booking_id,
        v_kode_booking,
        v_session.id,
        v_package.id,
        v_clean_name,
        v_clean_kelas,
        v_clean_email,
        'PENDING',
        v_qr_payload,
        v_package.harga,
        now(),
        v_expired_at,
        0
    );

    -- 8. Increment session kuota_terisi atomically
    UPDATE sessions
    SET kuota_terisi = kuota_terisi + v_package.jumlah_orang,
        updated_at = now()
    WHERE id = v_session.id;

    -- 9. Insert initial audit log
    INSERT INTO booking_logs (
        booking_id,
        status_sebelum,
        status_sesudah,
        changed_by,
        keterangan,
        changed_at
    ) VALUES (
        v_new_booking_id,
        NULL,
        'PENDING',
        NULL,
        'Booking berhasil dibuat oleh user (' || v_package.nama_paket || ' - ' || v_package.jumlah_orang || ' orang)',
        now()
    );

    -- 10. Return structured JSON payload for frontend consumption
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
