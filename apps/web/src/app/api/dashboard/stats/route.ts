import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-context';

/**
 * Tenant-scoped dashboard metrics. Active users = distinct users with UserSession
 * activity (created or last seen) in the window.
 */
export async function GET() {
  const session = await requireTenantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = session.tenantId;
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [active7Rows, active30Rows, completedProjects, totalProjects] = await Promise.all([
    prisma.userSession.findMany({
      where: {
        tenantId,
        OR: [{ createdAt: { gte: sevenDaysAgo } }, { lastSeenAt: { gte: sevenDaysAgo } }],
      },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.userSession.findMany({
      where: {
        tenantId,
        OR: [{ createdAt: { gte: thirtyDaysAgo } }, { lastSeenAt: { gte: thirtyDaysAgo } }],
      },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.project.count({
      where: {
        tenantId,
        OR: [{ status: 'exported' }, { completedSteps: { contains: '"export"' } }],
      },
    }),
    prisma.project.count({ where: { tenantId } }),
  ]);

  return NextResponse.json({
    activeUsersLast7Days: active7Rows.length,
    activeUsersLast30Days: active30Rows.length,
    completedProjects,
    totalProjects,
  });
}
