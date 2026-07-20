import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center animate-fade-in">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-brand">
        <ShieldCheck className="h-8 w-8" aria-hidden />
      </span>
      <h1 className="mb-3 text-3xl font-semibold tracking-tight text-white">Check Point Migration Tool</h1>
      <p className="mb-8 max-w-md text-slate-400">
        Move Cisco ASA, FTD, and Fortinet configurations to Check Point. Import, parse, map, validate, and export — one
        guided path.
      </p>
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 font-medium text-white shadow-sm transition-colors hover:bg-brand-400"
      >
        Go to projects
      </Link>
    </div>
  );
}
