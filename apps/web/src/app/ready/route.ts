import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Readiness check — returns 200 if the app can serve requests (DB reachable).
 * Used by Kubernetes, Docker, and orchestration.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { status: 'not ready', error: 'Database unreachable' },
      { status: 503 }
    );
  }
}
