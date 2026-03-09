import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getProjectAccess, canManageMembers } from '@/lib/project-access';

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

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await getProjectAccess(projectId, user.username, user.userId);
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, username: true } } },
  });
  return NextResponse.json(members.map((m) => ({ id: m.id, userId: m.userId, username: m.user.username, role: m.role })));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await getProjectAccess(projectId, user.username, user.userId);
  if (!canManageMembers(access)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: z.infer<typeof addMemberSchema>;
  try {
    body = addMemberSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const targetUser = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: body.userId } },
  });
  if (existing) return NextResponse.json({ error: 'User already a member' }, { status: 409 });

  const member = await prisma.projectMember.create({
    data: { projectId, userId: body.userId, role: body.role },
    include: { user: { select: { id: true, username: true } } },
  });
  return NextResponse.json({ id: member.id, userId: member.userId, username: member.user.username, role: member.role });
}
