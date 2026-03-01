import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSession, verifyCredentials, getSessionCookieName } from '@/lib/auth';

export async function POST(req: Request) {
  const { username, password } = (await req.json()) as { username?: string; password?: string };
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }
  const valid = await verifyCredentials(username, password);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const token = await createSession(username);
  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return NextResponse.json({ ok: true });
}
