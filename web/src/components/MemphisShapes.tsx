'use client';

import React from 'react';

export function MemphisSquiggle({ className = 'text-sky-500' }: { className?: string }) {
  return (
    <svg className={`w-16 h-8 inline-block ${className}`} viewBox="0 0 80 40" fill="none">
      <path
        d="M5 20 Q 20 5, 35 20 T 65 20 T 95 20"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MemphisBadge({
  children,
  color = 'bg-sky-400 text-glacier-navy',
  rotate = 'rotate-[-2deg]',
}: {
  children: React.ReactNode;
  color?: string;
  rotate?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-black text-xs uppercase tracking-wider px-3 py-1 border-3 border-glacier-navy rounded-xl shadow-hard-sm ${color} ${rotate}`}
    >
      {children}
    </span>
  );
}
