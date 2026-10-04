# 🎬 CineBook — Sistem Pemesanan Tiket Bioskop Acara Kampus (Full Web & Mobile)

Sistem pemesanan tiket bioskop proker kampus siap produksi dengan arsitektur **Full Web Next.js 14** (Client Mahasiswa + Portal Kasir/Gate/Admin dengan Kamera Web Browser) serta opsi **Admin App Android APK (Expo)**, ditenagai oleh backend bersama Supabase / PostgreSQL dan gaya visual **Modern Memphis / Abstract Collage**.

---

## 🌟 Akses Cepat Full Web (Semua Berjalan 100% di Browser)

Dengan arsitektur Full Web, panitia dan mahasiswa cukup membuka browser tanpa perlu instalasi APK:
- **Halaman Penonton / Mahasiswa:**
  - `http://localhost:3000/` — Pilih Tanggal & Sesi Film
  - `http://localhost:3000/booking/[sessionId]` — Pilih Paket & Formulir Pemesanan
  - `http://localhost:3000/ticket/[kodeBooking]` — E-Ticket QR Resmi & Countdown 24 Jam
- **Portal Admin & Scanner Lapangan (Web Browser):**
  - `http://localhost:3000/admin/login` — Login Panitia (dilengkapi 1-Tap Quick Demo Role)
  - `http://localhost:3000/admin/dashboard` — Dashboard Super Admin & Laporan Keuangan
  - `http://localhost:3000/admin/verify` — Kamera Web Scanner Kasir (Scan QR + ACC Bayar Offline)
  - `http://localhost:3000/admin/gate` — Kamera Web Scanner Pintu Gate (Validasi Tanggal Hari H & Akses Masuk)
  - `http://localhost:3000/admin/sessions` — Kelola Kuota & Pembatalan Sesi Darurat
  - `http://localhost:3000/api/export-bookings` — Unduh Rekap Transaksi CSV

---

## 🚀 Fitur Utama

1. **Client Web (Mahasiswa / Penonton):**
   - **Pilih Jadwal:** Telusuri tanggal dan sesi pemutaran film dengan visualisasi kuota kursi terisi secara realtime.
   - **Pilih Paket & Data:** Dukungan paket tiket (Single, Couple Combo, Trio Hemat, Squad Feast) dengan kalkulator harga instan dan validasi Zod.
   - **E-Ticket Terverifikasi:** Tampilan E-Ticket bergaya Modern Memphis dengan QR Code bertanda tangan digital HMAC-SHA256 dan countdown timer 24 jam menuju kedaluwarsa.
   - **Pencarian Tiket Aman:** Kunci akses ganda (`kode_booking` + `email`) mencegah akses tidak berwenang ke tiket orang lain.

2. **Admin App (Kasir, Gate & Super Admin — React Native / Expo):**
   - **Kasir:** Kamera native fullscreen, respons getar (*haptic feedback*), tinjauan detail booking, tombol keputusan besar ACC/DECLINE, serta fallback input kode manual.
   - **Gate:** Scanner cepat untuk pintu masuk teater dengan validasi otomatis kesesuaian tanggal sesi hari H.
   - **Super Admin:** Dashboard statistik pendapatan offline hari ini, rincian status tiket, feed transaksi, dan ekspor laporan CSV.
   - **Session Persistence:** Penyimpanan sesi login via `expo-secure-store` sehingga panitia tidak perlu login ulang saat aplikasi ditutup.

3. **Backend & Database Logic (Supabase / PostgreSQL):**
   - **Atomic Transaksi:** Pemesanan dengan `SELECT ... FOR UPDATE` menjamin nol overbooking pada penjualan tiket berkecepatan tinggi (*war tiket*).
   - **QR Code Anti-Fraud:** Protokol `CB1` dengan hashing HMAC-SHA256 untuk memvalidasi integritas QR dan menolak QR palsu/dari sistem luar.
   - **Two-Phase Scan:** Pemindaian membaca data terlebih dahulu (`scan_qr_preview`), baru menerapkan mutasi pada penekanan tombol (`submit_admin_decision`).
   - **Auto-Expire Scheduler:** Pengembalian kuota otomatis via `pg_cron` untuk pemesanan yang tidak dibayar dalam 24 jam.
   - **Row Level Security (RLS):** Kebijakan ketat berbasis role admin (`super_admin`, `kasir`, `gate`).

