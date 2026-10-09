import { createClient } from '@supabase/supabase-js';
import { Film, Session, Package, BookingDetailResponse, AdminRole, CreateSessionPayload, GateQueueItem } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project')
);

// Safe serverless-friendly Supabase client with browser vs nodejs detection
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: typeof window !== 'undefined',
        autoRefreshToken: typeof window !== 'undefined',
      },
    })
  : (null as any);

// Server-side privileged client (for serverless cron & secure backend functions)
export const supabaseAdmin = (isSupabaseConfigured && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : supabase;


// =============================================================================
// Standalone Interactive Mock Fallback Store - Cinemanik Edition
// =============================================================================
const mockFilms: Film[] = [];

const mockPackages: Package[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    nama_paket: 'Frost Solo Pass (1 Orang)',
    jumlah_orang: 1,
    harga: 25000,
    is_active: true,
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    nama_paket: 'Glacier Couple Combo (2 Orang + Hot Popcorn)',
    jumlah_orang: 2,
    harga: 45000,
    is_active: true,
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    nama_paket: 'Arctic Trio Warm (3 Orang + 3 Minum Hangat)',
    jumlah_orang: 3,
    harga: 65000,
    is_active: true,
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    nama_paket: 'Blizzard Squad Feast (4 Orang + Winter Feast)',
    jumlah_orang: 4,
    harga: 80000,
    is_active: true,
  },
];

const getTodayStr = () => new Date().toISOString().split('T')[0];
const getTomorrowStr = () => new Date(Date.now() + 86400000).toISOString().split('T')[0];

let mockSessions: Session[] = [];

let mockBookings: Record<string, any> = {};

export function getStoredMockBookings(): Record<string, any> {
  if (typeof window === 'undefined') return mockBookings;
  try {
    const raw = localStorage.getItem('cinemanik_mock_bookings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...mockBookings, ...parsed };
    }
  } catch {}
  return mockBookings;
}

export function saveStoredMockBooking(code: string, booking: any) {
  mockBookings[code] = booking;
  if (typeof window !== 'undefined') {
    try {
      const current = getStoredMockBookings();
      current[code] = booking;
      localStorage.setItem('cinemanik_mock_bookings', JSON.stringify(current));
    } catch {}
  }
}

export function getStoredCustomFilms(): Film[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('cinemanik_custom_films_v1');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveStoredCustomFilm(film: Film): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getStoredCustomFilms();
    const existingIndex = list.findIndex((f) => f.id === film.id);
    if (existingIndex >= 0) {
      list[existingIndex] = film;
    } else {
      list.push(film);
    }
    localStorage.setItem('cinemanik_custom_films_v1', JSON.stringify(list));
  } catch {}
}

export function getStoredCustomSessions(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('cinemanik_custom_sessions_v1');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveStoredCustomSession(sess: any): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getStoredCustomSessions();
    const existingIndex = list.findIndex((s) => s.id === sess.id);
    if (existingIndex >= 0) {
      list[existingIndex] = sess;
    } else {
      list.unshift(sess);
    }
    localStorage.setItem('cinemanik_custom_sessions_v1', JSON.stringify(list));
  } catch {}
}

// =============================================================================
// Client API Methods (Real Supabase + Interactive Mock Fallback)
// =============================================================================

export async function fetchAvailableSessionDates(): Promise<string[]> {
  const customSessions = getStoredCustomSessions();
  const customDates = customSessions
    .filter((s) => s.status_sesi === 'AKTIF')
    .map((s) => String(s.tanggal));

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('tanggal')
        .eq('status_sesi', 'AKTIF')
        .order('tanggal', { ascending: true });

      if (!error && data) {
        const dbDates = data.map((item: any) => String(item.tanggal));
        const dates = Array.from(new Set<string>([...dbDates, ...customDates])).sort();
        return dates;
      }
    } catch (e) {
      console.error('Error fetching session dates:', e);
    }
  }

  // Interactive mock fallback
  const mockDates = mockSessions
    .filter((s) => s.status_sesi === 'AKTIF')
    .map((s) => s.tanggal);
  const allDates = Array.from(new Set<string>([...mockDates, ...customDates])).sort();
  return allDates;
}

