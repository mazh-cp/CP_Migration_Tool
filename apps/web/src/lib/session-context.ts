/**
 * Session-bound tenant resolution.
 * Tenant identity MUST come only from validated server-side session state.
 * Never use request parameters, body, query, headers, or client state for tenant identity.
 */

import { cookies } from 'next/headers';
import { prisma } from './prisma';

const SESSION_COOKIE_NAME = 'cisco2cp_session';
const SUPPORT_SESSION_COOKIE_NAME = 'cisco2cp_support_session';

export type TenantSession = {
  userId: string;
  tenantId: string;
  sessionId: string;
  role: string;
  username: string;
  email: string | null;
  /** Env / primary administrator account (`User.isPlatformAdmin`). */
  isPlatformAdmin: boolean;
};

export type PlatformAdminSessionContext = {
  userId: string;
  sessionId: string;
  mode: 'SUPPORT';
  supportTargetTenantId: string;
  username: string;
  expiresAt: Date;
};

/**
 * Rejects JWTs issued before the user's last password change/reset, unless the
 * token is backed by a still-ACTIVE UserSession (i.e. the caller's own session
 * that was deliberately spared during revocation).
 */
async function isTokenStaleAfterPasswordChange(
  userId: string,
  passwordChangedAt: Date | null,
  issuedAtSeconds: number | undefined,
  sessionToken: string | undefined
): Promise<boolean> {
  if (!passwordChangedAt) return false;
  if (issuedAtSeconds != null && issuedAtSeconds * 1000 >= passwordChangedAt.getTime()) {
    return false;
  }
  if (sessionToken) {
    const session = await prisma.userSession.findUnique({
      where: { sessionToken },
      select: { userId: true, status: true, revokedAt: true, expiresAt: true },
    });
    if (
      session &&
      session.userId === userId &&
      session.status === 'ACTIVE' &&
      !session.revokedAt &&
      new Date() <= session.expiresAt
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Validates auth cookie. If cookie is a JWT (legacy or platform-admin), returns user from payload.
 * Does NOT load UserSession; use requireTenantSession for tenant-bound access.
 */
export async function requireAuthSession(): Promise<{
  userId: string;
  username: string;
  email: string | null;
  isPlatformAdmin: boolean;
  isInternalSupport: boolean;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const { jwtVerify } = await import('jose');
  const secret = getSessionSecret();
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.userId as string | undefined;
    const username = payload.username as string | undefined;
    if (!userId || !username) return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        isPlatformAdmin: true,
        isInternalSupportIdentity: true,
        passwordChangedAt: true,
      },
    });
    if (!user) return null;
    const stale = await isTokenStaleAfterPasswordChange(
      userId,
      user.passwordChangedAt,
      payload.iat,
      typeof payload.sessionToken === 'string' ? payload.sessionToken : undefined
    );
    if (stale) return null;
    return {
      userId,
      username,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
      isInternalSupport: user.isInternalSupportIdentity,
    };
  } catch {
    return null;
  }
}

/**
 * Validates auth, loads UserSession from DB, ensures ACTIVE and not expired/revoked.
 * Returns tenant-bound context. Tenant identity comes ONLY from UserSession.
 * Cookie may be: (1) sessionToken (opaque) -> lookup UserSession, or (2) JWT with sessionToken -> lookup UserSession.
 */
