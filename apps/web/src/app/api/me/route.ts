import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/project-access';
import { hashPassword, revokeAllSessionsForUser } from '@/lib/auth';
import { getPasswordViolations, PASSWORD_MAX_LENGTH } from '@/lib/password-policy';
import { writeAudit, getClientMeta } from '@/lib/audit';

const patchMeSchema = z
  .object({
    email: z.union([z.string().email(), z.literal('')]).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH).optional(),
  })
  .strict();

export async function GET() {
  const session = await requireTenantSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    username: session.username,
    userId: session.userId,
    tenantId: session.tenantId,
    role: session.role,
    email: session.email,
    isAdmin: session.role === 'admin',
    isPlatformAdmin: session.isPlatformAdmin,
  });
}

export async function PATCH(req: Request) {
  const session = await requireTenantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: z.infer<typeof patchMeSchema>;
  try {
    body = patchMeSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const hasPasswordChange = body.newPassword != null && body.newPassword.length > 0;
  if (hasPasswordChange) {
    if (!body.currentPassword) {
      return NextResponse.json({ error: 'Current password is required to set a new password' }, { status: 400 });
    }
    const violations = getPasswordViolations(body.newPassword!, { username: user.username });
    if (violations.length > 0) {
      return NextResponse.json(
        { error: 'Password does not meet complexity requirements', requirements: violations },
        { status: 400 }
      );
    }
    const match = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!match) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }
    if (body.currentPassword === body.newPassword) {
      return NextResponse.json({ error: 'New password must differ from the current password' }, { status: 400 });
    }
  }

  if (body.email !== undefined) {
    const normalized = body.email.trim() === '' ? null : body.email.trim();
    if (normalized) {
      const taken = await prisma.user.findFirst({
        where: { email: normalized, NOT: { id: session.userId } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json({ error: 'Email is already in use' }, { status: 409 });
      }
    }
  }

  const data: {
    passwordHash?: string;
    email?: string | null;
    passwordChangedByUser?: boolean;
    passwordChangedAt?: Date;
  } = {};
  if (hasPasswordChange && body.newPassword) {
    data.passwordHash = await hashPassword(body.newPassword);
    // Mark that this account now has a user-set password so the env
    // AUTH_PASSWORD bootstrap can no longer override or log in.
    data.passwordChangedByUser = true;
    // JWTs issued before this moment are rejected unless backed by a
    // still-ACTIVE UserSession (the caller's own session is spared below).
    data.passwordChangedAt = new Date();
  }
  if (body.email !== undefined) {
    data.email = body.email.trim() === '' ? null : body.email.trim();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data,
    select: { id: true, username: true, email: true },
  });

  if (hasPasswordChange) {
    // Invalidate all other sessions so a compromised session cannot outlive a
    // password reset; keep the caller's current session.
    const currentSessionId = session.sessionId === 'legacy' ? undefined : session.sessionId;
    await revokeAllSessionsForUser(session.userId, currentSessionId);
    const meta = getClientMeta(req);
    await writeAudit({
      actorUserId: session.userId,
      tenantId: session.tenantId,
      action: 'password.change',
      resourceType: 'user',
      resourceId: session.userId,
      result: 'success',
      ...meta,
    }).catch(() => {});
  }

  return NextResponse.json(updated);
}
