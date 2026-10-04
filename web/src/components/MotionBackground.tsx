'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface Flake {
  x: number;
  y: number;
  r: number;
  vy: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  alpha: number;
  color: string;
}

const FLAKE_COLORS = ['#FFFFFF', '#E0F2FE', '#BAE6FD', '#7DD3FC', '#38BDF8'];

function spawnFlakes(count: number, w: number, h: number): Flake[] {
  return Array.from({ length: count }, () => {
    const r = 1.0 + Math.random() * 2.2;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r,
      vy: 12 + Math.random() * 36,
      swayAmp: 6 + Math.random() * 20,
      swayFreq: 0.2 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.2 + Math.random() * 0.4,
      color: FLAKE_COLORS[Math.floor(Math.random() * FLAKE_COLORS.length)],
    };
  });
}

export function SnowfallCanvas({
  density = 0.8,
  className = 'pointer-events-none absolute inset-0 h-full w-full',
}: {
  density?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let running = true;
    let last = performance.now();
    let w = 0;
    let h = 0;
    let flakes: Flake[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(20, Math.min(110, Math.round(((w * h) / 22000) * density)));
      flakes = spawnFlakes(count, w, h);
      if (reduceMotion) drawFrame(performance.now() / 1000);
    };

    const drawFrame = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        const x = f.x + Math.sin(t * f.swayFreq + f.phase) * f.swayAmp;
        if (f.r > 2.0) {
          ctx.globalAlpha = f.alpha * 0.2;
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(x, f.y, f.r * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = f.alpha;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const step = (now: number) => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;
      for (const f of flakes) {
        f.y += f.vy * dt;
        if (f.y - f.r * 2.4 > h) {
          f.y = -f.r * 2.4;
          f.x = Math.random() * w;
        }
      }
      drawFrame(t);
      raf = requestAnimationFrame(step);
    };

    resize();
    window.addEventListener('resize', resize);

    if (reduceMotion) {
      // static frame
    } else {
      raf = requestAnimationFrame(step);
    }

    const onVisibility = () => {
      const next = !document.hidden && !reduceMotion;
      if (next && !running) last = performance.now();
      running = next;
      if (running) raf = requestAnimationFrame(step);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
    />
  );
}

export function MotionBackground() {
  const pathname = usePathname();
  const isAdminOrSecret =
    pathname?.startsWith('/admin') || pathname?.startsWith('/woylahpakcik');

  if (isAdminOrSecret) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden opacity-50"
    >
      {/* Layer 1 — Aurora borealis drift (GPU transform keyframes) */}
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />

      {/* Layer 2 — Falling snow canvas */}
      <SnowfallCanvas density={0.7} />

      {/* Layer 3 — Subtle ambient frosted accents */}
      <div className="absolute top-1/4 -right-16 w-80 h-80 rounded-full bg-cyan-200/20 blur-3xl" />
      <div className="absolute bottom-1/4 -left-16 w-80 h-80 rounded-full bg-sky-200/25 blur-3xl" />
    </div>
  );
}
