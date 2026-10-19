import { createClient } from '@supabase/supabase-js';
import {
  Film,
  Session,
  Package,
  BookingDetailResponse,
  AdminRole,
  CreateSessionPayload,
  GateQueueItem,
} from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project')
);

// Client-side safe Supabase instance (anon role only)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: typeof window !== 'undefined',
        autoRefreshToken: typeof window !== 'undefined',
      },
    })
  : (null as any);

// =============================================================================
// Client API Methods (Direct Supabase Database Operations)
// =============================================================================

export async function fetchAvailableSessionDates(): Promise<string[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('tanggal')
        .eq('status_sesi', 'AKTIF')
        .order('tanggal', { ascending: true });

      if (!error && data) {
        const dates = Array.from(new Set<string>(data.map((item: any) => String(item.tanggal)))).sort();
        return dates;
      }
    } catch (e) {
      console.error('Error fetching session dates:', e);
    }
  }
  return [];
}

export async function fetchSessions(selectedDate?: string): Promise<Session[]> {
  const targetDate = selectedDate || new Date().toISOString().split('T')[0];

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        id,
        tanggal,
        jam_mulai,
        film_id,
        kuota_total,
        kuota_terisi,
        status_sesi,
        films (
          id,
          judul,
          deskripsi,
          durasi_menit,
          poster_path
        )
      `)
      .eq('status_sesi', 'AKTIF')
      .eq('tanggal', targetDate)
      .order('jam_mulai', { ascending: true });

    if (!error && data) {
      return data as any[];
    }
    if (error) {
      console.error('Error fetching sessions:', error);
    }
  }

  return [];
}

export async function fetchSessionById(sessionId: string): Promise<Session | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        id,
        tanggal,
        jam_mulai,
        film_id,
        kuota_total,
        kuota_terisi,
        status_sesi,
        films (
          id,
          judul,
          deskripsi,
          durasi_menit,
          poster_path
        )
      `)
      .eq('id', sessionId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as any;
  }

  return null;
}

export async function fetchPackages(): Promise<Package[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('harga', { ascending: true });

    if (error) {
      console.error('Error fetching packages:', error);
      return [];
    }

    return data || [];
  }

  return [];
}

export async function adminFetchAllPackages(): Promise<Package[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_get_packages');
    if (!error && Array.isArray(data)) {
      return data;
    }
    const { data: d2 } = await supabase
      .from('packages')
      .select('*')
      .order('jumlah_orang', { ascending: true });
    if (d2) return d2;
  }
  return [];
}

export async function adminSavePackage(payload: {
  id?: string;
  nama_paket: string;
  jumlah_orang: number;
  harga: number;
  is_active: boolean;
}): Promise<{ success: boolean; message: string }> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_upsert_package', {
      p_id: payload.id || null,
      p_nama_paket: payload.nama_paket.trim(),
      p_jumlah_orang: Number(payload.jumlah_orang),
      p_harga: Number(payload.harga),
      p_is_active: Boolean(payload.is_active),
    });
    if (error) throw new Error(error.message);
    return data;
  }
  throw new Error('Supabase belum terkonfigurasi.');
}

export async function adminDeletePackage(
  id: string
): Promise<{ success: boolean; message: string; deactivated?: boolean }> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_delete_package', {
      p_id: id,
    });
    if (error) throw new Error(error.message);
    return data;
  }
  throw new Error('Supabase belum terkonfigurasi.');
}

export async function executeCreateBooking(payload: {
  sessionId: string;
  packageId: string;
  namaLengkap: string;
  kelas: string;
  email: string;
}): Promise<any> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('create_booking', {
      p_session_id: payload.sessionId,
      p_package_id: payload.packageId,
      p_nama_lengkap: payload.namaLengkap.trim(),
      p_kelas: payload.kelas.trim(),
      p_email: payload.email.trim().toLowerCase(),
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }
  }

  throw new Error('Layanan pemesanan sedang tidak dapat terhubung ke database.');
}

/**
 * Server-authenticated ticket lookup.
 * Always routes through /api/verify-ticket with rate limiting to prevent client-side bypass & enumeration.
 */
