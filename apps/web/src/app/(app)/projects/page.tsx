'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FolderKanban, Trash2 } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  sourceType: string;
  status: string;
  updatedAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : []))
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  async function handleDelete(project: Project) {
    if (!confirm(`Delete project "${project.name}"? This cannot be undone.`)) return;
    setDeletingProjectId(project.id);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (!res.ok) {
        alert('Failed to delete project');
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err) {
      alert('Error: ' + (err as Error).message);
    } finally {
      setDeletingProjectId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 rounded-lg font-medium"
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
            <Link href="/projects/new" className="text-brand-300 hover:underline mt-2 inline-block">
              Create project
            </Link>
          </div>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className="p-6 bg-slate-800/50 rounded-xl border border-slate-700 hover:border-brand-400/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Link href={`/projects/${p.id}/import`} className="font-semibold text-white hover:text-brand-200">
                  {p.name}
                </Link>
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
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  disabled={deletingProjectId === p.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-red-300 hover:text-red-200 hover:bg-danger/10 disabled:opacity-50"
                  title="Delete project"
                >
                  <Trash2 className="w-4 h-4" />
                  {deletingProjectId === p.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
