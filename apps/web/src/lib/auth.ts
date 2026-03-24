import { SignJWT, jwtVerify } from 'jose';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';
import { randomBytes, createHmac } from 'crypto';
import { getSessionCookieName as getSessionCookieNameFromContext } from './session-context';

/** SSO URL params from 3rd party redirect. Use opaque sso_id, not email. */
export type SsoRedirectParams = {
  sso_id: string;
  tenant?: string;
  ts?: string;
  sig?: string;
  return_url?: string;
};

const SSO_TS_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
const SSO_ID_REGEX = /^[a-zA-Z0-9_-]{8,128}$/;

/** Verify HMAC signature for SSO redirect. Payload: sso_id|tenant|ts */
function verifySsoSignature(ssoId: string, tenant: string, ts: string, sig: string): boolean {
  const secret = process.env.SSO_PARTNER_SECRET;
  if (!secret || secret.length < 16) return false;
  const payload = `${ssoId}|${tenant}|${ts}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  return sig.length > 0 && sig === expected;
}

/** Validate and verify SSO redirect params. Returns error message or null if valid. */
export function validateSsoRedirect(params: SsoRedirectParams): string | null {
  const { sso_id, tenant, ts, sig } = params;
  if (!sso_id || typeof sso_id !== 'string') return 'Missing sso_id';
  if (!SSO_ID_REGEX.test(sso_id.trim())) return 'Invalid sso_id format';
  const ssoId = sso_id.trim();
  const tenantSlug = (tenant ?? 'default').trim();

  const secret = process.env.SSO_PARTNER_SECRET;
  if (secret && secret.length >= 16) {
    if (!ts || !sig) return 'Signature and timestamp required when SSO_PARTNER_SECRET is set';
    const tsNum = parseInt(ts, 10);
    if (isNaN(tsNum)) return 'Invalid timestamp';
    const now = Date.now();
    if (Math.abs(now - tsNum * 1000) > SSO_TS_TOLERANCE_MS) return 'Timestamp expired or invalid';
    if (!verifySsoSignature(ssoId, tenantSlug, ts, sig)) return 'Invalid signature';
  }

  return null;
}

/** Find or create user by SSO ID. Returns { userId, username, tenantId } or null. */
export async function findOrCreateUserBySsoId(
  ssoId: string,
  tenantSlug: string,
  jitProvision = true
): Promise<{ userId: string; username: string; tenantId: string; isAdmin: boolean } | null> {
  let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    if (tenantSlug === 'default') {
      tenant = await prisma.tenant.create({
        data: { name: 'Default', slug: 'default' },
      });
    } else {
      tenant = await prisma.tenant.findFirst({ where: { slug: 'default' } });
      if (!tenant) {
        tenant = await prisma.tenant.create({
          data: { name: 'Default', slug: 'default' },
        });
      }
      tenantSlug = 'default';
    }
  }

  let user = await prisma.user.findFirst({
    where: { ssoExternalId: ssoId, ssoTenantSlug: tenantSlug },
    select: { id: true, username: true },
  });

  if (!user && jitProvision) {
    const username = `sso-${randomBytes(8).toString('hex')}`;
    const passwordPlaceholder = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    user = await prisma.user.create({
      data: {
        username,
        passwordHash: passwordPlaceholder,
        ssoExternalId: ssoId,
        ssoTenantSlug: tenantSlug,
      },
      select: { id: true, username: true },
    });
    await prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: 'member',
        isPrimary: true,
        status: 'active',
      },
    });
  } else if (!user) {
    return null;
  } else {
    const membership = await prisma.tenantMembership.findFirst({
      where: { userId: user.id, tenantId: tenant.id, status: 'active' },
    });
    if (!membership) {
      await prisma.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: 'member',
          isPrimary: true,
          status: 'active',
        },
      });
    }
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: user.id, tenantId: tenant.id, status: 'active' },
  });
  const role = membership?.role ?? 'member';

  return {
    userId: user.id,
    username: user.username,
    tenantId: tenant.id,
    isAdmin: role === 'admin',
  };
}

const SESSION_SECRET = (() => {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters in production');
  }
  return new TextEncoder().encode(secret || 'dev-secret-change-in-production');
})();

export type SessionUser = { username: string; userId?: string; isAdmin?: boolean };

/** Get or create default tenant (for single-tenant / backfill). */
export async function getDefaultTenantId(): Promise<string> {
  let tenant = await prisma.tenant.findFirst({ where: { slug: 'default' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'Default', slug: 'default' },
    });
  }
  return tenant.id;
}

/** Get primary tenant for user. Normal users have exactly one primary TenantMembership. */
export async function getPrimaryTenantIdForUser(userId: string): Promise<string | null> {
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId, isPrimary: true, status: 'active' },
    select: { tenantId: true },
  });
  return membership?.tenantId ?? null;
}

/** Ensure user has a primary tenant (e.g. default tenant); returns tenantId. */
export async function ensurePrimaryTenantForUser(userId: string): Promise<string> {
  const existing = await getPrimaryTenantIdForUser(userId);
  if (existing) return existing;
  const tenantId = await getDefaultTenantId();
  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: { tenantId, userId },
    },
    create: {
      tenantId,
      userId,
      role: 'admin',
      isPrimary: true,
      status: 'active',
    },
    update: { isPrimary: true, status: 'active' },
  });
  return tenantId;
}

/** Single active session per user per tenant: revoke any existing ACTIVE session. */
async function revokeExistingSessionsForUserAndTenant(userId: string, tenantId: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { userId, tenantId, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
}

const SESSION_DAYS = 7;

export async function createTenantSession(
  userId: string,
  username: string,
  tenantId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  await revokeExistingSessionsForUserAndTenant(userId, tenantId);
  const sessionToken = randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  await prisma.userSession.create({
    data: {
      userId,
      tenantId,
      sessionToken,
      status: 'ACTIVE',
      expiresAt,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  });
  return new SignJWT({ userId, username, sessionToken })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setIssuedAt()
    .sign(SESSION_SECRET);
}

/** Legacy: create session without DB UserSession (for env admin before tenant backfill). */
export async function createSession(username: string, userId?: string, isAdmin?: boolean): Promise<string> {
  return new SignJWT({
    username,
    userId: userId ?? null,
    isAdmin: isAdmin ?? false,
    sessionToken: null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(SESSION_SECRET);
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return {
      username: payload.username as string,
      userId: (payload.userId as string) ?? undefined,
      isAdmin: (payload.isAdmin as boolean) ?? false,
    };
  } catch {
    return null;
  }
}

export function getSessionCookieName(): string {
  return getSessionCookieNameFromContext();
}

/** Env-based admin (e.g. AUTH_USERNAME) has full access; used only when no tenant session. */
export function isEnvAdmin(username: string): boolean {
  const envUser = process.env.AUTH_USERNAME;
  return !!(envUser && username === envUser);
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<{ userId: string; username: string; isAdmin: boolean; tenantId: string } | null> {
  const envUser = process.env.AUTH_USERNAME?.trim();
  const envPass = process.env.AUTH_PASSWORD;
  const u = username?.trim() ?? '';
  const p = password ?? '';
  if (envUser && envPass && u === envUser && p === envPass) {
    let user = await prisma.user.findUnique({ where: { username: envUser } });
    const hash = await bcrypt.hash(envPass, 10);
    if (!user) {
      user = await prisma.user.create({
        data: {
          username: envUser,
          passwordHash: hash,
          isPlatformAdmin: true,
        },
      });
      const tenantId = await getDefaultTenantId();
      await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        create: { tenantId, userId: user.id, role: 'admin', isPrimary: true, status: 'active' },
        update: {},
      });
    } else {
      // Keep DB password in sync with .env so login always works when env matches
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hash, isPlatformAdmin: true },
      });
    }
    const tenantId = await ensurePrimaryTenantForUser(user.id);
    return { userId: user.id, username: user.username, isAdmin: true, tenantId };
  }
  const user = await prisma.user.findUnique({ where: { username: u } });
  if (!user) return null;
  const valid = await bcrypt.compare(p, user.passwordHash);
  if (!valid) return null;
  const tenantId = await ensurePrimaryTenantForUser(user.id);
  return {
    userId: user.id,
    username: user.username,
    isAdmin: user.isPlatformAdmin,
    tenantId,
  };
}

export async function verifyPin(pin: string): Promise<boolean> {
  const envPin = process.env.CONFIG_PIN;
  if (envPin) return pin === envPin;
  return false;
}
