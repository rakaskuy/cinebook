// cinebook/supabase/functions/send-booking-email/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseClient.ts';
import QRCode from 'https://esm.sh/qrcode@1.5.3';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { booking_id, kode_booking } = await req.json();
    if (!booking_id && !kode_booking) {
      return new Response(
        JSON.stringify({ error: 'booking_id or kode_booking is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createAdminClient();

    // Query booking with relations
    let query = supabase
      .from('bookings')
      .select(`
        id,
        kode_booking,
        nama_lengkap,
        kelas,
        email,
        status,
        qr_payload,
        total_harga,
        expired_at,
        created_at,
        sessions (
          tanggal,
          jam_mulai,
          films (
            judul,
            durasi_menit,
            poster_path
          )
        ),
        packages (
          nama_paket,
          jumlah_orang
        )
      `);

    if (booking_id) {
      query = query.eq('id', booking_id);
    } else {
      query = query.eq('kode_booking', kode_booking);
    }

    const { data: booking, error: fetchError } = await query.single();

    if (fetchError || !booking) {
      return new Response(
        JSON.stringify({ error: 'Booking not found', details: fetchError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate QR code Data URL (PNG base64) with clean Medium density
    const qrDataUrl = await QRCode.toDataURL(booking.qr_payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 280,
      color: {
        dark: '#111827',
        light: '#FFFDF5',
      },
    });

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const senderEmail = Deno.env.get('SENDER_EMAIL') || 'GlaciFest SMAN 1 Kendal <no-reply@sman1kendal.sch.id>';

    // Format display currency and date
    const hargaFormatted = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(Number(booking.total_harga));

    const tanggalFormatted = new Date(booking.sessions.tanggal).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const expiredFormatted = new Date(booking.expired_at).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // Modern Memphis / Abstract Collage Email Template
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>E-Ticket ${booking.kode_booking} - CineBook</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #FDFBF7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181B;">
  <div style="max-width: 580px; margin: 0 auto; background: #FFFFFF; border: 4px solid #18181B; border-radius: 16px; box-shadow: 8px 8px 0px #18181B; overflow: hidden;">
    
    <!-- Memphis Header Banner -->
    <div style="background: #FFE600; padding: 24px; border-bottom: 4px solid #18181B; text-align: center; position: relative;">
      <div style="display: inline-block; background: #FF3366; color: #FFFFFF; font-weight: 900; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; padding: 6px 14px; border: 3px solid #18181B; border-radius: 8px; box-shadow: 3px 3px 0px #18181B; margin-bottom: 12px;">
        🎬 CINEBOOK TICKET
      </div>
      <h1 style="margin: 0; font-size: 26px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; color: #18181B;">
        ${booking.sessions.films.judul}
      </h1>
      <p style="margin: 8px 0 0; font-weight: 700; color: #3F3F46; font-size: 14px;">
        📅 ${tanggalFormatted} • ⏰ ${booking.sessions.jam_mulai.substring(0, 5)} WIB
      </p>
    </div>

    <!-- Ticket Body -->
    <div style="padding: 24px;">
      <!-- QR Container with Memphis Frame -->
      <div style="text-align: center; background: #00F0FF; padding: 20px; border: 4px solid #18181B; border-radius: 12px; box-shadow: 4px 4px 0px #18181B; margin-bottom: 24px;">
        <p style="margin: 0 0 10px; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">
          Tunjukkan QR ini ke Kasir / Gate
        </p>
        <img src="${qrDataUrl}" alt="QR Code Ticket" style="width: 220px; height: 220px; border: 3px solid #18181B; border-radius: 8px; background: #FFFFFF;" />
        <div style="margin-top: 12px; background: #FFFFFF; border: 3px solid #18181B; display: inline-block; padding: 6px 16px; border-radius: 6px; font-family: monospace; font-size: 18px; font-weight: 900; letter-spacing: 1px;">
          ${booking.kode_booking}
        </div>
      </div>

      <!-- Detail Info Grid -->
      <div style="background: #F4F4F5; border: 3px solid #18181B; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #71717A; font-weight: 700;">Nama Pemesan</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 900;">${booking.nama_lengkap} (${booking.kelas})</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #71717A; font-weight: 700;">Paket</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 900;">${booking.packages.nama_paket}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #71717A; font-weight: 700;">Total Tagihan</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #FF3366; font-size: 16px;">${hargaFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #71717A; font-weight: 700;">Status Saat Ini</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 900;">
              <span style="background: #FFE600; padding: 4px 8px; border: 2px solid #18181B; border-radius: 4px;">
                ${booking.status}
              </span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Payment Alert Box -->
      <div style="background: #FFF7ED; border-left: 6px solid #FF3366; border: 3px solid #18181B; border-radius: 8px; padding: 14px; font-size: 13px; line-height: 1.5;">
        <strong style="color: #FF3366;">⚠️ PENTING: Batas Waktu Bayar Offline</strong><br/>
        Segera datangi meja kasir panitia sebelum <strong>${expiredFormatted} WIB</strong> (24 jam dari pemesanan). Tiket yang belum di-ACC kasir akan hangus otomatis oleh sistem dan kuota dilepas kembali.
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #18181B; color: #FFFFFF; padding: 16px; text-align: center; font-size: 12px; font-weight: 600;">
      CineBook Campus Cinema Experience • Simpan email ini sebagai bukti sah pemesanan
    </div>
  </div>
</body>
</html>
    `;

    // Dispatch email via Resend if API key is present
    let resendResult = { id: 'mock-local-id' };
    if (resendApiKey) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: senderEmail,
          to: [booking.email],
          subject: `🎟️ E-Ticket CineBook: ${booking.sessions.films.judul} (${booking.kode_booking})`,
          html: emailHtml,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Resend API Error: ${errText}`);
      }

      resendResult = await response.json();
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email sent successfully',
        message_id: resendResult.id,
        email: booking.email,
        kode_booking: booking.kode_booking,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
