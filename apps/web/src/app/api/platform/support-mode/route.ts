/**
 * Platform admin support-mode entry.
 * Requires authenticated platform admin; creates time-limited PlatformAdminSession
 * and sets support session cookie. All support-mode actions are audited.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SignJWT } from 'jose';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin } from '@/lib/platform-admin-access';
import { writeAudit, getClientMeta } from '@/lib/audit';
import { getSupportSessionCookieName } from '@/lib/session-context';

const SUPPORT_DURATION_MINUTES = 30;
const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);

const bodySchema = z.object({
  targetTenantId: z.string().uuid(),
  justification: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const auth = { userId: admin.userId, username: admin.username };

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: body.targetTenantId },
  });
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + SUPPORT_DURATION_MINUTES);
  const meta = getClientMeta(req);

  const session = await prisma.platformAdminSession.create({
    data: {
      userId: admin.userId,
      mode: 'SUPPORT',
      status: 'ACTIVE',
      supportTargetTenantId: body.targetTenantId,
      expiresAt,
      justification: body.justification,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });

  const token = await new SignJWT({
    userId: admin.userId,
    sessionId: session.id,
    supportTargetTenantId: body.targetTenantId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .sign(SESSION_SECRET);

  await writeAudit({
    actorUserId: admin.userId,
    tenantId: body.targetTenantId,
    platformAdminSessionId: session.id,
    action: 'support_mode_entry',
    resourceType: 'PlatformAdminSession',
    resourceId: session.id,
    result: 'success',
    details: { justification: body.justification, targetTenant: tenant.name },
    ...meta,
  }).catch(() => {});

  const res = NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() });
  res.cookies.set(getSupportSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SUPPORT_DURATION_MINUTES * 60,
    path: '/',
  });
  return res;
}
