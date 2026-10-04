'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import {
  Calendar,
  Clock,
  Users,
  Ticket,
  Film,
  Sparkles,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Timer,
  Snowflake,
  QrCode,
  CreditCard,
  MapPin,
  ChevronRight,
  Info,
  Tv,
  Volume2,
} from 'lucide-react';
import { Session } from '@/lib/types';
import { fetchSessions, fetchAvailableSessionDates } from '@/lib/supabase';
import {
  ScrollWordReveal,
  ScrollBlockReveal,
  ScrollTypewriter,
  KineticSectionTitle,
  Card3D,
  Button3D,
} from '@/components/KineticTypography';

const heroContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const heroItemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

const sessionsGridVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.06,
    },
  },
};

const sessionCardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export default function HomePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    async function loadDates() {
      try {
        const dates = await fetchAvailableSessionDates();
        if (isMounted && dates.length > 0) {
          setAvailableDates(dates);
          const todayStr = new Date().toISOString().split('T')[0];
          setSelectedDate(dates.includes(todayStr) ? todayStr : dates[0]);
        } else if (isMounted) {
          const todayStr = new Date().toISOString().split('T')[0];
          setAvailableDates([todayStr]);
          setSelectedDate(todayStr);
        }
      } catch (err) {
        console.error('Failed to load session dates:', err);
        const todayStr = new Date().toISOString().split('T')[0];
        if (isMounted) {
          setAvailableDates([todayStr]);
          setSelectedDate(todayStr);
        }
      }
    }
    loadDates();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    let active = true;
    setLoading(true);

    fetchSessions(selectedDate)
      .then((data) => {
        if (active) {
          setSessions(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch sessions:', err);
        if (active) {
          setSessions([]);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedDate]);

  function formatDateLabel(dateStr: string) {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const d = new Date(dateStr + 'T00:00:00');
      const dayMonth = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

      if (dateStr === todayStr) {
        return `Hari Ini (${dayMonth})`;
      }
      if (dateStr === tomorrowStr) {
        return `Besok (${dayMonth})`;
      }
      const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' });
      return `${dayName}, ${dayMonth}`;
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-16 sm:space-y-20">
      {/* ============================================================== */}
      {/* 1. HERO SECTION WITH SCROLL KINETIC TYPOGRAPHY & 3D LIGHTING   */}
      {/* ============================================================== */}
      <motion.section
        variants={heroContainerVariants}
        initial="hidden"
        animate="visible"
        className="relative rounded-3xl border border-sky-950/10 bg-white/80 backdrop-blur-xl p-6 sm:p-10 lg:p-12 shadow-[0_4px_28px_rgba(8,47,73,0.06)] overflow-hidden"
      >
        {/* Soft Ambient Radial Accents */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-gradient-to-br from-cyan-400/20 to-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-gradient-to-tr from-indigo-400/15 to-cyan-400/10 blur-3xl" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center relative z-10">
          {/* Left Column: Headlines & CTA */}
          <div className="lg:col-span-7 space-y-6">
            {/* Sliding block badge */}
            <motion.div variants={heroItemVariants}>
              <ScrollBlockReveal delay={0.05}>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-200 bg-sky-50/80 text-sky-800 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                  <span>OSIS SMAN 1 Kendal • Festival Sinema 2026</span>
                </div>
              </ScrollBlockReveal>
            </motion.div>

            {/* Kinetic Typography Headline */}
            <ScrollWordReveal
              text="Sensasi Nonton di"
              highlight="Ekspedisi Dingin Arktik"
              className="font-serif text-3xl sm:text-5xl lg:text-6xl text-slate-900 font-normal tracking-tight leading-[1.15]"
            />

            {/* Scroll Typewriter & Animated Subtitle */}
            <motion.div variants={heroItemVariants} className="space-y-2">
              <p className="text-xs sm:text-sm font-medium text-sky-700">
                <ScrollTypewriter
                  text="Auditorium SMAN 1 Kendal disulap menjadi teater dingin bertaraf festival."
                  speed={28}
                  delay={300}
                />
              </p>
              <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed font-sans">
                Nikmati festival bioskop bertema gletser musim dingin. Pilih jadwal sesi,
                terima E-Ticket QR resmi seketika, lalu selesaikan konfirmasi pembayaran secara offline
                di pos kasir panitia OSIS.
              </p>
            </motion.div>

            {/* Quick Feature Badges with 3D Micro-interactions */}
            <motion.div variants={heroItemVariants} className="flex flex-wrap items-center gap-2.5 pt-1">
              {[
                { icon: ShieldCheck, text: 'Anti-Overbooking Realtime' },
                { icon: QrCode, text: 'HMAC Secure QR' },
                { icon: Clock, text: '24 Jam Batas Kasir' },
                { icon: Volume2, text: 'Audio Bioskop 5.1' },
              ].map((badge, idx) => {
                const Icon = badge.icon;
                return (
                  <motion.div
                    key={idx}
                    whileHover={{ y: -2.5, scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white/80 hover:bg-white text-slate-700 text-xs font-medium shadow-sm transition-colors cursor-default"
                  >
                    <Icon className="w-3.5 h-3.5 text-sky-600" />
                    <span>{badge.text}</span>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* 3D Action Buttons (Stay/In/Out Tactile Micro-Interactions) */}
            <motion.div variants={heroItemVariants} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <motion.a
                href="#jadwal"
                whileHover={{ y: -2.5, scale: 1.03, boxShadow: '0 12px 24px -6px rgba(8, 47, 73, 0.25)' }}
                whileTap={{ y: 1, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 450, damping: 22 }}
                className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-sky-950 text-white font-medium text-xs sm:text-sm px-6 py-3 rounded-xl shadow-sm cursor-pointer"
              >
                <Ticket className="w-4 h-4" />
                <span>Lihat Jadwal &amp; Pesan</span>
              </motion.a>

              <motion.a
                href="/#panduan"
                whileHover={{ y: -2, scale: 1.02, boxShadow: '0 8px 18px -4px rgba(8, 47, 73, 0.08)' }}
                whileTap={{ y: 1, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                className="flex items-center justify-center gap-1.5 bg-white/80 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium px-5 py-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer"
              >
                <Info className="w-4 h-4 text-slate-400" />
                <span>Panduan Festival</span>
              </motion.a>
            </motion.div>
          </div>

          {/* Right Column: Featured Spotlight Preview 3D Perspective Card */}
          <motion.div
            variants={heroItemVariants}
            className="lg:col-span-5 relative [perspective:1000px]"
          >
            <Card3D lift={-8} rotateX={3} rotateY={-3} scale={1.025}>
              <div className="rounded-2xl border border-sky-100 bg-white/95 p-5 shadow-lg space-y-4 transition-colors">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium pb-2 border-b border-slate-100">
                  <span className="flex items-center gap-1.5 text-sky-700 font-semibold">
                    <Film className="w-3.5 h-3.5" />
                    Sorotan Teater Utama
                  </span>
                  <span className="bg-sky-50 text-sky-800 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-sky-200">
                    Festival Unggulan
                  </span>
                </div>

                {/* Poster Preview */}
                <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden bg-slate-950 group">
                  <img
                    src="https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?q=80&w=800&auto=format&fit=crop"
                    alt="Interstellar Cinemanik"
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent pointer-events-none" />
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <p className="text-[10px] text-cyan-200 font-semibold uppercase tracking-wider">
                      Sesi Pembuka • 13:30 WIB
                    </p>
                    <p className="font-serif text-base font-medium line-clamp-1">
                      Interstellar: Ekspedisi Planet Es Mann
                    </p>
                  </div>
                </div>

                {/* Meta information */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium">Tempat</p>
                    <p className="text-xs font-semibold text-slate-800 line-clamp-1">Auditorium SMAN 1</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium">Tiket Masuk</p>
                    <p className="text-xs font-semibold text-slate-800">Mulai Rp 25.000</p>
                  </div>
                </div>
              </div>
            </Card3D>
          </motion.div>
        </div>
      </motion.section>

      {/* ============================================================== */}
      {/* 2. FESTIVAL LIVE HIGHLIGHT STRIP (Metrics in 3D Cards)         */}
      {/* ============================================================== */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 [perspective:1000px]">
        {[
          {
            stat: '3 Film',
            label: 'Katalog Festival',
            desc: 'Sci-fi, petualangan, & animasi salju',
            icon: Film,
          },
          {
            stat: '4 Paket',
            label: 'Pilihan Tiket',
            desc: 'Solo, Couple, Trio, & Squad feast',
            icon: Ticket,
          },
          {
            stat: '60 Kursi',
            label: 'Kapasitas Tiap Sesi',
            desc: 'Kenyamanan auditorium ber-AC',
            icon: Users,
          },
          {
            stat: 'Anti-Calo',
            label: 'Sistem Terintegrasi',
            desc: 'QR HMAC & verifikasi data siswa',
            icon: ShieldCheck,
          },
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <Card3D key={idx} lift={-5} rotateX={2} rotateY={-1.5} scale={1.02}>
              <div className="bg-white/85 border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-xl sm:text-2xl text-slate-900 font-medium">
                    {item.stat}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">{item.label}</p>
                  <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{item.desc}</p>
                </div>
              </div>
            </Card3D>
          );
        })}
      </section>

      {/* ============================================================== */}
      {/* 3. HOW IT WORKS / ALUR EKSPEDISI TIKET (3D Cards)              */}
      {/* ============================================================== */}
      <section id="panduan" className="space-y-6 scroll-mt-24">
        <KineticSectionTitle
          tag="Alur Pemesanan"
          title="Empat Langkah Menuju Kursi Teater"
          subtitle="Proses pemesanan transparan tanpa antrean panjang saat hari pemutaran film."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 [perspective:1000px]">
          {[
            {
              num: '01',
              title: 'Pilih Sesi & Paket',
              desc: 'Tentukan tanggal tayang dan paket tiket yang diinginkan (Solo, Couple, Trio, Squad).',
              icon: Ticket,
            },
            {
              num: '02',
              title: 'Terima E-Ticket QR',
              desc: 'QR Code ber-tanda tangan HMAC aktif instan dan langsung dikirimkan ke email Anda.',
              icon: QrCode,
            },
            {
              num: '03',
              title: 'Bayar di Pos Kasir',
              desc: 'Konfirmasi pembayaran offline ke pos kasir panitia OSIS dalam batas waktu 24 jam.',
              icon: CreditCard,
            },
            {
              num: '04',
              title: 'Scan Masuk Gate',
              desc: 'Tunjukkan QR Code saat hari-H di pintu masuk teater untuk verifikasi akses.',
              icon: ShieldCheck,
            },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <Card3D key={idx} lift={-6} rotateX={2.5} rotateY={-2} scale={1.025}>
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                      {item.num}
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600">
                      <Icon className="w-4 h-4 text-sky-600" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-semibold text-sm sm:text-base text-slate-900">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-sans">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </Card3D>
            );
          })}
        </div>
      </section>

      {/* ============================================================== */}
      {/* 4. SCHEDULE & SESSIONS GRID (3D Perspective Lift Cards)        */}
      {/* ============================================================== */}
      <section id="jadwal" className="space-y-6 scroll-mt-24">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-slate-200">
          <KineticSectionTitle
            tag="Jadwal Pemutaran"
            title="Pilihan Sesi Film & Kuota Kursi"
            subtitle="Pilih tanggal pemutaran untuk melihat ketersediaan kursi secara realtime."
          />

          {/* Date Selector Segmented Control with Spring Interaction */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
            {availableDates.map((dateStr) => {
              const isSelected = selectedDate === dateStr;
              return (
                <motion.button
                  key={dateStr}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`relative px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    isSelected ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="active-date-pill"
                      className="absolute inset-0 bg-white rounded-lg shadow-sm"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-sky-600" />
                    {formatDateLabel(dateStr)}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Sessions List */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs font-medium text-slate-500 flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 animate-spin text-sky-600" />
            <span>Memuat jadwal sesi teater...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-400" />
            <h3 className="font-semibold text-sm text-slate-800">
              Belum Ada Jadwal Penayangan
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Panitia OSIS belum menambahkan jadwal pemutaran film untuk tanggal ini. Silakan pilih tanggal lain.
            </p>
          </div>
        ) : (
          <motion.div
            key={selectedDate}
            variants={sessionsGridVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 [perspective:1000px]"
          >
            {sessions.map((sess) => {
              const film = sess.films;
              const sisaKuota = sess.kuota_total - sess.kuota_terisi;
              const isFull = sisaKuota <= 0;
              const isAlmostFull = sisaKuota > 0 && sisaKuota <= 10;
              const percentFilled = Math.min(100, Math.round((sess.kuota_terisi / sess.kuota_total) * 100));

              return (
                <Card3D key={sess.id} lift={-8} rotateX={2.5} rotateY={-2} scale={1.02}>
                  <div className="group rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col justify-between h-full">
                    {/* Poster container */}
                    <div className="relative aspect-[16/10] w-full bg-slate-900 overflow-hidden">
                      {film?.poster_path ? (
                        <img
                          src={film.poster_path}
                          alt={film.judul}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white font-medium text-sm p-4 text-center">
                          {film?.judul}
                        </div>
                      )}

                      {/* Time Badge Overlay */}
                      <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white rounded-md px-2 py-1 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                        <Clock className="w-3 h-3 text-cyan-300" />
                        <span>{sess.jam_mulai.substring(0, 5)} WIB</span>
                      </div>

                      {/* Duration Badge */}
                      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md text-slate-800 rounded-md px-2 py-0.5 text-[11px] font-medium shadow-sm flex items-center gap-1">
                        <Timer className="w-3 h-3 text-slate-500" />
                        <span>{film?.durasi_menit || 120} Min</span>
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1.5">
                        <h3 className="font-serif text-lg font-medium text-slate-900 line-clamp-1 group-hover:text-sky-700 transition-colors">
                          {film?.judul}
                        </h3>
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {film?.deskripsi}
                        </p>
                      </div>

                      {/* Seat Meter */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-slate-500 font-medium">
                            <Users className="w-3.5 h-3.5" />
                            <span>Kapasitas Kursi</span>
                          </span>
                          <span
                            className={`font-semibold ${
                              isFull
                                ? 'text-rose-600'
                                : isAlmostFull
                                ? 'text-amber-600'
                                : 'text-sky-700'
                            }`}
                          >
                            {isFull ? 'Habis' : `Tersisa ${sisaKuota} / ${sess.kuota_total}`}
                          </span>
                        </div>

                        {/* Minimalist Progress Bar */}
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isFull
                                ? 'bg-rose-500'
                                : isAlmostFull
                                ? 'bg-amber-500'
                                : 'bg-sky-500'
                            }`}
                            style={{ width: `${percentFilled}%` }}
                          />
                        </div>
                      </div>

                      {/* Action Button */}
                      {isFull ? (
                        <div className="w-full bg-slate-100 text-slate-400 font-semibold text-xs py-2.5 rounded-xl text-center flex items-center justify-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Kursi Penuh</span>
                        </div>
                      ) : (
                        <Link
                          href={`/booking/${sess.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/booking/${sess.id}`);
                          }}
                          className="relative z-30 w-full flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-sky-900 active:bg-sky-950 text-white font-medium text-xs py-2.5 rounded-xl transition-all duration-150 shadow-sm hover:shadow hover:scale-[1.015] active:scale-[0.98] cursor-pointer"
                        >
                          <span>Pilih Sesi &amp; Pesan</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </Card3D>
              );
            })}
          </motion.div>
        )}
      </section>

      {/* ============================================================== */}
      {/* 5. INFORMASI PENTING / EVENT GUIDELINES (3D Micro-interact)    */}
      {/* ============================================================== */}
      <section className="rounded-2xl border border-sky-100 bg-sky-50/50 p-6 sm:p-8 space-y-5">
        <KineticSectionTitle
          tag="Panduan & Ketentuan"
          title="Ketentuan & Informasi Lapangan"
          subtitle="Informasi penting mengenai pengambilan tiket dan tata tertib festival bioskop."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 [perspective:1000px]">
          {[
            {
              title: 'Pos Kasir Lapangan',
              desc: 'Meja kasir panitia OSIS bertempat di lobi auditorium. Bawa kode booking atau tunjukkan QR di layar ponsel untuk verifikasi pembayaran.',
            },
            {
              title: 'Batas Waktu Pembayaran 24 Jam',
              desc: 'Tiket berstatus PENDING akan otomatis kedaluwarsa setelah 24 jam bila belum dibayarkan. Kuota kursi akan dikembalikan ke sistem.',
            },
            {
              title: 'Gate Masuk Hari-H',
              desc: 'Tiket hanya dapat di-scan masuk di gate teater sesuai dengan tanggal penayangan yang tertera pada e-ticket Anda.',
            },
          ].map((item, idx) => (
            <Card3D key={idx} lift={-5} rotateX={2} rotateY={-1.5} scale={1.02}>
              <div className="space-y-1.5 bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm h-full flex flex-col justify-between">
                <p className="font-semibold text-sm text-slate-800">{item.title}</p>
                <p className="leading-relaxed text-slate-500">{item.desc}</p>
              </div>
            </Card3D>
          ))}
        </div>
      </section>

      {/* ============================================================== */}
      {/* 6. BOTTOM CALL-TO-ACTION (CTA) BANNER WITH 3D INTERACTION      */}
      {/* ============================================================== */}
      <section className="relative rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 text-white p-8 sm:p-12 overflow-hidden shadow-xl [perspective:1000px]">
        {/* Subtle Arctic Glow Background */}
        <div className="pointer-events-none absolute -top-12 -right-12 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

        <div className="relative z-10 max-w-2xl space-y-6">
          <ScrollBlockReveal blockColor="from-cyan-400 to-sky-300">
            <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-widest bg-cyan-950/60 px-3 py-1 rounded-full border border-cyan-800/60">
              Pengalaman Sinematik Dingin SMAN 1 Kendal
            </span>
          </ScrollBlockReveal>

          <ScrollWordReveal
            text="Siap Menikmati Festival"
            highlight="Layar Lebar?"
            className="font-serif text-2xl sm:text-4xl text-white font-normal tracking-tight leading-tight"
          />

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans max-w-lg">
            Amankan kursi Anda sekarang bersama sahabat dan teman sekelas.
            Nikmati film berkualitas dalam suasana auditorium yang sejuk dan mengesankan.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <motion.a
              href="#jadwal"
              whileHover={{ y: -2.5, scale: 1.03, boxShadow: '0 12px 28px -6px rgba(14, 165, 233, 0.4)' }}
              whileTap={{ y: 1, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-semibold text-xs sm:text-sm px-6 py-3 rounded-xl shadow-md cursor-pointer"
            >
              <Ticket className="w-4 h-4" />
              <span>Pesan Tiket Sekarang</span>
            </motion.a>

            <span className="text-xs text-slate-400 flex items-center gap-1.5 px-3 py-2">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span>Auditorium Utama • Kuota Terbatas</span>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
