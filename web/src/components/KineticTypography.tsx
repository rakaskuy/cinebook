'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  Variants,
} from 'framer-motion';

// =============================================================================
// 1. Scroll-Triggered Kinetic Word Mask Reveal
// =============================================================================
export function ScrollWordReveal({
  text,
  highlight,
  className = '',
  delay = 0,
}: {
  text: string;
  highlight?: string;
  className?: string;
  delay?: number;
}) {
  const words = text.split(' ');

  return (
    <motion.div
      role="heading"
      aria-level={1}
      aria-label={`${text} ${highlight || ''}`}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
      className={className}
    >
      <span className="flex flex-wrap items-baseline gap-x-2.5">
        {words.map((word, i) => (
          <span key={i} className="inline-block overflow-hidden pb-1">
            <motion.span
              aria-hidden
              variants={{
                hidden: { y: '115%', opacity: 0 },
                visible: {
                  y: '0%',
                  opacity: 1,
                  transition: {
                    duration: 0.6,
                    delay: delay + i * 0.045,
                    ease: [0.16, 1, 0.3, 1],
                  },
                },
              }}
              className="inline-block"
            >
              {word}
            </motion.span>
          </span>
        ))}
        {highlight && (
          <span className="inline-block overflow-hidden pb-1">
            <motion.span
              aria-hidden
              variants={{
                hidden: { y: '115%', opacity: 0 },
                visible: {
                  y: '0%',
                  opacity: 1,
                  transition: {
                    duration: 0.7,
                    delay: delay + words.length * 0.045,
                    ease: [0.16, 1, 0.3, 1],
                  },
                },
              }}
              className="italic font-serif font-normal bg-gradient-to-r from-sky-600 via-cyan-600 to-sky-700 bg-clip-text text-transparent inline-block"
            >
              {highlight}
            </motion.span>
          </span>
        )}
      </span>
    </motion.div>
  );
}

