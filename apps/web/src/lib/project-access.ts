import { prisma } from './prisma';
import { isEnvAdmin } from './auth';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);
const COOKIE_NAME = 'cisco2cp_session';

export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer';

export async function getCurrentUser(): Promise<{ username: string; userId?: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return { username: payload.username as string, userId: payload.userId as string | undefined };
  } catch {
    return null;
  }
}

/** Check if user has access to project. Admin (env user) has full access. */
export async function getProjectAccess(
  projectId: string,
  username: string,
  userId?: string
): Promise<ProjectRole | null> {
  if (isEnvAdmin(username)) return 'owner';
  if (!userId) return null;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return (member?.role as ProjectRole) ?? null;
}

export function canEdit(role: ProjectRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

export function canManageMembers(role: ProjectRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** Returns { user, access } or null if unauthorized/forbidden */
export async function requireProjectAccess(
  projectId: string,
  requireEdit = false
): Promise<{ user: { username: string; userId?: string }; access: ProjectRole } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const access = await getProjectAccess(projectId, user.username, user.userId);
  if (!access) return null;
  if (requireEdit && !canEdit(access)) return null;
  return { user, access };
}
