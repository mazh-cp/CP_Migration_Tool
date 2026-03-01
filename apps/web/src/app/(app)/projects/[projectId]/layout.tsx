'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProjectStepper } from '@cisco2cp/ui';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<{
    name: string;
    status: string;
    completedSteps: string[];
  } | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p) =>
        setProject({
          name: p.name,
          status: p.status,
          completedSteps: (() => {
            try {
              return typeof p.completedSteps === 'string' ? JSON.parse(p.completedSteps || '[]') : p.completedSteps || [];
            } catch {
              return [];
            }
          })(),
        })
      )
      .catch(() => setProject({ name: 'Project', status: 'draft', completedSteps: [] }));
  }, [projectId]);

  if (!project) {
    return <div className="animate-pulse h-32 bg-slate-800 rounded-xl mb-6" />;
  }

  return (
    <div>
      <ProjectStepper
        projectId={projectId}
        projectName={project.name}
        status={project.status}
        warningCount={0}
        completedSteps={project.completedSteps}
      />
      {children}
    </div>
  );
}
