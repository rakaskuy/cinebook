'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  Search,
  RefreshCw,
  Sparkles,
  DollarSign,
  ArrowRight,
  Laptop,
  Smartphone,
  Columns2,
  Ticket,
  Maximize2,
  Minimize2,
  XCircle,
} from 'lucide-react';
import {
  executeAdminSubmitDecision,
  executeRegisterCashierScan,
  fetchCashierQueue,
  CashierQueueItem,
} from '@/lib/supabase';

function playScanChime(success: boolean = true) {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (success) {
      // Chime bioskop kasir yang jernih, lantang, dan memuaskan (E5 -> A5 -> E6)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
      osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.08); // A5
      osc.frequency.setValueAtTime(1318.51, audioCtx.currentTime + 0.16); // E6
      gain.gain.setValueAtTime(0.65, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } else {
      // Double buzz peringatan gagal
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      osc.frequency.setValueAtTime(160, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(success ? [120, 60, 120] : [260, 80, 260]);
    }
  } catch (e) {
    console.warn('Audio chime playback failed:', e);
  }
}

async function safeStopScanner(scanner: any) {
  if (!scanner) return;
  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
  } catch {
    // Ignore already stopped, paused or non-running scanner
  }
  try {
    scanner.clear();
  } catch {
    // Ignore clear failures
  }
}

