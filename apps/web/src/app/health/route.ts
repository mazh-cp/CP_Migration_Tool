import { readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

function readDeployRevision(): { gitSha?: string; gitShaShort?: string; deployedAt?: string } {
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'deploy-revision.txt'), 'utf8').trim();
    const [gitSha, gitShaShort, deployedAt] = raw.split(/\s+/);
    if (!gitSha) return {};
    return { gitSha, gitShaShort, deployedAt };
  } catch {
    return {};
  }
}

/**
 * Health check — returns 200 if the app is running.
 * Used by load balancers, orchestration, and monitoring.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    ...readDeployRevision(),
  });
}
