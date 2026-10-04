// cinebook/supabase/functions/export-bookings-report/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseClient.ts';

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const status = url.searchParams.get('status');

    const supabase = createAdminClient();

    // Query bookings with relations
    let query = supabase
      .from('bookings')
      .select(`
        id,
        kode_booking,
        nama_lengkap,
        kelas,
        email,
        status,
        total_harga,
        decline_count,
        created_at,
        expired_at,
        acc_at,
        used_at,
        sessions (
          tanggal,
          jam_mulai,
          films (judul)
        ),
        packages (
          nama_paket,
          jumlah_orang
        )
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: bookings, error } = await query;

    if (error) {
      throw error;
    }

    // Compose CSV Headers
    const headers = [
      'Kode Booking',
      'Nama Pemesan',
      'Kelas',
      'Email',
      'Status',
      'Film',
      'Tanggal Tayang',
      'Jam Tayang',
      'Paket',
      'Jumlah Tiket (Orang)',
      'Total Harga (IDR)',
      'Waktu Booking',
      'Waktu ACC Kasir',
      'Waktu Gate Masuk',
      'Jumlah Decline',
    ];

    const rows: string[] = [headers.join(',')];

    let grandTotal = 0;
    let totalTickets = 0;

    for (const b of bookings || []) {
      const filmJudul = (b.sessions as any)?.films?.judul || '-';
      const tanggal = (b.sessions as any)?.tanggal || '-';
      const jam = (b.sessions as any)?.jam_mulai?.substring(0, 5) || '-';
      const paket = (b.packages as any)?.nama_paket || '-';
      const qty = (b.packages as any)?.jumlah_orang || 0;
      const harga = Number(b.total_harga) || 0;

      if (b.status === 'ACC' || b.status === 'USED') {
        grandTotal += harga;
        totalTickets += qty;
      }

      const row = [
        escapeCsv(b.kode_booking),
        escapeCsv(b.nama_lengkap),
        escapeCsv(b.kelas),
        escapeCsv(b.email),
        escapeCsv(b.status),
        escapeCsv(filmJudul),
        escapeCsv(tanggal),
        escapeCsv(jam),
        escapeCsv(paket),
        escapeCsv(qty),
        escapeCsv(harga),
        escapeCsv(b.created_at),
        escapeCsv(b.acc_at),
        escapeCsv(b.used_at),
        escapeCsv(b.decline_count),
      ];
      rows.push(row.join(','));
    }

    // Append summary footer row
    rows.push('');
    rows.push(['"TOTAL REVENUE (ACC/USED)"', '""', '""', '""', '""', '""', '""', '""', '""', escapeCsv(totalTickets), escapeCsv(grandTotal)].join(','));

    const csvOutput = rows.join('\r\n');
    const timestamp = new Date().toISOString().slice(0, 10);

    return new Response(csvOutput, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cinebook_report_${timestamp}.csv"`,
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
