'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const STORAGE_KEY = 'cinemanik_intro_seen';

type SplashStage = 'welcome' | 'cinemanik' | 'cta' | 'exit';

/**
 * Web Audio API procedural synthesis:
 * Ambient cinema swell when entering intro.
 */
function playAmbientAudio() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Sub-bass sweep
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(50, now);
    subOsc.frequency.exponentialRampToValueAtTime(70, now + 1.0);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 2.2);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.18, now + 0.35);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.4);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 2.5);

    // Ethereal chord shimmer
    const chordFreqs = [261.63, 392.0, 523.25, 659.25, 1046.5];
    const chordGain = ctx.createGain();
    chordGain.gain.setValueAtTime(0.001, now);
    chordGain.gain.linearRampToValueAtTime(0.12, now + 0.25);
    chordGain.gain.exponentialRampToValueAtTime(0.001, now + 2.4);
    chordGain.connect(ctx.destination);

    chordFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.03);
      osc.connect(chordGain);
      osc.start(now + i * 0.03);
      osc.stop(now + 2.5);
    });
  } catch {}
}

/**
 * Soft cinema chime on letsgooo exit
 */
function playExitAudio() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const freqs = [523.25, 783.99, 1046.5, 1318.51];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    gain.connect(ctx.destination);

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      osc.connect(gain);
      osc.start(now + idx * 0.04);
      osc.stop(now + 1.2);
    });
  } catch {}
}

const WELCOME_LETTERS = ['W', 'E', 'L', 'C', 'O', 'M', 'E', ' ', 'T', 'O'];

