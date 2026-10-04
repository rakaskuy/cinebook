import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handleAutoExpire(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    const vercelCronHeader = request.headers.get('x-vercel-cron');

    // Secure via bearer token or Vercel cron invocation header if CRON_SECRET is set
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !vercelCronHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc('auto_expire_bookings');
      if (error) throw error;
      return NextResponse.json({ success: true, result: data });
    }

    // Mock local fallback response
    return NextResponse.json({
      success: true,
      expired_count: 0,
      message: 'Local mock auto-expire executed successfully',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleAutoExpire(request);
}

export async function POST(request: Request) {
  return handleAutoExpire(request);
}

