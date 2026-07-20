'use client';

import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { PageHeader, EmptyState } from '@cisco2cp/ui';

export default function ReportsPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reports"
        description="Conversion quality summaries, warning trends, and per-project migration coverage."
      />
      <EmptyState
        icon={BarChart3}
        title="No reports yet"
        description="Run a migration to generate a conversion report. Quality summaries and warning trends will appear here once a project completes."
        action={
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
          >
            Go to projects
          </Link>
        }
      />
    </div>
  );
}
