import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h1 className="text-3xl font-bold mb-4">Cisco → Check Point</h1>
      <p className="text-slate-400 mb-8 text-center max-w-md">
        Convert Cisco ASA and FTD configurations to Check Point equivalents. Import, parse, map, validate, and export.
      </p>
      <Link
        href="/projects"
        className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-medium"
      >
        Go to Projects
      </Link>
    </div>
  );
}
