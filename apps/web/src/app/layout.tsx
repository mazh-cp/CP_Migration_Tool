import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cisco → Check Point Converter',
  description: 'Convert Cisco ASA/FTD configs to Check Point',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