export async function executeCheckBookingStatus(
  kodeBooking: string,
  email: string
): Promise<BookingDetailResponse> {
  const cleanCode = kodeBooking.trim().toUpperCase();
  const cleanEmail = email.trim().toLowerCase();

  try {
    const res = await fetch('/api/verify-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kode_booking: cleanCode, email: cleanEmail }),
    });

    const result = await res.json();
    if (res.ok && result.success && result.ticket) {
      return result.ticket;
    }

    return {
      success: false,
      message: result.message || 'Data booking tidak ditemukan atau email verifikasi salah.',
    } as any;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Gagal menghubungi server verifikasi tiket.',
    } as any;
  }
}

// =============================================================================
// Real Admin Web Operations (Used by Kasir, Gate & Super Admin)
// =============================================================================

export interface AdminScanPreviewResponse {
  success: boolean;
  status: string;
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
  can_action: boolean;
  admin_role: AdminRole;
  notice?: string | null;
  message?: string;
}

export interface CashierQueueItem {
  id: string;
  kode_booking: string;
  nama_lengkap: string;
  kelas: string;
  email: string;
  total_harga: number;
  status: string;
  created_at: string;
  expired_at: string;
  last_scanned_at?: string | null;
  decline_count: number;
  film_judul: string;
  nama_paket: string;
  jumlah_orang: number;
  tanggal: string;
  jam_mulai: string;
  is_recently_scanned: boolean;
}

export async function executeRegisterCashierScan(
  qrPayloadOrCode: string
): Promise<{
  success: boolean;
  kode_booking?: string;
  nama_lengkap?: string;
  kelas?: string;
  film_judul?: string;
  nama_paket?: string;
  jumlah_orang?: number;
  total_harga?: number;
  status?: string;
  message: string;
}> {
  const trimmed = qrPayloadOrCode.trim();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('register_cashier_scan', {
      p_qr_payload: trimmed,
    });
    if (error) {
      throw new Error(error.message);
    }
    if (data) {
      return data;
    }
  }

  throw new Error('Gagal memproses pemindaian kasir: database tidak terhubung.');
}

export async function fetchCashierQueue(): Promise<CashierQueueItem[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('get_cashier_queue');
      if (!error && Array.isArray(data)) {
        return data;
      }
      if (error) {
        console.error('get_cashier_queue error:', error.message);
      }
    } catch (e) {
      console.error('Error fetching cashier queue:', e);
    }
  }

  return [];
}

export async function fetchGateQueue(): Promise<GateQueueItem[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('get_gate_queue');
      if (!error && Array.isArray(data)) {
        return data;
      }
      if (error) {
        console.error('get_gate_queue error:', error.message);
      }
    } catch (e) {
      console.error('Error fetching gate queue:', e);
    }
  }

  return [];
}

export async function executeRegisterGateScan(
  qrPayloadOrCode: string
): Promise<{
  success: boolean;
  kode_booking?: string;
  nama_lengkap?: string;
  kelas?: string;
  film_judul?: string;
  nama_paket?: string;
  jumlah_orang?: number;
  status?: string;
  tanggal?: string;
  jam_mulai?: string;
  is_session_today?: boolean;
  message: string;
}> {
  const trimmed = qrPayloadOrCode.trim();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('register_gate_scan', {
      p_qr_payload: trimmed,
    });
    if (error) {
      throw new Error(error.message);
    }
    if (data) {
      return data;
    }
  }

  throw new Error('Gagal memproses pemindaian gate: database tidak terhubung.');
}

export async function executeAdminScanPreview(
  qrPayloadOrCode: string,
  role: AdminRole
): Promise<AdminScanPreviewResponse> {
  const trimmed = qrPayloadOrCode.trim();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('scan_qr_preview', {
      p_qr_payload: trimmed,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }
  }

  throw new Error('Gagal memverifikasi tiket: database tidak terhubung.');
}

export async function executeAdminSubmitDecision(
  kodeBooking: string,
  decision: 'ACC' | 'DECLINE',
  alasan?: string,
  role: AdminRole = 'kasir'
): Promise<{ success: boolean; message: string; status?: string }> {
  let cleanCode = kodeBooking.trim().toUpperCase();
  if (cleanCode.startsWith('CB1:')) {
    const parts = cleanCode.split(':');
    if (parts.length >= 2) cleanCode = parts[1].toUpperCase();
  } else if (cleanCode.startsWith('CB1.')) {
    const parts = cleanCode.split('.');
    if (parts.length === 3) {
      try {
        const decoded = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        cleanCode = decoded.split('|')[0].toUpperCase();
      } catch {}
    }
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('submit_admin_decision', {
      p_kode_booking: cleanCode,
      p_decision: decision,
      p_alasan: alasan || null,
    });

    if (error) {
      throw new Error(error.message);
    }
    if (data) {
      return data;
    }
  }

  throw new Error('Gagal mengirim keputusan: database tidak terhubung.');
}