export async function requireTenantSession(): Promise<TenantSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const { jwtVerify } = await import('jose');
  const secret = getSessionSecret();
  let sessionToken: string;
  let userIdFromJwt: string | undefined;
  let issuedAtSeconds: number | undefined;
  // True when the JWT was issued with a DB-backed session token; such cookies
  // MUST validate against an ACTIVE UserSession and never use the JWT fallback.
  let jwtHasSessionToken = false;
  try {
    const { payload } = await jwtVerify(token, secret);
    jwtHasSessionToken = typeof payload.sessionToken === 'string' && payload.sessionToken.length > 0;
    sessionToken = (payload.sessionToken as string) ?? token;
    userIdFromJwt = payload.userId as string | undefined;
    issuedAtSeconds = payload.iat;
  } catch {
    sessionToken = token;
  }

  const session = await prisma.userSession.findUnique({
    where: { sessionToken },
    include: { user: { select: { username: true, email: true, isPlatformAdmin: true } }, tenant: true },
  });
  if (
    session &&
    session.status === 'ACTIVE' &&
    !session.revokedAt &&
    new Date() <= session.expiresAt &&
    (userIdFromJwt == null || session.userId === userIdFromJwt)
  ) {
    const membership = await prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: { tenantId: session.tenantId, userId: session.userId },
      },
    });
    if (membership && membership.status === 'active') {
      const touchThresholdMs = 10 * 60 * 1000;
      if (Date.now() - session.lastSeenAt.getTime() > touchThresholdMs) {
        void prisma.userSession
          .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
          .catch(() => {});
      }
      return {
        userId: session.userId,
        tenantId: session.tenantId,
        sessionId: session.id,
        role: membership.role,
        username: session.user.username,
        email: session.user.email,
        isPlatformAdmin: session.user.isPlatformAdmin,
      };
    }
  }

  // A cookie issued with a DB session token whose session is missing, revoked,
  // or expired is dead — never fall back to JWT-only auth for it. Otherwise a
  // stolen cookie would outlive password change / session revocation.
  if (jwtHasSessionToken) return null;

  // Fallback: legacy JWT (no session token) with userId (e.g. env admin cookie
  // issued before tenant sessions existed). Resolve tenant from the user's
  // primary membership. Reject tokens issued before the last password change.
  const userId = userIdFromJwt;
  if (userId) {
    const membership = await prisma.tenantMembership.findFirst({
      where: { userId, isPrimary: true, status: 'active' },
      include: {
        user: { select: { username: true, email: true, isPlatformAdmin: true, passwordChangedAt: true } },
      },
    });
    if (membership) {
      const stale = await isTokenStaleAfterPasswordChange(
        userId,
        membership.user.passwordChangedAt,
        issuedAtSeconds,
        undefined
      );
      if (stale) return null;
      return {
        userId: membership.userId,
        tenantId: membership.tenantId,
        sessionId: 'legacy',
        role: membership.role,
        username: membership.user.username,
        email: membership.user.email,
        isPlatformAdmin: membership.user.isPlatformAdmin,
      };
    }
  }
  return null;
}

/**
 * For platform admin support mode: validates support session cookie and returns context.
 * Used only for support-mode operations; never for normal tenant APIs.
 */
export async function requirePlatformAdminSession(): Promise<PlatformAdminSessionContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SUPPORT_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const { jwtVerify } = await import('jose');
  const secret = getSessionSecret();
  try {
    const { payload } = await jwtVerify(token, secret);
    const sessionId = payload.sessionId as string | undefined;
    const userId = payload.userId as string | undefined;
    const supportTargetTenantId = payload.supportTargetTenantId as string | undefined;
    if (!sessionId || !userId || !supportTargetTenantId) return null;

    const session = await prisma.platformAdminSession.findUnique({
      where: { id: sessionId },
      include: { user: { select: { username: true } } },
    });
    if (
      !session ||
      session.userId !== userId ||
      session.status !== 'ACTIVE' ||
      session.revokedAt ||
      new Date() > session.expiresAt
    ) {
      return null;
    }

    return {
      userId: session.userId,
      sessionId: session.id,
      mode: 'SUPPORT',
      supportTargetTenantId: session.supportTargetTenantId ?? supportTargetTenantId,
      username: session.user.username,
      expiresAt: session.expiresAt,
    };
  } catch {
    return null;
  }
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters in production');
  }
  return new TextEncoder().encode(secret || 'dev-secret-change-in-production');
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getSupportSessionCookieName() {
  return SUPPORT_SESSION_COOKIE_NAME;
}
