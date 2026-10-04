import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AdminRole, AdminUser, DashboardStats, DecisionResult, ScanPreviewResult } from './types';

// Custom Storage Adapter for Supabase Auth using expo-secure-store
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('your-project')
);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : (null as any);

// =============================================================================
// Standalone Simulation Store for Instant Field & Scanner Testing
// =============================================================================
let mockBookings: Record<string, any> = {
  'CIN-20260922-A9F4': {
    id: 'mock-uuid-101',
    kode_booking: 'CIN-20260922-A9F4',
    nama_lengkap: 'Ahmad Fauzi',
    kelas: 'Informatika 2023',
    email: 'ahmad.fauzi@campus.ac.id',
    status: 'PENDING',
    total_harga: 45000,
    created_at: new Date().toISOString(),
    expired_at: new Date(Date.now() + 22 * 3600 * 1000).toISOString(),
    acc_at: null,
    used_at: null,
    decline_count: 0,
    film_judul: 'Interstellar: Perjalanan Antariksa Mahasiswa',
    durasi_menit: 169,
    poster_path: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop',
    tanggal: new Date().toISOString().split('T')[0],
    jam_mulai: '13:30:00',
    nama_paket: 'Couple Combo (2 Orang + Popcorn)',
    jumlah_orang: 2,
  },
  'CIN-20260922-K7X2': {
    id: 'mock-uuid-102',
    kode_booking: 'CIN-20260922-K7X2',
    nama_lengkap: 'Siti Sarah Wardhani',
    kelas: 'Sistem Informasi 2024',
    email: 'siti.sarah@campus.ac.id',
    status: 'ACC',
    total_harga: 25000,
    created_at: new Date().toISOString(),
    expired_at: new Date(Date.now() + 20 * 3600 * 1000).toISOString(),
    acc_at: new Date().toISOString(),
    acc_by_name: 'Bima Kasir',
    used_at: null,
    decline_count: 0,
    film_judul: 'Spider-Man: Across the Spider-Verse',
    durasi_menit: 140,
    poster_path: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=800&auto=format&fit=crop',
    tanggal: new Date().toISOString().split('T')[0],
    jam_mulai: '19:45:00',
    nama_paket: 'Single Ticket (1 Orang)',
    jumlah_orang: 1,
  },
  'CIN-20260922-W9M3': {
    id: 'mock-uuid-103',
    kode_booking: 'CIN-20260922-W9M3',
    nama_lengkap: 'Dimas Wicaksono',
    kelas: 'Teknik Elektro 2022',
    email: 'dimas.w@campus.ac.id',
    status: 'USED',
    total_harga: 80000,
    created_at: new Date().toISOString(),
    expired_at: new Date().toISOString(),
    acc_at: new Date().toISOString(),
    acc_by_name: 'Bima Kasir',
    used_at: new Date().toISOString(),
    used_by_name: 'Eko Petugas Gate',
    decline_count: 0,
    film_judul: 'Spirited Away: Petualangan Dunia Roh',
    durasi_menit: 125,
    poster_path: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?q=80&w=800&auto=format&fit=crop',
    tanggal: new Date().toISOString().split('T')[0],
    jam_mulai: '16:30:00',
    nama_paket: 'Squad Feast (4 Orang + Jumbo Snack)',
    jumlah_orang: 4,
  },
};

