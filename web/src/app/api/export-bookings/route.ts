import { NextResponse } from 'next/server';
import { fetchAdminDashboardData } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(request: Request) {
  try {
    const data = await fetchAdminDashboardData();
    const bookings = data.bookings || [];

    const headers = [
      'Kode Booking',
      'Nama Pemesan',
      'Kelas',
      'Email',
      'Status',
      'Judul Film',
      'Tanggal Tayang',
      'Jam Tayang',
      'Paket',
      'Jumlah Tiket',
      'Total Harga (IDR)',
      'Waktu Dibuat',
      'Waktu ACC Kasir',
      'Waktu Gate Masuk',
      'Jumlah Decline',
    ];

    const rows: string[] = [headers.join(',')];

    let totalRevenue = 0;

    for (const b of bookings) {
      if (b.status === 'ACC' || b.status === 'USED') {
        totalRevenue += Number(b.total_harga || 0);
      }

      const row = [
        escapeCsv(b.kode_booking),
        escapeCsv(b.nama_lengkap),
        escapeCsv(b.kelas),
        escapeCsv(b.email),
        escapeCsv(b.status),
        escapeCsv(b.film_judul),
        escapeCsv(b.tanggal),
        escapeCsv(b.jam_mulai),
        escapeCsv(b.nama_paket),
        escapeCsv(b.jumlah_orang),
        escapeCsv(b.total_harga),
        escapeCsv(b.created_at),
        escapeCsv(b.acc_at || '-'),
        escapeCsv(b.used_at || '-'),
        escapeCsv(b.decline_count || 0),
      ];
      rows.push(row.join(','));
    }

    // Summary footer row
    rows.push('');
    rows.push(['"TOTAL REVENUE"', '""', '""', '""', '""', '""', '""', '""', '""', '""', escapeCsv(totalRevenue)].join(','));

    const csvContent = rows.join('\r\n');
    const timestamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cinebook_sman1kendal_${timestamp}.csv"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
