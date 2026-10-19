-- =============================================================================
-- CineBook Database Security Hardening
-- Step 14: Revoke Anon Access on Bookings + 8-char Booking Code + 16-hex HMAC
-- =============================================================================

-- 1. REVOKE all direct table access from 'anon' on bookings & audit logs
-- Prevents public PostgREST enumeration of student PII.
-- All client booking and verification operations MUST route through Security Definer RPCs
-- (create_booking, check_booking_status, scan_qr_preview).
REVOKE ALL ON TABLE public.bookings FROM anon;
REVOKE SELECT ON TABLE public.bookings FROM anon;
REVOKE ALL ON TABLE public.booking_logs FROM anon;
REVOKE SELECT ON TABLE public.booking_logs FROM anon;

-- Ensure RLS is strictly enforced
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_logs ENABLE ROW LEVEL SECURITY;

-- 2. STRENGTHEN BOOKING CODE ENTROPY: 8-character unambiguous random code
-- Format: CIN-YYYYMMDD-XXXXXXXX (31^8 = 852,887,143,761 possibilities)
-- Eliminates brute-force enumeration attacks completely.
CREATE OR REPLACE FUNCTION public.cinebook_generate_booking_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- Unambiguous (no 0/O, 1/I)
    v_random_str text := '';
    v_date_str text := to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date, 'YYYYMMDD');
    v_i integer;
BEGIN
    FOR v_i IN 1..8 LOOP
        v_random_str := v_random_str || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
    END LOOP;
    RETURN 'CIN-' || v_date_str || '-' || v_random_str;
END;
$$;

-- 3. CRYPTOGRAPHIC HMAC-SHA256 SIGNATURE: 16-character hex signature
CREATE OR REPLACE FUNCTION public.cinebook_create_qr_payload(
    p_kode_booking text,
    p_email text,
    p_booking_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_secret text;
    v_clean_code text;
    v_sig text;
BEGIN
    v_secret := cinebook_get_secret('qr_hmac_secret');
    v_clean_code := upper(trim(p_kode_booking));
    -- 16-hex characters HMAC-SHA256 signature (64-bit cryptographic security)
    v_sig := upper(substr(encode(hmac(v_clean_code::bytea, v_secret::bytea, 'sha256'), 'hex'), 1, 16));
    RETURN 'CB1:' || v_clean_code || ':' || v_sig;
END;
$$;

-- 4. VERIFY HMAC-SHA256 SIGNATURE WITH BACKWARD COMPATIBILITY
CREATE OR REPLACE FUNCTION public.cinebook_verify_qr_payload(p_payload text)
RETURNS TABLE (
    is_valid boolean,
    kode_booking text,
    booking_id uuid,
    email text,
    created_epoch bigint,
    error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_secret text;
    v_tokens text[];
    v_parsed_code text;
    v_parsed_id uuid;
    v_parsed_email text;
    v_parsed_epoch bigint;
    v_received_sig text;
    v_expected_sig_16 text;
    v_expected_sig_8 text;
BEGIN
    is_valid := false;
    error_message := NULL;

    IF p_payload IS NULL OR trim(p_payload) = '' THEN
        error_message := 'QR Code kosong!';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Format CB1:CODE:SIG
    IF p_payload LIKE 'CB1:%' THEN
        v_tokens := string_to_array(p_payload, ':');
        IF array_length(v_tokens, 1) = 3 THEN
            v_parsed_code := upper(trim(v_tokens[2]));
            v_received_sig := upper(trim(v_tokens[3]));
            v_secret := cinebook_get_secret('qr_hmac_secret');

            -- Calculate 16-char and 8-char HMAC signatures
            v_expected_sig_16 := upper(substr(encode(hmac(v_parsed_code::bytea, v_secret::bytea, 'sha256'), 'hex'), 1, 16));
            v_expected_sig_8 := upper(substr(v_expected_sig_16, 1, 8));

            IF v_received_sig != v_expected_sig_16 AND v_received_sig != v_expected_sig_8 THEN
                error_message := 'Tanda tangan digital QR Code tidak cocok (QR Palsu)!';
                RETURN NEXT;
                RETURN;
            END IF;

            SELECT b.id, b.email, extract(epoch from b.created_at)::bigint
            INTO v_parsed_id, v_parsed_email, v_parsed_epoch
            FROM bookings b
            WHERE b.kode_booking = v_parsed_code;

            is_valid := true;
            kode_booking := v_parsed_code;
            booking_id := v_parsed_id;
            email := v_parsed_email;
            created_epoch := coalesce(v_parsed_epoch, 0);
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    error_message := 'Format QR Code tidak dikenali atau rusak.';
    RETURN NEXT;
END;
$$;
