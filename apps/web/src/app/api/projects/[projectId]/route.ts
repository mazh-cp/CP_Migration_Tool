import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canManageMembers, requireProjectAccess } from '@/lib/project-access';
import { logger } from '@/lib/logger';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: auth.session.tenantId },
    include: { artifacts: true, normalized: true, jobs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const artifacts = project.artifacts.map(({ content: _c, ...a }) => a);
  return NextResponse.json({ ...project, artifacts });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!canManageMembers(auth.role)) {
    return NextResponse.json({ error: 'Only owner/admin can delete projects' }, { status: 403 });
  }

  try {
    const deleted = await prisma.project.deleteMany({
      where: { id: projectId, tenantId: auth.session.tenantId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    logger.info({ projectId, actorUserId: auth.session.userId }, 'Project deleted');
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err, projectId }, 'Failed to delete project');
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
