/**
 * Platform admin and support-mode authorization.
 * Customer tenant APIs must reject platform admins unless in valid support mode for that tenant.
 */

import { requireAuthSession, requirePlatformAdminSession } from './session-context';

/**
 * Requires an authenticated user who is a platform admin (isPlatformAdmin).
 * Does not grant tenant access; use requireSupportModeForTenant for that.
 */
export async function requirePlatformAdmin(): Promise<{
  userId: string;
  username: string;
} | null> {
  const auth = await requireAuthSession();
  if (!auth || !auth.isPlatformAdmin) return null;
  return { userId: auth.userId, username: auth.username };
}

/**
 * For support-mode operations: validates active PlatformAdminSession and that
 * supportTargetTenantId matches the requested tenant. Enforces expiry.
 * Returns session context or null.
 */
export async function requireSupportModeForTenant(targetTenantId: string): Promise<{
  userId: string;
  sessionId: string;
  username: string;
  supportTargetTenantId: string;
} | null> {
  const support = await requirePlatformAdminSession();
  if (!support || support.supportTargetTenantId !== targetTenantId) return null;
  return {
    userId: support.userId,
    sessionId: support.sessionId,
    username: support.username,
    supportTargetTenantId: support.supportTargetTenantId,
  };
}