---

## 📂 Struktur Repositori

```text
cinebook/
├── supabase/
│   ├── schema_full_production.sql        # Script SQL gabungan siap eksekusi
│   ├── migrations/
│   │   ├── 20260922000001_initial_schema.sql
│   │   ├── 20260922000002_create_booking.sql
│   │   ├── 20260922000003_scan_and_decision.sql
│   │   ├── 20260922000004_auto_expire_and_edge_cases.sql
│   │   ├── 20260922000005_row_level_security.sql
│   │   └── 20260922000006_seed_demo_data.sql
│   └── functions/
│       ├── send-booking-email/           # Kirim e-ticket QR via Resend API
│       ├── send-decision-email/          # Notifikasi ACC/DECLINE kasir & gate
│       ├── auto-expire-cron/             # Webhook cron pembersih 24 jam
│       └── export-bookings-report/       # Ekspor laporan CSV festival
├── web/                                  # Next.js 14 Client Web
│   ├── src/app/                          # App Router (Landing, Booking, Ticket)
│   ├── src/components/                   # Komponen Memphis, Navbar, Footer
│   └── src/lib/                          # Supabase client & types
├── admin-app/                            # React Native / Expo Admin App
│   ├── src/screens/                      # Login, Dashboard, Verify (Kasir), Gate
│   ├── src/lib/                          # SecureStore & Supabase client
│   ├── app.json                          # Izin kamera & konfigurasi native
│   └── eas.json                          # Profil build Android APK langsung
└── docs/
    └── architecture_and_security.md      # Detail algoritma & concurrency
```

---

## 🛠️ Panduan Menjalankan

### 1. Database Supabase
1. Buka dashboard Supabase project Anda.
2. Masuk ke menu **SQL Editor**.
3. Buka file `cinebook/supabase/schema_full_production.sql` dan klik **Run**.
4. Semua tabel, fungsi atomik, kebijakan RLS, dan data sampel film langsung aktif.

### 2. Client Web (Next.js)
```bash
cd cinebook/web
npm install
npm run dev
```
Buka browser di [http://localhost:3000](http://localhost:3000).

> *Catatan:* Aplikasi web telah dilengkapi built-in interactive mock fallback sehingga dapat langsung dijalankan dan diuji bahkan sebelum konfigurasi kunci API Supabase dihubungkan!

### 3. Admin App (React Native / Expo)
```bash
cd cinebook/admin-app
npm install
npx expo start
```
- Jalankan di emulator Android dengan menekan `a`, atau scan QR melalui aplikasi **Expo Go** di HP panitia.
- Tersedia tombol **1-Tap Quick Demo Login** untuk mencoba role Kasir, Gate, atau Super Admin secara langsung.

### 4. Build APK Android (EAS Build)
Untuk menghasilkan file `.apk` mandiri yang dapat langsung diinstal panitia di lapangan tanpa melalui Google Play Store:
```bash
cd cinebook/admin-app
# Login akun Expo Anda
npx eas login
# Jalankan build profil preview APK
npx eas build --platform android --profile preview
```
File APK siap didistribusikan ke panitia lapangan.

---

## 🎨 Desain: Modern Memphis / Abstract Collage

Sistem mengadopsi estetika **Modern Memphis** dengan karakteristik:
- Palet kontras tinggi: Memphis Yellow (`#FFE600`), Hot Pink (`#FF3366`), Vibrant Cyan (`#00F0FF`), Neon Green (`#00E599`).
- Garis tepi hitam tegas (`border: 3px/4px solid #18181B`).
- Bayangan keras tanpa blur (*neo-brutalist hard shadows*: `box-shadow: 4px 4px 0px #18181B`).
- Bentuk geometris abstrak (lingkaran, segitiga miring, pola titik-titik radial, squiggle melayang).
- **Khusus Layar Scanner (Kasir & Gate):** Antarmuka dirancang dengan prioritas utilitas lapangan: kontras tinggi, tombol ACC/DECLINE ekstra besar, serta area kamera bersih tanpa gangguan visual.