export async function executeScanQrPreview(
  qrPayloadOrCode: string,
  role: AdminRole
): Promise<ScanPreviewResult> {
  const trimmed = qrPayloadOrCode.trim();

  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('scan_qr_preview', {
      p_qr_payload: trimmed,
    });
    if (error) {
      return {
        success: false,
        status: 'INVALID_QR',
        message: error.message,
        available_actions: [],
      };
    }
    return data;
  }

  // Standalone Mock Fallback
  // Extract booking code if raw payload is CB1.xxx.xxx or direct CIN-xxx
  let targetCode = trimmed.toUpperCase();
  if (trimmed.startsWith('CB1:')) {
    const parts = trimmed.split(':');
    if (parts.length === 3) {
      targetCode = parts[1].toUpperCase();
    }
  } else if (trimmed.startsWith('CB1.')) {
    const parts = trimmed.split('.');
    if (parts.length === 3) {
      try {
        const decoded = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        targetCode = decoded.split('|')[0].toUpperCase();
      } catch {
        return {
          success: false,
          status: 'INVALID_QR',
          message: 'Format QR Code rusak atau bukan tiket CineBook!',
          available_actions: [],
        };
      }
    }
  }

  const b = mockBookings[targetCode];
  if (!b) {
    return {
      success: false,
      status: 'NOT_FOUND',
      message: `Tiket dengan kode ${targetCode} tidak terdaftar di sistem!`,
      available_actions: [],
    };
  }

  const isToday = b.tanggal === new Date().toISOString().split('T')[0];
  let availableActions: string[] = [];
  let canAction = false;
  let notice: string | null = null;

  if (role === 'kasir') {
    if (b.status === 'PENDING') {
      availableActions = ['ACC', 'DECLINE'];
      canAction = true;
    } else {
      notice = `Kasir hanya memvalidasi PENDING. Status saat ini: ${b.status}`;
    }
  } else if (role === 'gate') {
    if (b.status === 'ACC') {
      if (!isToday) {
        notice = `PERINGATAN: Tiket untuk tanggal ${b.tanggal}, bukan hari ini!`;
        availableActions = ['DECLINE'];
      } else {
        availableActions = ['ACC', 'DECLINE'];
        canAction = true;
      }
    } else if (b.status === 'PENDING') {
      notice = 'Tiket BELUM DI-ACC kasir! Arahkan pengunjung ke meja kasir.';
    } else if (b.status === 'USED') {
      notice = 'PERINGATAN: Tiket SUDAH DIGUNAKAN untuk masuk!';
    } else {
      notice = `Status tiket: ${b.status}`;
    }
  } else if (role === 'super_admin') {
    if (['PENDING', 'ACC'].includes(b.status)) {
      availableActions = ['ACC', 'DECLINE'];
      canAction = true;
    }
  }

  return {
    success: true,
    status: b.status,
    booking_id: b.id,
    kode_booking: b.kode_booking,
    nama_lengkap: b.nama_lengkap,
    kelas: b.kelas,
    email: b.email,
    total_harga: b.total_harga,
    created_at: b.created_at,
    expired_at: b.expired_at,
    acc_at: b.acc_at,
    acc_by_name: b.acc_by_name,
    used_at: b.used_at,
    used_by_name: b.used_by_name,
    decline_count: b.decline_count,
    is_repeated_decline: b.decline_count >= 3,
    film_judul: b.film_judul,
    durasi_menit: b.durasi_menit,
    poster_path: b.poster_path,
    tanggal: b.tanggal,
    jam_mulai: b.jam_mulai,
    is_session_today: isToday,
    nama_paket: b.nama_paket,
    jumlah_orang: b.jumlah_orang,
    available_actions: availableActions,
    can_action: canAction,
    admin_role: role,
    notice,
  };
}

export async function executeSubmitAdminDecision(
  kodeBooking: string,
  decision: 'ACC' | 'DECLINE',
  alasan?: string,
  role: AdminRole = 'kasir'
): Promise<DecisionResult> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('submit_admin_decision', {
      p_kode_booking: kodeBooking,
      p_decision: decision,
      p_alasan: alasan || null,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // Standalone local simulation
  const b = mockBookings[kodeBooking.toUpperCase()];
  if (!b) throw new Error('Booking tidak ditemukan!');

  if (decision === 'DECLINE') {
    if (!alasan || !alasan.trim()) {
      throw new Error('Alasan penolakan (DECLINE) wajib diisi!');
    }
    b.decline_count = (b.decline_count || 0) + 1;
    return {
      success: true,
      decision: 'DECLINE',
      kode_booking: b.kode_booking,
      status: b.status,
      decline_count: b.decline_count,
      message: `DECLINE tercatat: ${alasan}`,
    };
  }

  // ACC Logic
  if (role === 'kasir') {
    b.status = 'ACC';
    b.acc_at = new Date().toISOString();
    b.acc_by_name = 'Kasir Lapangan';
  } else if (role === 'gate') {
    b.status = 'USED';
    b.used_at = new Date().toISOString();
    b.used_by_name = 'Petugas Gate';
  } else {
    b.status = b.status === 'PENDING' ? 'ACC' : 'USED';
  }

  return {
    success: true,
    decision: 'ACC',
    kode_booking: b.kode_booking,
    status_sesudah: b.status,
    message: `Keputusan ACC berhasil diterapkan! Tiket kini ${b.status}`,
  };
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const all = Object.values(mockBookings);
  const counts = {
    PENDING: all.filter((x) => x.status === 'PENDING').length,
    ACC: all.filter((x) => x.status === 'ACC').length,
    USED: all.filter((x) => x.status === 'USED').length,
    EXPIRED: all.filter((x) => x.status === 'EXPIRED').length,
    CANCELLED: all.filter((x) => x.status === 'CANCELLED').length,
  };

  const revenue = all
    .filter((x) => x.status === 'ACC' || x.status === 'USED')
    .reduce((sum, curr) => sum + (curr.total_harga || 0), 0);

  return {
    totalBookingsToday: all.length,
    totalRevenueToday: revenue,
    countsByStatus: counts,
    recentBookings: all.map((b) => ({
      id: b.id,
      kode_booking: b.kode_booking,
      nama_lengkap: b.nama_lengkap,
      kelas: b.kelas,
      film_judul: b.film_judul,
      status: b.status,
      total_harga: b.total_harga,
      created_at: b.created_at,
    })),
  };
}
