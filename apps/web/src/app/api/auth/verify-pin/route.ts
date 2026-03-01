import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { verifyPin } from '@/lib/auth';

const PIN_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);
const PIN_COOKIE = 'cisco2cp_config_unlocked';

export async function POST(req: Request) {
  const { pin } = (await req.json()) as { pin?: string };
  if (!pin) {
    return NextResponse.json({ error: 'PIN required' }, { status: 400 });
  }
  const valid = await verifyPin(pin);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }
  const token = await new SignJWT({ unlocked: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(PIN_SECRET);
  const cookieStore = await cookies();
  cookieStore.set(PIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60,
    path: '/',
  });
  return NextResponse.json({ ok: true });
}
