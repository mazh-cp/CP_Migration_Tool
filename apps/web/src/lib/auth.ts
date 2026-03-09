import { SignJWT, jwtVerify } from 'jose';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);
const COOKIE_NAME = 'cisco2cp_session';

export type SessionUser = { username: string; userId?: string; isAdmin?: boolean };

export async function createSession(username: string, userId?: string, isAdmin?: boolean): Promise<string> {
  return new SignJWT({ username, userId: userId ?? null, isAdmin: isAdmin ?? false })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(SESSION_SECRET);
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return {
      username: payload.username as string,
      userId: (payload.userId as string) ?? undefined,
      isAdmin: (payload.isAdmin as boolean) ?? false,
    };
  } catch {
    return null;
  }
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

/** Admin = env AUTH_USERNAME, has full access to all projects */
export function isEnvAdmin(username: string): boolean {
  const envUser = process.env.AUTH_USERNAME;
  return !!(envUser && username === envUser);
}

export async function verifyCredentials(username: string, password: string): Promise<{ userId?: string; isAdmin: boolean } | null> {
  const envUser = process.env.AUTH_USERNAME;
  const envPass = process.env.AUTH_PASSWORD;
  if (envUser && envPass && username === envUser && password === envPass) {
    return { isAdmin: true };
  }
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return { userId: user.id, isAdmin: false };
}

export async function verifyPin(pin: string): Promise<boolean> {
  const envPin = process.env.CONFIG_PIN;
  if (envPin) {
    return pin === envPin;
  }
  return false;
}