export async function fetchSessions(selectedDate?: string): Promise<Session[]> {
  const targetDate = selectedDate || getTodayStr();
  const customSessions = getStoredCustomSessions().filter(
    (s) => s.status_sesi === 'AKTIF' && s.tanggal === targetDate
  );

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
      const merged = [...(data as any[])];
      for (const cs of customSessions) {
        if (!merged.some((m) => m.id === cs.id)) {
          merged.push(cs);
        }
      }
      return merged;
    }

    if (error) {
      console.error('Error fetching sessions:', error);
    }
  }

  // Interactive Mock fallback
  const mockMatch = mockSessions.filter(
    (s) => s.status_sesi === 'AKTIF' && s.tanggal === targetDate
  );
  const merged = [...mockMatch];
  for (const cs of customSessions) {
    if (!merged.some((m) => m.id === cs.id)) {
      merged.push(cs);
    }
  }
  return merged;
}

export async function fetchSessionById(sessionId: string): Promise<Session | null> {
  const customSessions = getStoredCustomSessions();
  const customFound = customSessions.find((s) => s.id === sessionId);
  if (customFound) {
    return customFound;
  }

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

  // Interactive Mock fallback
  const found = mockSessions.find((s) => s.id === sessionId);
  return found || null;
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

  // Interactive Mock fallback
  return mockPackages;
}

export async function adminFetchAllPackages(): Promise<Package[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_get_packages');
    if (!error && Array.isArray(data)) {
      return data;
    }
    const { data: d2 } = await supabase.from('packages').select('*').order('jumlah_orang', { ascending: true });
    if (d2) return d2;
  }
  return mockPackages;
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

