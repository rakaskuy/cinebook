import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { kode_booking } = await request.json();
    if (!kode_booking) {
      return NextResponse.json({ error: 'kode_booking is required' }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL || 'Cinemanik SMAN 1 Kendal <no-reply@sman1kendal.sch.id>';

    if (!resendApiKey) {
      // If no API key configured yet, return simulated success
      return NextResponse.json({
        success: true,
        message: 'Resend API Key belum diisi di .env.local, simulasi pengiriman berhasil.',
        sender: senderEmail,
      });
    }

    // Public HTTPS outbound request to official Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: senderEmail,
        to: ['user@example.com'], // Or extracted recipient
        subject: `[Cinemanik] E-Ticket Tiket Anda (${kode_booking})`,
        html: `<p>Halo, ini adalah tiket Cinemanik Anda dengan kode <strong>${kode_booking}</strong>.</p>`,
      }),
    });

    const result = await res.json();
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
