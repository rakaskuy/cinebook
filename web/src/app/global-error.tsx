'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-[#F0F7FF] flex items-center justify-center p-4 antialiased font-sans text-slate-900">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 bg-rose-50 border border-rose-200 rounded-2xl mx-auto flex items-center justify-center text-rose-600 font-bold text-xl">
            !
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
              Terjadi Kesalahan Sistem
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Aplikasi mengalami kendala kritis. Silakan muat ulang halaman untuk melanjutkan.
            </p>
          </div>
          <button
            onClick={() => reset()}
            className="w-full bg-slate-900 hover:bg-sky-950 text-white font-semibold text-xs py-3 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            Muat Ulang Halaman
          </button>
        </div>
      </body>
    </html>
  );
}
