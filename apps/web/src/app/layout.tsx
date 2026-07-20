import type { Metadata } from 'next';
import { Barlow, JetBrains_Mono } from 'next/font/google';
import { ChunkLoadRecovery } from '@/components/chunk-load-recovery';
import './globals.css';

// DIN Pro substitute (see tailwind.config.ts): Barlow for UI, JetBrains Mono for config/CLI output.
const sans = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Check Point Migration Tool',
  description: 'Convert Cisco ASA, FTD, and Fortinet configurations to Check Point.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
        <ChunkLoadRecovery />
        {children}
      </body>
    </html>
  );
}
