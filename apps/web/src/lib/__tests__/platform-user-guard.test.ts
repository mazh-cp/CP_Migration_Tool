import { describe, expect, it } from 'vitest';
import { canManageTenantUsers } from '../platform-user-guard';
import type { TenantSession } from '../session-context';

function session(partial: Partial<TenantSession> & Pick<TenantSession, 'role' | 'isPlatformAdmin'>): TenantSession {
  return {
    sessionId: 's',
    userId: 'u',
    tenantId: 't',
    username: 'x',
    email: null,
    ...partial,
  };
}

describe('canManageTenantUsers', () => {
  it('allows tenant admins', () => {
    expect(canManageTenantUsers(session({ role: 'admin', isPlatformAdmin: false }))).toBe(true);
  });

  it('allows platform admins even when tenant role is member', () => {
    expect(canManageTenantUsers(session({ role: 'member', isPlatformAdmin: true }))).toBe(true);
  });

  it('denies non-admin tenant members', () => {
    expect(canManageTenantUsers(session({ role: 'member', isPlatformAdmin: false }))).toBe(false);
    expect(canManageTenantUsers(session({ role: 'viewer', isPlatformAdmin: false }))).toBe(false);
  });
});