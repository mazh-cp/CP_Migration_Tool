import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { isEnvAdmin } from '@/lib/auth';

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);
const COOKIE_NAME = 'cisco2cp_session';

async function requireAdmin(): Promise<{ username: string; userId?: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    const username = payload.username as string;
    if (!isEnvAdmin(username)) return null;
    return { username, userId: payload.userId as string | undefined };
  } catch {
    return null;
  }
}

const createUserSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(6),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const users = await prisma.user.findMany({
    select: { id: true, username: true, createdAt: true },
    orderBy: { username: 'asc' },
  });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: z.infer<typeof createUserSchema>;
  try {
    body = createUserSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username: body.username } });
  if (existing) {
    return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: { username: body.username, passwordHash },
    select: { id: true, username: true, createdAt: true },
  });
  return NextResponse.json(user);
}
