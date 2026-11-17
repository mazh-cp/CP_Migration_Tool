import { describe, expect, it } from 'vitest';
import { canDeleteProject } from '../project-access';
import type { TenantSession } from '../session-context';

function session(
  partial: Partial<TenantSession> & Pick<TenantSession, 'role' | 'isPlatformAdmin'>
): TenantSession {
  return {
    sessionId: 's',
    userId: 'u',
    tenantId: 't',
    username: 'x',
    email: null,
    ...partial,
  };
}

describe('canDeleteProject', () => {
  it('allows project owner/admin', () => {
    const s = session({ role: 'member', isPlatformAdmin: false });
    expect(canDeleteProject(s, 'owner')).toBe(true);
    expect(canDeleteProject(s, 'admin')).toBe(true);
  });

  it('allows tenant/platform admin without project membership', () => {
    const tenantAdmin = session({ role: 'admin', isPlatformAdmin: false });
    expect(canDeleteProject(tenantAdmin, 'viewer')).toBe(true);
    const platformAdmin = session({ role: 'member', isPlatformAdmin: true });
    expect(canDeleteProject(platformAdmin, 'viewer')).toBe(true);
  });

  it('denies plain members/viewers', () => {
    const member = session({ role: 'member', isPlatformAdmin: false });
    expect(canDeleteProject(member, 'viewer')).toBe(false);
    expect(canDeleteProject(member, 'editor')).toBe(false);
  });
});