export async function adminDeletePackage(id: string): Promise<{ success: boolean; message: string; deactivated?: boolean }> {
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
  const customSessions = getStoredCustomSessions();
  const customSession = customSessions.find((s) => s.id === payload.sessionId);
  const isCustom = Boolean(customSession || payload.sessionId.startsWith('sess-'));

  if (!isCustom && isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('create_booking', {
      p_session_id: payload.sessionId,
      p_package_id: payload.packageId,
      p_nama_lengkap: payload.namaLengkap,
      p_kelas: payload.kelas,
      p_email: payload.email,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }
  }

  // Interactive Mock & Custom Session store
  let targetSession = customSession || mockSessions.find((s) => s.id === payload.sessionId);
  if (!targetSession) {
    throw new Error('Sesi penayangan film tidak ditemukan.');
  }

  let targetPkg = mockPackages.find((p) => p.id === payload.packageId);
  if (!targetPkg) {
    targetPkg = mockPackages[0];
  }

  const sisa = (targetSession.kuota_total || 60) - (targetSession.kuota_terisi || 0);
  if (targetPkg.jumlah_orang > sisa) {
    throw new Error('Sisa kuota kursi tidak mencukupi untuk paket ini!');
  }

  // Generate cryptographically secure unique booking code
  const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').substring(0, 4).toUpperCase()
    : '9X2A';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const newCode = `CIN-${dateStr}-${randomSuffix}`;
  const newId = `id-${Date.now()}`;
  const expiredAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const rawQr = `CB1:${newCode}:${randomSuffix}7A9B`;

  // Update session quota
  targetSession.kuota_terisi = (targetSession.kuota_terisi || 0) + targetPkg.jumlah_orang;
  if (customSession) {
    saveStoredCustomSession(targetSession);
  }

  // Save to mock bookings store
  const newBooking = {
    id: newId,
    kode_booking: newCode,
    session_id: targetSession.id,
    package_id: targetPkg.id,
    nama_lengkap: payload.namaLengkap,
    kelas: payload.kelas,
    email: payload.email.toLowerCase(),
    status: 'PENDING',
    qr_payload: rawQr,
    total_harga: targetPkg.harga,
    created_at: new Date().toISOString(),
    expired_at: expiredAt,
    acc_at: null,
    used_at: null,
    decline_count: 0,
    film_judul: targetSession.films?.judul || targetSession.film_judul || 'Film Festival',
    film_deskripsi: targetSession.films?.deskripsi || targetSession.film_deskripsi || '',
    durasi_menit: targetSession.films?.durasi_menit || targetSession.durasi_menit || 120,
    poster_path: targetSession.films?.poster_path || targetSession.poster_path || '',
    tanggal: targetSession.tanggal,
    jam_mulai: targetSession.jam_mulai,
    nama_paket: targetPkg.nama_paket,
    jumlah_orang: targetPkg.jumlah_orang,
  };

  saveStoredMockBooking(newCode, newBooking);

  return {
    success: true,
    booking_id: newId,
    kode_booking: newCode,
    nama_lengkap: payload.namaLengkap,
    kelas: payload.kelas,
    email: payload.email,
    status: 'PENDING',
    qr_payload: rawQr,
    total_harga: targetPkg.harga,
    expired_at: expiredAt,
    film_judul: newBooking.film_judul,
    poster_path: newBooking.poster_path,
    tanggal: targetSession.tanggal,
    jam_mulai: targetSession.jam_mulai,
    nama_paket: targetPkg.nama_paket,
    jumlah_orang: targetPkg.jumlah_orang,
  };
}

export async function executeCheckBookingStatus(
  kodeBooking: string,
  email: string
): Promise<BookingDetailResponse> {
  const cleanCode = kodeBooking.trim().toUpperCase();
  const cleanEmail = email.trim().toLowerCase();

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('check_booking_status', {
        p_kode_booking: cleanCode,
        p_email: cleanEmail,
      });

      if (!error && data?.success) {
        return data;
      }
    } catch {}
  }

  // Interactive Mock fallback
  const allBookings = getStoredMockBookings();
  const b = allBookings[cleanCode] || mockBookings[cleanCode];
  if (!b || b.email.toLowerCase() !== cleanEmail) {
    return {
      success: false,
      message: 'Data booking tidak ditemukan atau email verifikasi tidak cocok!',
    } as any;
  }

  const secondsLeft = Math.max(
    0,
    Math.floor((new Date(b.expired_at).getTime() - Date.now()) / 1000)
  );

  return {
    success: true,
    booking_id: b.id,
    kode_booking: b.kode_booking,
    nama_lengkap: b.nama_lengkap,
    kelas: b.kelas,
    email: b.email,
    status: b.status,
    qr_payload: b.qr_payload,
    total_harga: b.total_harga,
    created_at: b.created_at,
    expired_at: b.expired_at,
    seconds_left: secondsLeft,
    film_judul: b.film_judul,
    film_deskripsi: b.film_deskripsi || '',
    durasi_menit: b.durasi_menit || 120,
    poster_path: b.poster_path,
    session_id: b.session_id,
    tanggal: b.tanggal,
    jam_mulai: b.jam_mulai,
    nama_paket: b.nama_paket,
    jumlah_orang: b.jumlah_orang,
  };
}

// =============================================================================
// Real Admin Web Operations (Used by Kasir, Gate & Super Admin)
// =============================================================================

export interface AdminScanPreviewResponse {
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

  // Mock & Local fallback
  let targetCode = trimmed.toUpperCase();
  if (trimmed.startsWith('CB1:')) {
    const parts = trimmed.split(':');
    if (parts.length >= 3) targetCode = parts[parts.length - 2].toUpperCase();
  } else if (trimmed.startsWith('CB1.')) {
    const parts = trimmed.split('.');
    if (parts.length === 3) {
      try {
        const decoded = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        targetCode = decoded.split('|')[0].toUpperCase();
      } catch {}
    }
  }

  const allBookings = getStoredMockBookings();
  const b = allBookings[targetCode];
  if (!b) return { success: false, message: 'Tiket tidak ditemukan di sistem.' };
  b.last_scanned_at = new Date().toISOString();
  saveStoredMockBooking(targetCode, b);

  return {
    success: true,
    kode_booking: b.kode_booking,
    nama_lengkap: b.nama_lengkap,
    kelas: b.kelas,
    film_judul: b.film_judul,
    nama_paket: b.nama_paket,
    jumlah_orang: b.jumlah_orang,
    total_harga: b.total_harga,
    status: b.status,
    message: 'QR Berhasil Di-scan! Data telah dikirim ke antrean Kasir.',
  };
}