export default function KasirVerifyPage() {
  const [viewMode, setViewMode] = useState<'kiosk' | 'queue' | 'split'>('kiosk');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Scanner states
  const [scannerStarted, setScannerStarted] = useState(false);
  const [lastScannedResult, setLastScannedResult] = useState<any | null>(null);
  const [scanningActive, setScanningActive] = useState(true);

  // Queue states for Cashier's Phone
  const [queue, setQueue] = useState<CashierQueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Decline Modal states
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [targetDeclineCode, setTargetDeclineCode] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Manual search keyword for queue
  const [searchQuery, setSearchQuery] = useState('');

  const html5QrCodeRef = useRef<any>(null);
  const scanningActiveRef = useRef(true);
  const lastScannedTicketRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    scanningActiveRef.current = scanningActive;
  }, [scanningActive]);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // 1. Initialize Edge-to-Edge Scanner
  useEffect(() => {
    let isMounted = true;

    async function startEdgeScanner() {
      if (viewMode === 'queue') {
        if (html5QrCodeRef.current) {
          const currentScanner = html5QrCodeRef.current;
          html5QrCodeRef.current = null;
          await safeStopScanner(currentScanner);
          if (isMounted) setScannerStarted(false);
        }
        return;
      }

      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!isMounted) return;

        const qrRegionId = 'reader-verify-container';
        const element = document.getElementById(qrRegionId);
        if (!element) return;

        if (html5QrCodeRef.current) {
          const prevScanner = html5QrCodeRef.current;
          html5QrCodeRef.current = null;
          await safeStopScanner(prevScanner);
        }

        if (!isMounted) return;

        const scanner = new Html5Qrcode(qrRegionId, {
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        html5QrCodeRef.current = scanner;

        const qrCodeSuccessCallback = async (decodedText: string) => {
          const cleanText = decodedText?.trim();
          if (!cleanText) return;
          if (!scanningActiveRef.current) return;

          // Anti-spam lock: prevent repeat scans of the exact same QR while held in frame
          const now = Date.now();
          if (
            lastScannedTicketRef.current === cleanText &&
            now - lastScannedTimeRef.current < 7000
          ) {
            return;
          }

          scanningActiveRef.current = false;
          setScanningActive(false);
          lastScannedTicketRef.current = cleanText;
          lastScannedTimeRef.current = now;

          try {
            const res = await executeRegisterCashierScan(cleanText);
            playScanChime(res.success);
            setLastScannedResult(res);

            if (res.success) {
              loadQueue();
            }

            setTimeout(() => {
              setLastScannedResult(null);
              scanningActiveRef.current = true;
              setScanningActive(true);
            }, 3000);
          } catch (err: any) {
            playScanChime(false);
            setLastScannedResult({
              success: false,
              message: err.message || 'QR Code tidak valid atau rusak.',
            });
            setTimeout(() => {
              setLastScannedResult(null);
              scanningActiveRef.current = true;
              setScanningActive(true);
            }, 3000);
          }
        };

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 25,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minDim = Math.min(viewfinderWidth, viewfinderHeight);
              const box = Math.max(Math.floor(minDim * 0.72), 220);
              return { width: box, height: box };
            },
          },
          qrCodeSuccessCallback,
          undefined
        );

        if (!isMounted) {
          await safeStopScanner(scanner);
          return;
        }

        setScannerStarted(true);
      } catch (err) {
        console.warn('Scanner camera init failed:', err);
      }
    }

    startEdgeScanner();

    return () => {
      isMounted = false;
      if (html5QrCodeRef.current) {
        const cur = html5QrCodeRef.current;
        html5QrCodeRef.current = null;
        safeStopScanner(cur);
      }
    };
  }, [viewMode]);

  // 2. Load & Poll Cashier Queue
  const loadQueue = async () => {
    try {
      setLoadingQueue(true);
      const items = await fetchCashierQueue();
      setQueue(items);
    } catch (err) {
      console.error('Failed to load cashier queue:', err);
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  // 3. Handle Cashier ACC Payment
  const handleAccBooking = async (kodeBooking: string) => {
    try {
      setSubmittingAction(true);
      const res = await executeAdminSubmitDecision(kodeBooking, 'ACC');
      playScanChime(true);
      setActionNotice({
        type: 'success',
        text: `Tiket ${kodeBooking} berhasil di-ACC! Siswa kini dapat masuk gerbang.`,
      });
      loadQueue();
    } catch (err: any) {
      playScanChime(false);
      setActionNotice({
        type: 'error',
        text: err.message || 'Gagal menyetujui pembayaran.',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  // 4. Handle Cashier Decline Payment
  const handleDeclineBooking = async () => {
    if (!targetDeclineCode || !declineReason.trim()) {
      alert('Mohon isi alasan penolakan tiket.');
      return;
    }

    try {
      setSubmittingAction(true);
      await executeAdminSubmitDecision(targetDeclineCode, 'DECLINE', declineReason.trim());
      playScanChime(false);
      setActionNotice({
        type: 'success',
        text: `Tiket ${targetDeclineCode} ditolak: ${declineReason}`,
      });
      setShowDeclineModal(false);
      setTargetDeclineCode(null);
      setDeclineReason('');
      loadQueue();
    } catch (err: any) {
      alert(err.message || 'Gagal menolak tiket.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const filteredQueue = queue.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.kode_booking.toLowerCase().includes(q) ||
      item.nama_lengkap.toLowerCase().includes(q) ||
      item.kelas.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-sky-50 text-sky-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-sky-200 flex items-center gap-1.5">
              <DollarSign className="w-3 h-3 text-sky-600" />
              <span>POS Kasir Cinemanik</span>
            </span>
            <span className="text-[11px] text-slate-500 font-medium">SMAN 1 Kendal</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl text-slate-900 font-medium tracking-tight">
            Verifikasi Pembayaran Kasir
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl leading-relaxed">
            Pindai QR pemesanan siswa pada meja kasir atau setujui pembayaran tiket via ponsel.
          </p>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 self-start md:self-auto shadow-sm">
          <button
            onClick={() => setViewMode('kiosk')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'kiosk'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Laptop Scanner</span>
          </button>

          <button
            onClick={() => setViewMode('queue')}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'queue'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Ponsel ACC</span>
            {queue.length > 0 && (
              <span className="ml-1 bg-sky-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {queue.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setViewMode('split')}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'split'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Split Mode</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      <AnimatePresence>
        {actionNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
              actionNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionNotice.text}</span>
            </div>
            <button
              onClick={() => setActionNotice(null)}
              className="text-slate-500 hover:text-slate-900 text-[11px] underline"
            >
              Tutup
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT BASED ON MODE */}
      <div className={`grid gap-6 items-start ${viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'}`}>

        {/* ========================================================================= */}
        {/* SECTION 1: LAPTOP SCANNER KIOSK (EDGE-TO-EDGE SCANNER + FULLSCREEN)        */}
        {/* ========================================================================= */}
        {(viewMode === 'kiosk' || viewMode === 'split') && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-6' : 'max-w-3xl mx-auto w-full'} space-y-4`}>
            <div
              className={`bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm transition-all ${
                isFullscreen
                  ? '!fixed !inset-0 !z-[9999] !rounded-none !border-0 !p-4 sm:!p-6 !bg-slate-950 flex flex-col justify-between overflow-hidden !m-0 !w-screen !h-screen'
                  : ''
              }`}
            >
              {/* Scanner Control Bar */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Camera className={`w-4 h-4 ${isFullscreen ? 'text-sky-300' : 'text-slate-700'}`} />
                  <span
                    className={`font-semibold text-xs tracking-tight ${
                      isFullscreen ? 'text-sky-100' : 'text-slate-900'
                    }`}
                  >
                    Pemindai QR Meja Kasir
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold bg-sky-50 text-sky-800 px-2 py-0.5 border border-sky-200 rounded-md">
                    Otomatis
                  </span>

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
                    title={isFullscreen ? 'Keluar Layar Penuh' : 'Mode Layar Penuh'}
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Edge-to-Edge Video Viewfinder Container */}
              <div
                className={`relative bg-slate-950 rounded-xl overflow-hidden border ${
                  lastScannedResult
                    ? lastScannedResult.success
                      ? 'border-emerald-400 ring-4 ring-emerald-500/40'
                      : 'border-rose-400 ring-4 ring-rose-500/40'
                    : 'border-slate-800'
                } flex items-center justify-center transition-all duration-300 ${
                  isFullscreen ? 'flex-1 w-full !h-full my-2' : 'h-[360px] sm:h-[420px] w-full'
                }`}
              >
                <div id="reader-verify-container" className="absolute inset-0 w-full h-full" />

                {/* Subtle Glacial Laser Line Scan */}
                <div className="pointer-events-none absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-bounce" />

                {/* Minimalist Corner Brackets */}
                <div className="pointer-events-none absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-sky-400/80 rounded-tl" />
                <div className="pointer-events-none absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-sky-400/80 rounded-tr" />
                <div className="pointer-events-none absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-sky-400/80 rounded-bl" />
                <div className="pointer-events-none absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-sky-400/80 rounded-br" />

                {!scannerStarted && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white bg-slate-900/90 space-y-3">
                    <Camera className="w-10 h-10 text-sky-400 animate-pulse" />
                    <p className="text-xs text-slate-300 max-w-sm leading-relaxed">
                      Menghubungkan ke kamera laptop. Pastikan izin kamera telah diberikan di browser.
                    </p>
                  </div>
                )}

                {/* Pop-up Notification When Scanned */}
                <AnimatePresence>
                  {lastScannedResult && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 16 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 16 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                      className={`absolute inset-4 sm:inset-6 z-20 rounded-2xl border p-6 flex flex-col items-center justify-center text-center shadow-2xl backdrop-blur-md ${
                        lastScannedResult.success
                          ? 'bg-white/95 border-emerald-300 text-slate-900'
                          : 'bg-white/95 border-rose-300 text-rose-950'
                      }`}
                    >
                      {lastScannedResult.success ? (
                        <>
                          <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mb-3">
                            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                          </div>
                          <span className="font-mono text-xs bg-slate-900 text-white px-2.5 py-0.5 rounded-md mb-2">
                            {lastScannedResult.kode_booking}
                          </span>
                          <h2 className="font-serif text-xl sm:text-2xl font-medium tracking-tight text-slate-900">
                            {lastScannedResult.nama_lengkap} ({lastScannedResult.kelas})
                          </h2>
                          <div className="text-xs text-slate-600 mt-1 font-medium">
                            {lastScannedResult.nama_paket} ({lastScannedResult.jumlah_orang} Orang)
                          </div>
                          <div className="mt-3 text-2xl font-semibold font-mono text-slate-900">
                            Rp {Number(lastScannedResult.total_harga || 0).toLocaleString('id-ID')}
                          </div>
                          <div className="mt-3 bg-sky-50 border border-sky-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-sky-800 flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5 text-sky-600" />
                            <span>Terkirim ke HP Kasir untuk ACC</span>
                          </div>
                          <div className="w-full mt-4 pt-2.5 border-t border-slate-100 space-y-1">
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: '100%' }}
                                animate={{ width: '0%' }}
                                transition={{ duration: 3, ease: 'linear' }}
                                className="h-full bg-emerald-500"
                              />
                            </div>
                            <p className="text-[10px] text-slate-400">Siap scan tiket kasir berikutnya...</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 bg-rose-50 border border-rose-200 rounded-full flex items-center justify-center mb-3">
                            <AlertTriangle className="w-6 h-6 text-rose-600" />
                          </div>
                          <h3 className="font-serif text-lg font-medium text-rose-950">Gagal Memindai</h3>
                          <p className="text-xs text-rose-700 mt-1 max-w-xs">{lastScannedResult.message}</p>
                          <div className="w-full mt-4 pt-2.5 border-t border-slate-100 space-y-1">
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: '100%' }}
                                animate={{ width: '0%' }}
                                transition={{ duration: 3, ease: 'linear' }}
                                className="h-full bg-rose-500"
                              />
                            </div>
                            <p className="text-[10px] text-slate-400">Coba arahkan ulang QR Code...</p>
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Status footer inside scanner box */}
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  isFullscreen ? 'bg-slate-900 text-sky-200 border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                  <span>Kamera memindai QR secara penuh tanpa batasan sudut pandang.</span>
                </span>
                <span className="font-mono text-[10px] bg-white text-slate-700 px-2 py-0.5 border border-slate-200 rounded">
                  Auto-Reset
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 2: HP KASIR APPROVAL QUEUE                                         */}
        {/* ========================================================================= */}
        {(viewMode === 'queue' || viewMode === 'split') && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-6' : 'max-w-3xl mx-auto w-full'} space-y-4`}>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-600" />
                  <h2 className="font-serif text-lg font-medium text-slate-900 tracking-tight">
                    Antrean Konfirmasi Pembayaran
                  </h2>
                </div>
                <button
                  onClick={loadQueue}
                  className="flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-2.5 py-1.5 border border-slate-200 rounded-lg shadow-sm transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingQueue ? 'animate-spin' : ''}`} />
                  <span>Segarkan</span>
                </button>
              </div>

              {/* Search in queue */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari kode booking, nama siswa, atau kelas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Queue List */}
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {filteredQueue.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                    <Ticket className="w-8 h-8 mx-auto text-slate-400" />
                    <p className="font-semibold text-xs text-slate-700">
                      Tidak Ada Antrean Pembayaran
                    </p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Saat siswa memindai QR di laptop kasir, data mereka akan segera tampil di sini.
                    </p>
                  </div>
                ) : (
                  filteredQueue.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 rounded-xl border transition-all ${
                        item.is_recently_scanned
                          ? 'bg-sky-50/40 border-sky-300 ring-2 ring-sky-400/20'
                          : 'bg-white border-slate-200/80 shadow-sm'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold bg-slate-900 text-white px-2 py-0.5 rounded-md">
                            {item.kode_booking}
                          </span>
                          {item.is_recently_scanned && (
                            <span className="bg-sky-100 text-sky-800 text-[10px] font-semibold px-2 py-0.5 rounded-md border border-sky-200 flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5 text-sky-600" />
                              <span>Baru Di-Scan</span>
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-slate-600">
                          {item.film_judul}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 my-2">
                        <div>
                          <h3 className="font-serif text-base text-slate-900 font-medium tracking-tight">
                            {item.nama_lengkap}
                          </h3>
                          <p className="text-xs text-slate-500">
                            Kelas {item.kelas} • {item.nama_paket} ({item.jumlah_orang} Orang)
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <span className="text-[10px] font-medium text-slate-500 block uppercase">
                            Total Tagihan:
                          </span>
                          <span className="text-lg font-semibold font-mono text-slate-900">
                            Rp {Number(item.total_harga).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => {
                            setTargetDeclineCode(item.kode_booking);
                            setShowDeclineModal(true);
                          }}
                          disabled={submittingAction}
                          className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs border border-rose-200 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Tolak</span>
                        </button>

                        <button
                          onClick={() => handleAccBooking(item.kode_booking)}
                          disabled={submittingAction}
                          className="py-2.5 px-3 bg-slate-900 hover:bg-sky-900 text-white font-semibold text-xs rounded-lg transition-all shadow-sm flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Setujui Pembayaran</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Decline Reason Modal */}
      <AnimatePresence>
        {showDeclineModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeclineModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative w-full max-w-md bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xl space-y-4 z-10"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-medium text-slate-900">
                    Tolak Pembayaran
                  </h3>
                  <span className="font-mono text-xs text-slate-500">{targetDeclineCode}</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tuliskan alasan penolakan agar penonton mengetahui kendala pembayaran (misal: Uang fisik tidak cukup atau salah sesi).
              </p>
              <textarea
                rows={3}
                placeholder="Contoh: Uang tunai kurang Rp 10.000 / Salah jadwal teater..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => setShowDeclineModal(false)}
                  className="px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleDeclineBooking}
                  disabled={submittingAction}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                >
                  {submittingAction ? 'Menyimpan...' : 'Konfirmasi Penolakan'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
