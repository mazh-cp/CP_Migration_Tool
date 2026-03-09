import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { isEnvAdmin } from '@/lib/auth';

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);
const COOKIE_NAME = 'cisco2cp_session';

async function getCurrentUser(): Promise<{ username: string; userId?: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return { username: payload.username as string, userId: payload.userId as string | undefined };
  } catch {
    return null;
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  sourceType: z.enum(['asa', 'ftd', 'both']),
});

type ProjectListItem = Awaited<ReturnType<typeof prisma.project.findMany<{
  orderBy: { updatedAt: 'desc' };
  include: { _count: { select: { artifacts: true } } };
}>>>[number];

export async function GET() {
  try {
    const user = await getCurrentUser();
    let projects: ProjectListItem[];
    if (user && isEnvAdmin(user.username)) {
      projects = await prisma.project.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { artifacts: true } } },
      });
    } else if (user?.userId) {
      projects = await prisma.project.findMany({
        where: { projectMembers: { some: { userId: user.userId } } },
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { artifacts: true } } },
      });
    } else {
      projects = [] as ProjectListItem[];
    }
    return NextResponse.json(projects);
  } catch (err) {
    logger.error({ err }, 'Failed to list projects');
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, sourceType } = createSchema.parse(body);
    const project = await prisma.project.create({
      data: {
        name,
        sourceType,
        ...(user.userId && {
          projectMembers: {
            create: { userId: user.userId, role: 'owner' },
          },
        }),
      },
    });
    return NextResponse.json(project);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    logger.error({ err }, 'Failed to create project');
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
