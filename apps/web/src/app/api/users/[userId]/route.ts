import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/project-access';

const ALLOWED_TENANT_ROLES = ['admin', 'member', 'viewer'] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await requireTenantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId } = await params;
  let body: { role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const role = body.role;
  if (!role || !ALLOWED_TENANT_ROLES.includes(role as (typeof ALLOWED_TENANT_ROLES)[number])) {
    return NextResponse.json(
      { error: 'Invalid role. Use one of: admin, member, viewer' },
      { status: 400 }
    );
  }

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: session.tenantId, userId } },
    include: { user: { select: { id: true, username: true } } },
  });
  if (!membership || membership.status !== 'active') {
    return NextResponse.json({ error: 'User not found in this tenant' }, { status: 404 });
  }

  await prisma.tenantMembership.update({
    where: { id: membership.id },
    data: { role },
  });

  return NextResponse.json({
    id: membership.user.id,
    username: membership.user.username,
    tenantRole: role,
  });
}
