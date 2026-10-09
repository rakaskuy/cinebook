'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DoorOpen,
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  ArrowRight,
  Maximize2,
  Minimize2,
  Smartphone,
  Laptop,
  Columns2,
  Search,
  Ticket,
  Sparkles,
} from 'lucide-react';
import {
  executeAdminScanPreview,
  executeAdminSubmitDecision,
  executeRegisterGateScan,
  fetchGateQueue,
  AdminScanPreviewResponse,
} from '@/lib/supabase';
import { GateQueueItem } from '@/lib/types';

function playGateTone(isApproved: boolean) {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isApproved) {
      osc.type = 'sine';
      // Harmonic 3-note cinema chime: E5 (659.25Hz) -> A5 (880.00Hz) -> E6 (1318.51Hz)
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(880.0, ctx.currentTime + 0.08);
      osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.65, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      // Dual-tone warning buzz: 220Hz -> 160Hz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(160, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(isApproved ? [120, 60, 120] : [260, 80, 260]);
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

export default function GateScanPage() {
  const [viewMode, setViewMode] = useState<'kiosk' | 'queue' | 'split'>('kiosk');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Scanner states
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<AdminScanPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scannerStarted, setScannerStarted] = useState(false);

  // Queue states for Mobile Gatekeepers
  const [queue, setQueue] = useState<GateQueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manual code input
  const [manualCode, setManualCode] = useState('');

  // Decline Modal
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [targetDeclineCode, setTargetDeclineCode] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  // Feedback Banner
  const [gateFeedback, setGateFeedback] = useState<{
    type: 'PASS' | 'REJECT';
    title: string;
    msg: string;
  } | null>(null);

  // On-screen Scan Result HUD Overlay over camera viewfinder
  const [lastScannedHUD, setLastScannedHUD] = useState<{
    success: boolean;
    status: string;
    kode_booking: string;
    nama_lengkap: string;
    kelas: string;
    film_judul: string;
    jumlah_orang: number;
    nama_paket: string;
    message?: string;
    is_session_today?: boolean;
  } | null>(null);

  const hudTimerRef = useRef<any>(null);
  const html5QrCodeRef = useRef<any>(null);
  const isProcessingScanRef = useRef(false);
  const lastScannedTicketRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const handleDecodedRef = useRef<any>(null);

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

  // 1. Fetch Gate Queue for Mobile
  const loadQueue = async () => {
    try {
      setLoadingQueue(true);
      const res = await fetchGateQueue();
      setQueue(res);
    } catch (err) {
      console.error('Failed to load gate queue:', err);
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 4000);
    return () => clearInterval(interval);
  }, []);

  // 2. High-Speed QR Camera Scanner
  useEffect(() => {
    let isMounted = true;

    async function startGateScanner() {
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
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (!isMounted) return;

        const qrRegionId = 'reader-gate-container';
        const el = document.getElementById(qrRegionId);
        if (!el) return;

        if (html5QrCodeRef.current) {
          const prevScanner = html5QrCodeRef.current;
          html5QrCodeRef.current = null;
          await safeStopScanner(prevScanner);
        }

        if (!isMounted) return;

        // Optimized QR-only format & hardware-accelerated BarcodeDetector
        const scanner = new Html5Qrcode(qrRegionId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        html5QrCodeRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 20,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minDim = Math.min(viewfinderWidth, viewfinderHeight);
              const box = Math.max(Math.floor(minDim * 0.75), 220);
              return { width: box, height: box };
            },
          },
          (decoded: string) => {
            if (handleDecodedRef.current) {
              handleDecodedRef.current(decoded);
            }
          },
          () => {}
        );

        if (!isMounted) {
          await safeStopScanner(scanner);
          return;
        }

        setScannerStarted(true);
      } catch (err) {
        console.warn('Gate camera initialization error:', err);
      }
    }

    startGateScanner();

    return () => {
      isMounted = false;
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
      if (html5QrCodeRef.current) {
        const cur = html5QrCodeRef.current;
        html5QrCodeRef.current = null;
        safeStopScanner(cur);
      }
    };
  }, [viewMode]);

  const handleDecoded = async (text: string) => {
    const cleanText = text?.trim();
    if (!cleanText) return;

    // Mutex lock to stop redundant frame callbacks
    if (isProcessingScanRef.current) return;

    // Anti-spam lock
    const now = Date.now();
    if (
      lastScannedTicketRef.current === cleanText &&
      now - lastScannedTimeRef.current < 2000
    ) {
      return;
    }

    isProcessingScanRef.current = true;
    lastScannedTicketRef.current = cleanText;
    lastScannedTimeRef.current = now;

    setScannedCode(cleanText);
    setLoading(true);
    setGateFeedback(null);

    try {
      // Register scan to highlight in gate queue
      executeRegisterGateScan(cleanText).then(() => loadQueue()).catch(() => {});

      const res = await executeAdminScanPreview(cleanText, 'gate');
      setPreviewData(res);
      if (res.kode_booking) {
        setScannedCode(res.kode_booking);
      }
      const isApproved = Boolean(res.success && res.status === 'ACC' && res.is_session_today);
      playGateTone(isApproved);

      setLastScannedHUD({
        success: isApproved,
        status: res.status || 'UNKNOWN',
        kode_booking: res.kode_booking || cleanText,
        nama_lengkap: res.nama_lengkap || 'Penonton',
        kelas: res.kelas || '-',
        film_judul: res.film_judul || '-',
        jumlah_orang: res.jumlah_orang || 1,
        nama_paket: res.nama_paket || 'Tiket Masuk',
        message: res.message || (!res.is_session_today ? `Sesi tanggal ${res.tanggal}, bukan hari ini!` : undefined),
        is_session_today: res.is_session_today,
      });

      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
      hudTimerRef.current = setTimeout(() => {
        setLastScannedHUD(null);
      }, 5000);
    } catch (err: any) {
      setPreviewData({
        success: false,
        status: 'INVALID_QR',
        message: err.message || 'QR Code tidak dapat diverifikasi!',
        available_actions: [],
      });
      playGateTone(false);

      setLastScannedHUD({
        success: false,
        status: 'INVALID_QR',
        kode_booking: cleanText,
        nama_lengkap: 'Tidak Dikenal',
        kelas: '-',
        film_judul: '-',
        jumlah_orang: 0,
        nama_paket: '-',
        message: err.message || 'QR Code tidak valid atau tidak terdaftar di sistem.',
      });

      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
      hudTimerRef.current = setTimeout(() => {
        setLastScannedHUD(null);
      }, 5000);
    } finally {
      setLoading(false);
      setTimeout(() => {
        isProcessingScanRef.current = false;
      }, 1200);
    }
  };

  handleDecodedRef.current = handleDecoded;

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    setLoading(true);
    setScannedCode(manualCode.trim());
    setGateFeedback(null);

    try {
      const res = await executeAdminScanPreview(manualCode.trim(), 'gate');
      setPreviewData(res);
      if (res.kode_booking) {
        setScannedCode(res.kode_booking);
      }
      const isApproved = Boolean(res.success && res.status === 'ACC' && res.is_session_today);
      playGateTone(isApproved);

      setLastScannedHUD({
        success: isApproved,
        status: res.status || 'UNKNOWN',
        kode_booking: res.kode_booking || manualCode.trim(),
        nama_lengkap: res.nama_lengkap || 'Penonton',
        kelas: res.kelas || '-',
        film_judul: res.film_judul || '-',
        jumlah_orang: res.jumlah_orang || 1,
        nama_paket: res.nama_paket || 'Tiket Masuk',
        message: res.message || (!res.is_session_today ? `Sesi tanggal ${res.tanggal}, bukan hari ini!` : undefined),
        is_session_today: res.is_session_today,
      });

      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
      hudTimerRef.current = setTimeout(() => {
        setLastScannedHUD(null);
      }, 5000);
    } catch (err: any) {
      setPreviewData({
        success: false,
        status: 'INVALID_QR',
        message: err.message || 'Kode tiket tidak ditemukan.',
        available_actions: [],
      });
      playGateTone(false);

      setLastScannedHUD({
        success: false,
        status: 'INVALID_QR',
        kode_booking: manualCode.trim(),
        nama_lengkap: 'Tidak Dikenal',
        kelas: '-',
        film_judul: '-',
        jumlah_orang: 0,
        nama_paket: '-',
        message: err.message || 'Kode tiket tidak ditemukan.',
      });

      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
      hudTimerRef.current = setTimeout(() => {
        setLastScannedHUD(null);
      }, 5000);
    } finally {
      setLoading(false);
    }
  };

  // 3. One-tap Mobile Approval Handler
  const handleAccEntry = async (codeToAcc: string) => {
    try {
      setSubmitting(true);
      await executeAdminSubmitDecision(codeToAcc, 'ACC', undefined, 'gate');
      playGateTone(true);
      setActionNotice({
        type: 'success',
        text: `Akses penonton tiket ${codeToAcc} berhasil diizinkan masuk!`,
      });
      loadQueue();
      if (previewData && previewData.kode_booking === codeToAcc) {
        setPreviewData(null);
        setScannedCode(null);
      }
    } catch (err: any) {
      playGateTone(false);
      setActionNotice({
        type: 'error',
        text: err.message || 'Gagal memvalidasi izin masuk gate.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Gate Decision for Preview Panel
  const handleGateDecision = async (decision: 'ACC' | 'DECLINE', reason?: string) => {
    const targetCode = previewData?.kode_booking || scannedCode;
    if (!previewData || !targetCode) return;
    setSubmitting(true);

    try {
      await executeAdminSubmitDecision(targetCode, decision, reason, 'gate');

      if (decision === 'ACC') {
        playGateTone(true);
        setGateFeedback({
          type: 'PASS',
          title: 'AKSES MASUK DIIZINKAN',
          msg: `${previewData.nama_lengkap} (${previewData.jumlah_orang} Orang) silakan masuk ke teater.`,
        });
      } else {
        playGateTone(false);
        setGateFeedback({
          type: 'REJECT',
          title: 'AKSES MASUK DITOLAK',
          msg: `Penolakan dicatat: ${reason || 'Tidak memenuhi syarat'}.`,
        });
      }

      setPreviewData(null);
      setScannedCode(null);
      setLastScannedHUD(null);
      setShowDeclineModal(false);
      setTargetDeclineCode(null);
      setDeclineReason('');
      loadQueue();
      setTimeout(() => {
        isProcessingScanRef.current = false;
      }, 1000);
    } catch (err: any) {
      playGateTone(false);
      alert(err.message || 'Gagal memproses aksi gate.');
      isProcessingScanRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  // 5. Decline Handler for Queue List
  const handleDeclineFromQueue = async () => {
    if (!targetDeclineCode || !declineReason.trim()) {
      alert('Mohon isi alasan penolakan tiket.');
      return;
    }

    try {
      setSubmitting(true);
      await executeAdminSubmitDecision(targetDeclineCode, 'DECLINE', declineReason.trim(), 'gate');
      playGateTone(false);
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
      setSubmitting(false);
    }
  };

  const resetScanner = () => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    isProcessingScanRef.current = false;
    lastScannedTicketRef.current = null;
    lastScannedTimeRef.current = 0;
    setScannedCode(null);
    setPreviewData(null);
    setLastScannedHUD(null);
    setGateFeedback(null);
    setManualCode('');
  };

  const filteredQueue = queue.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.kode_booking.toLowerCase().includes(q) ||
      item.nama_lengkap.toLowerCase().includes(q) ||
      item.kelas.toLowerCase().includes(q) ||
      item.film_judul.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header bar with Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-sky-50 text-sky-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-sky-200 flex items-center gap-1.5">
              <DoorOpen className="w-3 h-3 text-sky-600" />
              <span>Gerbang Teater Cinemanik</span>
            </span>
            <span className="text-[11px] text-slate-500 font-medium">SMAN 1 Kendal</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl text-slate-900 font-medium tracking-tight">
            Pemindai Masuk Teater
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl leading-relaxed">
            Pindai QR Gate Pass siswa di laptop atau izinkan penonton masuk langsung via ponsel panitia.
          </p>
        </div>

        {/* View Mode Tabs (Laptop Scanner vs Ponsel ACC vs Split) */}
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

      {/* Instant Gate Feedback Banner */}
      {gateFeedback && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
            gateFeedback.type === 'PASS'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-3">
            {gateFeedback.type === 'PASS' ? (
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <XCircle className="w-6 h-6 text-rose-600" />
              </div>
            )}
            <div>
              <h2 className="font-serif text-base sm:text-lg font-medium tracking-tight">
                {gateFeedback.title}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">{gateFeedback.msg}</p>
            </div>
          </div>
          <button
            onClick={resetScanner}
            className="bg-white text-slate-800 hover:text-slate-950 text-xs font-semibold px-3.5 py-2 border border-slate-200 rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors shrink-0"
          >
            <span>Scan Penonton Berikutnya</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className={`grid gap-6 items-start ${viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'}`}>

        {/* ========================================================================= */}
        {/* SECTION 1: LAPTOP SCANNER (EDGE-TO-EDGE FAST QR SCANNER)                  */}
        {/* ========================================================================= */}
        {(viewMode === 'kiosk' || viewMode === 'split') && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-7' : 'max-w-4xl mx-auto w-full'} space-y-4`}>
            <div
              className={`bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm overflow-hidden transition-all ${
                isFullscreen
                  ? '!fixed !inset-0 !z-[9999] !rounded-none !border-0 !p-4 sm:!p-6 !bg-slate-950 flex flex-col justify-between overflow-hidden !m-0 !w-screen !h-screen'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold mb-3 px-1">
                <span className={`flex items-center gap-2 ${isFullscreen ? 'text-sky-300' : 'text-slate-900'}`}>
                  <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                  <span>Pemindai Gate Aktif (QR Cepat Otomatis)</span>
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? 'Keluar Layar Penuh' : 'Mode Layar Penuh'}
                    className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
                    title={isFullscreen ? 'Keluar Layar Penuh' : 'Mode Layar Penuh'}
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div
                className={`relative bg-slate-950 rounded-xl overflow-hidden border ${
                  lastScannedHUD
                    ? lastScannedHUD.success
                      ? 'border-emerald-400 ring-4 ring-emerald-500/40'
                      : 'border-rose-400 ring-4 ring-rose-500/40'
                    : 'border-slate-800'
                } flex items-center justify-center transition-all duration-300 ${
                  isFullscreen ? 'flex-1 w-full !h-full my-2' : 'h-[360px] sm:h-[420px] w-full'
                }`}
              >
                <div id="reader-gate-container" className="absolute inset-0 w-full h-full" />

                {/* Laser scan line effect */}
                <div className="pointer-events-none absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-bounce" />

                {/* Minimalist corner brackets */}
                <div className="pointer-events-none absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-sky-400/80 rounded-tl" />
                <div className="pointer-events-none absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-sky-400/80 rounded-tr" />
                <div className="pointer-events-none absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-sky-400/80 rounded-bl" />
                <div className="pointer-events-none absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-sky-400/80 rounded-br" />

                {!scannerStarted && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white space-y-2 bg-slate-950/90">
                    <Camera className="w-10 h-10 text-sky-400 animate-pulse" />
                    <p className="text-xs text-slate-300 max-w-sm">
                      Memuat kamera pintu gate. Pastikan izin kamera telah diberikan di browser.
                    </p>
                  </div>
                )}

                {/* Pop-up Notification HUD When Scanned */}
                <AnimatePresence>
                  {lastScannedHUD && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.94, y: 16 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.94, y: 16 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                      className={`${
                        isFullscreen
                          ? 'fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-md sm:w-full z-[100000]'
                          : 'absolute inset-4 sm:inset-6 z-30'
                      } rounded-3xl border p-6 sm:p-7 flex flex-col items-center justify-center text-center shadow-2xl backdrop-blur-xl ${
                        lastScannedHUD.success
                          ? 'bg-white border-emerald-300 text-slate-900 shadow-emerald-500/10'
                          : 'bg-white border-rose-300 text-rose-950 shadow-rose-500/10'
                      }`}
                    >
                      {lastScannedHUD.success ? (
                        <>
                          <div className="w-14 h-14 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mb-2.5">
                            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                          </div>
                          <span className="font-mono text-xs font-bold bg-slate-900 text-white px-3 py-0.5 rounded-md mb-1.5">
                            {lastScannedHUD.kode_booking}
                          </span>
                          <h2 className="font-serif text-xl sm:text-2xl font-medium tracking-tight text-slate-900">
                            {lastScannedHUD.nama_lengkap} ({lastScannedHUD.kelas})
                          </h2>
                          <p className="text-xs text-slate-600 mt-1 font-medium">
                            {lastScannedHUD.film_judul} &bull; {lastScannedHUD.jumlah_orang} Orang ({lastScannedHUD.nama_paket})
                          </p>
                          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-1 text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>QR GATE PASS VALID: SIAP MASUK</span>
                          </div>

                          {/* Instant 1-Click Approve in Fullscreen */}
                          <button
                            type="button"
                            onClick={() => {
                              handleGateDecision('ACC');
                              setLastScannedHUD(null);
                            }}
                            className="w-full bg-slate-900 hover:bg-sky-950 text-white font-semibold text-xs py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-3.5 cursor-pointer"
                          >
                            <DoorOpen className="w-4 h-4" />
                            <span>Izinkan Masuk Teater Sekarang</span>
                          </button>

                          <div className="w-full mt-3 pt-2 border-t border-slate-100 space-y-1">
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: '100%' }}
                                animate={{ width: '0%' }}
                                transition={{ duration: 5, ease: 'linear' }}
                                className="h-full bg-emerald-500"
                              />
                            </div>
                            <p className="text-[10px] text-slate-400">Ketuk layar atau tunggu auto-reset...</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-14 h-14 bg-rose-50 border border-rose-200 rounded-full flex items-center justify-center mb-2.5">
                            <AlertTriangle className="w-8 h-8 text-rose-600" />
                          </div>
                          <span className="font-mono text-xs font-bold bg-rose-900 text-white px-3 py-0.5 rounded-md mb-1.5">
                            {lastScannedHUD.kode_booking}
                          </span>
                          <h3 className="font-serif text-xl font-medium text-rose-950">
                            {lastScannedHUD.status === 'USED' ? 'Tiket Sudah Digunakan!' : 'Akses Gate Ditolak!'}
                          </h3>
                          <p className="text-xs text-rose-700 mt-1 max-w-xs font-medium">
                            {lastScannedHUD.message || 'Tiket ini tidak memenuhi syarat untuk masuk teater.'}
                          </p>

                          <button
                            type="button"
                            onClick={() => setLastScannedHUD(null)}
                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs py-2.5 px-4 rounded-xl transition-all mt-3.5 cursor-pointer"
                          >
                            Tutup Notifikasi
                          </button>

                          <div className="w-full mt-3 pt-2 border-t border-slate-100 space-y-1">
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: '100%' }}
                                animate={{ width: '0%' }}
                                transition={{ duration: 5, ease: 'linear' }}
                                className="h-full bg-rose-500"
                              />
                            </div>
                            <p className="text-[10px] text-slate-400">Siap scan tiket berikutnya...</p>
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Status footer inside scanner box */}
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between mt-3 ${
                  isFullscreen ? 'bg-slate-900 text-sky-200 border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                  <span>Kamera memindai QR secara cepat dan otomatis.</span>
                </span>
                <span className="font-mono text-[10px] bg-white text-slate-700 px-2 py-0.5 border border-slate-200 rounded">
                  Auto-Reset
                </span>
              </div>

              {!isFullscreen && (
                <form onSubmit={handleManualSearch} className="flex gap-2 mt-4">
                  <input
                    type="text"
                    placeholder="Ketik kode booking (Contoh: CIN-20261010-XXXX)"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    type="submit"
                    className="bg-slate-900 hover:bg-sky-900 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span>Cek</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>

            {/* Instant Scanned Verification Card for Laptop View */}
            {viewMode === 'kiosk' && (
              <div className="pt-2">
                {loading ? (
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center text-xs font-medium text-slate-500 shadow-sm flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4 animate-spin text-sky-600" />
                    <span>Memvalidasi jadwal &amp; tanggal sesi...</span>
                  </div>
                ) : !previewData ? (
                  <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-2">
                    <DoorOpen className="w-8 h-8 text-sky-600 mx-auto" />
                    <h3 className="font-serif text-sm font-medium text-slate-900">
                      Arahkan QR Gate Pass Siswa ke Kamera
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Sistem akan memverifikasi signature dan jadwal penayangan secara otomatis.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                          Kode Tiket
                        </span>
                        <div className="font-mono font-semibold text-base text-slate-900">
                          {previewData.kode_booking}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          previewData.status === 'ACC'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : previewData.status === 'USED'
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : 'bg-sky-50 text-sky-800 border-sky-200'
                        }`}
                      >
                        {previewData.status === 'ACC'
                          ? 'Siap Masuk'
                          : previewData.status === 'USED'
                          ? 'Sudah Digunakan'
                          : previewData.status}
                      </span>
                    </div>

                    {/* Wrong Date Alert */}
                    {!previewData.is_session_today && (
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          Perhatian: Sesi tiket ini tanggal {previewData.tanggal}, bukan untuk hari ini!
                        </span>
                      </div>
                    )}

                    {/* Student Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
                      <div>
                        <span className="text-slate-500">Nama Penonton:</span>
                        <p className="font-semibold text-slate-900">{previewData.nama_lengkap}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Kelas:</span>
                        <p className="font-medium text-slate-800">{previewData.kelas}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Film:</span>
                        <p className="font-semibold text-slate-900">{previewData.film_judul}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Jumlah Orang:</span>
                        <p className="font-medium text-slate-800">{previewData.jumlah_orang} Orang ({previewData.nama_paket})</p>
                      </div>
                    </div>

                    {/* Action button */}
                    <div className="pt-1">
                      {previewData.status === 'ACC' && previewData.is_session_today ? (
                        <button
                          onClick={() => handleGateDecision('ACC')}
                          disabled={submitting}
                          className="w-full bg-slate-900 hover:bg-sky-900 text-white font-semibold text-xs py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                        >
                          <DoorOpen className="w-4 h-4" />
                          <span>Izinkan Masuk Teater</span>
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setTargetDeclineCode(previewData.kode_booking || null);
                              setShowDeclineModal(true);
                            }}
                            className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs py-2.5 rounded-xl border border-rose-200 transition-colors"
                          >
                            Tolak Masuk
                          </button>
                          <button
                            onClick={resetScanner}
                            className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-colors"
                          >
                            Batal
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 2: HP GATE PASS ACC QUEUE (MENU HP UNTUK ACC TIKET DI PINTU)     */}
        {/* ========================================================================= */}
        {(viewMode === 'queue' || viewMode === 'split') && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-5' : 'max-w-3xl mx-auto w-full'} space-y-4`}>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-600" />
                  <h2 className="font-serif text-lg font-medium text-slate-900 tracking-tight">
                    Antrean Masuk Teater
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

              {/* Search Filter */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari kode booking, nama penonton, kelas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Queue List of ACC Tickets */}
              <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
                {filteredQueue.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                    <Ticket className="w-8 h-8 mx-auto text-slate-400" />
                    <p className="font-semibold text-xs text-slate-700">
                      Tidak Ada Tiket Siap Masuk
                    </p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Tiket yang sudah disetujui kasir (status ACC) akan otomatis tampil di sini.
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
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-xs text-slate-900">
                              {item.nama_lengkap}
                            </h3>
                            <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                              {item.kelas}
                            </span>
                            {item.is_recently_scanned && (
                              <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-1.5 py-0.2 rounded-full animate-pulse border border-sky-200">
                                Baru Di-scan
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono font-medium text-slate-500 mt-0.5">
                            {item.kode_booking} &bull; {item.film_judul}
                          </p>
                        </div>

                        {/* Status Badge */}
                        <div className="text-right">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              item.is_session_today
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {item.is_session_today ? 'Hari Ini' : `Tgl ${item.tanggal}`}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                        <span>{item.nama_paket} ({item.jumlah_orang} Orang)</span>
                        <span className="font-semibold text-slate-800">Sesi {item.jam_mulai.substring(0, 5)} WIB</span>
                      </div>

                      {/* Direct One-Tap Action Buttons on Phone */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2">
                        <button
                          onClick={() => handleAccEntry(item.kode_booking)}
                          disabled={submitting}
                          className="flex-1 bg-slate-900 hover:bg-sky-900 text-white font-semibold text-xs py-2 px-3 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
                        >
                          <DoorOpen className="w-3.5 h-3.5" />
                          <span>Izinkan Masuk</span>
                        </button>

                        <button
                          onClick={() => {
                            setTargetDeclineCode(item.kode_booking);
                            setShowDeclineModal(true);
                          }}
                          disabled={submitting}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs py-2 px-3 rounded-lg border border-rose-200 transition-colors"
                        >
                          Tolak
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
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4 z-10 border border-slate-200"
            >
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-serif text-base font-semibold text-slate-900">
                  Tolak Akses Masuk
                </h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Silakan tuliskan alasan penolakan untuk tiket{' '}
                <span className="font-mono font-semibold text-slate-800">
                  {targetDeclineCode || previewData?.kode_booking}
                </span>.
              </p>
              <textarea
                rows={3}
                placeholder="Contoh: Bukan jadwal hari ini / Gelang rusak / Terlambat..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeclineModal(false);
                    setTargetDeclineCode(null);
                    setDeclineReason('');
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-2.5 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (targetDeclineCode) {
                      handleDeclineFromQueue();
                    } else {
                      handleGateDecision('DECLINE', declineReason);
                    }
                  }}
                  disabled={submitting || !declineReason.trim()}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-xl transition-colors shadow-sm"
                >
                  {submitting ? 'Memproses...' : 'Konfirmasi Tolak'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