export async function fetchCashierQueue(): Promise<CashierQueueItem[]> {
  const localBookings = getStoredMockBookings();
  const localQueue: CashierQueueItem[] = Object.values(localBookings)
    .filter((b) => b.status === 'PENDING')
    .map((b) => ({
      id: b.id,
      kode_booking: b.kode_booking,
      nama_lengkap: b.nama_lengkap,
      kelas: b.kelas,
      email: b.email,
      total_harga: b.total_harga,
      status: b.status,
      created_at: b.created_at,
      expired_at: b.expired_at,
      last_scanned_at: b.last_scanned_at || null,
      decline_count: b.decline_count || 0,
      film_judul: b.film_judul,
      nama_paket: b.nama_paket,
      jumlah_orang: b.jumlah_orang,
      tanggal: b.tanggal,
      jam_mulai: b.jam_mulai,
      is_recently_scanned: Boolean(b.last_scanned_at),
    }));

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('get_cashier_queue');
      if (!error && Array.isArray(data)) {
        return data;
      }
    } catch (e) {
      console.error('Error fetching cashier queue:', e);
    }
  }

  // Local/Mock fallback
  return localQueue.sort((a, b) => (b.last_scanned_at ? 1 : 0) - (a.last_scanned_at ? 1 : 0));
}

export async function fetchGateQueue(): Promise<GateQueueItem[]> {
  const localBookings = getStoredMockBookings();
  const localQueue: GateQueueItem[] = Object.values(localBookings)
    .filter((b) => b.status === 'ACC')
    .map((b) => ({
      id: b.id,
      kode_booking: b.kode_booking,
      nama_lengkap: b.nama_lengkap,
      kelas: b.kelas,
      email: b.email,
      total_harga: b.total_harga,
      status: b.status,
      created_at: b.created_at,
      acc_at: b.acc_at || null,
      last_scanned_at: b.last_scanned_at || null,
      decline_count: b.decline_count || 0,
      film_judul: b.film_judul,
      nama_paket: b.nama_paket,
      jumlah_orang: b.jumlah_orang,
      tanggal: b.tanggal,
      jam_mulai: b.jam_mulai,
      is_session_today: b.tanggal === getTodayStr(),
      is_recently_scanned: Boolean(b.last_scanned_at),
    }));

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

  return localQueue.sort((a, b) => (b.last_scanned_at ? 1 : 0) - (a.last_scanned_at ? 1 : 0));
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

  let targetCode = trimmed.toUpperCase();
  if (trimmed.startsWith('CB1:')) {
    const parts = trimmed.split(':');
    if (parts.length >= 2) targetCode = parts[1].toUpperCase();
  }
  const allBookings = getStoredMockBookings();
  const b = allBookings[targetCode];
  if (!b) return { success: false, message: 'Tiket tidak ditemukan di sistem.' };
  b.last_scanned_at = new Date().toISOString();
  saveStoredMockBooking(targetCode, b);

  return {
    success: true,
    kode_booking: b.kode_booking,
    nama_lengkap: b.nama_lengkap,
    kelas: b.kelas,
    film_judul: b.film_judul,
    nama_paket: b.nama_paket,
    jumlah_orang: b.jumlah_orang,
    status: b.status,
    tanggal: b.tanggal,
    jam_mulai: b.jam_mulai,
    is_session_today: b.tanggal === getTodayStr(),
    message: 'QR Berhasil Di-scan! Tiket siap diizinkan masuk.',
  };
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

  // Interactive Mock & Local fallback
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

  const allBookings = getStoredMockBookings();
  const b = allBookings[targetCode];
  if (!b) {
    return {
      success: false,
      status: 'NOT_FOUND',
      message: `Tiket dengan kode ${targetCode} tidak terdaftar di sistem!`,
      available_actions: [],
    };
  }

  const isToday = b.tanggal === getTodayStr();
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
    decline_count: b.decline_count || 0,
    is_repeated_decline: (b.decline_count || 0) >= 3,
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

  // Interactive Mock & Local fallback
  const allBookings = getStoredMockBookings();
  const b = allBookings[cleanCode];
  if (!b) throw new Error('Data booking tidak ditemukan di sistem.');

  if (decision === 'DECLINE') {
    if (!alasan || !alasan.trim()) {
      throw new Error('Alasan penolakan (DECLINE) wajib disertakan!');
    }
    b.decline_count = (b.decline_count || 0) + 1;
    saveStoredMockBooking(cleanCode, b);
    return {
      success: true,
      message: `DECLINE tercatat: ${alasan}`,
      status: b.status,
    };
  }

  // ACC Logic
  if (role === 'gate' || b.status === 'ACC') {
    b.status = 'USED';
    b.used_at = new Date().toISOString();
    b.used_by_name = 'Petugas Gate (OSIS)';
  } else if (role === 'kasir') {
    b.status = 'ACC';
    b.acc_at = new Date().toISOString();
    b.acc_by_name = 'Kasir Lapangan (OSIS)';
  } else {
    b.status = b.status === 'PENDING' ? 'ACC' : 'USED';
    if (b.status === 'USED') {
      b.used_at = new Date().toISOString();
      b.used_by_name = 'Petugas Gate (OSIS)';
    }
  }
  saveStoredMockBooking(cleanCode, b);

  return {
    success: true,
    message: `Keputusan ACC berhasil! Status tiket sekarang ${b.status}`,
    status: b.status,
  };
}

