/** Username configured for env bootstrap login (`AUTH_USERNAME`). */
export function getEnvBootstrapUsername(): string | null {
  const trimmed = process.env.AUTH_USERNAME?.trim();
  return trimmed || null;
}

/** True when this username is the designated env bootstrap administrator. */
export function isEnvBootstrapUsername(username: string): boolean {
  const envUser = getEnvBootstrapUsername();
  return !!envUser && username === envUser;
}

/** Tenant user-management (Settings → Users) is granted by tenant membership role, not platform admin. */
export function isTenantAdministratorRole(tenantRole: string | null | undefined): boolean {
  return tenantRole === 'admin';
}