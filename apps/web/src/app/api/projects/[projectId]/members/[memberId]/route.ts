import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getProjectAccess, canManageMembers } from '@/lib/project-access';

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);
const COOKIE_NAME = 'cisco2cp_session';

async function getCurrentUser(): Promise<{ username: string; userId?: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return { username: payload.username as string, userId: payload.userId as string | undefined };
  } catch {
    return null;
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  const { projectId, memberId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await getProjectAccess(projectId, user.username, user.userId);
  if (!canManageMembers(access)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json()) as { role?: string };
  if (!body.role || !['owner', 'admin', 'editor', 'viewer'].includes(body.role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const member = await prisma.projectMember.update({
    where: { id: memberId, projectId },
    data: { role: body.role },
    include: { user: { select: { id: true, username: true } } },
  });
  return NextResponse.json({ id: member.id, userId: member.userId, username: member.user.username, role: member.role });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  const { projectId, memberId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await getProjectAccess(projectId, user.username, user.userId);
  if (!canManageMembers(access)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.projectMember.delete({ where: { id: memberId, projectId } });
  return NextResponse.json({ ok: true });
}