// =============================================================================
// 2. Scroll-Triggered Sliding Block Reveal
// Sweeps a colored gradient block across as the user scrolls into view
// =============================================================================
export function ScrollBlockReveal({
  children,
  className = '',
  blockColor = 'from-sky-400 to-cyan-300',
  duration = 0.75,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  blockColor?: string;
  duration?: number;
  delay?: number;
}) {
  return (
    <div className={`relative inline-block overflow-hidden ${className}`}>
      {/* Sliding block curtain */}
      <motion.div
        initial={{ x: '-105%' }}
        whileInView={{ x: '105%' }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
        className={`absolute inset-0 bg-gradient-to-r ${blockColor} z-20 pointer-events-none`}
      />
      {/* Target Content */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.3, delay: delay + duration * 0.3 }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// =============================================================================
// 3. Scroll-Triggered Typewriter Text
// Types out text automatically when scrolled into view with typing cursor
// =============================================================================
export function ScrollTypewriter({
  text,
  className = '',
  speed = 35,
  delay = 100,
}: {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
}) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-30px' });

  useEffect(() => {
    if (!isInView || hasStarted) return;
    setHasStarted(true);

    const timer = setTimeout(() => {
      setIsTyping(true);
      let currentIndex = 0;
      const interval = setInterval(() => {
        currentIndex++;
        setDisplayedText(text.slice(0, currentIndex));
        if (currentIndex >= text.length) {
          clearInterval(interval);
          setTimeout(() => setIsTyping(false), 500);
        }
      }, speed);
    }, delay);

    return () => clearTimeout(timer);
  }, [isInView, text, speed, delay, hasStarted]);

  return (
    <span ref={ref} aria-label={text} className={`inline-block ${className}`}>
      <span aria-hidden="true">
        {displayedText}
        {isTyping && (
          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-sky-500 animate-pulse align-middle" />
        )}
      </span>
    </span>
  );
}

// =============================================================================
// 4. Kinetic Section Title with Block Tag & Rising Headline
// =============================================================================
export function KineticSectionTitle({
  tag,
  title,
  subtitle,
  className = '',
}: {
  tag: string;
  title: string;
  subtitle: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Sliding block tag */}
      <div>
        <ScrollBlockReveal delay={0.05}>
          <p className="text-xs font-semibold text-sky-700 uppercase tracking-wider px-0.5">
            {tag}
          </p>
        </ScrollBlockReveal>
      </div>

      <div className="overflow-hidden pb-1">
        <motion.h2
          initial={{ y: '110%', opacity: 0 }}
          whileInView={{ y: '0%', opacity: 1 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.65, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="font-serif text-2xl sm:text-3xl text-slate-900 font-normal tracking-tight"
        >
          {title}
        </motion.h2>
      </div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed"
      >
        {subtitle}
      </motion.p>
    </div>
  );
}

// =============================================================================
// 5. 3D Perspective Card with Dynamic Cursor Avoidance / Repulsion Physics
// =============================================================================
export function Card3D({
  children,
  className = '',
  lift = -6,
  rotateX: legacyRotateX,
  rotateY: legacyRotateY,
  scale = 1.025,
  maxTilt = 12,
  repelDistance = 8,
  enableSheen = true,
}: {
  children: React.ReactNode;
  className?: string;
  lift?: number;
  rotateX?: number;
  rotateY?: number;
  scale?: number;
  maxTilt?: number;
  repelDistance?: number;
  enableSheen?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Koordinat kursor ternormalisasi dari tengah card: [-0.5, 0.5]
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Fisika spring yang responsif & mulus tanpa re-render pohon React
  const springConfig = { stiffness: 350, damping: 26, mass: 0.5 };
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);

  // Fisika "ngehindarin kursor" (Avoidance / Repulsion 3D):
  // Saat kursor di ATAS (mouseY < 0), tepi atas menunduk masuk ke dalam layar menjauhi kursor (rotateX > 0)
  // Saat kursor di BAWAH (mouseY > 0), tepi bawah menunduk masuk ke dalam layar (rotateX < 0)
  const actualTilt = legacyRotateX ? Math.max(Math.abs(legacyRotateX) * 3.5, 10) : maxTilt;
  const rotateXTransform = useTransform(springY, [-0.5, 0.5], [actualTilt, -actualTilt]);

  // Saat kursor di KIRI (mouseX < 0), tepi kiri menunduk masuk menjauhi kursor (rotateY < 0)
  // Saat kursor di KANAN (mouseX > 0), tepi kanan menunduk masuk menjauhi kursor (rotateY > 0)
  const rotateYTransform = useTransform(springX, [-0.5, 0.5], [-actualTilt, actualTilt]);

  // Translasi 2D menghindar (card sedikit bergeser/menyingkir menjauhi kursor)
  const translateXTransform = useTransform(springX, [-0.5, 0.5], [repelDistance, -repelDistance]);
  const translateYTransform = useTransform(springY, [-0.5, 0.5], [repelDistance, -repelDistance]);

  // Kilau cahaya dinamis (sheen) yang mengikuti posisi kursor
  const sheenX = useTransform(springX, [-0.5, 0.5], [0, 100]);
  const sheenY = useTransform(springY, [-0.5, 0.5], [0, 100]);
  const sheenBg = useMotionTemplate`radial-gradient(circle 280px at ${sheenX}% ${sheenY}%, rgba(255, 255, 255, 0.14), transparent 75%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const target = e.target as HTMLElement | null;
    const isInteractive = target?.closest('a, button, input, select, textarea, [role="button"]');
    if (isInteractive) {
      // Ketika kursor berada di atas tombol / tautan di dalam card,
      // redam translasi tolak (repel) agar tombol tetap stabil dan mudah diklik
      mouseX.set(0);
      mouseY.set(0);
      return;
    }
    const rect = cardRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const normX = (e.clientX - rect.left) / rect.width - 0.5;
    const normY = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(normX);
    mouseY.set(normY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="[perspective:1100px] h-full"
    >
      <motion.div
        style={{
          rotateX: rotateXTransform,
          rotateY: rotateYTransform,
          x: translateXTransform,
          y: translateYTransform,
          transformStyle: 'preserve-3d',
        }}
        whileHover={{
          scale,
          boxShadow: '0 24px 40px -12px rgba(8, 47, 73, 0.16)',
        }}
        transition={{
          type: 'spring',
          stiffness: 380,
          damping: 24,
        }}
        className={`h-full relative transition-shadow duration-300 cursor-default ${className}`}
      >
        {enableSheen && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 hover:opacity-100 transition-opacity duration-300"
            style={{
              background: sheenBg,
            }}
          />
        )}
        <div className="relative z-10 h-full flex flex-col [transform:translateZ(1px)]">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// 6. 3D Tactile Button with Spring Physics
// =============================================================================
export function Button3D({
  children,
  onClick,
  className = '',
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { y: -2.5, scale: 1.025, boxShadow: '0 12px 24px -6px rgba(8, 47, 73, 0.22)' } : undefined}
      whileTap={!disabled ? { y: 1, scale: 0.975 } : undefined}
      transition={{ type: 'spring', stiffness: 450, damping: 22 }}
      className={`cursor-pointer transition-colors ${className}`}
    >
      {children}
    </motion.button>
  );
}
