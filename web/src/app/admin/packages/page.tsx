'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tag,
  Plus,
  Edit2,
  Trash2,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  DollarSign,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  adminFetchAllPackages,
  adminSavePackage,
  adminDeletePackage,
} from '@/lib/supabase';
import { Package } from '@/lib/types';

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal form states
  const [showModal, setShowModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [formNama, setFormNama] = useState('');
  const [formJumlahOrang, setFormJumlahOrang] = useState(1);
  const [formHarga, setFormHarga] = useState(25000);
  const [formIsActive, setFormIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadPackages = async () => {
    try {
      setLoading(true);
      const data = await adminFetchAllPackages();
      setPackages(data);
    } catch (err: any) {
      console.error('Failed to load packages:', err);
      setNotification({ type: 'error', text: err.message || 'Gagal memuat data paket.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  const handleOpenAdd = () => {
    setEditingPackage(null);
    setFormNama('');
    setFormJumlahOrang(1);
    setFormHarga(25000);
    setFormIsActive(true);
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (pkg: Package) => {
    setEditingPackage(pkg);
    setFormNama(pkg.nama_paket);
    setFormJumlahOrang(pkg.jumlah_orang);
    setFormHarga(pkg.harga);
    setFormIsActive(pkg.is_active);
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNama.trim()) {
      setFormError('Nama paket wajib diisi.');
      return;
    }
    if (formJumlahOrang < 1) {
      setFormError('Jumlah orang minimal 1.');
      return;
    }
    if (formHarga < 0) {
      setFormError('Harga paket tidak boleh negatif.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      const res = await adminSavePackage({
        id: editingPackage?.id,
        nama_paket: formNama.trim(),
        jumlah_orang: formJumlahOrang,
        harga: formHarga,
        is_active: formIsActive,
      });

      setNotification({
        type: 'success',
        text: res.message || 'Paket tiket berhasil disimpan!',
      });
      setShowModal(false);
      loadPackages();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan paket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (pkg: Package) => {
    try {
      await adminSavePackage({
        id: pkg.id,
        nama_paket: pkg.nama_paket,
        jumlah_orang: pkg.jumlah_orang,
        harga: pkg.harga,
        is_active: !pkg.is_active,
      });
      setNotification({
        type: 'success',
        text: `Paket ${pkg.nama_paket} berhasil di${pkg.is_active ? 'nonaktifkan' : 'aktifkan'}!`,
      });
      loadPackages();
    } catch (err: any) {
      setNotification({ type: 'error', text: err.message || 'Gagal mengubah status paket.' });
    }
  };

  const handleDelete = async (pkg: Package) => {
    if (!confirm(`Yakin ingin menghapus atau menonaktifkan paket "${pkg.nama_paket}"?`)) {
      return;
    }

    try {
      const res = await adminDeletePackage(pkg.id);
      setNotification({
        type: 'success',
        text: res.message || 'Paket berhasil dihapus/dinonaktifkan.',
      });
      loadPackages();
    } catch (err: any) {
      setNotification({ type: 'error', text: err.message || 'Gagal menghapus paket.' });
    }
  };

  const hargaPerOrang = formJumlahOrang > 0 ? Math.round(formHarga / formJumlahOrang) : formHarga;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-sky-50 text-sky-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-sky-200 flex items-center gap-1.5">
              <Tag className="w-3 h-3 text-sky-600" />
              <span>Katalog &amp; Bundle Tiket</span>
            </span>
            <span className="text-[11px] text-slate-500 font-medium">SMAN 1 Kendal</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl text-slate-900 font-medium tracking-tight">
            Kelola Paket &amp; Harga Tiket
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl leading-relaxed">
            Atur harga per orang, paket bundle (solo, couple, squad), dan kuota kursi tanpa hardcode.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 bg-slate-900 hover:bg-sky-900 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Paket Baru</span>
        </button>
      </div>

      {/* Action Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{notification.text}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-500 hover:text-slate-900 text-[11px] underline"
            >
              Tutup
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Package List Grid */}
      {loading ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-16 text-center text-xs text-slate-500 flex items-center justify-center gap-2 shadow-sm">
          <Clock className="w-4 h-4 animate-spin text-sky-600" />
          <span>Memuat konfigurasi paket tiket...</span>
        </div>
      ) : packages.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <Tag className="w-8 h-8 mx-auto text-slate-400" />
          <h3 className="font-serif text-base font-medium text-slate-900">Belum Ada Paket Tiket</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Klik tombol Tambah Paket Baru di atas untuk membuat paket tiket solo atau bundle.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {packages.map((pkg) => {
            const perPerson = pkg.jumlah_orang > 0 ? Math.round(pkg.harga / pkg.jumlah_orang) : pkg.harga;
            return (
              <motion.div
                key={pkg.id}
                layout
                className={`bg-white rounded-2xl border p-5 shadow-sm transition-all flex flex-col justify-between ${
                  pkg.is_active ? 'border-slate-200/90' : 'border-slate-200/60 opacity-60 bg-slate-50/50'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Header & Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h2 className="font-serif text-base font-semibold text-slate-900 leading-snug">
                        {pkg.nama_paket}
                      </h2>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Users className="w-3.5 h-3.5 text-sky-600" />
                        <span>Kapasitas {pkg.jumlah_orang} Orang</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(pkg)}
                      title={pkg.is_active ? 'Nonaktifkan paket' : 'Aktifkan paket'}
                      className="cursor-pointer shrink-0"
                    >
                      {pkg.is_active ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Aktif</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3 text-slate-400" />
                          <span>Nonaktif</span>
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Pricing Box */}
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                      Total Biaya Paket
                    </div>
                    <div className="text-2xl font-serif font-bold text-slate-900 font-mono tracking-tight">
                      Rp {Number(pkg.harga).toLocaleString('id-ID')}
                    </div>
                    <div className="text-[11px] font-medium text-sky-700 pt-0.5">
                      Rata-rata Rp {Number(perPerson).toLocaleString('id-ID')} per orang
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenEdit(pkg)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Ubah Harga / Nama</span>
                  </button>

                  <button
                    onClick={() => handleDelete(pkg)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Hapus paket"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal Add / Edit Package */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-2xl p-6 sm:p-7 shadow-xl max-w-md w-full space-y-5 z-10 border border-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-5 h-5 text-sky-600" />
                  <h3 className="font-serif text-lg font-semibold text-slate-900">
                    {editingPackage ? 'Ubah Paket Tiket' : 'Tambah Paket Baru'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  &times;
                </button>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Paket / Bundle
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Frost Solo Pass / Paket Couple"
                    value={formNama}
                    onChange={(e) => setFormNama(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kapasitas Orang
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      required
                      value={formJumlahOrang}
                      onChange={(e) => setFormJumlahOrang(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Mengurangi kuota kursi</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Total Harga (IDR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      required
                      value={formHarga}
                      onChange={(e) => setFormHarga(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Biaya per paket</p>
                  </div>
                </div>

                {/* Live Calculation Preview */}
                <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3 text-xs space-y-1 text-slate-700">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-500">Perkiraan harga per orang:</span>
                    <span className="font-bold text-sky-800 font-mono">
                      Rp {Number(hargaPerOrang).toLocaleString('id-ID')} / orang
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Siswa memesan paket ini akan membayar total Rp {Number(formHarga).toLocaleString('id-ID')} untuk {formJumlahOrang} orang.
                  </p>
                </div>

                {/* Status Toggle */}
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Paket Aktif (Tampil di form pemesanan siswa)
                  </span>
                </label>

                <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-slate-900 hover:bg-sky-900 disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan Paket'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
