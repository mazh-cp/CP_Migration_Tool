import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';
import { getNormalizedCounts } from '@/lib/normalized-counts';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = auth.session.tenantId;

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');

  if (jobId) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, projectId },
    });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    let parseCounts: Awaited<ReturnType<typeof getNormalizedCounts>> | undefined;
    if (job.type === 'parse' && job.status === 'completed') {
      parseCounts = (await getNormalizedCounts(projectId, tenantId)) ?? undefined;
    }

    return NextResponse.json({
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
      },
      ...(parseCounts ? { parseCounts } : {}),
    });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
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
