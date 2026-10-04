# 🎬 CineBook — Architecture, Concurrency & Security Specification

Sistem reservasi tiket bioskop acara kampus berkinerja tinggi dengan integritas backend PostgreSQL (Supabase), Next.js 14 Client Web, dan Expo Android APK Scanner.

---

## 1. Concurrency & Atomic Locking Architecture

### Kenapa Row-Level Lock (`SELECT ... FOR UPDATE`) Dipilih Dibanding Optimistic Locking?

Dalam skenario penjualan tiket acara kampus atau pemutaran film terbatas ("war tiket"):
1. **Tingkat Kontensi Sangat Tinggi (High Contention on Final Seats):**
   Ketika kuota tersisa 2 kursi terakhir dan ada 50 mahasiswa yang menekan tombol *Checkout* secara bersamaan:
   - **Optimistic Locking (misal via version column / timestamp):**
     Membiarkan semua 50 transaksi membaca kuota lama. Saat commit, 49 transaksi mengalami version conflict dan terpaksa di-*abort* (rollback). Ini menimbulkan *wasted work*, lonjakan error ke pengguna yang sudah mengisi form lengkap, dan beban retry berulang ke server.
   - **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE OF sessions`):**
     Database engine mengunci baris spesifik sesi yang dipesan secara eksklusif. Permintaan lain untuk sesi yang sama akan antre secara FIFO di tingkat kernel engine PostgreSQL. Durasi penahanan lock ini sangat singkat (2–5 milidetik: hanya waktu evaluasi `kuota_terisi + seats <= kuota_total` dan satu baris `INSERT bookings`). Transaksi berikutnya langsung melihat kuota nyata teranyar. Kuota habis akan ditolak secara ramah (*clean rejection*) tanpa crash atau race condition.
2. **Jaminan Nol Overbooking (Zero Negative Quota Anomaly):**
   Constraint database `CHECK (kuota_terisi <= kuota_total)` bersama `FOR UPDATE` menjamin 100% konsistensi ACID secara matematis di level database engine, independen dari client mana pun yang memanggil (Web maupun Mobile).

---

## 2. Protokol Kriptografi E-Ticket QR (Anti-Fraud)

### Struktur Token `CB1` (CineBook Version 1)
Format:
```text
CB1.<base64url_data>.<hex_hmac_signature>
```
Komponen `raw_data`:
```text
kode_booking | booking_id | lower(email) | timestamp_epoch
```

### Mekanisme Verifikasi
1. Sistem mengambil kunci rahasia aplikasi dari tabel `cinebook_config` via fungsi `SECURITY DEFINER` (tidak dapat diakses oleh publik).
2. Sistem menghitung HMAC-SHA256 dari `raw_data` menggunakan kunci rahasia.
3. Tanda tangan digital hasil komputasi dicocokkan dengan `<hex_hmac_signature>`.
4. Jika tanda tangan tidak cocok atau struktur rusak, sistem langsung menolak dengan status `INVALID_QR` dan mencegah scanning QR dari sistem/acara lain.
5. Kode QR tidak dapat dipalsukan atau diubah isinya (misal mengubah kode booking atau email) karena perubahan 1 karakter saja akan menghasilkan signature yang sama sekali berbeda.

---

## 3. State Machine & Two-Phase Verification

### Alur Status Booking
```
[PENDING] --(Kasir ACC via scan)--> [ACC] --(Gate ACC via scan)--> [USED]
    │                                 │
    ├──(24 jam tanpa ACC)──> [EXPIRED] ├──(Sesi Dibatalkan)──> [CANCELLED]
    └──(Batal Mandiri)────> [CANCELLED]
```

### Two-Phase Scanning Process
1. **Fase 1: `scan_qr_preview(qr_payload)` (Read-Only)**
   - Mendekode & memverifikasi digital signature.
   - Melakukan relasi `bookings` + `films` + `sessions` + `packages`.
   - Menghitung `available_actions` berdasarkan role admin yang sedang login:
     - **Kasir:** Hanya diperkenankan `ACC` atau `DECLINE` jika status masih `PENDING`.
     - **Gate:** Hanya diperkenankan `ACC` atau `DECLINE` jika status `ACC` dan tanggal sesi = **hari ini**.
   - Menampilkan peringatan visual jika tiket telah di-decline $\ge 3$ kali.
   - **TIDAK mengubah data apa pun di database.**
2. **Fase 2: `submit_admin_decision(kode_booking, decision, alasan?)`**
   - Mengambil row-level lock pada baris booking (`FOR UPDATE`).
   - Memastikan status tidak berubah antara waktu preview dan submit (cegah double scan oleh dua kasir bersamaan).
   - Jika `decision = 'ACC'`:
     - Kasir: mengubah `PENDING` $\to$ `ACC`, mencatat `acc_at` & `acc_by`.
     - Gate: mengubah `ACC` $\to$ `USED`, mencatat `used_at` & `used_by`.
   - Jika `decision = 'DECLINE'`:
     - Alasan **WAJIB diisi**.
     - Status booking **TIDAK BERUBAH** (tetap `PENDING` atau `ACC`) sehingga pembeli dapat memperbaiki bukti pembayaran.
     - Kolom `decline_count` bertambah $+1$ dan alasan tersimpan di tabel audit `booking_logs`.

---

## 4. Penanganan Edge Cases

| Edge Case | Penanganan & Solusi Sistem |
|---|---|
| **Rebutan Kursi Terakhir** | `SELECT ... FOR UPDATE` pada baris sesi mengunci baris saat evaluasi kuota, mencegah 2 user mendapatkan kursi yang sama. |
| **QR Di-decline Berulang Kali** | Kolom `decline_count` melacak total penolakan. Jika $\ge 3$, muncul notifikasi bahaya warna merah pada preview admin scanner. |
| **QR Sistem Lain / Palsu** | `cinebook_verify_qr_payload` memverifikasi HMAC-SHA256. Jika tidak cocok, status `INVALID_QR` dikembalikan tanpa membuka data sensitif. |
| **Izin Kamera HP Ditolak** | Admin app menyediakan fallback input manual kode booking via keyboard native serta tombol pintas buka pengaturan HP (`Linking.openSettings()`). |
| **Sesi Dibatalkan Mendadak** | Fungsi `cancel_session(session_id, alasan)` mengunci sesi jadi `DITUTUP`, meng-cascade pembatalan ke semua booking `PENDING` & `ACC`, dan mencatat riwayat audit. |
| **Pembatalan Mandiri User** | Fungsi `cancel_booking_by_user(kode_booking, email)` memungkinkan pemesan membatalkan tiket `PENDING` miliknya dan otomatis mengembalikan kuota kursi ke publik. |
| **Perubahan Kuota Total Sesi** | Fungsi `update_session_quota(session_id, new_quota)` memvalidasi bahwa kuota baru tidak boleh lebih kecil dari kuota yang sudah terisi. |

---

## 5. Setup Scheduler `pg_cron`

Jalankan query berikut di Supabase SQL Editor:
```sql
-- Aktifkan ekstensi
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Jadwalkan auto_expire_bookings() tiap 15 menit
SELECT cron.schedule(
    'cinebook-auto-expire-job',
    '*/15 * * * *',
    'SELECT auto_expire_bookings();'
);
```

Untuk melihat status job:
```sql
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```
