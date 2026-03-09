'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FolderKanban } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  sourceType: string;
  status: string;
  updatedAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : []))
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-medium"
        >
          <Plus className="w-5 h-5" />
          New Project
        </Link>
      </div>

      <div className="grid gap-4">
        {projects.length === 0 && (
          <div className="border border-dashed border-slate-600 rounded-xl p-12 text-center text-slate-400">
            <FolderKanban className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No projects yet. Create one to start converting configurations.</p>
            <Link href="/projects/new" className="text-cyan-400 hover:underline mt-2 inline-block">
              Create project
            </Link>
          </div>
        )}
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}/import`}
            className="block p-6 bg-slate-800/50 rounded-xl border border-slate-700 hover:border-cyan-500/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">{p.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                    {p.sourceType}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      p.status === 'exported'
                        ? 'bg-green-500/20 text-green-400'
                        : p.status === 'parsed'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-slate-600 text-slate-300'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              </div>
              <span className="text-sm text-slate-500">
                {new Date(p.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