export function IntroSplash() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(true);
  const [stage, setStage] = useState<SplashStage>('welcome');

  const isAdminOrSecret =
    pathname?.startsWith('/admin') || pathname?.startsWith('/woylahpakcik');

  // Complete theater entrance and unmount overlay
  const completeIngress = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {}
    setActive(false);
  }, []);

  // Exit trigger (clicked "letsgooo" or hit Enter/Space)
  const triggerExit = useCallback(() => {
    if (stage === 'exit') return;
    setStage('exit');
    playExitAudio();
  }, [stage]);

  // Check initial seen state on mount
  useEffect(() => {
    setMounted(true);
    let seen = false;
    try {
      seen =
        sessionStorage.getItem(STORAGE_KEY) === '1' ||
        document.documentElement.hasAttribute('data-intro-skip');
    } catch {}

    if (seen) {
      setActive(false);
    } else {
      playAmbientAudio();
    }

    const onReplay = () => {
      setActive(false);
      setStage('welcome');
      try {
        sessionStorage.removeItem(STORAGE_KEY);
        document.documentElement.removeAttribute('data-intro-skip');
      } catch {}
      setTimeout(() => {
        setActive(true);
        playAmbientAudio();
      }, 50);
    };

    window.addEventListener('cinemanik:replay-intro', onReplay);
    return () => window.removeEventListener('cinemanik:replay-intro', onReplay);
  }, []);

  // Deterministic stage state machine
  useEffect(() => {
    if (!active || isAdminOrSecret) return;

    if (stage === 'welcome') {
      const timer = setTimeout(() => {
        setStage('cinemanik');
      }, reduceMotion ? 400 : 1900);
      return () => clearTimeout(timer);
    }

    if (stage === 'cinemanik') {
      const timer = setTimeout(() => {
        setStage('cta');
      }, reduceMotion ? 400 : 2100);
      return () => clearTimeout(timer);
    }

    if (stage === 'exit') {
      const timer = setTimeout(() => {
        completeIngress();
      }, reduceMotion ? 250 : 700);
      return () => clearTimeout(timer);
    }
  }, [active, completeIngress, isAdminOrSecret, reduceMotion, stage]);

  // Lock body scroll while overlay is active
  useEffect(() => {
    if (!active || isAdminOrSecret) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active, isAdminOrSecret]);

  // Keyboard shortcut listener (Enter/Space to advance or enter)
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        completeIngress();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (stage === 'cta') {
          triggerExit();
        } else if (stage === 'welcome' || stage === 'cinemanik') {
          setStage('cta');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, completeIngress, stage, triggerExit]);

  if (!mounted || isAdminOrSecret || !active) return null;

  return (
    <motion.div
      role="dialog"
      aria-label="Cinemanik Welcome Experience"
      data-intro-overlay=""
      initial={{ opacity: 1 }}
      animate={
        stage === 'exit'
          ? {
              opacity: 0,
              scale: 1.03,
              filter: 'blur(8px)',
              transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
            }
          : { opacity: 1, scale: 1, filter: 'blur(0px)' }
      }
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black select-none overflow-hidden"
    >
      {/* ============================================================== */}
      {/* 1. AMBIENT BACKLIGHT GLOW                                      */}
      {/* ============================================================== */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 0.35, scale: 1 }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
        className="absolute w-80 sm:w-[480px] h-80 sm:h-[480px] rounded-full bg-gradient-to-tr from-cyan-600/30 via-sky-500/20 to-transparent blur-[120px] pointer-events-none"
      />

      {/* ============================================================== */}
      {/* 2. SEQUENTIAL MOTION GRAPHIC STAGES (ONE-BY-ONE IN CENTER)     */}
      {/* ============================================================== */}
      <div className="relative z-20 flex flex-col items-center justify-center text-center max-w-2xl w-full px-6 min-h-[220px]">
        <AnimatePresence mode="wait">
          {/* ------------------------------------------------------------ */}
          {/* STAGE 1: "WELCOME TO" (Typewriting & Sliding Block Reveal)   */}
          {/* ------------------------------------------------------------ */}
          {stage === 'welcome' && (
            <motion.div
              key="stage-welcome"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: -24,
                filter: 'blur(10px)',
                transition: { duration: 0.5, ease: [0.7, 0, 0.84, 0] },
              }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center justify-center"
            >
              {/* Typewriter text container with sliding block reveal */}
              <div className="relative inline-flex items-center overflow-hidden py-1 px-3">
                {/* Sliding solid reveal block */}
                <motion.div
                  initial={{ x: '-105%' }}
                  animate={{ x: '105%' }}
                  transition={{ duration: 0.85, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-sky-300 to-white z-10 pointer-events-none"
                />

                {/* Character-by-character typewriter reveal */}
                <h2 className="font-sans text-xs sm:text-sm font-semibold uppercase text-cyan-300 tracking-[0.55em] flex items-center pl-[0.55em]">
                  {WELCOME_LETTERS.map((char, index) => (
                    <motion.span
                      key={`${char}-${index}`}
                      initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      transition={{
                        duration: 0.28,
                        delay: 0.22 + index * 0.07,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className={char === ' ' ? 'inline-block w-[0.6em]' : 'inline-block'}
                    >
                      {char}
                    </motion.span>
                  ))}

                  {/* Blinking cyan terminal cursor */}
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 1, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.75,
                      ease: 'linear',
                    }}
                    className="inline-block w-[2px] h-[1.1em] bg-cyan-300 ml-1.5 align-middle shadow-[0_0_8px_rgba(103,232,249,1)]"
                  />
                </h2>
              </div>

              {/* Minimal light beam underneath */}
              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 0.8 }}
                transition={{ duration: 0.8, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
                className="mt-4 h-[1px] w-28 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
              />
            </motion.div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* STAGE 2: "Cinemanik" (Overlays Center, Preserves Font/Color)  */}
          {/* ------------------------------------------------------------ */}
          {stage === 'cinemanik' && (
            <motion.div
              key="stage-cinemanik"
              initial={{ opacity: 0, y: 32, scale: 0.95, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{
                opacity: 0,
                scale: 1.08,
                filter: 'blur(16px)',
                y: -16,
                transition: { duration: 0.55, ease: [0.7, 0, 0.84, 0] },
              }}
              transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center justify-center"
            >
              {/* Kinetic upward mask reveal for title */}
              <div className="overflow-hidden pb-2">
                <motion.h1
                  initial={{ y: '110%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                  className="font-serif text-6xl sm:text-8xl lg:text-9xl text-white font-normal tracking-tight leading-[1.1]"
                >
                  Cine
                  <span className="italic font-serif font-light text-cyan-300 drop-shadow-[0_0_24px_rgba(103,232,249,0.5)]">
                    manik
                  </span>
                </motion.h1>
              </div>

              {/* Anamorphic expanding light flare divider */}
              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="mt-4 sm:mt-6 h-[1px] w-36 sm:w-56 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_16px_rgba(56,189,248,0.9)]"
              />
            </motion.div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* STAGE 3: "letsgooo" (Interactive CTA & Fadeout Exit)         */}
          {/* ------------------------------------------------------------ */}
          {stage === 'cta' && (
            <motion.div
              key="stage-cta"
              initial={{ opacity: 0, scale: 0.88, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{
                opacity: 0,
                scale: 1.05,
                filter: 'blur(10px)',
                transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
              }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex flex-col items-center justify-center"
            >
              {/* Ambient gravitational ring breathing behind the CTA */}
              <motion.div
                animate={{
                  scale: [1, 1.25, 1],
                  opacity: [0.25, 0.55, 0.25],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2.8,
                  ease: 'easeInOut',
                }}
                className="absolute -inset-6 rounded-full border border-cyan-400/30 blur-[1px] pointer-events-none"
              />

              {/* Single Centered Action Button ("letsgooo") */}
              <motion.button
                type="button"
                onClick={triggerExit}
                whileHover={!reduceMotion ? { scale: 1.05 } : undefined}
                whileTap={!reduceMotion ? { scale: 0.96 } : undefined}
                className="relative group overflow-hidden flex items-center justify-center gap-3 px-10 py-4 rounded-full bg-white text-black font-semibold text-sm sm:text-base tracking-wide shadow-[0_0_35px_rgba(255,255,255,0.35),0_0_70px_rgba(56,189,248,0.25)] hover:shadow-[0_0_55px_rgba(56,189,248,0.7)] transition-all cursor-pointer"
              >
                {/* Glowing laser sweep sheen */}
                <motion.div
                  animate={{ x: ['-120%', '220%'] }}
                  transition={{
                    repeat: Infinity,
                    duration: 2.4,
                    ease: 'easeInOut',
                    repeatDelay: 0.8,
                  }}
                  className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent skew-x-12 pointer-events-none"
                />

                <span className="relative z-10 font-sans tracking-wide">letsgooo</span>
                <ArrowRight className="relative z-10 w-4 h-4 text-black transition-transform group-hover:translate-x-1" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
