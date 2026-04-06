import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { requireProjectAccess } from '@/lib/project-access';
import { executeParseJob } from '@/lib/parse-job';
import { pickLatestConfigArtifact } from '@/lib/project-artifacts';

/**
 * Parse runs in the background after we return 202 so load balancers / reverse proxies
 * (Azure AG, nginx) do not return 504 Gateway Timeout while large configs normalize.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = auth.session.tenantId;

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    include: { artifacts: { orderBy: { uploadedAt: 'desc' } } },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const configArtifact = pickLatestConfigArtifact(project.artifacts);
  if (!configArtifact?.content) {
    return NextResponse.json(
      {
        error:
          'No firewall configuration to parse. Import ASA, FTD, FortiGate, FortiManager, or Palo Alto XML first.',
      },
      { status: 400 }
    );
  }

  const existing = await prisma.job.findFirst({
    where: { projectId, type: 'parse', status: 'running' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return NextResponse.json(
      {
        jobId: existing.id,
        alreadyRunning: true,
        message: 'Parse already in progress for this project.',
      },
      { status: 202 }
    );
  }

  const job = await prisma.job.create({
    data: { projectId, tenantId, type: 'parse', status: 'running', startedAt: new Date() },
  });

  void executeParseJob(job.id, projectId, tenantId).catch((err) => {
    logger.error({ err, jobId: job.id, projectId }, 'executeParseJob unhandled rejection');
  });

  return NextResponse.json(
    {
      jobId: job.id,
      message: 'Parse started. Poll GET /api/projects/.../status?jobId= until job completes.',
    },
    { status: 202 }
  );
}
