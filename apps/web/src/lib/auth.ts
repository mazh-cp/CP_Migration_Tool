import { SignJWT, jwtVerify } from 'jose';

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);
const COOKIE_NAME = 'cisco2cp_session';

export async function createSession(username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(SESSION_SECRET);
}

export async function verifySession(token: string): Promise<{ username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return { username: payload.username as string };
  } catch {
    return null;
  }
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const envUser = process.env.AUTH_USERNAME;
  const envPass = process.env.AUTH_PASSWORD;
  if (envUser && envPass) {
    return username === envUser && password === envPass;
  }
  return false;
}

export async function verifyPin(pin: string): Promise<boolean> {
  const envPin = process.env.CONFIG_PIN;
  if (envPin) {
    return pin === envPin;
  }
  return false;
}
