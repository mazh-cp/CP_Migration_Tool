import { prisma } from './prisma';
import type { TenantSession } from './session-context';

/** Primary / env administrator account — tenant admins must not see or mutate this user. */
export async function userIsPlatformAdmin(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true },
  });
  return u?.isPlatformAdmin === true;
}

export function canManagePlatformAdminAccount(session: TenantSession): boolean {
  return session.isPlatformAdmin === true;
}

export async function assertTenantAdminCanManageUser(
  session: TenantSession,
  targetUserId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (targetUserId === session.userId) return { ok: true };
  const targetIsPlatform = await userIsPlatformAdmin(targetUserId);
  if (targetIsPlatform && !canManagePlatformAdminAccount(session)) {
    return { ok: false, status: 403, error: 'Cannot modify the platform administrator account' };
  }
  return { ok: true };
}
