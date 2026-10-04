// cinebook/supabase/functions/send-decision-email/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseClient.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { kode_booking, decision, admin_role, note } = await req.json();

    if (!kode_booking || !decision) {
      return new Response(
        JSON.stringify({ error: 'kode_booking and decision are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createAdminClient();

    // Query booking with relations
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id,
        kode_booking,
        nama_lengkap,
        email,
        status,
        sessions (
          tanggal,
          jam_mulai,
          films (judul)
        ),
        packages (nama_paket)
      `)
      .eq('kode_booking', kode_booking)
      .single();

    if (error || !booking) {
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let subject = '';
    let headline = '';
    let badgeColor = '#FFE600';
    let messageBody = '';

    if (decision === 'ACC' && (booking.status === 'ACC' || admin_role === 'kasir')) {
      subject = `✅ Pembayaran Diterima! Tiket CineBook Siap Dipakai (${booking.kode_booking})`;
      headline = 'Pembayaran Berhasil Dikonfirmasi!';
      badgeColor = '#00F0FF';
      messageBody = `
        <p style="font-size: 15px; line-height: 1.6;">Halo <strong>${booking.nama_lengkap}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6;">
          Pembayaran offline untuk tiket film <strong>${booking.sessions.films.judul}</strong> telah 
          dikonfirmasi oleh kasir panitia. Status tiket Anda sekarang <strong>AKTIF / ACC</strong>.
        </p>
        <div style="background: #ECFDF5; border: 3px solid #18181B; border-radius: 8px; padding: 16px; margin: 16px 0;">
          🎉 <strong>Langkah Selanjutnya:</strong> Tunjukkan QR Code tiket Anda ke petugas gate di pintu masuk bioskop pada hari H!
        </div>
      `;
    } else if (decision === 'ACC' && (booking.status === 'USED' || admin_role === 'gate')) {
      subject = `🍿 Selamat Menikmati Film! Gate Masuk Divalidasi (${booking.kode_booking})`;
      headline = 'Akses Masuk Bioskop Disetujui!';
      badgeColor = '#10B981';
      messageBody = `
        <p style="font-size: 15px; line-height: 1.6;">Halo <strong>${booking.nama_lengkap}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6;">
          Tiket Anda untuk film <strong>${booking.sessions.films.judul}</strong> telah di-scan dan divalidasi oleh petugas gate.
        </p>
        <div style="background: #FDF4FF; border: 3px solid #18181B; border-radius: 8px; padding: 16px; margin: 16px 0;">
          🎬 <em>Selamat menonton dan nikmati waktu Anda bersama CineBook Campus Festival!</em>
        </div>
      `;
    } else {
      subject = `⚠️ Perhatian Mengenai Tiket CineBook (${booking.kode_booking})`;
      headline = 'Catatan dari Petugas Lapangan';
      badgeColor = '#FF3366';
      messageBody = `
        <p style="font-size: 15px; line-height: 1.6;">Halo <strong>${booking.nama_lengkap}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6;">
          Ada catatan dari petugas lapangan terkait tiket Anda:
        </p>
        <div style="background: #FFF1F2; border: 3px solid #18181B; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <strong>Alasan/Catatan:</strong> ${note || 'Silakan temui panitia festival untuk verifikasi lebih lanjut.'}
        </div>
      `;
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 24px; background-color: #FDFBF7; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #18181B;">
  <div style="max-width: 540px; margin: 0 auto; background: #FFFFFF; border: 4px solid #18181B; border-radius: 16px; box-shadow: 8px 8px 0px #18181B; overflow: hidden;">
    <div style="background: ${badgeColor}; padding: 24px; border-bottom: 4px solid #18181B; text-align: center;">
      <h2 style="margin: 0; font-size: 22px; font-weight: 900; text-transform: uppercase;">${headline}</h2>
      <p style="margin: 6px 0 0; font-weight: 700;">Kode: ${booking.kode_booking}</p>
    </div>
    <div style="padding: 24px;">
      ${messageBody}
    </div>
    <div style="background: #18181B; color: #FFF; padding: 12px; text-align: center; font-size: 12px;">
      CineBook Campus Cinema System
    </div>
  </div>
</body>
</html>
    `;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const senderEmail = Deno.env.get('SENDER_EMAIL') || 'GlaciFest SMAN 1 Kendal <no-reply@sman1kendal.sch.id>';

    if (resendApiKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: senderEmail,
          to: [booking.email],
          subject,
          html: emailHtml,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Decision notification processed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
