import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <p className="text-slate-400 mb-6">
        Welcome to the Cisco ASA/FTD to Check Point conversion tool. Create a project to get started.
      </p>
      <Link
        href="/projects/new"
        className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-medium"
      >
        Create New Project
      </Link>
    </div>
  );
}
