import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { isEnvAdmin } from '@/lib/auth';

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);
const COOKIE_NAME = 'cisco2cp_session';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    const username = payload.username as string;
    return NextResponse.json({
      username,
      userId: payload.userId ?? null,
      isAdmin: isEnvAdmin(username),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
