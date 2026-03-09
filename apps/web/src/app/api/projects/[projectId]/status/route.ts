import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { jobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    status: project.status,
    currentStep: project.currentStep,
    completedSteps: JSON.parse(project.completedSteps || '[]'),
    latestJob: project.jobs[0] || null,
  });
}
