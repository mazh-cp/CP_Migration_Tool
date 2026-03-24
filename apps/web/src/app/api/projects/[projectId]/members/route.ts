import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess, canManageMembers } from '@/lib/project-access';

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const members = await prisma.projectMember.findMany({
    where: { projectId, project: { tenantId: auth.session.tenantId } },
    include: { user: { select: { id: true, username: true } } },
  });
  return NextResponse.json(members.map((m) => ({ id: m.id, userId: m.userId, username: m.user.username, role: m.role })));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!canManageMembers(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: z.infer<typeof addMemberSchema>;
  try {
    body = addMemberSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: auth.session.tenantId },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const targetUser = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const targetMembership = await prisma.tenantMembership.findFirst({
    where: { userId: body.userId, tenantId: auth.session.tenantId, status: 'active' },
  });
  if (!targetMembership) {
    return NextResponse.json(
      { error: 'User is not a member of this tenant. Add them to the tenant first.' },
      { status: 403 }
    );
  }

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
