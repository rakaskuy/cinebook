export type AdminRole = 'super_admin' | 'kasir' | 'gate';

export interface AdminUser {
  id: string;
  nama: string;
  role: AdminRole;
  email: string;
}

export interface ScanPreviewResult {
  success: boolean;
  status: 'PENDING' | 'ACC' | 'USED' | 'EXPIRED' | 'CANCELLED' | 'INVALID_QR' | 'NOT_FOUND';
  message?: string;
  booking_id?: string;
  kode_booking?: string;
  nama_lengkap?: string;
  kelas?: string;
  email?: string;
  total_harga?: number;
  created_at?: string;
  expired_at?: string;
  acc_at?: string | null;
  acc_by_name?: string | null;
  used_at?: string | null;
  used_by_name?: string | null;
  decline_count?: number;
  is_repeated_decline?: boolean;
  film_judul?: string;
  durasi_menit?: number;
  poster_path?: string;
  session_id?: string;
  tanggal?: string;
  jam_mulai?: string;
  is_session_today?: boolean;
  nama_paket?: string;
  jumlah_orang?: number;
  available_actions: string[];
  can_action?: boolean;
  admin_role?: AdminRole;
  notice?: string | null;
}

export interface DecisionResult {
  success: boolean;
  decision: 'ACC' | 'DECLINE';
  kode_booking: string;
  status?: string;
  status_sebelum?: string;
  status_sesudah?: string;
  message: string;
  decline_count?: number;
}

export interface DashboardStats {
  totalBookingsToday: number;
  totalRevenueToday: number;
  countsByStatus: {
    PENDING: number;
    ACC: number;
    USED: number;
    EXPIRED: number;
    CANCELLED: number;
  };
  recentBookings: {
    id: string;
    kode_booking: string;
    nama_lengkap: string;
    kelas: string;
    film_judul: string;
    status: string;
    total_harga: number;
    created_at: string;
  }[];
}
