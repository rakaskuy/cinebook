'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  Ticket,
  Search,
  X,
  Menu,
  ArrowRight,
  Snowflake,
} from 'lucide-react';

export function Navbar() {
  const router = useRouter();
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [inputEmail, setInputEmail] = useState('');

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim() || !inputEmail.trim()) return;
    setShowCheckModal(false);
    setMobileMenuOpen(false);
    router.push(
      `/ticket/${encodeURIComponent(inputCode.trim().toUpperCase())}?email=${encodeURIComponent(
        inputEmail.trim().toLowerCase()
      )}`
    );
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-sky-950/10 px-4 sm:px-6 lg:px-8 py-3 transition-all shadow-[0_2px_12px_rgba(8,47,73,0.04)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Logo with Arctic Glacier Crystal Emblem */}
          <Link href="/" className="group flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shrink-0">
              <img
                src="/logo-cinemanik.png"
                alt="Logo Cinemanik"
                className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(56,189,248,0.4)]"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-xl sm:text-2xl text-slate-900 tracking-tight font-medium">
                  Cine<span className="italic text-sky-600 font-serif">manik</span>
                </span>
                <span className="hidden md:inline-flex items-center gap-1 bg-sky-50 text-sky-800 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-sky-200">
                  <Snowflake className="w-2.5 h-2.5 text-sky-500" />
                  <span>SMAN 1 Kendal</span>
                </span>
              </div>
              <p className="text-[10px] font-medium text-slate-500 tracking-wider hidden sm:block">
                Festival Bioskop Arktik 2026
              </p>
            </div>
          </Link>

          {/* Desktop Nav Actions */}
          <div className="hidden sm:flex items-center gap-2">
            <motion.button
              whileHover={{ y: -1.5, scale: 1.02 }}
              whileTap={{ y: 0.5, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 450, damping: 25 }}
              onClick={() => setShowCheckModal(true)}
              className="flex items-center gap-1.5 text-slate-700 hover:text-sky-700 text-xs font-semibold px-3.5 py-2 rounded-lg border border-slate-200 hover:border-sky-300 bg-white/70 hover:bg-sky-50/50 transition-colors shadow-sm cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <span>Cek E-Ticket</span>
            </motion.button>

            <motion.div
              whileHover={{ y: -1.5, scale: 1.02 }}
              whileTap={{ y: 0.5, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 450, damping: 25 }}
            >
              <Link
                href="/#jadwal"
                className="flex items-center gap-1.5 bg-slate-900 hover:bg-sky-900 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm hover:shadow"
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>Pesan Tiket</span>
              </Link>
            </motion.div>
          </div>

          {/* Mobile Actions: Compact Search + Menu Button */}
          <div className="flex sm:hidden items-center gap-2">
            <button
              onClick={() => setShowCheckModal(true)}
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm"
              aria-label="Cek Tiket"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="sm:hidden overflow-hidden pt-3 pb-1 border-t border-slate-100 mt-2 space-y-2"
            >
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowCheckModal(true);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 text-slate-800 text-xs font-semibold bg-white"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-sky-600" /> Cek E-Ticket Saya
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <Link
                href="/#jadwal"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
              >
                <span className="flex items-center gap-2">
                  <Ticket className="w-4 h-4" /> Pesan Tiket Teater
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Ticket Lookup Modal */}
      <AnimatePresence>
        {showCheckModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCheckModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-md bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xl z-10"
            >
              <button
                onClick={() => setShowCheckModal(false)}
                className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="bg-sky-50 text-sky-800 text-[10px] font-semibold px-2 py-0.5 rounded-md border border-sky-200">
                  Verifikasi E-Ticket
                </span>
              </div>

              <h3 className="font-serif text-xl sm:text-2xl text-slate-900 font-medium mb-1">
                Buka E-Ticket Anda
              </h3>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Masukkan Kode Booking dan Email terdaftar untuk mengakses tiket QR resmi.
              </p>

              <form onSubmit={handleLookup} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kode Booking
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: CIN-20260922-A9F4"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Pemesan
                  </label>
                  <input
                    type="email"
                    placeholder="siswa@sman1kendal.sch.id"
                    value={inputEmail}
                    onChange={(e) => setInputEmail(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-sky-900 text-white font-semibold text-xs py-2.5 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 mt-2"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Buka E-Ticket</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
