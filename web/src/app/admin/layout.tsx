'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminNavbar } from '@/components/AdminNavbar';
import { getStoredAdminSession } from '@/lib/adminAuth';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const session = getStoredAdminSession();
    if (!session) {
      router.replace('/woylahpakcik/login/admin');
    } else {
      setAuthorized(true);
    }
  }, [router]);

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm flex items-center gap-3 text-xs font-semibold text-slate-700">
          <Loader2 className="w-4 h-4 text-sky-600 animate-spin" />
          <span>Memverifikasi Akses Panitia...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AdminNavbar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
