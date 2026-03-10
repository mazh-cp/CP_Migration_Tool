import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSession, verifyCredentials, getSessionCookieName } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const { username, password } = (await req.json()) as { username?: string; password?: string };
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }
    const result = await verifyCredentials(username, password);
    if (!result) {
      logger.warn(
        {
          username,
          authEnvSet: !!(process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD),
          expectedUser: process.env.AUTH_USERNAME || '(not set)',
        },
        'Login failed'
      );
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    const token = await createSession(username, result.userId, result.isAdmin);
    const cookieStore = await cookies();
    cookieStore.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Login failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
