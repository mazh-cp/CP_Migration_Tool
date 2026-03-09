import { NextResponse } from 'next/server';

/**
 * Health check — returns 200 if the app is running.
 * Used by load balancers, orchestration, and monitoring.
 */
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
