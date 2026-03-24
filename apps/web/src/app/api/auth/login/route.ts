import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createTenantSession, createSession, verifyCredentials, getSessionCookieName } from '@/lib/auth';
import { writeAudit, getClientMeta } from '@/lib/audit';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const { username, password } = (await req.json()) as { username?: string; password?: string };
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }
    const result = await verifyCredentials(username, password);
    const meta = getClientMeta(req);
    if (!result) {
      await writeAudit({
        actorUserId: 'anonymous',
        action: 'login',
        resourceType: 'auth',
        resourceId: null,
        result: 'failure',
        details: { reason: 'invalid_credentials', username },
        ...meta,
      }).catch(() => {});
      logger.warn(
        {
          username,
          authEnvSet: !!(process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD),
        },
        'Login failed'
      );
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    let token: string;
    try {
      token = await createTenantSession(
        result.userId,
        result.username,
        result.tenantId,
        meta.ipAddress ?? undefined,
        meta.userAgent ?? undefined
      );
    } catch (sessionErr) {
      logger.warn({ err: sessionErr, userId: result.userId }, 'createTenantSession failed, using legacy session');
      token = await createSession(result.username, result.userId, result.isAdmin);
    }
    const cookieStore = await cookies();
    const secureCookie = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';
    cookieStore.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    await writeAudit({
      actorUserId: result.userId,
      tenantId: result.tenantId,
      action: 'login',
      resourceType: 'auth',
      resourceId: result.userId,
      result: 'success',
      details: { username },
      ...meta,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Login failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
