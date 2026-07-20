/**
 * Tenant-scoped authorization. Tenant identity from session only; never from request params.
 */

import { prisma } from './prisma';
import { requireTenantSession as getTenantSessionFromContext, type TenantSession } from './session-context';
import { requireSupportModeForTenant } from './platform-admin-access';

export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer';

/** Re-export: get current tenant-bound session from session-context. */
export async function requireTenantSession(): Promise<TenantSession | null> {
  return getTenantSessionFromContext();
}

/**
 * Require access to project. Queries with where: { id: projectId, tenantId: session.tenantId }.
 * Never uses tenantId from request. Supports support-mode: if tenant session fails, check platform admin support for that project's tenant.
 */
export async function requireProjectAccess(
  projectId: string,
  requireEdit = false
): Promise<{ session: TenantSession; project: { id: string; tenantId: string; name: string }; role: ProjectRole } | null> {
  const session = await getTenantSessionFromContext();
  if (session) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: session.tenantId },
      select: { id: true, tenantId: true, name: true },
    });
    if (!project) return null;
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: session.userId } },
    });
    const role = (member?.role as ProjectRole) ?? 'viewer';
    if (requireEdit && !canEdit(role)) return null;
    return {
      session,
      project: { id: project.id, tenantId: project.tenantId ?? session.tenantId, name: project.name },
      role,
    };
  }
  const projectRow = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, tenantId: true, name: true } });
  if (!projectRow || !projectRow.tenantId) return null;
  const support = await requireSupportModeForTenant(projectRow.tenantId);
  if (!support) return null;
  const supportUser = await prisma.user.findUnique({
    where: { id: support.userId },
    select: { isPlatformAdmin: true },
  });
  const tenantSession: TenantSession = {
    userId: support.userId,
    tenantId: support.supportTargetTenantId,
    sessionId: support.sessionId,
    role: 'admin',
    username: support.username,
    email: null,
    isPlatformAdmin: supportUser?.isPlatformAdmin ?? true,
  };
  return {
    session: tenantSession,
    project: { id: projectRow.id, tenantId: projectRow.tenantId, name: projectRow.name },
    role: 'admin',
  };
}

export function canEdit(role: ProjectRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

export function canManageMembers(role: ProjectRole | null): boolean {
  return role === 'owner' || role === 'admin';
}
