import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_SECRET = (() => {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters in production');
  }
  return new TextEncoder().encode(secret || 'dev-secret-change-in-production');
})();
const COOKIE_NAME = 'cisco2cp_session';

const PUBLIC_PATHS = ['/login', '/health', '/ready'];

export async function middleware(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl;

    if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }
  if (pathname === '/health' || pathname === '/ready') {
    return NextResponse.next();
  }

  if (pathname === '/') {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      try {
        await jwtVerify(token, SESSION_SECRET);
        return NextResponse.redirect(new URL('/dashboard', req.url));
      } catch {
        return NextResponse.redirect(new URL('/login', req.url));
      }
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      try {
        await jwtVerify(token, SESSION_SECRET);
        return NextResponse.redirect(new URL('/dashboard', req.url));
      } catch {
        // invalid token, allow login
      }
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }
  try {
    await jwtVerify(token, SESSION_SECRET);
    return NextResponse.next();
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
  } catch {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  // Exclude health/ready so they never touch auth logic and avoid "headers already sent" with not-found
  matcher: ['/((?!_next/static|_next/image|favicon.ico|health|ready).*)'],
};
