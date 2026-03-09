import Link from 'next/link';
import { BookOpen } from 'lucide-react';

const docs = [
  { slug: 'user-guide', title: 'User Guide', description: 'Step-by-step conversion workflow' },
  { slug: 'user-admin-guide', title: 'User Admin Guide', description: 'Login, settings, and configuration' },
  { slug: 'process-flow', title: 'Process Flow', description: 'Conversion process and state flow' },
  { slug: 'architecture', title: 'Architecture', description: 'Module structure and pipeline' },
  { slug: 'mapping-support-matrix', title: 'Mapping Support Matrix', description: 'ASA → Check Point mapping details' },
  { slug: 'limitations', title: 'Limitations', description: 'Unsupported features and notes' },
  { slug: 'release-notes', title: 'Release Notes', description: 'Version history' },
  { slug: 'README', title: 'README', description: 'Quick start and project overview' },
];

export default function DocumentationPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <BookOpen className="w-7 h-7 text-cyan-400" />
        Documentation
      </h1>
      <p className="text-slate-400 mb-8">
        Reference guides and documentation for the Cisco ASA/FTD → Check Point converter.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {docs.map((doc) => (
          <Link
            key={doc.slug}
            href={`/documentation/${doc.slug}`}
            className="block p-5 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-cyan-500/50 hover:bg-slate-800 transition-colors"
          >
            <h2 className="font-semibold text-cyan-400 mb-1">{doc.title}</h2>
            <p className="text-sm text-slate-400">{doc.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
