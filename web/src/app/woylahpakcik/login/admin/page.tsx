'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  Shield,
  ArrowRight,
  Lock,
  Mail,
  AlertCircle,
  Info,
  Loader2,
} from 'lucide-react';
import { saveAdminSession } from '@/lib/adminAuth';
import { AdminRole } from '@/lib/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function SecretAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Masukkan email dan password akun panitia.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    // 1. Dukungan kredensial resmi panitia festival (kasir, gate, super admin)
    const isKasirLogin =
      cleanEmail.includes('kasir') &&
      (cleanPass === 'kasir123' || cleanPass === 'cinemanik2026' || cleanPass === 'password123');

    const isGateLogin =
      cleanEmail.includes('gate') &&
      (cleanPass === 'gate123' || cleanPass === 'cinemanik2026' || cleanPass === 'password123');

    const isAdminLogin =
      cleanEmail.includes('admin') &&
      (cleanPass === 'admin123' || cleanPass === 'cinemanik2026' || cleanPass === 'password123');

    if (isKasirLogin || isGateLogin || isAdminLogin) {
      let role: AdminRole = 'super_admin';
      let nama = 'Super Admin Festival';

      if (isKasirLogin) {
        role = 'kasir';
        nama = 'Petugas Kasir OSIS';
      } else if (isGateLogin) {
        role = 'gate';
        nama = 'Petugas Pintu Gate';
      }

      saveAdminSession({
        id: `staff-${role}-${Date.now()}`,
        nama,
        role,
        email: email.trim(),
        loginAt: new Date().toISOString(),
      });

      if (role === 'kasir') router.push('/admin/verify');
      else if (role === 'gate') router.push('/admin/gate');
      else router.push('/admin/dashboard');
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setErrorMsg('Koneksi Supabase belum terkonfigurasi dan kredensial tidak cocok.');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) throw error;
      if (!data.user) throw new Error('Pengguna tidak ditemukan.');

      // Fetch admin role profile from admins table
      const { data: adminProfile, error: profileErr } = await supabase
        .from('admins')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileErr || !adminProfile) {
        throw new Error(
          'Akun terdaftar tetapi belum memiliki hak akses operasional panitia di database.'
        );
      }

      if (!adminProfile.is_active) {
        throw new Error('Akun panitia Anda sedang dinonaktifkan oleh administrator.');
      }

      const role = adminProfile.role as AdminRole;

      saveAdminSession({
        id: data.user.id,
        nama: adminProfile.nama || 'Panitia Cinemanik',
        role: role,
        email: data.user.email || email,
        loginAt: new Date().toISOString(),
      });

      if (role === 'kasir') router.push('/admin/verify');
      else if (role === 'gate') router.push('/admin/gate');
      else router.push('/admin/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Email atau password tidak sesuai.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16 space-y-6">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-sky-200">
          <Shield className="w-3 h-3 text-sky-600" />
          <span>Portal Akses Panitia OSIS</span>
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl text-slate-900 font-medium tracking-tight">
          Masuk Operasional Admin
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
          Autentikasi staf panitia untuk memverifikasi pembayaran kasir, gate ingress, dan manajemen festival.
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
        <form onSubmit={handleStandardLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Panitia
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                placeholder="panitia@sman1kendal.sch.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3 text-xs flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{errorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-sky-900 text-white font-semibold text-xs py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <>
                <span>Masuk Sistem</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-[11px] text-slate-500 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700">
            <Info className="w-3.5 h-3.5 text-sky-600" />
            <span>Kredensial Resmi Panitia</span>
          </div>
          <p className="leading-relaxed">
            Halaman ini khusus panitia yang memiliki hak akses operasional resmi dari administrator sekolah.
          </p>
        </div>
      </div>
    </div>
  );
}
