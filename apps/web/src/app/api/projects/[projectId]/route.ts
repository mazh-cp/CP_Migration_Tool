import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { artifacts: true, normalized: true, jobs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const artifacts = project.artifacts.map(({ content: _c, ...a }) => a);
  return NextResponse.json({ ...project, artifacts });
}
