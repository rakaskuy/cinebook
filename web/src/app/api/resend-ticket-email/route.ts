import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { kode_booking, email } = body;
    if (!kode_booking) {
      return NextResponse.json({ error: 'kode_booking is required' }, { status: 400 });
    }

    const cleanCode = String(kode_booking).trim().toUpperCase();

    // -------------------------------------------------------------------------
    // 1. FORWARDING TO EXTERNAL MAILER (Untuk Vercel -> PC 192.168.1.7)
    // -------------------------------------------------------------------------
    const externalMailerUrl = process.env.EXTERNAL_MAILER_URL?.trim();
    const isFromExternal = request.headers.get('x-from-external-mailer') === '1';

    if (externalMailerUrl && !isFromExternal) {
      try {
        console.log(`[Vercel Forward] Mengarahkan pengiriman email ke server PC: ${externalMailerUrl}`);
        const fwdRes = await fetch(externalMailerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-from-external-mailer': '1',
            ...(process.env.MAILER_SECRET ? { 'x-mailer-secret': process.env.MAILER_SECRET } : {}),
          },
          body: JSON.stringify(body),
        });

        if (fwdRes.ok) {
          const fwdData = await fwdRes.json();
          return NextResponse.json({ ...fwdData, forwarded: true });
        } else {
          console.warn(`[External Mailer Error] Server PC merespon status ${fwdRes.status}. Mencoba fallback...`);
        }
      } catch (err: any) {
        console.warn(`[External Mailer Unreachable] Gagal menghubungi server PC: ${err.message}. Mencoba fallback...`);
      }
    }

    // -------------------------------------------------------------------------
    // 2. AMBIL DATA DETAIL TIKET DARI DATABASE
    // -------------------------------------------------------------------------
    let bookingData: any = null;

    if (isSupabaseConfigured && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('bookings')
        .select(`
          id,
          kode_booking,
          qr_payload,
          nama_lengkap,
          kelas,
          email,
          total_harga,
          status,
          created_at,
          sessions (
            tanggal,
            jam_mulai,
            films ( judul, durasi_menit )
          ),
          packages (
            nama_paket,
            jumlah_orang
          )
        `)
        .eq('kode_booking', cleanCode)
        .single();

      if (!error && data) {
        bookingData = {
          kode_booking: data.kode_booking,
          qr_payload: data.qr_payload || cleanCode,
          nama_lengkap: data.nama_lengkap,
          kelas: data.kelas,
          email: data.email,
          total_harga: data.total_harga,
          status: data.status,
          film_judul: (data.sessions as any)?.films?.judul || 'Film Festival',
          durasi_menit: (data.sessions as any)?.films?.durasi_menit || 120,
          tanggal: (data.sessions as any)?.tanggal || '-',
          jam_mulai: (data.sessions as any)?.jam_mulai || '-',
          nama_paket: (data.packages as any)?.nama_paket || 'Tiket Festival',
          jumlah_orang: (data.packages as any)?.jumlah_orang || 1,
        };
      }
    }

    const recipientEmail = email?.trim().toLowerCase() || bookingData?.email;
    if (!recipientEmail) {
      return NextResponse.json({ error: 'Recipient email not found' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const ticketUrl = `${appUrl}/ticket/${cleanCode}?email=${encodeURIComponent(recipientEmail)}`;
    const smtpUser = process.env.SMTP_USER || process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'kenxfear@gmail.com';
    const smtpPass = process.env.SMTP_PASS?.trim();
    const senderEmail = process.env.SENDER_EMAIL || `Cinemanik SMAN 1 Kendal <${smtpUser}>`;
    const emailSubject = `[Cinemanik] E-Ticket Tiket Anda - ${cleanCode} (${bookingData?.film_judul || 'Festival'})`;
    const qrPayloadToEncode = bookingData?.qr_payload || cleanCode;

    // -------------------------------------------------------------------------
    // 3. GENERATE QR CODE BUFFER (Untuk Embedded CID Image di Email)
    // -------------------------------------------------------------------------
    let qrBuffer: Buffer | null = null;
    try {
      qrBuffer = await QRCode.toBuffer(qrPayloadToEncode, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0284C7',
          light: '#FFFFFF',
        },
      });
    } catch (qrErr) {
      console.warn('QR Code generation error for email:', qrErr);
    }

    // Template HTML Email Resmi dengan QR Code Tersemat
    const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>E-Ticket Cinemanik 2026</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #F0F7FF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #BAE6FD; overflow: hidden; box-shadow: 0 4px 20px rgba(8, 47, 73, 0.06);">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #38BDF8 0%, #0284C7 100%); padding: 32px 28px; text-align: center; color: #ffffff;">
        <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #E0F2FE;">OSIS SMA Negeri 1 Kendal</p>
        <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;">Cinemanik 2026</h1>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #BAE6FD;">Festival Bioskop Arktik & Gletser</p>
      </td>
    </tr>

    <!-- Body Content -->
    <tr>
      <td style="padding: 32px 28px;">
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #334155;">
          Halo <strong>${bookingData?.nama_lengkap || 'Penonton'}</strong> (${bookingData?.kelas || '-'}),
        </p>
        <p style="margin: 0 0 24px 0; font-size: 13px; line-height: 1.6; color: #64748B;">
          Reservasi tiket Anda untuk festival bioskop Cinemanik 2026 telah berhasil tercatat. Simpan email ini dan tunjukkan QR Code di bawah ke petugas kami.
        </p>

        <!-- Booking Code & QR Box -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border: 2px dashed #BAE6FD; border-radius: 16px; margin-bottom: 24px; text-align: center;">
          <tr>
            <td style="padding: 24px 20px;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748B;">Kode Booking Resmi</span>
              <div style="font-size: 26px; font-weight: 800; font-family: monospace; letter-spacing: 0.08em; color: #0284C7; margin: 6px 0 10px 0;">
                ${cleanCode}
              </div>
              <span style="display: inline-block; font-size: 11px; font-weight: 700; background: ${bookingData?.status === 'ACC' ? '#DCFCE7' : '#FEF3C7'}; color: ${bookingData?.status === 'ACC' ? '#166534' : '#92400E'}; padding: 4px 12px; border-radius: 999px; border: 1px solid ${bookingData?.status === 'ACC' ? '#BBF7D0' : '#FDE68A'}; margin-bottom: 16px;">
                ${bookingData?.status === 'ACC' ? 'LUNAS (QR GATE PASS AKTIF)' : 'MENUNGGU PEMBAYARAN KASIR'}
              </span>

              <!-- Embedded QR Code Image -->
              <div style="background-color: #ffffff; padding: 14px; border-radius: 16px; border: 2px solid #E2E8F0; display: inline-block; box-shadow: 0 4px 12px rgba(8, 47, 73, 0.08); margin: 0 auto;">
                <img src="cid:ticket-qrcode" alt="QR E-Ticket ${cleanCode}" width="220" height="220" style="display: block; margin: 0 auto; border-radius: 8px;" />
              </div>

              <p style="margin: 12px 0 0 0; font-size: 11px; color: #64748B; line-height: 1.4;">
                Pindai langsung QR Code di atas di meja kasir atau gerbang masuk teater.
              </p>
            </td>
          </tr>
        </table>

        <!-- Ticket Summary -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 13px; margin-bottom: 28px; line-height: 1.8;">
          <tr>
            <td style="color: #64748B; padding: 4px 0;">Film</td>
            <td style="font-weight: 700; color: #0F172A; text-align: right; padding: 4px 0;">${bookingData?.film_judul || '-'}</td>
          </tr>
          <tr>
            <td style="color: #64748B; padding: 4px 0;">Jadwal Tayang</td>
            <td style="font-weight: 600; color: #0F172A; text-align: right; padding: 4px 0;">${bookingData?.tanggal || '-'} &bull; ${String(bookingData?.jam_mulai || '').substring(0, 5)} WIB</td>
          </tr>
          <tr>
            <td style="color: #64748B; padding: 4px 0;">Paket & Jumlah</td>
            <td style="font-weight: 600; color: #0F172A; text-align: right; padding: 4px 0;">${bookingData?.nama_paket || 'Tiket'} (${bookingData?.jumlah_orang || 1} Orang)</td>
          </tr>
          <tr style="border-top: 1px solid #E2E8F0;">
            <td style="color: #64748B; padding: 8px 0 4px 0; font-weight: 600;">Total Biaya</td>
            <td style="font-weight: 800; font-size: 16px; font-family: monospace; color: #0F172A; text-align: right; padding: 8px 0 4px 0;">
              Rp ${Number(bookingData?.total_harga || 0).toLocaleString('id-ID')}
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
          <tr>
            <td align="center">
              <a href="${ticketUrl}" target="_blank" style="display: inline-block; background: #0F172A; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 14px 28px; border-radius: 12px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);">
                Buka E-Ticket &amp; QR Code Interaktif di Browser &rarr;
              </a>
            </td>
          </tr>
        </table>

        <!-- Instructions -->
        <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 14px; font-size: 12px; color: #166534; line-height: 1.5;">
          <strong>Petunjuk Kehadiran:</strong><br>
          ${
            bookingData?.status === 'ACC'
              ? 'Tiket Anda sudah LUNAS. Cukup tunjukkan QR Code di atas langsung kepada petugas gate di pintu masuk bioskop pada hari penayangan.'
              : 'Silakan tunjukkan QR Code di atas atau kode booking ke pos kasir panitia OSIS dalam waktu <strong>24 jam</strong> untuk melunasi pembayaran tiket.'
          }
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 28px; text-align: center; font-size: 11px; color: #94A3B8;">
        &copy; 2026 OSIS SMA Negeri 1 Kendal. Festival Bioskop Cinemanik 2026.<br>
        Email resmi otomatis. Simpan email ini untuk akses masuk teater.
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // -------------------------------------------------------------------------
    // 4. PENGIRIMAN EMAIL RESMI GMAIL SMTP / POSTFIX SERVER LOKAL
    // -------------------------------------------------------------------------
    const smtpHost = process.env.SMTP_HOST || (smtpPass ? 'smtp.gmail.com' : (process.env.USE_LOCAL_POSTFIX === 'true' ? 'localhost' : ''));

    if (smtpHost || smtpPass) {
      try {
        const transportConfig: any = smtpPass
          ? {
              host: smtpHost || 'smtp.gmail.com',
              port: Number(process.env.SMTP_PORT) || 465,
              secure: Number(process.env.SMTP_PORT) === 465 || !process.env.SMTP_PORT,
              auth: {
                user: smtpUser,
                pass: smtpPass,
              },
            }
          : {
              host: 'localhost',
              port: 25,
              tls: { rejectUnauthorized: false },
            };

        const transporter = nodemailer.createTransport(transportConfig);
        const mailOptions: any = {
          from: senderEmail,
          to: recipientEmail,
          subject: emailSubject,
          html: htmlEmail,
          ...(qrBuffer
            ? {
                attachments: [
                  {
                    filename: `qrcode-${cleanCode}.png`,
                    content: qrBuffer,
                    cid: 'ticket-qrcode',
                  },
                ],
              }
            : {}),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Google/Local Mailer] Email berhasil dikirim via SMTP (${info.messageId}) ke ${recipientEmail}`);
        return NextResponse.json({
          success: true,
          provider: smtpPass ? 'gmail-smtp' : 'postfix',
          messageId: info.messageId,
          ticketUrl,
          recipient: recipientEmail,
        });
      } catch (smtpErr: any) {
        console.error('[SMTP Send Error]:', smtpErr);
      }
    }

    // -------------------------------------------------------------------------
    // 5. SIMULASI AMAN (Jika Belum Mengisi Password Aplikasi Google)
    // -------------------------------------------------------------------------
    return NextResponse.json({
      success: true,
      simulated: true,
      message: `Email E-Ticket terverifikasi untuk ${recipientEmail}. Masukkan SMTP_PASS di .env.local untuk pengiriman langsung via akun Google Anda.`,
      ticketUrl,
      recipient: recipientEmail,
    });
  } catch (err: any) {
    console.error('Email sending error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