export async function fetchAdminDashboardData() {
  const localBookings = Object.values(getStoredMockBookings());

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: rpcData, error } = await supabase.rpc('get_admin_dashboard_data');
      if (!error && rpcData) {
        const existingBookings = Array.isArray(rpcData.bookings) ? [...rpcData.bookings] : [];
        let extraRevenue = 0;
        let extraTotal = 0;
        const counts = { ...(rpcData.counts || { PENDING: 0, ACC: 0, USED: 0, EXPIRED: 0, CANCELLED: 0 }) };

        for (const b of localBookings) {
          if (!existingBookings.some((eb: any) => eb.kode_booking === b.kode_booking)) {
            existingBookings.unshift({
              id: b.id,
              kode_booking: b.kode_booking,
              nama_lengkap: b.nama_lengkap,
              kelas: b.kelas,
              email: b.email,
              status: b.status,
              total_harga: b.total_harga,
              created_at: b.created_at,
              film_judul: b.film_judul,
              tanggal: b.tanggal,
              jam_mulai: b.jam_mulai,
              nama_paket: b.nama_paket,
            });
            extraTotal++;
            if (b.status === 'ACC' || b.status === 'USED') {
              extraRevenue += (b.total_harga || 0);
            }
            if (counts[b.status] !== undefined) {
              counts[b.status]++;
            }
          }
        }

        return {
          totalRevenue: (rpcData.totalRevenue || 0) + extraRevenue,
          totalBookings: (rpcData.totalBookings || 0) + extraTotal,
          counts,
          bookings: existingBookings,
        };
      }
    } catch (err) {
      console.error('Error calling get_admin_dashboard_data:', err);
    }
  }

  // Fallback
  let totalRevenue = 0;
  const counts: Record<string, number> = { PENDING: 0, ACC: 0, USED: 0, EXPIRED: 0, CANCELLED: 0 };
  for (const b of localBookings) {
    if (b.status === 'ACC' || b.status === 'USED') totalRevenue += (b.total_harga || 0);
    if (counts[b.status] !== undefined) counts[b.status]++;
  }

  return {
    totalRevenue,
    totalBookings: localBookings.length,
    counts,
    bookings: localBookings,
  };
}

export async function adminFetchAllSessions(): Promise<any[]> {
  const customSessions = getStoredCustomSessions();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_fetch_all_sessions');
    if (!error && data) {
      const merged = [...(data as any[])];
      for (const cs of customSessions) {
        if (!merged.some((m) => m.id === cs.id)) {
          merged.unshift(cs);
        }
      }
      return merged;
    }
    console.error('Error calling admin_fetch_all_sessions:', error);
  }
  const merged = [...mockSessions];
  for (const cs of customSessions) {
    if (!merged.some((m) => m.id === cs.id)) {
      merged.unshift(cs);
    }
  }
  return merged;
}

