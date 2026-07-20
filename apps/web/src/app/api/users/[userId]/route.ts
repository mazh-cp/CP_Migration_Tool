import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/project-access';
import { assertTenantAdminCanManageUser } from '@/lib/platform-user-guard';
import { hashPassword, revokeAllSessionsForUser } from '@/lib/auth';
import { getPasswordViolations, PASSWORD_MAX_LENGTH } from '@/lib/password-policy';
import { writeAudit, getClientMeta } from '@/lib/audit';

const ALLOWED_TENANT_ROLES = ['admin', 'member', 'viewer'] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await requireTenantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId } = await params;
  const guard = await assertTenantAdminCanManageUser(session, userId);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  let body: { role?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const role = body.role;
  const password = body.password;
  const hasRole = role !== undefined;
  const hasPassword = typeof password === 'string' && password.length > 0;

  if (!hasRole && !hasPassword) {
    return NextResponse.json({ error: 'Provide a role and/or a new password' }, { status: 400 });
  }
  if (hasRole && !ALLOWED_TENANT_ROLES.includes(role as (typeof ALLOWED_TENANT_ROLES)[number])) {
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

  if (hasPassword) {
    if (password!.length > PASSWORD_MAX_LENGTH) {
      return NextResponse.json({ error: 'Password does not meet complexity requirements' }, { status: 400 });
    }
    const violations = getPasswordViolations(password!, { username: membership.user.username });
    if (violations.length > 0) {
      return NextResponse.json(
        { error: 'Password does not meet complexity requirements', requirements: violations },
        { status: 400 }
      );
    }
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(password!),
        passwordChangedByUser: true,
        // Invalidate all JWTs issued before this reset (no session is spared).
        passwordChangedAt: new Date(),
      },
    });
    // Force re-login everywhere for the reset account.
    await revokeAllSessionsForUser(userId);
    const meta = getClientMeta(req);
    await writeAudit({
      actorUserId: session.userId,
      tenantId: session.tenantId,
      action: 'password.reset',
      resourceType: 'user',
      resourceId: userId,
      result: 'success',
      ...meta,
    }).catch(() => {});
  }

  if (hasRole) {
    await prisma.tenantMembership.update({
      where: { id: membership.id },
      data: { role },
    });
  }

  return NextResponse.json({
    id: membership.user.id,
    username: membership.user.username,
    tenantRole: hasRole ? role : membership.role,
    passwordReset: hasPassword || undefined,
  });
}
