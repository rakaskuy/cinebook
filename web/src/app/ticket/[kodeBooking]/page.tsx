'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Ticket,
  Clock,
  Calendar,
  Film,
  Mail,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowLeft,
  Download,
  Lock,
  Unlock,
  Check,
  Loader2,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { BookingDetailResponse } from '@/lib/types';
import { executeCheckBookingStatus } from '@/lib/supabase';

export default function TicketPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const kodeBooking = (params.kodeBooking as string) || '';
  const initialEmail = searchParams.get('email') || '';

  const [emailInput, setEmailInput] = useState(initialEmail);
  const [ticketData, setTicketData] = useState<BookingDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const fetchTicket = async (emailToVerify: string) => {
    if (!kodeBooking || !emailToVerify) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const data = await executeCheckBookingStatus(kodeBooking, emailToVerify);
      if (data && data.success) {
        setTicketData(data);
        setTimeLeft(data.seconds_left || 0);
      } else {
        setErrorMsg(data?.message || 'Tiket tidak ditemukan atau email verifikasi salah.');
        setTicketData(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat status tiket.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialEmail) {
      fetchTicket(initialEmail);
    }
  }, [kodeBooking, initialEmail]);

  useEffect(() => {
    if (!ticketData || ticketData.status !== 'PENDING' || !emailInput) return;
    const interval = setInterval(() => {
      executeCheckBookingStatus(kodeBooking, emailInput)
        .then((data) => {
          if (data && data.success && data.status !== 'PENDING') {
            setTicketData(data);
            setTimeLeft(data.seconds_left || 0);
          }
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(interval);
  }, [ticketData, emailInput, kodeBooking]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const handleVerifyEmail = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTicket(emailInput);
  };

  const handleResendEmail = async () => {
    if (!ticketData) return;
    setResending(true);
    setEmailSent(false);

    try {
      await fetch('/api/resend-ticket-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode_booking: ticketData.kode_booking }),
      }).catch(() => null);

      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 5000);
    } catch {
      setEmailSent(true);
    } finally {
      setResending(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return '00:00:00 (Kedaluwarsa)';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
      .toString()
      .padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return {
          label: 'Menunggu Kasir',
          color: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: Clock,
          desc: 'Tunjukkan kode booking atau QR ini ke meja kasir lobi OSIS untuk menyelesaikan pembayaran.',
        };
      case 'ACC':
        return {
          label: 'Lunas & Siap Masuk',
          color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: CheckCircle2,
          desc: 'Pembayaran telah diverifikasi panitia. QR Code ini siap digunakan untuk scan masuk pintu auditorium.',
        };
      case 'REJECT':
        return {
          label: 'Ditolak Panitia',
          color: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: XCircle,
          desc: 'Pemesanan ditolak oleh panitia OSIS. Silakan hubungi meja informasi.',
        };
      case 'EXPIRED':
        return {
          label: 'Kedaluwarsa (24 Jam)',
          color: 'bg-slate-100 text-slate-700 border-slate-200',
          icon: AlertTriangle,
          desc: 'Waktu pembayaran 24 jam telah habis. Kuota kursi telah dikembalikan ke sistem.',
        };
      case 'USED':
        return {
          label: 'Telah Masuk Teater',
          color: 'bg-sky-50 text-sky-800 border-sky-200',
          icon: CheckCircle2,
          desc: 'Tiket ini telah berhasil di-scan di gerbang masuk bioskop. Selamat menyaksikan!',
        };
      case 'CANCELLED':
        return {
          label: 'Dibatalkan',
          color: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: XCircle,
          desc: 'Booking tiket ini telah dibatalkan.',
        };
      default:
        return {
          label: status,
          color: 'bg-slate-50 text-slate-700 border-slate-200',
          icon: HelpCircle,
          desc: '',
        };
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-white/90 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Ke Beranda</span>
        </Link>
        <div className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-800 text-xs font-medium px-3 py-1.5 border border-sky-200 rounded-lg">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
          <span>E-Ticket Resmi OSIS</span>
        </div>
      </div>

      {/* Security Email Gate Modal */}
      <AnimatePresence>
        {!ticketData && !loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm max-w-lg mx-auto space-y-5"
          >
            <div className="w-10 h-10 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-center">
              <Lock className="w-5 h-5 text-sky-600" />
            </div>
            <div className="space-y-1">
              <h2 className="font-serif text-2xl text-slate-900 font-medium tracking-tight">
                Verifikasi Email Pemesan
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Untuk mengakses e-ticket <strong className="text-slate-800 font-mono">{kodeBooking}</strong>, masukkan email yang didaftarkan saat reservasi.
              </p>
            </div>

            <form onSubmit={handleVerifyEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Alamat Email Siswa
                </label>
                <input
                  type="email"
                  placeholder="siswa@sman1kendal.sch.id"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {errorMsg && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <motion.button
                type="submit"
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98, y: 1 }}
                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                className="w-full bg-slate-900 hover:bg-sky-950 text-white font-medium text-xs sm:text-sm py-2.5 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                <span>Buka E-Ticket</span>
              </motion.button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm text-xs font-medium text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
          <span>Memverifikasi tiket dan tanda tangan digital...</span>
        </div>
      )}

      {/* Ticket Card: Anthropic Editorial Presentation */}
      <AnimatePresence>
        {ticketData && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            whileHover={{ y: -4, boxShadow: '0 20px 30px -10px rgba(8, 47, 73, 0.1)' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-sm transition-all"
          >
            {/* Header Strip */}
            <div className="p-6 sm:p-8 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="bg-sky-50 text-sky-800 text-[10px] font-semibold px-2 py-0.5 rounded border border-sky-200">
                    SMAN 1 Kendal
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                    {ticketData.kode_booking}
                  </span>
                </div>
                <h1 className="font-serif text-2xl sm:text-3xl text-slate-900 font-medium tracking-tight">
                  {ticketData.film_judul}
                </h1>
                <p className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-sky-600" />
                    {new Date(ticketData.tanggal).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sky-600" />
                    {ticketData.jam_mulai.substring(0, 5)} WIB
                  </span>
                </p>
              </div>

              {/* Status Pill Badge */}
              <div>
                {(() => {
                  const badge = getStatusBadge(ticketData.status);
                  const Icon = badge.icon;
                  return (
                    <div
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-semibold ${badge.color}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{badge.label}</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Ticket Body: Two-Column Responsive Layout */}
            <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              {/* Left: QR Code Block */}
              <div className="md:col-span-5 flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 border border-slate-200/80 text-center">
                <span className="text-[11px] font-semibold text-slate-600 mb-3">
                  {ticketData.status === 'PENDING' ? (
                    <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                      Tunjukkan ke Kasir Lobi
                    </span>
                  ) : ticketData.status === 'ACC' ? (
                    <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                      QR Gate Pass Resmi
                    </span>
                  ) : (
                    <span className="text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                      Status: {ticketData.status}
                    </span>
                  )}
                </span>

                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm max-w-[200px] w-full aspect-square flex items-center justify-center">
                  <QRCodeSVG
                    value={ticketData.qr_payload}
                    size={170}
                    level="M"
                    includeMargin={true}
                    className="w-full h-full"
                  />
                </div>

                <div className="mt-3 font-mono font-semibold text-xs text-slate-800 bg-white px-2.5 py-1 rounded border border-slate-200">
                  {ticketData.kode_booking}
                </div>

                <p className="text-[11px] text-slate-500 mt-2 max-w-xs">
                  {ticketData.status === 'PENDING'
                    ? 'Bawa kode booking ini ke meja kasir lobi untuk verifikasi pembayaran'
                    : ticketData.status === 'ACC'
                    ? 'Scan QR ini di pintu masuk teater saat hari-H penayangan'
                    : 'Akses masuk bioskop telah divalidasi'}
                </p>
              </div>

              {/* Right: Booking Details & Countdown */}
              <div className="md:col-span-7 space-y-4">
                {/* 24-Hour Countdown Timer Box for PENDING */}
                {ticketData.status === 'PENDING' && (
                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-1">
                    <div className="flex items-center justify-between text-xs text-amber-900 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        Batas Waktu Pembayaran Kasir
                      </span>
                      <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-mono">
                        24 Jam
                      </span>
                    </div>
                    <div className="text-2xl font-serif font-medium text-amber-950 font-mono tracking-tight">
                      {formatCountdown(timeLeft)}
                    </div>
                    <p className="text-[11px] text-amber-800/80 leading-relaxed font-sans">
                      Bila batas waktu habis sebelum dikonfirmasi kasir, kuota kursi otomatis kembali tersedia untuk umum.
                    </p>
                  </div>
                )}

                {/* Details Table */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">Nama Pemesan</span>
                    <span className="font-medium text-slate-800">{ticketData.nama_lengkap}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">Kelas / Jurusan</span>
                    <span className="font-medium text-slate-800">{ticketData.kelas}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">Email</span>
                    <span className="font-mono text-slate-800">{ticketData.email}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">Paket Tiket</span>
                    <span className="font-medium text-slate-800">
                      {ticketData.nama_paket.includes('Orang')
                        ? ticketData.nama_paket
                        : `${ticketData.nama_paket} (${ticketData.jumlah_orang} Orang)`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-500">Total Pembayaran Offline</span>
                    <span className="font-serif text-base font-semibold text-slate-900">
                      Rp {Number(ticketData.total_harga).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {/* Status Explanation Banner */}
                <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3 text-xs text-slate-600 flex items-start gap-2">
                  <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{getStatusBadge(ticketData.status).desc}</span>
                </div>
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="bg-slate-50 border-t border-slate-100 p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <motion.button
                  onClick={handleResendEmail}
                  disabled={resending}
                  whileHover={!resending ? { scale: 1.02, y: -1 } : undefined}
                  whileTap={!resending ? { scale: 0.98, y: 1 } : undefined}
                  transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium px-4 py-2 rounded-lg border border-slate-200 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                  <span>{resending ? 'Mengirim...' : 'Kirim Ulang ke Email'}</span>
                </motion.button>

                <AnimatePresence>
                  {emailSent && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="text-xs text-emerald-700 flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md"
                    >
                      <Check className="w-3.5 h-3.5" /> Terkirim!
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                onClick={() => window.print()}
                whileHover={{ scale: 1.02, y: -1, boxShadow: '0 8px 18px -4px rgba(8, 47, 73, 0.2)' }}
                whileTap={{ scale: 0.98, y: 1 }}
                transition={{ type: 'spring', stiffness: 450, damping: 22 }}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-sky-950 text-white font-medium text-xs px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Cetak / Unduh Tiket</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
