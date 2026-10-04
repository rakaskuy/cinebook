'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  Shield,
  AlertCircle,
  Info,
  Loader2,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { saveAdminSession, clearAdminSession } from '@/lib/adminAuth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function SecretAdminLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Verifikasi status user Google yang baru login
  const verifyUserAccess = async (user: any) => {
    if (!user || !user.email) return;

    setLoading(true);
    setErrorMsg(null);

    const userEmail = user.email.trim().toLowerCase();
    const userName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email.split('@')[0];

    try {
      // 1. Verifikasi melalui RPC admin_verify_google_user di Supabase PostgreSQL
      if (isSupabaseConfigured && supabase) {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc(
          'admin_verify_google_user',
          {
            p_email: userEmail,
            p_nama: userName,
          }
        );

        if (!rpcErr && rpcRes) {
          if (rpcRes.success && rpcRes.user) {
            setSuccessMsg(`Selamat datang, ${rpcRes.user.nama}! Mengalihkan ke dashboard...`);
            saveAdminSession({
              id: rpcRes.user.id || user.id,
              nama: rpcRes.user.nama || userName,
              role: (rpcRes.user.role as any) || 'super_admin',
              email: userEmail,
              loginAt: new Date().toISOString(),
            });

            setTimeout(() => {
              router.replace('/admin/dashboard');
            }, 800);
            return;
          } else {
            // Email tidak berhak akses admin
            await supabase.auth.signOut();
            clearAdminSession();
            setErrorMsg(
              rpcRes.message ||
                `Akses Ditolak: Akun Google (${userEmail}) tidak terdaftar sebagai administrator festival.`
            );
            setLoading(false);
            return;
          }
        }
      }

      // 2. Fallback verifikasi via environment variable (jika ada NEXT_PUBLIC_ADMIN_EMAIL)
      const allowedEnvEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase();
      if (allowedEnvEmail && userEmail === allowedEnvEmail) {
        setSuccessMsg(`Autentikasi terverifikasi. Mengalihkan ke dashboard...`);
        saveAdminSession({
          id: user.id,
          nama: userName,
          role: 'super_admin',
          email: userEmail,
          loginAt: new Date().toISOString(),
        });
        setTimeout(() => {
          router.replace('/admin/dashboard');
        }, 800);
        return;
      }

      // Jika tidak memenuhi kriteria di atas:
      if (supabase) {
        await supabase.auth.signOut();
      }
      clearAdminSession();
      setErrorMsg(
        `Akses Ditolak: Akun Google (${userEmail}) tidak memiliki hak akses administrator festival.`
      );
    } catch (err: any) {
      console.error('Error saat verifikasi akun:', err);
      setErrorMsg(err.message || 'Terjadi kesalahan saat memverifikasi hak akses admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setCheckingAuth(false);
      return;
    }

    // Periksa sesi aktif dari Supabase
    supabase.auth.getSession().then((res: any) => {
      const session = res?.data?.session;
      if (session?.user) {
        verifyUserAccess(session.user).finally(() => {
          setCheckingAuth(false);
        });
      } else {
        setCheckingAuth(false);
      }
    });

    // Pasang listener auth state change
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await verifyUserAccess(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);

    if (!isSupabaseConfigured || !supabase) {
      setErrorMsg('Koneksi Supabase belum terkonfigurasi pada file environment.');
      setLoading(false);
      return;
    }

    try {
      const redirectUrl = `${window.location.origin}/woylahpakcik/login/admin`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        throw error;
      }
      // Browser akan dialihkan ke halaman persetujuan Google OAuth
    } catch (err: any) {
      console.error('Google OAuth Error:', err);
      setErrorMsg(err.message || 'Gagal memulai login dengan akun Google.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-800 text-[11px] font-semibold px-3 py-1 rounded-full border border-sky-200">
            <Shield className="w-3.5 h-3.5 text-sky-600" />
            <span>Portal Operasional Panitia Festival</span>
          </div>

          <div className="flex items-center justify-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-600 flex items-center justify-center text-white shadow-sm">
              <Film className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl text-slate-900 font-medium tracking-tight">
              Cine<span className="italic text-sky-600 font-serif">manik</span> Admin
            </h1>
          </div>

          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Sistem autentikasi terenkripsi administrator festival. Akses langsung terintegrasi dengan Google Single Sign-On (SSO).
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1.5 text-center">
            <h2 className="text-sm font-semibold text-slate-900">
              Masuk dengan Akun Google
            </h2>
            <p className="text-xs text-slate-500">
              Gunakan akun Google yang berhak akses operasional festival.
            </p>
          </div>

          {/* Feedback messages */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3.5 text-xs flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </motion.div>
            )}

            {successMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3.5 text-xs flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                <span className="leading-relaxed">{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Google Sign In Action */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || checkingAuth}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs py-3 px-4 rounded-xl border border-slate-300 shadow-sm transition-all hover:shadow hover:border-slate-400 disabled:opacity-50 flex items-center justify-center gap-3 group active:scale-[0.99]"
            >
              {loading || checkingAuth ? (
                <>
                  <Loader2 className="w-4 h-4 text-sky-600 animate-spin" />
                  <span>
                    {checkingAuth ? 'Memeriksa sesi login...' : 'Menghubungkan ke Google...'}
                  </span>
                </>
              ) : (
                <>
                  {/* Official Google 'G' Logo SVG */}
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.27 21.39 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.57H1.26C.46 8.17 0 9.98 0 12s.46 3.83 1.26 5.43l4.02-3.14z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.61 1.26 6.57l4.02 3.14c.95-2.83 3.6-4.96 6.72-4.96z"
                    />
                  </svg>
                  <span className="text-slate-800 group-hover:text-slate-900">
                    Masuk dengan Akun Google
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Security & Access Info */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-[11px] text-slate-500 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Lock className="w-3.5 h-3.5 text-sky-600" />
              <span>Proteksi Akses Administrator</span>
            </div>
            <p className="leading-relaxed">
              Login form manual telah dinonaktifkan demi standar keamanan. Hanya akun Google yang terdaftar sebagai administrator di Supabase yang diberikan izin akses ke sistem festival.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
