-- =============================================================================
-- CineBook Database Schema
-- Step 1: Enums, Tables, Constraints, and Indexes
-- =============================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean up any existing objects if re-running in development
DROP TABLE IF EXISTS booking_logs CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS packages CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS films CASCADE;
DROP TABLE IF EXISTS cinebook_config CASCADE;

DROP TYPE IF EXISTS admin_role CASCADE;
DROP TYPE IF EXISTS booking_status CASCADE;
DROP TYPE IF EXISTS session_status CASCADE;

-- -----------------------------------------------------------------------------
-- 1. Custom Types & Enums
-- -----------------------------------------------------------------------------
CREATE TYPE session_status AS ENUM ('AKTIF', 'DITUTUP');
CREATE TYPE booking_status AS ENUM ('PENDING', 'ACC', 'USED', 'EXPIRED', 'CANCELLED');
CREATE TYPE admin_role AS ENUM ('super_admin', 'kasir', 'gate');

-- -----------------------------------------------------------------------------
-- 2. System Configuration & Security Secrets
-- -----------------------------------------------------------------------------
-- Stores application-level cryptographic keys and operational flags.
-- No public RLS access: accessible solely via SECURITY DEFINER functions.
CREATE TABLE cinebook_config (
    key text PRIMARY KEY,
    value text NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now()
);

-- Seed default HMAC secret key (can and should be rotated in production)
INSERT INTO cinebook_config (key, value, description)
VALUES (
    'qr_hmac_secret',
    'cb_secret_production_hmac_2026_cinebook_secure_key_99x#',
    'Secret key used for HMAC-SHA256 signature verification in e-ticket QR payloads'
);

-- -----------------------------------------------------------------------------
-- 3. films Table
-- -----------------------------------------------------------------------------
CREATE TABLE films (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    judul text NOT NULL,
    deskripsi text,
    durasi_menit integer NOT NULL CHECK (durasi_menit > 0),
    poster_path text, -- Path in Supabase Storage bucket (e.g. 'posters/film-slug.jpg')
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. sessions Table
-- -----------------------------------------------------------------------------
CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal date NOT NULL,
    jam_mulai time NOT NULL,
    film_id uuid NOT NULL REFERENCES films(id) ON DELETE RESTRICT,
    kuota_total integer NOT NULL CHECK (kuota_total > 0),
    kuota_terisi integer NOT NULL DEFAULT 0 CHECK (kuota_terisi >= 0 AND kuota_terisi <= kuota_total),
    status_sesi session_status NOT NULL DEFAULT 'AKTIF',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_session_schedule UNIQUE (tanggal, jam_mulai, film_id)
);

-- -----------------------------------------------------------------------------
-- 5. packages Table
-- -----------------------------------------------------------------------------
CREATE TABLE packages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_paket text NOT NULL,
    jumlah_orang integer NOT NULL CHECK (jumlah_orang > 0),
    harga numeric(10, 2) NOT NULL CHECK (harga >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 6. admins Table
-- -----------------------------------------------------------------------------
-- References Supabase auth.users.id
CREATE TABLE admins (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nama text NOT NULL,
    role admin_role NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 7. bookings Table
-- -----------------------------------------------------------------------------
CREATE TABLE bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_booking text NOT NULL UNIQUE,
    session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    package_id uuid NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
    nama_lengkap text NOT NULL,
    kelas text NOT NULL,
    email text NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    status booking_status NOT NULL DEFAULT 'PENDING',
    qr_payload text NOT NULL,
    total_harga numeric(10, 2) NOT NULL CHECK (total_harga >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    expired_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    acc_at timestamptz,
    acc_by uuid REFERENCES admins(id) ON DELETE SET NULL,
    used_at timestamptz,
    used_by uuid REFERENCES admins(id) ON DELETE SET NULL,
    decline_count integer NOT NULL DEFAULT 0 CHECK (decline_count >= 0)
);

-- -----------------------------------------------------------------------------
-- 8. booking_logs Table (Immutable Audit Trail)
-- -----------------------------------------------------------------------------
CREATE TABLE booking_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    status_sebelum text,
    status_sesudah text NOT NULL,
    changed_by uuid REFERENCES admins(id) ON DELETE SET NULL,
    keterangan text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 9. Performance Indexes
-- -----------------------------------------------------------------------------
-- Core lookup indexes
CREATE INDEX idx_bookings_kode_booking ON bookings (kode_booking);
CREATE INDEX idx_bookings_session_id ON bookings (session_id);
CREATE INDEX idx_bookings_status ON bookings (status);
CREATE INDEX idx_bookings_email ON bookings (email);

-- Composite index for the auto-expire background job
CREATE INDEX idx_bookings_status_expired_at ON bookings (status, expired_at)
    WHERE status = 'PENDING';

-- Composite index for fast combined booking status check
CREATE INDEX idx_bookings_kode_email ON bookings (kode_booking, lower(email));

-- Sessions lookup index for scheduling & calendar views
CREATE INDEX idx_sessions_tanggal_status ON sessions (tanggal, status_sesi);
CREATE INDEX idx_sessions_film_id ON sessions (film_id);

-- Booking logs index for auditing and timeline reconstruction
CREATE INDEX idx_booking_logs_booking_id ON booking_logs (booking_id);
CREATE INDEX idx_booking_logs_changed_at ON booking_logs (changed_at DESC);
