'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Film,
  LogOut,
  LayoutDashboard,
  QrCode,
  DoorOpen,
  CalendarDays,
  Snowflake,
  Tag,
} from 'lucide-react';
import {
  AdminSession,
  getStoredAdminSession,
  clearAdminSession,
} from '@/lib/adminAuth';
import { supabase } from '@/lib/supabase';

export function AdminNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminSession | null>(null);

  useEffect(() => {
    setAdmin(getStoredAdminSession());
  }, [pathname]);

  const handleLogout = async () => {
    clearAdminSession();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }
    router.push('/woylahpakcik/login/admin');
  };

  if (!admin && pathname === '/woylahpakcik/login/admin') {
    return null;
  }

  const role = admin?.role || 'kasir';

  const roleBadge = {
    kasir: { label: 'Kasir Meja', bg: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
    gate: { label: 'Petugas Gate', bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    super_admin: { label: 'Super Admin', bg: 'bg-sky-50 text-sky-800 border-sky-200' },
  }[role];

  return (
    <nav className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-2.5 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Brand & Active Admin Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shrink-0">
                <img
                  src="/logo-cinemanik.png"
                  alt="Logo Cinemanik"
                  className="w-full h-full object-contain filter drop-shadow-[0_2px_6px_rgba(56,189,248,0.4)]"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-serif text-lg sm:text-xl text-slate-900 tracking-tight font-medium">
                    Cine<span className="italic text-sky-600 font-serif">manik</span>
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md">
                    Admin
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium hidden sm:block">
                  Pos Operasional Panitia SMAN 1 Kendal
                </p>
              </div>
            </Link>

            {admin && (
              <span
                className={`text-[10px] sm:text-xs font-semibold px-2.5 py-0.5 border rounded-full ${roleBadge.bg}`}
              >
                {roleBadge.label}
              </span>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="md:hidden text-slate-500 hover:text-rose-600 p-1.5 transition-colors"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {role === 'super_admin' && (
            <>
              <Link
                href="/admin/dashboard"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  pathname === '/admin/dashboard'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </Link>

              <Link
                href="/admin/sessions"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  pathname === '/admin/sessions'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Kelola Sesi</span>
              </Link>

              <Link
                href="/admin/packages"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  pathname === '/admin/packages'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Kelola Paket</span>
              </Link>
            </>
          )}

          <Link
            href="/admin/verify"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              pathname === '/admin/verify'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Kasir</span>
          </Link>

          <Link
            href="/admin/gate"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              pathname === '/admin/gate'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <DoorOpen className="w-3.5 h-3.5" />
            <span>Gate Masuk</span>
          </Link>

          <button
            onClick={handleLogout}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-2"
            title="Keluar dari akun admin"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
