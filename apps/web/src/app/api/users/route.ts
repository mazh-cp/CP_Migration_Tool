import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { requireTenantSession } from '@/lib/project-access';

const createUserSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(6),
  email: z.string().email().optional(),
});

export async function GET() {
  const session = await requireTenantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId: session.tenantId, status: 'active' },
    include: { user: { select: { id: true, username: true, email: true, createdAt: true } } },
    orderBy: { user: { username: 'asc' } },
  });
  return NextResponse.json(
    memberships.map((m) => ({
      id: m.user.id,
      username: m.user.username,
      email: m.user.email,
      createdAt: m.user.createdAt,
      tenantRole: m.role,
      isPrimary: m.isPrimary,
    }))
  );
}

export async function POST(req: Request) {
  const session = await requireTenantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: z.infer<typeof createUserSchema>;
  try {
    body = createUserSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const existingByUsername = await prisma.user.findUnique({ where: { username: body.username } });
  if (existingByUsername) {
    return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
  }
  if (body.email) {
    const existingByEmail = await prisma.user.findUnique({ where: { email: body.email } });
    if (existingByEmail) {
      return NextResponse.json(
        { error: 'Email already in use by another user. Same email cannot be used across tenants.' },
        { status: 409 }
      );
    }
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: {
      username: body.username,
      email: body.email ?? null,
      passwordHash,
    },
    select: { id: true, username: true, email: true, createdAt: true },
  });

  await prisma.tenantMembership.create({
    data: {
      tenantId: session.tenantId,
      userId: user.id,
      role: 'member',
      isPrimary: true,
      status: 'active',
    },
  });

  return NextResponse.json(user);
}
