import type { Metadata } from 'next';
import './globals.css';
import { MotionBackground } from '@/components/MotionBackground';
import { IntroSplash } from '@/components/IntroSplash';
import { AppChrome } from '@/components/AppChrome';

export const metadata: Metadata = {
  title: 'Cinemanik 2026: Festival Bioskop Es & Gletser SMAN 1 Kendal',
  description: 'Pesan tiket film bertema gletser es kegiatan OSIS SMA Negeri 1 Kendal secara instan dengan E-Ticket QR kristal terverifikasi, bayar offline ke panitia.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen flex flex-col bg-[#F0F7FF] antialiased selection:bg-cyan-300 selection:text-glacier-navy">
        {/* Anti-FOUC guard: hide the intro overlay pre-paint for visitors who
            already saw it this session (removed again once React unmounts it). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(sessionStorage.getItem('cinemanik_intro_seen')==='1')document.documentElement.setAttribute('data-intro-skip','1')}catch(e){}",
          }}
        />
        <MotionBackground />
        <IntroSplash />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
