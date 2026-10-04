'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAdminOrSecret = pathname?.startsWith('/admin') || pathname?.startsWith('/woylahpakcik');

  // Prevent layout flash before hydration
  if (!mounted) {
    return <main className="flex-1 relative z-10">{children}</main>;
  }

  if (isAdminOrSecret) {
    return <main className="flex-1 relative z-10">{children}</main>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 relative z-10">{children}</main>
      <Footer />
    </>
  );
}
