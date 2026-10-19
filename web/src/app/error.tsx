'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 bg-rose-50 border border-rose-200 rounded-2xl mx-auto flex items-center justify-center text-rose-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            Terjadi Kendala Teknis
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Halaman sedang mengalami gangguan sementara. Silakan coba muat ulang atau kembali ke halaman utama.
          </p>
        </div>
        <div className="flex gap-2.5 pt-2">
          <button
            onClick={() => reset()}
            className="flex-1 bg-slate-900 hover:bg-sky-950 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
          <Link
            href="/"
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Beranda</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
