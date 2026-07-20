import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess, canManageMembers } from '@/lib/project-access';
import { assertTenantAdminCanManageUser } from '@/lib/platform-user-guard';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  const { projectId, memberId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!canManageMembers(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json()) as { role?: string };
  if (!body.role || !['owner', 'admin', 'editor', 'viewer'].includes(body.role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const existingMember = await prisma.projectMember.findFirst({
    where: { id: memberId, projectId, project: { tenantId: auth.session.tenantId } },
    include: { user: { select: { id: true } } },
  });
  if (!existingMember) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const guard = await assertTenantAdminCanManageUser(auth.session, existingMember.userId);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const member = await prisma.projectMember.updateMany({
    where: {
      id: memberId,
      projectId,
      project: { tenantId: auth.session.tenantId },
    },
    data: { role: body.role },
  });
  if (member.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.projectMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { id: true, username: true } } },
  });
  return NextResponse.json(
    updated
      ? { id: updated.id, userId: updated.userId, username: updated.user.username, role: updated.role }
      : { ok: true }
  );
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  const { projectId, memberId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!canManageMembers(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const toRemove = await prisma.projectMember.findFirst({
    where: { id: memberId, projectId, project: { tenantId: auth.session.tenantId } },
    include: { user: { select: { id: true } } },
  });
  if (!toRemove) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const guard = await assertTenantAdminCanManageUser(auth.session, toRemove.userId);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const result = await prisma.projectMember.deleteMany({
    where: {
      id: memberId,
      projectId,
      project: { tenantId: auth.session.tenantId },
    },
  });
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
