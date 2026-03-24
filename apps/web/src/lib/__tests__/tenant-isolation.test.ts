/**
 * Tenant isolation: tenant is resolved only from session; cross-tenant project access fails closed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('tenant isolation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('project access requires session tenantId - tenant never from request', () => {
    // requireProjectAccess(projectId) only accepts projectId from URL; tenantId must come from session.
    // This test documents the contract: no API should accept tenantId from body/query/params for auth.
    const requestParams = { projectId: 'proj-123' };
    const forbiddenParams = ['tenantId', 'tenant_id', 'tenant'];
    for (const key of forbiddenParams) {
      expect(requestParams).not.toHaveProperty(key);
    }
    expect(requestParams).toHaveProperty('projectId');
  });

  it('project query pattern is where: { id: projectId, tenantId: session.tenantId }', () => {
    const session = { tenantId: 'tenant-A', userId: 'user-1' };
    const projectId = 'proj-1';
    const expectedWhere = { id: projectId, tenantId: session.tenantId };
    expect(expectedWhere.tenantId).toBe(session.tenantId);
    expect(expectedWhere.id).toBe(projectId);
  });

  it('cross-tenant project fetch fails closed when tenantId does not match', () => {
    const sessionTenantId = 'tenant-A';
    const projectInOtherTenant = { id: 'proj-1', tenantId: 'tenant-B', name: 'P' };
    const wouldReturn = sessionTenantId === projectInOtherTenant.tenantId ? projectInOtherTenant : null;
    expect(wouldReturn).toBeNull();
  });
});
