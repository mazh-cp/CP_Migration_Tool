import { NextResponse } from 'next/server';

/**
 * Auth diagnostic — helps troubleshoot login issues on local/dev installs.
 * In production, disabled unless AUTH_DIAGNOSTIC_ENABLED=true (still unauthenticated; prefer restricting network access).
 */
export async function GET() {
  const prod = process.env.NODE_ENV === 'production';
  const enabled = process.env.AUTH_DIAGNOSTIC_ENABLED === 'true' || process.env.AUTH_DIAGNOSTIC_ENABLED === '1';
  if (prod && !enabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const authUser = process.env.AUTH_USERNAME?.trim();
  const authPass = process.env.AUTH_PASSWORD;
  return NextResponse.json({
    authUserSet: !!authUser,
    authPasswordSet: !!authPass,
    authPasswordLength: authPass ? authPass.length : 0,
    expectedUser: authUser || null,
    nodeEnv: process.env.NODE_ENV,
    hint: !authUser || !authPass
      ? 'Copy apps/web/.env.example to apps/web/.env and set AUTH_USERNAME and AUTH_PASSWORD, then restart the server.'
      : 'If login still fails, run: cd apps/web && npx ts-node --compiler-options \'{"module":"CommonJS"}\' scripts/set-admin-password.ts changeme',
  });
}
