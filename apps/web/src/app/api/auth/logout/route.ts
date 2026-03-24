import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getSessionCookieName } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, SESSION_SECRET);
      const sessionToken = (payload.sessionToken as string) ?? token;
      await prisma.userSession.updateMany({
        where: { sessionToken },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
    } catch {
      // ignore invalid token
    }
  }
  cookieStore.delete(getSessionCookieName());
  return NextResponse.json({ ok: true });
}
