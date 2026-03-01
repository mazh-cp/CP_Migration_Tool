import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  sourceType: z.enum(['asa', 'ftd', 'both']),
});

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { artifacts: true } } },
    });
    return NextResponse.json(projects);
  } catch (err) {
    logger.error({ err }, 'Failed to list projects');
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, sourceType } = createSchema.parse(body);
    const project = await prisma.project.create({
      data: { name, sourceType },
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
