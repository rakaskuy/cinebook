import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// In-memory rate limiting map: IP -> { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 1000; // 1 minute window

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown-ip';

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Terlalu banyak percobaan verifikasi. Silakan tunggu 1 menit.',
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { kode_booking, email } = body;

    if (!kode_booking || typeof kode_booking !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Kode booking wajib diisi.' },
        { status: 400 }
      );
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Email verifikasi wajib diisi.' },
        { status: 400 }
      );
    }

    const cleanCode = kode_booking.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    // Prioritize privileged client, fallback to public client with RPC
    const client = supabaseAdmin || supabase;
    if (!client) {
      return NextResponse.json(
        { success: false, message: 'Layanan database tidak tersedia.' },
        { status: 503 }
      );
    }

    const { data, error } = await client.rpc('check_booking_status', {
      p_kode_booking: cleanCode,
      p_email: cleanEmail,
    });

    if (error) {
      return NextResponse.json(
        { success: false, message: 'Gagal memverifikasi status tiket.' },
        { status: 500 }
      );
    }

    if (!data || !data.success) {
      return NextResponse.json(
        {
          success: false,
          message: 'Data booking tidak ditemukan atau email verifikasi tidak sesuai.',
        },
        { status: 403 }
      );
    }

    // Return sanitized ticket data
    return NextResponse.json({
      success: true,
      ticket: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan internal pada server.' },
      { status: 500 }
    );
  }
}
