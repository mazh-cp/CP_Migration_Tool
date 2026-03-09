import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CP Migration Tool',
  description: 'Cisco ASA/FTD to Check Point firewall migration',
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
