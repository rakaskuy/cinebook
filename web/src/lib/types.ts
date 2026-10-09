export type BookingStatus = 'PENDING' | 'ACC' | 'USED' | 'EXPIRED' | 'CANCELLED';
export type SessionStatus = 'AKTIF' | 'DITUTUP';
export type AdminRole = 'super_admin' | 'kasir' | 'gate';

export interface Film {
  id: string;
  judul: string;
  deskripsi: string;
  durasi_menit: number;
  poster_path: string;
  created_at?: string;
}

export interface Session {
  id: string;
  tanggal: string;
  jam_mulai: string;
  film_id: string;
  kuota_total: number;
  kuota_terisi: number;
  status_sesi: SessionStatus;
  films?: Film;
}

export interface Package {
  id: string;
  nama_paket: string;
  jumlah_orang: number;
  harga: number;
  is_active: boolean;
}

export interface Booking {
  id: string;
  kode_booking: string;
  session_id: string;
  package_id: string;
  nama_lengkap: string;
  kelas: string;
  email: string;
  status: BookingStatus;
  qr_payload: string;
  total_harga: number;
  created_at: string;
  expired_at: string;
  acc_at?: string | null;
  used_at?: string | null;
  decline_count: number;
  sessions?: Session;
  packages?: Package;
  films?: Film;
}

export interface BookingDetailResponse {
  success: boolean;
  message?: string;
  booking_id: string;
  kode_booking: string;
  nama_lengkap: string;
  kelas: string;
  email: string;
  status: BookingStatus;
  qr_payload: string;
  total_harga: number;
  created_at: string;
  expired_at: string;
  seconds_left: number;
  film_judul: string;
  film_deskripsi: string;
  durasi_menit: number;
  poster_path: string;
  session_id: string;
  tanggal: string;
  jam_mulai: string;
  nama_paket: string;
  jumlah_orang: number;
}

export interface CreateSessionPayload {
  filmId?: string;
  tanggal: string;
  jamMulai: string;
  kuotaTotal: number;
  isCustomFilm?: boolean;
  customJudul?: string;
  customDeskripsi?: string;
  customDurasiMenit?: number;
  customPosterPath?: string;
}

export interface GateQueueItem {
  id: string;
  kode_booking: string;
  nama_lengkap: string;
  kelas: string;
  email: string;
  total_harga: number;
  status: string;
  created_at: string;
  acc_at?: string | null;
  last_scanned_at?: string | null;
  decline_count: number;
  film_judul: string;
  nama_paket: string;
  jumlah_orang: number;
  tanggal: string;
  jam_mulai: string;
  is_session_today: boolean;
  is_recently_scanned: boolean;
}
