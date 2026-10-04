'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import {
  ArrowLeft,
  Clock,
  Calendar,
  Users,
  Film,
  Check,
  AlertCircle,
  ShieldAlert,
  Loader2,
  User,
  Ticket,
  ChevronRight,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { Session, Package } from '@/lib/types';
import { fetchSessionById, fetchPackages, executeCreateBooking } from '@/lib/supabase';

const bookingFormSchema = z.object({
  namaLengkap: z.string().min(2, 'Nama lengkap minimal 2 karakter').max(100, 'Nama terlalu panjang'),
  kelas: z.string().min(2, 'Kelas minimal 2 karakter (misal: XI MIPA 2, XII IPS 1)'),
  email: z.string().email('Format email tidak valid (contoh: siswa@sman1kendal.sch.id)'),
  packageId: z.string().min(1, 'Silakan pilih salah satu paket tiket'),
});

type BookingFormValues = z.infer<typeof bookingFormSchema>;

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [formData, setFormData] = useState<BookingFormValues>({
    namaLengkap: '',
    kelas: '',
    email: '',
    packageId: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof BookingFormValues, string>>>({});

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      try {
        const [sessData, pkgData] = await Promise.all([
          fetchSessionById(sessionId),
          fetchPackages(),
        ]);
        if (isMounted) {
          setSession(sessData);
          setPackages(pkgData);
          if (pkgData.length > 0) {
            setFormData((prev) => ({ ...prev, packageId: pkgData[0].id }));
          }
        }
      } catch (err: any) {
        console.error('Error loading booking data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const selectedPackage = packages.find((p) => p.id === formData.packageId);
  const sisaKuota = session ? session.kuota_total - session.kuota_terisi : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const validation = bookingFormSchema.safeParse(formData);
    if (!validation.success) {
      const errMap: Partial<Record<keyof BookingFormValues, string>> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          errMap[err.path[0] as keyof BookingFormValues] = err.message;
        }
      });
      setFieldErrors(errMap);
      return;
    }

    setFieldErrors({});

    if (!selectedPackage) {
      setSubmitError('Paket tiket tidak ditemukan.');
      return;
    }

    if (selectedPackage.jumlah_orang > sisaKuota) {
      setSubmitError(
        `Kapasitas kursi tidak mencukupi untuk paket ini (tersisa ${sisaKuota} kursi, paket butuh ${selectedPackage.jumlah_orang} kursi).`
      );
      return;
    }

    setSubmitting(true);

    try {
      const result = await executeCreateBooking({
        sessionId,
        packageId: formData.packageId,
        namaLengkap: formData.namaLengkap.trim(),
        kelas: formData.kelas.trim(),
        email: formData.email.trim().toLowerCase(),
      });

      if (!result.success || !result.kode_booking) {
        setSubmitError(result.message || 'Gagal membuat reservasi.');
        setSubmitting(false);
        return;
      }

      router.push(`/ticket/${result.kode_booking}?email=${encodeURIComponent(formData.email.trim().toLowerCase())}`);
    } catch (err: any) {
      setSubmitError(err.message || 'Terjadi kesalahan sistem saat memproses pemesanan.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-12 shadow-sm font-medium text-sm text-slate-600 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
          <span>Menyiapkan formulir pemesanan...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
          <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
          <h2 className="font-serif text-2xl text-slate-900 font-medium">
            Sesi Tidak Ditemukan
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Jadwal sesi film ini mungkin telah dihapus atau ditutup oleh panitia.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-slate-900 text-white font-medium text-xs px-4 py-2.5 rounded-xl shadow-sm hover:bg-sky-950 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Jadwal
          </Link>
        </div>
      </div>
    );
  }

  const film = session.films;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6 sm:space-y-8"
    >
      {/* Back Button */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-white/90 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Jadwal</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Session & Film Summary Card */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5 space-y-6"
        >
          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-sm">
            <div className="relative aspect-[16/10] bg-slate-950 overflow-hidden">
              {film?.poster_path && (
                <img
                  src={film.poster_path}
                  alt={film.judul}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 text-white">
                <span className="bg-sky-500/80 backdrop-blur-md text-[10px] font-semibold px-2 py-0.5 rounded text-white">
                  Auditorium SMAN 1
                </span>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div className="space-y-1">
                <h2 className="font-serif text-xl sm:text-2xl text-slate-900 font-medium tracking-tight">
                  {film?.judul}
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  {film?.deskripsi}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3 text-xs">
                <div className="flex items-center justify-between text-slate-700">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Calendar className="w-3.5 h-3.5 text-sky-600" />
                    Tanggal
                  </span>
                  <span className="font-medium text-slate-900">
                    {new Date(session.tanggal).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-700">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Clock className="w-3.5 h-3.5 text-sky-600" />
                    Jam Pemutaran
                  </span>
                  <span className="font-medium bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-900">
                    {session.jam_mulai.substring(0, 5)} WIB
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-700">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Users className="w-3.5 h-3.5 text-sky-600" />
                    Sisa Kursi
                  </span>
                  <span className="font-semibold text-sky-700">
                    {sisaKuota} dari {session.kuota_total} Kursi
                  </span>
                </div>
              </div>

              <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-3 text-xs text-slate-600 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 shrink-0 text-sky-600 mt-0.5" />
                <span className="leading-relaxed">
                  Sistem mengunci kursi secara realtime. Anda memiliki waktu 24 jam untuk menyelesaikan pembayaran offline di pos kasir OSIS.
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right: Booking Form & Package Selector */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          className="lg:col-span-7"
        >
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-6"
          >
            <div className="space-y-1">
              <span className="text-xs font-semibold text-sky-700 uppercase tracking-wider">
                Langkah Reservasi
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl text-slate-900 font-medium tracking-tight">
                Pilih Paket &amp; Data Siswa
              </h1>
              <p className="text-xs text-slate-500 font-sans">
                Pastikan email yang dimasukkan aktif untuk menerima salinan E-Ticket QR resmi.
              </p>
            </div>

            {/* Package Selector Cards */}
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-slate-800">
                Pilih Paket Tiket
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {packages.map((pkg) => {
                  const isSelected = formData.packageId === pkg.id;
                  const isInsufficient = pkg.jumlah_orang > sisaKuota;

                  return (
                    <motion.button
                      type="button"
                      key={pkg.id}
                      disabled={isInsufficient}
                      whileHover={!isInsufficient ? { y: -3, scale: 1.02 } : undefined}
                      whileTap={!isInsufficient ? { y: 1, scale: 0.98 } : undefined}
                      transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                      onClick={() => setFormData({ ...formData, packageId: pkg.id })}
                      className={`relative text-left p-4 rounded-xl border transition-all flex flex-col justify-between cursor-pointer ${
                        isInsufficient
                          ? 'opacity-40 bg-slate-50 border-slate-200 cursor-not-allowed'
                          : isSelected
                          ? 'bg-sky-50/70 border-sky-500 ring-1 ring-sky-500 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-5 h-5 bg-sky-600 text-white rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[2.5]" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-sm text-slate-900 pr-5">
                          {pkg.nama_paket}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{pkg.jumlah_orang} Orang</span>
                        </div>
                      </div>
                      <div className="mt-3 font-semibold text-sm text-sky-700">
                        Rp {pkg.harga.toLocaleString('id-ID')}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              {fieldErrors.packageId && (
                <p className="text-xs text-rose-600 mt-1">{fieldErrors.packageId}</p>
              )}
            </div>

            {/* User Form Fields */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Nama Lengkap Pemesan
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Raden Ayu Kartini"
                  value={formData.namaLengkap}
                  onChange={(e) => setFormData({ ...formData, namaLengkap: e.target.value })}
                  className={`w-full bg-slate-50 border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    fieldErrors.namaLengkap ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                  }`}
                />
                {fieldErrors.namaLengkap && (
                  <p className="text-xs text-rose-600 mt-1">{fieldErrors.namaLengkap}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Kelas (SMAN 1 Kendal)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: XI MIPA 2"
                    value={formData.kelas}
                    onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                    className={`w-full bg-slate-50 border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                      fieldErrors.kelas ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                    }`}
                  />
                  {fieldErrors.kelas && (
                    <p className="text-xs text-rose-600 mt-1">{fieldErrors.kelas}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Email Siswa (Akses E-Ticket)
                  </label>
                  <input
                    type="email"
                    placeholder="siswa@sman1kendal.sch.id"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full bg-slate-50 border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                      fieldErrors.email ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
                    }`}
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-rose-600 mt-1">{fieldErrors.email}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Total Price & Payment Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs text-slate-500">Total Pembayaran Offline:</span>
                <div className="text-xl sm:text-2xl font-serif text-slate-900 font-medium">
                  Rp {(selectedPackage?.harga || 0).toLocaleString('id-ID')}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-sky-800 bg-sky-50 px-3 py-1 rounded-lg border border-sky-100 font-medium self-start sm:self-auto">
                <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                <span>Bayar di Pos Kasir Lobi</span>
              </div>
            </div>

            <AnimatePresence>
              {submitError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3.5 text-xs font-medium flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{submitError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={submitting || sisaKuota <= 0}
              whileHover={!submitting && sisaKuota > 0 ? { scale: 1.02, y: -2, boxShadow: '0 12px 24px -6px rgba(8, 47, 73, 0.25)' } : undefined}
              whileTap={!submitting && sisaKuota > 0 ? { scale: 0.98, y: 1 } : undefined}
              transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              className="w-full bg-slate-900 hover:bg-sky-950 text-white font-medium text-xs sm:text-sm py-3 rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengunci Kuota &amp; Menerbitkan E-Ticket...</span>
                </>
              ) : (
                <>
                  <Ticket className="w-4 h-4" />
                  <span>Konfirmasi &amp; Terbitkan E-Ticket</span>
                </>
              )}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </motion.div>
  );
}
