import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, getProjectAccess } from '@/lib/project-access';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await getProjectAccess(projectId, user.username, user.userId);
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { artifacts: true, normalized: true, jobs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const artifacts = project.artifacts.map(({ content: _c, ...a }) => a);
  return NextResponse.json({ ...project, artifacts });
}
