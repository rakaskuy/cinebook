'use client';

import React from 'react';
import { Film, Snowflake, ShieldCheck, QrCode } from 'lucide-react';

export function Footer() {
  return (
    <footer className="relative bg-white/70 backdrop-blur-md border-t border-sky-950/10 px-4 py-10 mt-20">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-sky-600 flex items-center justify-center text-white shadow-sm">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-serif text-lg text-slate-900 tracking-tight flex items-center gap-2">
              <span>Cinemanik 2026</span>
              <span className="text-[10px] font-sans font-medium text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                SMAN 1 Kendal
              </span>
            </h4>
            <p className="text-xs text-slate-500">
              Festival Bioskop Bertema Es &amp; Gletser OSIS SMA Negeri 1 Kendal
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
            <span className="font-medium">HMAC-SHA256 Token</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-lg">
            <QrCode className="w-3.5 h-3.5 text-sky-600" />
            <span className="font-medium">Pos Kasir &amp; Gate Masuk</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center md:text-right font-medium">
          © 2026 Cinemanik SMAN 1 Kendal • Seluruh hak cipta dilindungi.
        </p>
      </div>
    </footer>
  );
}
