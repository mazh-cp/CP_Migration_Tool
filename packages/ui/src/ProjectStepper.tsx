'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { Check, Upload, FileSearch, Box, Shield, CheckCircle, Download, Network } from 'lucide-react';

const steps = [
  { id: 'import', label: 'Import', href: 'import', icon: Upload },
  { id: 'parse', label: 'Parse', href: 'parse', icon: FileSearch },
  { id: 'map-interfaces', label: 'Map Interfaces', href: 'map/interfaces', icon: Network },
  { id: 'map-objects', label: 'Map Objects', href: 'map/objects', icon: Box },
  { id: 'map-policy', label: 'Map Policy', href: 'map/policy', icon: Shield },
  { id: 'validate', label: 'Validate', href: 'validate', icon: CheckCircle },
  { id: 'export', label: 'Export', href: 'export', icon: Download },
];

export function ProjectStepper({
  projectId,
  projectName,
  status,
  warningCount = 0,
  completedSteps = [],
}: {
  projectId: string;
  projectName: string;
  status: string;
  warningCount?: number;
  completedSteps?: string[];
}) {
  const pathname = usePathname();
  const baseHref = `/projects/${projectId}`;

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-white">{projectName}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span
              className={clsx(
                'px-2 py-0.5 rounded text-xs font-medium',
                status === 'exported' && 'bg-green-500/20 text-green-400',
                status === 'validated' && 'bg-cyan-500/20 text-cyan-400',
                status === 'mapped' && 'bg-blue-500/20 text-blue-400',
                status === 'parsed' && 'bg-amber-500/20 text-amber-400',
                status === 'imported' && 'bg-slate-500/20 text-slate-400',
                status === 'draft' && 'bg-slate-500/20 text-slate-500'
              )}
            >
              {status}
            </span>
            {warningCount > 0 && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400">
                {warningCount} warnings
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {steps.map((step, idx) => {
          const href = `${baseHref}/${step.href}`;
          const isActive = pathname.includes(step.href);
          const isCompleted = completedSteps.includes(step.id);
          const Icon = step.icon;

          return (
            <Link
              key={step.id}
              href={href}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shrink-0',
                isActive && 'bg-cyan-600 text-white',
                !isActive && isCompleted && 'bg-slate-700 text-slate-300 hover:bg-slate-600',
                !isActive && !isCompleted && 'bg-slate-800 text-slate-500'
              )}
            >
              {isCompleted ? (
                <Check className="w-4 h-4" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">{step.label}</span>
              {idx < steps.length - 1 && (
                <span className="text-slate-600 ml-1">→</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
