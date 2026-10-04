-- =============================================================================
-- CineBook Database Policies
-- Step 5: Complete Row Level Security (RLS) & Role-Based Access Control
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper Function: get_admin_role()
--
-- Cached / SECURITY DEFINER lookup for currently authenticated admin user.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_role()
RETURNS admin_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role admin_role;
BEGIN
    SELECT role INTO v_role
    FROM admins
    WHERE id = auth.uid() AND is_active = true;

    RETURN v_role;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Enable RLS on all tables
-- -----------------------------------------------------------------------------
ALTER TABLE films ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cinebook_config ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. films Policies
-- -----------------------------------------------------------------------------
-- Public can read all film catalogues
CREATE POLICY "films_public_read" ON films
    FOR SELECT
    USING (true);

-- Only super_admin can create, update, or delete films
CREATE POLICY "films_super_admin_manage" ON films
    FOR ALL
    TO authenticated
    USING (get_admin_role() = 'super_admin')
    WITH CHECK (get_admin_role() = 'super_admin');

-- -----------------------------------------------------------------------------
-- 4. sessions Policies
-- -----------------------------------------------------------------------------
-- Public can read all session schedules
CREATE POLICY "sessions_public_read" ON sessions
    FOR SELECT
    USING (true);

-- Only super_admin can manage sessions directly (normal quota updates occur via create_booking)
CREATE POLICY "sessions_super_admin_manage" ON sessions
    FOR ALL
    TO authenticated
    USING (get_admin_role() = 'super_admin')
    WITH CHECK (get_admin_role() = 'super_admin');

-- -----------------------------------------------------------------------------
-- 5. packages Policies
-- -----------------------------------------------------------------------------
-- Public can read active packages
CREATE POLICY "packages_public_read" ON packages
    FOR SELECT
    USING (is_active = true OR get_admin_role() IS NOT NULL);

-- Only super_admin can manage ticket package pricing and definitions
CREATE POLICY "packages_super_admin_manage" ON packages
    FOR ALL
    TO authenticated
    USING (get_admin_role() = 'super_admin')
    WITH CHECK (get_admin_role() = 'super_admin');

-- -----------------------------------------------------------------------------
-- 6. admins Policies
-- -----------------------------------------------------------------------------
-- Admins can read their own profile; super_admin can read all admin profiles
CREATE POLICY "admins_read_policy" ON admins
    FOR SELECT
    TO authenticated
    USING (id = auth.uid() OR get_admin_role() = 'super_admin');

-- Only super_admin can insert, update, or deactivate admin accounts
CREATE POLICY "admins_super_admin_manage" ON admins
    FOR ALL
    TO authenticated
    USING (get_admin_role() = 'super_admin')
    WITH CHECK (get_admin_role() = 'super_admin');

-- -----------------------------------------------------------------------------
-- 7. bookings Policies
-- -----------------------------------------------------------------------------
-- SELECT:
-- 1. Any verified admin (kasir, gate, super_admin) can view bookings.
-- 2. Public users access booking details via check_booking_status() [SECURITY DEFINER],
--    or directly if matching their session email claim.
CREATE POLICY "bookings_admin_read" ON bookings
    FOR SELECT
    TO authenticated
    USING (get_admin_role() IS NOT NULL);

-- INSERT:
-- Public creates bookings strictly through create_booking() [SECURITY DEFINER].
-- Direct table INSERT is restricted to super_admin.
CREATE POLICY "bookings_super_admin_insert" ON bookings
    FOR INSERT
    TO authenticated
    WITH CHECK (get_admin_role() = 'super_admin');

-- UPDATE:
-- Kasir can only update bookings if old status is PENDING.
-- Gate can only update bookings if old status is ACC.
-- Super_admin has full update authority.
CREATE POLICY "bookings_role_based_update" ON bookings
    FOR UPDATE
    TO authenticated
    USING (
        (get_admin_role() = 'kasir' AND status = 'PENDING') OR
        (get_admin_role() = 'gate' AND status = 'ACC') OR
        (get_admin_role() = 'super_admin')
    )
    WITH CHECK (
        (get_admin_role() = 'kasir' AND status IN ('PENDING', 'ACC')) OR
        (get_admin_role() = 'gate' AND status IN ('ACC', 'USED')) OR
        (get_admin_role() = 'super_admin')
    );

-- DELETE:
-- Explicitly NO DELETE policy defined. Bookings can never be deleted
-- by any user to preserve accounting and security records.

-- -----------------------------------------------------------------------------
-- 8. booking_logs Policies (Immutable Audit Trail)
-- -----------------------------------------------------------------------------
-- SELECT: Only active admins can inspect the audit trail
CREATE POLICY "booking_logs_admin_read" ON booking_logs
    FOR SELECT
    TO authenticated
    USING (get_admin_role() IS NOT NULL);

-- INSERT: Allowed by authenticated admins or internal security functions
CREATE POLICY "booking_logs_admin_insert" ON booking_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (get_admin_role() IS NOT NULL);

-- UPDATE and DELETE: NEVER allowed. The table is strictly append-only.

-- -----------------------------------------------------------------------------
-- 9. cinebook_config Policies
-- -----------------------------------------------------------------------------
-- No public or direct user access. Only readable/writable by super_admin.
CREATE POLICY "cinebook_config_super_admin" ON cinebook_config
    FOR ALL
    TO authenticated
    USING (get_admin_role() = 'super_admin')
    WITH CHECK (get_admin_role() = 'super_admin');