export async function fetchAdminDashboardData() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: rpcData, error } = await supabase.rpc('get_admin_dashboard_data');
      if (!error && rpcData) {
        return {
          totalRevenue: rpcData.totalRevenue || 0,
          totalBookings: rpcData.totalBookings || 0,
          counts: rpcData.counts || { PENDING: 0, ACC: 0, USED: 0, EXPIRED: 0, CANCELLED: 0 },
          bookings: rpcData.bookings || [],
        };
      }
    } catch (err) {
      console.error('Error calling get_admin_dashboard_data:', err);
    }
  }

  return {
    totalRevenue: 0,
    totalBookings: 0,
    counts: { PENDING: 0, ACC: 0, USED: 0, EXPIRED: 0, CANCELLED: 0 },
    bookings: [],
  };
}

export async function adminFetchAllSessions(): Promise<any[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_fetch_all_sessions');
    if (!error && data) {
      return data as any[];
    }
    console.error('Error calling admin_fetch_all_sessions:', error);
  }
  return [];
}

export async function adminFetchFilms(): Promise<{ id: string; judul: string; durasi_menit: number; poster_path?: string; deskripsi?: string }[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('films')
      .select('id, judul, durasi_menit, poster_path, deskripsi')
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data as any[];
    }
    console.error('Error fetching films:', error);
  }
  return [];
}

export async function adminCreateSession(payload: CreateSessionPayload): Promise<{ success: boolean; message: string; id?: string }> {
  if (payload.isCustomFilm) {
    const judul = payload.customJudul?.trim();
    if (!judul) {
      throw new Error('Judul film kustom wajib diisi.');
    }
    const deskripsi = payload.customDeskripsi?.trim() || '';
    const durasi = Number(payload.customDurasiMenit) || 120;
    const poster = payload.customPosterPath?.trim() || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80';

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc('admin_create_film_and_session', {
        p_judul: judul,
        p_deskripsi: deskripsi,
        p_durasi_menit: durasi,
        p_poster_path: poster,
        p_tanggal: payload.tanggal,
        p_jam_mulai: payload.jamMulai,
        p_kuota_total: payload.kuotaTotal,
      });

      if (error) {
        throw new Error(error.message);
      }
      if (data?.success) {
        return { success: true, message: data.message, id: data.session_id };
      }
    }
    throw new Error('Gagal membuat film dan sesi baru: database tidak terhubung.');
  }

  if (!payload.filmId) {
    throw new Error('Pilih film dari katalog bioskop.');
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_create_session', {
      p_film_id: payload.filmId,
      p_tanggal: payload.tanggal,
      p_jam_mulai: payload.jamMulai,
      p_kuota_total: payload.kuotaTotal,
    });
    if (error) throw new Error(error.message);
    if (data) return data;
  }

  throw new Error('Gagal membuat sesi: database tidak terhubung.');
}

export async function adminUpdateSession(payload: {
  sessionId: string;
  kuotaTotal: number;
  status: 'AKTIF' | 'DITUTUP';
  tanggal?: string;
  jamMulai?: string;
}): Promise<{ success: boolean; message: string }> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_update_session', {
      p_session_id: payload.sessionId,
      p_kuota_total: payload.kuotaTotal,
      p_status: payload.status,
      p_tanggal: payload.tanggal || null,
      p_jam_mulai: payload.jamMulai || null,
    });
    if (error) throw new Error(error.message);
    return data;
  }
  throw new Error('Supabase belum terhubung.');
}

export async function executeAdminUpdateQuota(sessionId: string, newQuotaTotal: number) {
  return adminUpdateSession({ sessionId, kuotaTotal: newQuotaTotal, status: 'AKTIF' });
}

export async function executeAdminCancelSession(sessionId: string, alasan: string) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('cancel_session', {
      p_session_id: sessionId,
      p_alasan: alasan,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
  throw new Error('Supabase belum terhubung.');
}
