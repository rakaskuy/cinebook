'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet,
  Ticket,
  Clock,
  CheckCircle2,
  DoorOpen,
  XCircle,
  Download,
  Search,
  RefreshCw,
  QrCode,
  Sparkles,
  Film,
  ArrowRight,
  AlertCircle,
  Snowflake,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { fetchAdminDashboardData } from '@/lib/supabase';
import { getStoredAdminSession } from '@/lib/adminAuth';
import { MemphisBadge, MemphisSquiggle } from '@/components/MemphisShapes';

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminDashboardData();
      setData(res);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center font-black text-sm text-glacier-navy animate-pulse flex items-center justify-center gap-2">
        <Clock className="w-5 h-5 animate-spin text-sky-600" />
        <span>Memuat analitik festival Cinemanik...</span>
      </div>
    );
  }

  const bookings = data?.bookings || [];

  const filteredBookings = bookings.filter((b: any) => {
    const matchStatus = filterStatus === 'ALL' || b.status === filterStatus;
    const matchQuery =
      searchKeyword === '' ||
      b.kode_booking?.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      b.nama_lengkap?.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      b.email?.toLowerCase().includes(searchKeyword.toLowerCase());
    return matchStatus && matchQuery;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      {/* Top Welcome & Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-4xl font-black uppercase text-glacier-navy tracking-tight">
              Dashboard Cinemanik
            </h1>
            <MemphisSquiggle className="text-cyan-400 hidden sm:inline-block" />
          </div>
          <p className="text-xs sm:text-sm font-bold text-sky-900/75">
            Pemantauan tiket ekspedisi es, verifikasi kasir, dan kehadiran gate teater arktik secara realtime.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="flex items-center gap-1.5 bg-white/90 hover:bg-sky-50 text-glacier-navy font-black text-xs uppercase px-3 py-2.5 border-2 border-glacier-navy rounded-xl shadow-hard-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <a
            href="/api/export-bookings"
            download
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-400 to-sky-500 hover:from-cyan-300 hover:to-sky-400 text-glacier-navy font-black text-xs uppercase px-4 py-2.5 border-3 border-glacier-navy rounded-xl shadow-hard transition-all"
          >
            <Download className="w-4 h-4 stroke-[3]" />
            <span>Ekspor Laporan CSV</span>
          </a>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Revenue Card */}
        <div className="bg-gradient-to-br from-cyan-200 to-sky-300 border-4 border-glacier-navy rounded-2xl p-5 shadow-hard space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-glacier-navy">
              Total Revenue Offline
            </span>
            <div className="w-8 h-8 bg-white border-2 border-glacier-navy rounded-lg flex items-center justify-center shadow-sm">
              <Wallet className="w-4 h-4 text-glacier-navy" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-glacier-navy font-mono">
            Rp {(data?.totalRevenue || 0).toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] font-bold text-sky-950">
            Uang tunai terkonfirmasi kasir &amp; gate
          </p>
        </div>

        {/* Total Bookings Card */}
        <div className="bg-white/95 border-4 border-glacier-navy rounded-2xl p-5 shadow-hard space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-glacier-navy">
              Total Pemesanan
            </span>
            <div className="w-8 h-8 bg-sky-100 border-2 border-glacier-navy rounded-lg flex items-center justify-center">
              <Ticket className="w-4 h-4 text-sky-700" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-glacier-navy font-mono">
            {data?.totalBookings || 0} Tiket
          </div>
          <p className="text-[11px] font-bold text-sky-900/70">
            Semua tiket terbit di sistem
          </p>
        </div>

        {/* ACC Verified Card */}
        <div className="bg-emerald-100 border-4 border-glacier-navy rounded-2xl p-5 shadow-hard space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-emerald-950">
              Lunas / ACC Kasir
            </span>
            <div className="w-8 h-8 bg-white border-2 border-glacier-navy rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-950 font-mono">
            {data?.counts?.ACC || 0} Tiket
          </div>
          <p className="text-[11px] font-bold text-emerald-800">
            Memiliki QR Gate Pass siap masuk
          </p>
        </div>

        {/* Gate Used Card */}
        <div className="bg-sky-200 border-4 border-glacier-navy rounded-2xl p-5 shadow-hard space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-glacier-navy">
              Sudah Masuk Gate
            </span>
            <div className="w-8 h-8 bg-white border-2 border-glacier-navy rounded-lg flex items-center justify-center">
              <DoorOpen className="w-4 h-4 text-glacier-navy" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-glacier-navy font-mono">
            {data?.counts?.USED || 0} Pengunjung
          </div>
          <p className="text-[11px] font-bold text-sky-900/70">
            Telah berada di dalam ruang teater
          </p>
        </div>
      </div>

      {/* Quick Launchpad to Scanner Tools */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/verify"
          className="group bg-white/95 hover:bg-sky-50 border-4 border-glacier-navy rounded-2xl p-5 shadow-hard hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard-lg transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-cyan-200 border-3 border-glacier-navy rounded-xl flex items-center justify-center shadow-hard-sm group-hover:rotate-6 transition-transform">
              <QrCode className="w-6 h-6 text-glacier-navy" />
            </div>
            <div>
              <h3 className="font-black text-base uppercase text-glacier-navy">
                Pos Kasir (Scanner Laptop &amp; HP ACC)
              </h3>
              <p className="text-xs font-bold text-sky-900/70">
                Pindai QR pemesanan otomatis di laptop dan konfirmasi uang tunai di HP
              </p>
            </div>
          </div>
          <span className="font-black text-xs uppercase bg-cyan-300 text-glacier-navy px-3 py-1 border-2 border-glacier-navy rounded-lg flex items-center gap-1 shadow-sm">
            <span>Buka</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>

        <Link
          href="/admin/gate"
          className="group bg-white/95 hover:bg-sky-50 border-4 border-glacier-navy rounded-2xl p-5 shadow-hard hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard-lg transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-sky-300 border-3 border-glacier-navy rounded-xl flex items-center justify-center shadow-hard-sm group-hover:rotate-6 transition-transform">
              <DoorOpen className="w-6 h-6 text-glacier-navy" />
            </div>
            <div>
              <h3 className="font-black text-base uppercase text-glacier-navy">
                Kamera Gate (Pintu Masuk Teater)
              </h3>
              <p className="text-xs font-bold text-sky-900/70">
                Pindai QR Gate Pass penonton dan validasi akses masuk hari H
              </p>
            </div>
          </div>
          <span className="font-black text-xs uppercase bg-sky-200 text-glacier-navy px-3 py-1 border-2 border-glacier-navy rounded-lg flex items-center gap-1 shadow-sm">
            <span>Buka</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>
      </div>

      {/* Bookings Feed & Filter Table */}
      <div className="bg-white/95 backdrop-blur-xl border-4 border-glacier-navy rounded-3xl p-6 shadow-hard-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black uppercase text-glacier-navy tracking-tight">
              Daftar Transaksi Tiket Cinemanik
            </h2>
            <p className="text-xs font-bold text-sky-900/70">
              Total {filteredBookings.length} tiket tersimpan di database Supabase
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-sky-500" />
              <input
                type="text"
                placeholder="Cari kode / nama / email..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="bg-sky-50/70 border-2 border-glacier-navy rounded-xl pl-9 pr-3 py-1.5 text-xs font-bold text-glacier-navy placeholder:text-sky-400 focus:bg-white focus:outline-none"
              />
            </div>

            {/* Filter Status Pills */}
            <div className="flex items-center gap-1 bg-sky-100 border-2 border-glacier-navy p-1 rounded-xl">
              {['ALL', 'PENDING', 'ACC', 'USED', 'EXPIRED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-black uppercase transition-all ${
                    filterStatus === st
                      ? 'bg-glacier-navy text-cyan-200 shadow-sm'
                      : 'text-sky-900/70 hover:text-glacier-navy'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-3 border-glacier-navy text-[11px] font-black uppercase text-sky-900/70">
                <th className="py-3 px-2">Kode Booking</th>
                <th className="py-3 px-2">Pemesan &amp; Kelas</th>
                <th className="py-3 px-2">Film &amp; Sesi</th>
                <th className="py-3 px-2">Paket</th>
                <th className="py-3 px-2">Total Harga</th>
                <th className="py-3 px-2">Status</th>
                <th className="py-3 px-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-sky-100 text-xs font-bold text-glacier-navy">
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sky-900/60">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-6 h-6 text-sky-400" />
                      <span>Belum ada transaksi tiket yang sesuai dengan filter.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((b: any) => {
                  const statusBadgeClass =
                    b.status === 'ACC'
                      ? 'bg-emerald-300 text-glacier-navy'
                      : b.status === 'USED'
                      ? 'bg-sky-200 text-glacier-navy'
                      : b.status === 'PENDING'
                      ? 'bg-cyan-200 text-glacier-navy'
                      : 'bg-slate-200 text-slate-700';

                  return (
                    <tr key={b.kode_booking} className="hover:bg-sky-50/70 transition-colors">
                      <td className="py-3.5 px-2 font-mono font-black text-sm">
                        {b.kode_booking}
                      </td>
                      <td className="py-3.5 px-2">
                        <div className="font-black">{b.nama_lengkap}</div>
                        <div className="text-[10px] text-sky-800/70">{b.kelas} • {b.email}</div>
                      </td>
                      <td className="py-3.5 px-2">
                        <div className="flex items-center gap-1">
                          <Film className="w-3.5 h-3.5 text-sky-600" />
                          <span>{b.film_judul}</span>
                        </div>
                        <div className="text-[10px] text-sky-800/70">
                          {b.tanggal} • {b.jam_mulai?.substring(0, 5)} WIB
                        </div>
                      </td>
                      <td className="py-3.5 px-2">
                        {b.nama_paket}
                      </td>
                      <td className="py-3.5 px-2 text-sky-700 font-black">
                        Rp {Number(b.total_harga || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-2">
                        <span
                          className={`inline-block px-2.5 py-0.5 border-2 border-glacier-navy rounded-md text-[10px] font-black uppercase shadow-sm ${statusBadgeClass}`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-2 text-right">
                        <Link
                          href={`/ticket/${b.kode_booking}?email=${encodeURIComponent(b.email)}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 bg-white hover:bg-sky-100 border-2 border-glacier-navy px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shadow-hard-sm transition-all"
                        >
                          <span>Buka Tiket</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
