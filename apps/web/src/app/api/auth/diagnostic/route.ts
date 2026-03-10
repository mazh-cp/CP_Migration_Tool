import { NextResponse } from 'next/server';

/**
 * Auth diagnostic — helps troubleshoot login issues on remote installs.
 * Returns non-sensitive info: whether auth env is set, password length.
 * No auth required.
 */
export async function GET() {
  const authUser = process.env.AUTH_USERNAME;
  const authPass = process.env.AUTH_PASSWORD;
  return NextResponse.json({
    authUserSet: !!authUser,
    authPasswordSet: !!authPass,
    authPasswordLength: authPass ? authPass.length : 0,
    expectedUser: authUser || null,
    nodeEnv: process.env.NODE_ENV,
  });
}
