import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  createTenantSession,
  getSessionCookieName,
  validateSsoRedirect,
  findOrCreateUserBySsoId,
} from '@/lib/auth';
import { writeAudit, getClientMeta } from '@/lib/audit';

/** SSO callback: 3rd party redirects with sso_id (opaque ID), tenant, optional sig+ts. */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const params = {
    sso_id: searchParams.get('sso_id') ?? '',
    tenant: searchParams.get('tenant') ?? 'default',
    ts: searchParams.get('ts') ?? '',
    sig: searchParams.get('sig') ?? '',
    return_url: searchParams.get('return_url') ?? '',
  };

  const meta = getClientMeta(req);
  const baseUrl = req.nextUrl.origin;
  const safeReturn = params.return_url?.startsWith('/') ? params.return_url : '/dashboard';

  const err = validateSsoRedirect(params);
  if (err) {
    await writeAudit({
      actorUserId: 'anonymous',
      action: 'sso_callback',
      resourceType: 'auth',
      resourceId: null,
      result: 'failure',
      details: { reason: err, method: 'sso_url' },
      ...meta,
    }).catch(() => {});
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(err)}`, baseUrl));
  }

  const ssoId = params.sso_id.trim();
  const tenantSlug = params.tenant.trim() || 'default';

  const result = await findOrCreateUserBySsoId(ssoId, tenantSlug, true);
  if (!result) {
    await writeAudit({
      actorUserId: 'anonymous',
      action: 'sso_callback',
      resourceType: 'auth',
      resourceId: null,
      result: 'failure',
      details: { reason: 'user_not_found', method: 'sso_url' },
      ...meta,
    }).catch(() => {});
    return NextResponse.redirect(new URL('/login?error=User+not+found', baseUrl));
  }

  try {
    const token = await createTenantSession(
      result.userId,
      result.username,
      result.tenantId,
      meta.ipAddress,
      meta.userAgent
    );
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
      details: { method: 'sso_url', username: result.username },
      ...meta,
    }).catch(() => {});
    return NextResponse.redirect(new URL(safeReturn, baseUrl));
  } catch (e) {
    await writeAudit({
      actorUserId: 'anonymous',
      action: 'sso_callback',
      resourceType: 'auth',
      resourceId: null,
      result: 'failure',
      details: { reason: 'session_creation_failed', method: 'sso_url' },
      ...meta,
    }).catch(() => {});
    return NextResponse.redirect(new URL('/login?error=Session+creation+failed', baseUrl));
  }
}
