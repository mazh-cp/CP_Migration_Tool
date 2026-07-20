'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Users, CalendarDays, FolderCheck, FolderKanban, RefreshCw } from 'lucide-react';
import { Button, PageHeader } from '@cisco2cp/ui';

type DashboardStats = {
  activeUsersLast7Days: number;
  activeUsersLast30Days: number;
  completedProjects: number;
  totalProjects: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/dashboard/stats');
      const j = (await r.json().catch(() => ({}))) as DashboardStats & { error?: string };
      if (!r.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Could not load dashboard stats');
        setStats(null);
        return;
      }
      setStats({
        activeUsersLast7Days: j.activeUsersLast7Days ?? 0,
        activeUsersLast30Days: j.activeUsersLast30Days ?? 0,
        completedProjects: j.completedProjects ?? 0,
        totalProjects: j.totalProjects ?? 0,
      });
    } catch {
      setError('Could not load dashboard stats');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dashboard"
        description="Your workspace at a glance. Activity reflects user sessions; a project counts as completed once it has a successful export."
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {error && (
        <p className="mb-6 text-sm text-danger border border-danger/30 rounded-lg px-4 py-3 bg-danger/10">{error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-10">
        <StatCard
          title="Active users (7 days)"
          value={stats?.activeUsersLast7Days}
          loading={loading}
          icon={Users}
          accent="cyan"
          subtitle="Distinct users with session activity in the last week"
        />
        <StatCard
          title="Active users (30 days)"
          value={stats?.activeUsersLast30Days}
          loading={loading}
          icon={CalendarDays}
          accent="violet"
          subtitle="Distinct users with session activity in the last month"
        />
        <StatCard
          title="Completed projects"
          value={stats?.completedProjects}
          loading={loading}
          icon={FolderCheck}
          accent="emerald"
          subtitle={
            stats != null
              ? `${stats.completedProjects} of ${stats.totalProjects} projects exported`
              : 'Projects with at least one successful export'
          }
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-400"
        >
          <FolderKanban className="w-4 h-4" />
          Create new project
        </Link>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
        >
          View all projects
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  loading,
  icon: Icon,
  accent,
  subtitle,
}: {
  title: string;
  value: number | undefined;
  loading: boolean;
  icon: LucideIcon;
  accent: 'cyan' | 'violet' | 'emerald';
  subtitle: string;
}) {
  const ring =
    accent === 'cyan'
      ? 'from-brand-400/20 to-brand-400/5 border-brand-400/30'
      : accent === 'violet'
        ? 'from-violet-500/20 to-violet-500/5 border-violet-500/30'
        : 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30';
  const iconBg =
    accent === 'cyan'
      ? 'bg-brand-400/15 text-brand-300'
      : accent === 'violet'
        ? 'bg-violet-500/15 text-violet-300'
        : 'bg-emerald-500/15 text-emerald-400';

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br p-6 transition-transform hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-900/20 ${ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="mt-3 text-4xl font-bold tabular-nums text-white tracking-tight">
            {loading ? (
              <span className="inline-block h-10 w-16 animate-pulse rounded bg-slate-700" aria-hidden />
            ) : (
              (value ?? 0).toLocaleString()
            )}
          </p>
        </div>
        <div className={`rounded-lg p-2.5 ${iconBg}`}>
          <Icon className="w-6 h-6" aria-hidden />
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-500 leading-relaxed">{subtitle}</p>
    </div>
  );
}
