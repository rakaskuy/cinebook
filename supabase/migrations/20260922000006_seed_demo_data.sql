-- =============================================================================
-- CineBook Database Seed Data
-- Step 1b: Realistic Mock Data for Campus Cinema Festival
-- =============================================================================

-- 1. Seed Films
INSERT INTO films (id, judul, deskripsi, durasi_menit, poster_path)
VALUES
(
    '11111111-1111-1111-1111-111111111111',
    'Interstellar: Perjalanan Antariksa Mahasiswa',
    'Penjelajahan melintasi wormhole di dekat Saturnus demi mencari planet baru layak huni bagi kelangsungan umat manusia. Visual spektakuler dan audio menggelegar!',
    169,
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop'
),
(
    '22222222-2222-2222-2222-222222222222',
    'Spirited Away: Petualangan Dunia Roh',
    'Kisah magis Chihiro yang terjebak di pemandian air panas dunia roh dan berjuang menyelamatkan kedua orang tuanya dengan tekad yang tulus.',
    125,
    'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?q=80&w=800&auto=format&fit=crop'
),
(
    '33333333-3333-3333-3333-333333333333',
    'Spider-Man: Across the Spider-Verse',
    'Miles Morales terlempar melintasi Multiverse di mana ia bertemu dengan tim Spider-People yang bertugas melindungi keberadaan semesta.',
    140,
    'https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=800&auto=format&fit=crop'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Seed Packages
INSERT INTO packages (id, nama_paket, jumlah_orang, harga, is_active)
VALUES
(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Single Ticket (1 Orang)',
    1,
    25000.00,
    true
),
(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Couple Combo (2 Orang + Popcorn)',
    2,
    45000.00,
    true
),
(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Trio Hemat (3 Orang + 3 Minum)',
    3,
    65000.00,
    true
),
(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'Squad Feast (4 Orang + Jumbo Snack)',
    4,
    80000.00,
    true
)
ON CONFLICT (id) DO NOTHING;

-- 3. Seed Sessions (Today and Tomorrow)
INSERT INTO sessions (id, tanggal, jam_mulai, film_id, kuota_total, kuota_terisi, status_sesi)
VALUES
(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    CURRENT_DATE,
    '13:30:00',
    '11111111-1111-1111-1111-111111111111',
    60,
    4,
    'AKTIF'
),
(
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    CURRENT_DATE,
    '16:30:00',
    '22222222-2222-2222-2222-222222222222',
    50,
    2,
    'AKTIF'
),
(
    '99999999-9999-9999-9999-999999999999',
    CURRENT_DATE,
    '19:45:00',
    '33333333-3333-3333-3333-333333333333',
    70,
    0,
    'AKTIF'
),
(
    '88888888-8888-8888-8888-888888888888',
    CURRENT_DATE + 1,
    '14:00:00',
    '11111111-1111-1111-1111-111111111111',
    60,
    0,
    'AKTIF'
)
ON CONFLICT (tanggal, jam_mulai, film_id) DO NOTHING;
