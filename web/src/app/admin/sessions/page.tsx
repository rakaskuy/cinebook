'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  Calendar,
  Clock,
  Users,
  Edit3,
  AlertTriangle,
  RefreshCw,
  Plus,
  Shield,
  Timer,
  Check,
  X,
  Loader2,
  Upload,
  Image as ImageIcon,
  FileText,
  Sparkles,
  Trash2,
  Library,
  BookOpen,
} from 'lucide-react';
import {
  adminFetchAllSessions,
  adminFetchFilms,
  adminCreateSession,
  adminUpdateSession,
  executeAdminCancelSession,
} from '@/lib/supabase';

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [films, setFilms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal: Tambah Sesi Baru
  const [showAddModal, setShowAddModal] = useState(false);
  const [creationMode, setCreationMode] = useState<'custom' | 'catalog'>('custom');

  // Custom film fields
  const [customJudul, setCustomJudul] = useState('');
  const [customDeskripsi, setCustomDeskripsi] = useState('');
  const [customDurasi, setCustomDurasi] = useState<number>(120);
  const [customThumbnail, setCustomThumbnail] = useState<string>('');
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Catalog selection fields
  const [newFilmId, setNewFilmId] = useState('');

  // Session common schedule fields
  const [newTanggal, setNewTanggal] = useState('');
  const [newJamMulai, setNewJamMulai] = useState('13:30');
  const [newKuota, setNewKuota] = useState(60);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Modal: Edit Sesi
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [editKuota, setEditKuota] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<'AKTIF' | 'DITUTUP'>('AKTIF');
  const [editTanggal, setEditTanggal] = useState('');
  const [editJamMulai, setEditJamMulai] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal: Batal Darurat Sesi
  const [cancelingSession, setCancelingSession] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  // Feedback Notification
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sessData, filmsData] = await Promise.all([
        adminFetchAllSessions(),
        adminFetchFilms(),
      ]);
      setSessions(sessData || []);
      setFilms(filmsData || []);
      if (filmsData && filmsData.length > 0 && !newFilmId) {
        setNewFilmId(filmsData[0].id);
      }
    } catch (err) {
      console.error('Failed to load session management data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const today = new Date().toISOString().split('T')[0];
    setNewTanggal(today);
  }, []);

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError(null);
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('File harus berupa gambar (JPG, PNG, WebP, GIF).');
      return;
    }

    // 5MB max
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Ukuran gambar maksimal 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setThumbnailPreview(dataUrl);
      setCustomThumbnail(dataUrl);
    };
    reader.onerror = () => {
      setUploadError('Gagal memproses file gambar. Silakan coba lagi.');
    };
    reader.readAsDataURL(file);
  };

  const handleClearThumbnail = () => {
    setThumbnailPreview(null);
    setCustomThumbnail('');
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!newTanggal || !newJamMulai || newKuota <= 0) {
      setAddError('Harap lengkapi tanggal penayangan, jam mulai, dan kuota kursi teater.');
      return;
    }

    if (creationMode === 'custom') {
      if (!customJudul.trim()) {
        setAddError('Nama/judul film kustom wajib diisi.');
        return;
      }
      if (!customDeskripsi.trim()) {
        setAddError('Ringkasan cerita / sinopsis film wajib diisi.');
        return;
      }
    } else {
      if (!newFilmId) {
        setAddError('Pilih film dari katalog bioskop.');
        return;
      }
    }

    setSubmittingAdd(true);
    try {
      const formattedJam = newJamMulai.length === 5 ? `${newJamMulai}:00` : newJamMulai;
      const res = await adminCreateSession({
        filmId: creationMode === 'catalog' ? newFilmId : undefined,
        tanggal: newTanggal,
        jamMulai: formattedJam,
        kuotaTotal: Number(newKuota),
        isCustomFilm: creationMode === 'custom',
        customJudul: customJudul.trim(),
        customDeskripsi: customDeskripsi.trim(),
        customDurasiMenit: Number(customDurasi) || 120,
        customPosterPath: customThumbnail.trim() || undefined,
      });

      setNotification({
        type: 'success',
        text: res.message || 'Sesi teater dan film baru berhasil ditambahkan!',
      });
      setShowAddModal(false);

      // Reset custom form
      setCustomJudul('');
      setCustomDeskripsi('');
      setCustomDurasi(120);
      handleClearThumbnail();

      loadData();
    } catch (err: any) {
      setAddError(err.message || 'Gagal menambahkan sesi.');
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleOpenEdit = (sess: any) => {
    setEditingSession(sess);
    setEditKuota(sess.kuota_total);
    setEditStatus(sess.status_sesi);
    setEditTanggal(sess.tanggal);
    setEditJamMulai(sess.jam_mulai.substring(0, 5));
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    setEditError(null);

    if (editKuota < editingSession.kuota_terisi) {
      setEditError(
        `Kuota total baru (${editKuota}) tidak boleh lebih kecil dari kursi yang sudah dipesan (${editingSession.kuota_terisi})!`
      );
      return;
    }

    setSubmittingEdit(true);
    try {
      const formattedJam = editJamMulai.length === 5 ? `${editJamMulai}:00` : editJamMulai;
      const res = await adminUpdateSession({
        sessionId: editingSession.id,
        kuotaTotal: Number(editKuota),
        status: editStatus,
        tanggal: editTanggal,
        jamMulai: formattedJam,
      });

      setNotification({
        type: 'success',
        text: res.message || 'Perubahan sesi berhasil disimpan!',
      });
      setEditingSession(null);
      loadData();
    } catch (err: any) {
      setEditError(err.message || 'Gagal memperbarui sesi.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleCancelSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelingSession) return;

    if (!cancelReason.trim()) {
      alert('Alasan pembatalan sesi wajib diisi.');
      return;
    }

    setSubmittingCancel(true);
    try {
      await executeAdminCancelSession(cancelingSession.id, cancelReason.trim());
      setNotification({
        type: 'success',
        text: `Sesi teater telah ditutup darurat dan seluruh tiket terkait dibatalkan.`,
      });
      setCancelingSession(null);
      setCancelReason('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Gagal membatalkan sesi.');
    } finally {
      setSubmittingCancel(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-cyan-200 text-glacier-navy text-xs font-black uppercase px-3 py-1 border-2 border-glacier-navy rounded-lg shadow-hard-sm flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>SUPER ADMIN CINEMANIK</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black uppercase text-glacier-navy tracking-tight mt-1">
            Kelola Sesi &amp; Kuota Teater
          </h1>
          <p className="text-xs sm:text-sm font-bold text-sky-900/75">
            Atur jadwal tayang, tambah film kustom beserta poster dan sinopsis, sesuaikan kuota kursi, atau lakukan penutupan darurat.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="flex items-center gap-2 bg-white/90 hover:bg-sky-50 text-glacier-navy font-black text-xs uppercase px-4 py-2.5 border-3 border-glacier-navy rounded-xl shadow-hard transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-400 to-sky-500 hover:from-cyan-300 hover:to-sky-400 text-glacier-navy font-black text-xs uppercase px-4 py-2.5 border-3 border-glacier-navy rounded-xl shadow-hard transition-all"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Tambah Sesi Baru</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-xl border-3 border-glacier-navy shadow-hard font-black text-xs flex items-center justify-between gap-2 ${
              notification.type === 'success'
                ? 'bg-emerald-300 text-glacier-navy'
                : 'bg-rose-100 text-rose-900'
            }`}
          >
            <span>{notification.text}</span>
            <button onClick={() => setNotification(null)} className="underline text-[11px]">
              Tutup
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sessions Grid */}
      {loading ? (
        <div className="bg-white/90 border-4 border-glacier-navy rounded-2xl p-16 text-center font-black text-sm text-glacier-navy shadow-hard animate-pulse flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-sky-600" />
          <span>Memuat data sesi teater dari Supabase...</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white border-4 border-dashed border-sky-300 rounded-3xl p-12 text-center space-y-3">
          <Film className="w-12 h-12 mx-auto text-sky-400" />
          <h3 className="font-black text-lg uppercase text-glacier-navy">Belum Ada Sesi Terdaftar</h3>
          <p className="text-xs font-bold text-sky-900/60">
            Klik tombol "Tambah Sesi Baru" di atas untuk menambahkan jadwal penayangan film baru.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map((sess) => {
            const isClosed = sess.status_sesi === 'DITUTUP';
            const sisa = sess.kuota_total - sess.kuota_terisi;
            const percentFilled = Math.min(100, Math.round((sess.kuota_terisi / sess.kuota_total) * 100));
            const film = sess.films || {};
            const poster = sess.poster_path || film.poster_path;
            const judul = sess.film_judul || film.judul || 'Film Festival';
            const deskripsi = sess.deskripsi || film.deskripsi || '';
            const durasi = sess.durasi_menit || film.durasi_menit || 120;

            return (
              <motion.div
                key={sess.id}
                whileHover={{ y: -4 }}
                className={`bg-white/95 backdrop-blur-xl border-4 border-glacier-navy rounded-3xl overflow-hidden shadow-hard flex flex-col justify-between ${
                  isClosed ? 'opacity-60 bg-slate-100' : ''
                }`}
              >
                {/* Poster Thumbnail Header */}
                <div className="relative aspect-[16/9] w-full bg-slate-900 overflow-hidden border-b-3 border-glacier-navy">
                  {poster ? (
                    <img
                      src={poster}
                      alt={judul}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-sky-950 text-white p-4 text-center">
                      <Film className="w-8 h-8 text-cyan-400 mb-1" />
                      <span className="text-xs font-bold font-mono">{judul}</span>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-2.5 left-2.5">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 border-2 border-glacier-navy rounded shadow-hard-sm ${
                        isClosed ? 'bg-rose-200 text-rose-900' : 'bg-emerald-300 text-glacier-navy'
                      }`}
                    >
                      {sess.status_sesi}
                    </span>
                  </div>

                  {/* Time & Duration Badges */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                    <span className="text-[11px] font-mono font-black text-sky-950 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded border border-glacier-navy shadow-sm flex items-center gap-1">
                      <Clock className="w-3 h-3 text-sky-600" />
                      {sess.jam_mulai?.substring(0, 5)} WIB
                    </span>
                    <span className="text-[11px] font-bold text-slate-800 bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded border border-glacier-navy shadow-sm">
                      {durasi}m
                    </span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="font-black text-lg uppercase text-glacier-navy tracking-tight line-clamp-1">
                      {judul}
                    </h3>

                    {deskripsi && (
                      <p className="text-xs font-medium text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                        {deskripsi}
                      </p>
                    )}

                    <p className="text-xs font-bold text-sky-800/80 mt-2 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {new Date(sess.tanggal).toLocaleDateString('id-ID', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </p>
                  </div>

                  {/* Quota Progress Box */}
                  <div className="bg-sky-50 border-2 border-glacier-navy rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-black">
                      <span className="flex items-center gap-1 text-sky-900">
                        <Users className="w-3.5 h-3.5" />
                        Kapasitas Kursi
                      </span>
                      <span className="font-mono text-glacier-navy">
                        {sess.kuota_terisi} / {sess.kuota_total} ({sisa} Kursi Sisa)
                      </span>
                    </div>
                    <div className="w-full bg-sky-200 h-2.5 border-2 border-glacier-navy rounded-full overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full ${isClosed ? 'bg-slate-400' : 'bg-gradient-to-r from-cyan-400 to-sky-500'}`}
                        style={{ width: `${percentFilled}%` }}
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-sky-100">
                    <button
                      onClick={() => handleOpenEdit(sess)}
                      className="py-2.5 px-3 bg-cyan-200 hover:bg-cyan-300 text-glacier-navy font-black text-xs uppercase border-2 border-glacier-navy rounded-xl shadow-hard-sm transition-all flex items-center justify-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Sesi</span>
                    </button>

                    <button
                      onClick={() => setCancelingSession(sess)}
                      className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs uppercase border-2 border-glacier-navy rounded-xl shadow-hard-sm transition-all flex items-center justify-center gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Tutup Sesi</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TAMBAH SESI BARU (Dukungan Custom Nama, Upload Poster, Sinopsis)   */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div onClick={() => setShowAddModal(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-xl bg-white border-4 border-glacier-navy rounded-3xl p-5 sm:p-6 shadow-hard-xl space-y-4 z-10 max-h-[92vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b-2 border-slate-100">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-sky-600 stroke-[3]" />
                  <h3 className="font-black text-lg uppercase text-glacier-navy">Tambah Sesi Teater Baru</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 border-2 border-transparent hover:border-slate-300 transition-all"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Mode Selector Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl border-2 border-glacier-navy">
                <button
                  type="button"
                  onClick={() => setCreationMode('custom')}
                  className={`py-2 px-3 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 ${
                    creationMode === 'custom'
                      ? 'bg-gradient-to-r from-cyan-400 to-sky-400 text-glacier-navy border-2 border-glacier-navy shadow-hard-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Film Baru (Kustom)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreationMode('catalog')}
                  className={`py-2 px-3 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 ${
                    creationMode === 'catalog'
                      ? 'bg-gradient-to-r from-cyan-400 to-sky-400 text-glacier-navy border-2 border-glacier-navy shadow-hard-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Library className="w-3.5 h-3.5" />
                  <span>Pilih dari Katalog</span>
                </button>
              </div>

              <form onSubmit={handleCreateSession} className="space-y-4">
                {creationMode === 'custom' ? (
                  /* ----------------- SECTION: FILM KUSTOM ----------------- */
                  <div className="space-y-3.5 p-3.5 sm:p-4 bg-sky-50/60 border-2 border-sky-200 rounded-2xl">
                    <div className="flex items-center gap-1.5 text-xs font-black uppercase text-sky-900">
                      <Film className="w-4 h-4 text-sky-600" />
                      <span>Informasi Film Kustom</span>
                    </div>

                    {/* Custom Title Input */}
                    <div>
                      <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                        Nama / Judul Film <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Ekspedisi Lembah Gletser Arktik"
                        value={customJudul}
                        onChange={(e) => setCustomJudul(e.target.value)}
                        required={creationMode === 'custom'}
                        className="w-full bg-white border-2 border-glacier-navy rounded-xl px-3.5 py-2 text-xs font-bold text-glacier-navy placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                      />
                    </div>

                    {/* Thumbnail Upload + Live Preview */}
                    <div>
                      <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                        Upload Thumbnail / Poster Film
                      </label>

                      {thumbnailPreview ? (
                        <div className="relative border-2 border-glacier-navy rounded-xl overflow-hidden bg-slate-950 p-2 flex items-center gap-3">
                          <img
                            src={thumbnailPreview}
                            alt="Preview Thumbnail"
                            className="w-20 h-24 object-cover rounded-lg border border-slate-700 shadow-sm"
                          />
                          <div className="flex-1 space-y-1.5 text-left">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                              <Check className="w-3.5 h-3.5" />
                              Thumbnail siap di-publish
                            </span>
                            <p className="text-[10px] text-slate-300">
                              Gambar akan tampil di landing page dan tiket penonton.
                            </p>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="py-1 px-2.5 bg-sky-200 hover:bg-sky-300 text-glacier-navy text-[10px] font-black uppercase rounded-lg border border-glacier-navy transition-all"
                              >
                                Ganti Gambar
                              </button>
                              <button
                                type="button"
                                onClick={handleClearThumbnail}
                                className="py-1 px-2.5 bg-rose-100 hover:bg-rose-200 text-rose-800 text-[10px] font-black uppercase rounded-lg border border-rose-300 transition-all flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                Hapus
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-sky-300 hover:border-sky-500 bg-white hover:bg-sky-50/50 rounded-xl p-4 text-center cursor-pointer transition-all space-y-1.5"
                        >
                          <div className="w-10 h-10 mx-auto rounded-full bg-sky-100 flex items-center justify-center text-sky-600">
                            <Upload className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-bold text-glacier-navy">
                            Klik atau drag &amp; drop gambar thumbnail di sini
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Format JPG, PNG, atau WebP (Maksimal 5 MB)
                          </p>
                        </div>
                      )}

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleThumbnailUpload}
                        className="hidden"
                      />

                      {uploadError && (
                        <p className="text-[11px] font-bold text-rose-600 mt-1">
                          {uploadError}
                        </p>
                      )}
                    </div>

                    {/* Ringkasan Cerita / Synopsis */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-black uppercase text-glacier-navy">
                          Ringkasan Cerita / Sinopsis <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[10px] font-medium text-slate-400">
                          {customDeskripsi.length} karakter
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        placeholder="Tuliskan sinopsis singkat cerita film ini untuk menarik penonton dan siswa yang memesan tiket..."
                        value={customDeskripsi}
                        onChange={(e) => setCustomDeskripsi(e.target.value)}
                        required={creationMode === 'custom'}
                        className="w-full bg-white border-2 border-glacier-navy rounded-xl p-3 text-xs font-bold text-glacier-navy placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                      />
                    </div>

                    {/* Durasi Film */}
                    <div>
                      <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                        Estimasi Durasi Film (Menit)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="15"
                          max="360"
                          value={customDurasi}
                          onChange={(e) => setCustomDurasi(Number(e.target.value))}
                          className="w-full bg-white border-2 border-glacier-navy rounded-xl pl-3.5 pr-16 py-2 text-xs font-bold text-glacier-navy focus:outline-none focus:ring-2 focus:ring-sky-400"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                          Menit
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ----------------- SECTION: DARI KATALOG ----------------- */
                  <div className="space-y-3 p-3.5 sm:p-4 bg-sky-50/60 border-2 border-sky-200 rounded-2xl">
                    <div className="flex items-center gap-1.5 text-xs font-black uppercase text-sky-900">
                      <Library className="w-4 h-4 text-sky-600" />
                      <span>Pilih Film Terdaftar</span>
                    </div>
                    <div>
                      <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                        Daftar Film Bioskop
                      </label>
                      <select
                        value={newFilmId}
                        onChange={(e) => setNewFilmId(e.target.value)}
                        required={creationMode === 'catalog'}
                        className="w-full bg-white border-2 border-glacier-navy rounded-xl px-3.5 py-2.5 text-xs font-bold text-glacier-navy focus:outline-none focus:ring-2 focus:ring-sky-400"
                      >
                        {films.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.judul} ({f.durasi_menit} Menit)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* ----------------- SECTION: JADWAL & KAPASITAS ----------------- */}
                <div className="space-y-3 p-3.5 sm:p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-800">
                    <Calendar className="w-4 h-4 text-sky-600" />
                    <span>Jadwal &amp; Kapasitas Teater</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                        Tanggal Penayangan <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={newTanggal}
                        onChange={(e) => setNewTanggal(e.target.value)}
                        required
                        className="w-full bg-white border-2 border-glacier-navy rounded-xl px-3.5 py-2 text-xs font-bold text-glacier-navy focus:outline-none focus:ring-2 focus:ring-sky-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                        Jam Mulai (WIB) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="time"
                        value={newJamMulai}
                        onChange={(e) => setNewJamMulai(e.target.value)}
                        required
                        className="w-full bg-white border-2 border-glacier-navy rounded-xl px-3.5 py-2 text-xs font-bold text-glacier-navy focus:outline-none focus:ring-2 focus:ring-sky-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                      Kapasitas Total Kursi Teater <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={newKuota}
                      onChange={(e) => setNewKuota(Number(e.target.value))}
                      required
                      className="w-full bg-white border-2 border-glacier-navy rounded-xl px-3.5 py-2 text-xs font-bold text-glacier-navy focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                  </div>
                </div>

                {addError && (
                  <p className="text-xs font-bold text-rose-600 bg-rose-50 border-2 border-rose-300 p-2.5 rounded-xl">
                    {addError}
                  </p>
                )}

                {/* Modal Action Buttons */}
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2.5 border-2 border-glacier-navy rounded-xl font-black text-xs uppercase bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submittingAdd}
                    className="px-5 py-2.5 border-2 border-glacier-navy rounded-xl font-black text-xs uppercase bg-gradient-to-r from-cyan-400 to-sky-500 hover:from-cyan-300 hover:to-sky-400 text-glacier-navy shadow-hard-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {submittingAdd ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Tambahkan Sesi &amp; Film</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL: EDIT SESI                                                         */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {editingSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div onClick={() => setEditingSession(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white border-4 border-glacier-navy rounded-3xl p-6 shadow-hard-xl space-y-4 z-10"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-sky-600" />
                  <h3 className="font-black text-lg uppercase text-glacier-navy">
                    Edit Sesi: {editingSession.film_judul || editingSession.films?.judul}
                  </h3>
                </div>
                <button onClick={() => setEditingSession(null)} className="p-1 rounded hover:bg-slate-100">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div className="bg-sky-50 border-2 border-glacier-navy rounded-xl p-3 text-xs font-bold text-sky-950 flex items-center justify-between">
                  <span>Kursi Sudah Dipesan Siswa:</span>
                  <span className="font-mono text-sm font-black">{editingSession.kuota_terisi} Kursi</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                      Tanggal Penayangan
                    </label>
                    <input
                      type="date"
                      value={editTanggal}
                      onChange={(e) => setEditTanggal(e.target.value)}
                      required
                      className="w-full bg-sky-50 border-3 border-glacier-navy rounded-xl px-3.5 py-2 text-xs font-bold text-glacier-navy focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                      Jam Mulai (WIB)
                    </label>
                    <input
                      type="time"
                      value={editJamMulai}
                      onChange={(e) => setEditJamMulai(e.target.value)}
                      required
                      className="w-full bg-sky-50 border-3 border-glacier-navy rounded-xl px-3.5 py-2 text-xs font-bold text-glacier-navy focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                      Kapasitas Total Kursi
                    </label>
                    <input
                      type="number"
                      min={editingSession.kuota_terisi}
                      value={editKuota}
                      onChange={(e) => setEditKuota(Number(e.target.value))}
                      required
                      className="w-full bg-sky-50 border-3 border-glacier-navy rounded-xl px-3.5 py-2 text-xs font-bold text-glacier-navy focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-glacier-navy mb-1">
                      Status Sesi
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                      className="w-full bg-sky-50 border-3 border-glacier-navy rounded-xl px-3.5 py-2 text-xs font-bold text-glacier-navy focus:bg-white focus:outline-none"
                    >
                      <option value="AKTIF">AKTIF (Bisa Dipesan)</option>
                      <option value="DITUTUP">DITUTUP (Tutup Akses)</option>
                    </select>
                  </div>
                </div>

                {editError && (
                  <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-300 p-2.5 rounded-xl">
                    {editError}
                  </p>
                )}

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingSession(null)}
                    className="px-4 py-2.5 border-2 border-glacier-navy rounded-xl font-black text-xs uppercase bg-slate-100"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submittingEdit}
                    className="px-5 py-2.5 border-2 border-glacier-navy rounded-xl font-black text-xs uppercase bg-cyan-300 hover:bg-cyan-200 text-glacier-navy shadow-hard-sm"
                  >
                    {submittingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL: TUTUP SESI DARURAT                                                */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {cancelingSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div onClick={() => setCancelingSession(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white border-4 border-glacier-navy rounded-3xl p-6 shadow-hard-xl space-y-4 z-10"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="font-black text-lg uppercase text-glacier-navy">
                  Tutup Sesi Darurat
                </h3>
              </div>
              <p className="text-xs font-bold text-sky-900/70">
                Menutup sesi <strong className="text-glacier-navy">{cancelingSession.film_judul || cancelingSession.films?.judul}</strong> akan menghentikan pemesanan baru dan membatalkan status seluruh tiket terkait.
              </p>
              <textarea
                rows={3}
                placeholder="Alasan penutupan (misal: Kendala teknis proyektor / Pemadaman listrik)..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-sky-50 border-3 border-glacier-navy rounded-xl p-3 text-xs font-bold text-glacier-navy focus:bg-white focus:outline-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setCancelingSession(null)}
                  className="px-4 py-2 border-2 border-glacier-navy rounded-xl font-black text-xs uppercase bg-slate-100"
                >
                  Batal
                </button>
                <button
                  onClick={handleCancelSession}
                  disabled={submittingCancel}
                  className="px-4 py-2 border-2 border-glacier-navy rounded-xl font-black text-xs uppercase bg-rose-500 text-white shadow-hard-sm"
                >
                  {submittingCancel ? 'Memproses...' : 'Tutup Sesi'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