export async function adminFetchFilms(): Promise<{ id: string; judul: string; durasi_menit: number; poster_path?: string; deskripsi?: string }[]> {
  const customFilms = getStoredCustomFilms();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('admin_fetch_films');
    if (!error && data) {
      const merged = [...(data as any[])];
      for (const cf of customFilms) {
        if (!merged.some((m) => m.id === cf.id)) {
          merged.push(cf);
        }
      }
      return merged;
    }
    console.error('Error calling admin_fetch_films:', error);
  }
  const merged = [...mockFilms];
  for (const cf of customFilms) {
    if (!merged.some((m) => m.id === cf.id)) {
      merged.push(cf);
    }
  }
  return merged;
}

export async function adminCreateSession(payload: CreateSessionPayload): Promise<{ success: boolean; message: string; id?: string }> {
  // Check if this is a custom film creation
  if (payload.isCustomFilm) {
    const judul = payload.customJudul?.trim();
    if (!judul) {
      throw new Error('Judul film kustom wajib diisi.');
    }
    const deskripsi = payload.customDeskripsi?.trim() || '';
    const durasi = Number(payload.customDurasiMenit) || 120;
    const poster = payload.customPosterPath?.trim() || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80';

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('admin_create_film_and_session', {
          p_judul: judul,
          p_deskripsi: deskripsi,
          p_durasi_menit: durasi,
          p_poster_path: poster,
          p_tanggal: payload.tanggal,
          p_jam_mulai: payload.jamMulai,
          p_kuota_total: payload.kuotaTotal,
        });

        if (!error && data?.success) {
          const newFilm: Film = {
            id: data.film_id,
            judul,
            deskripsi,
            durasi_menit: durasi,
            poster_path: poster,
          };
          saveStoredCustomFilm(newFilm);
          return { success: true, message: data.message, id: data.session_id };
        }
        if (error) {
          console.warn('RPC admin_create_film_and_session error, falling back to hybrid store:', error.message);
        }
      } catch (err) {
        console.warn('RPC exception, falling back to hybrid store:', err);
      }
    }

    // Hybrid client storage fallback (offline / dev mode / unmigrated RLS)
    const filmId = `film-${Date.now()}`;
    const sessionId = `sess-${Date.now()}`;
    const newFilm: Film = {
      id: filmId,
      judul,
      deskripsi,
      durasi_menit: durasi,
      poster_path: poster,
    };
    saveStoredCustomFilm(newFilm);

    const newSession = {
      id: sessionId,
      tanggal: payload.tanggal,
      jam_mulai: payload.jamMulai,
      film_id: filmId,
      kuota_total: payload.kuotaTotal,
      kuota_terisi: 0,
      status_sesi: 'AKTIF' as const,
      films: newFilm,
      film_judul: judul,
      durasi_menit: durasi,
      poster_path: poster,
    };
    saveStoredCustomSession(newSession);

    return {
      success: true,
      message: 'Film kustom dan jadwal sesi teater berhasil dibuat!',
      id: sessionId,
    };
  }

  // Standard existing film selection
  if (!payload.filmId) {
    throw new Error('Pilih film dari katalog bioskop.');
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('admin_create_session', {
        p_film_id: payload.filmId,
        p_tanggal: payload.tanggal,
        p_jam_mulai: payload.jamMulai,
        p_kuota_total: payload.kuotaTotal,
      });
      if (!error && data) {
        return data;
      }
      if (error) {
        console.warn('RPC admin_create_session error, falling back to hybrid store:', error.message);
      }
    } catch (err) {
      console.warn('RPC exception, falling back to hybrid store:', err);
    }
  }

  // Mock / hybrid fallback
  const films = await adminFetchFilms();
  const foundFilm = films.find((f) => f.id === payload.filmId) || mockFilms[0];
  const sessionId = `sess-${Date.now()}`;
  const newSession = {
    id: sessionId,
    tanggal: payload.tanggal,
    jam_mulai: payload.jamMulai,
    film_id: payload.filmId,
    kuota_total: payload.kuotaTotal,
    kuota_terisi: 0,
    status_sesi: 'AKTIF' as const,
    films: foundFilm,
    film_judul: foundFilm.judul,
    durasi_menit: foundFilm.durasi_menit,
    poster_path: foundFilm.poster_path,
  };
  saveStoredCustomSession(newSession);

  return {
    success: true,
    message: 'Jadwal sesi teater baru berhasil ditambahkan!',
    id: sessionId,
  };
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
