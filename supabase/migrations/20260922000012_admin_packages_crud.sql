-- =============================================================================
-- CineBook Database Functions
-- Step 12: Admin Package & Pricing Configuration CRUD RPCs
-- =============================================================================

-- 1. Get all packages (including inactive ones for admin management)
CREATE OR REPLACE FUNCTION public.admin_get_packages()
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
            'id', id,
            'nama_paket', nama_paket,
            'jumlah_orang', jumlah_orang,
            'harga', harga,
            'is_active', is_active,
            'created_at', created_at,
            'updated_at', updated_at
        ) ORDER BY jumlah_orang ASC, harga ASC
    ) INTO v_result
    FROM packages;

    RETURN coalesce(v_result, '[]'::json);
END;
$$;

-- 2. Create or Update Package (Upsert)
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
        -- Update existing package
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
        -- Insert new package
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

-- 3. Delete Package (Safely deactivates if bookings already reference it)
CREATE OR REPLACE FUNCTION public.admin_delete_package(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_has_bookings boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM bookings WHERE package_id = p_id
    ) INTO v_has_bookings;

    IF v_has_bookings THEN
        -- Deactivate instead of hard delete to preserve referential integrity
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
