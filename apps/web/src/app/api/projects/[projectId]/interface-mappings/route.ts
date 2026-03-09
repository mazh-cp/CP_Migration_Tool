import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';

const interfaceMappingSchema = z.object({
  asaInterfaceId: z.string().min(1),
  cpInterfaceName: z.string().min(1),
  cpIpOverride: z.string().optional(),
  cpMaskOverride: z.string().optional(),
});

const postSchema = z.array(interfaceMappingSchema);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const records = await prisma.interfaceMappingRecord.findMany({
    where: { projectId },
  });
  return NextResponse.json(
    records.map((r) => ({
      asaInterfaceId: r.asaInterfaceId,
      cpInterfaceName: r.cpInterfaceName,
      cpIpOverride: r.cpIpOverride,
      cpMaskOverride: r.cpMaskOverride,
    }))
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: z.infer<typeof postSchema>;
  try {
    const raw = await req.json();
    body = postSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Expected array of interface mappings' }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  for (const m of body) {
    await prisma.interfaceMappingRecord.upsert({
      where: {
        projectId_asaInterfaceId: { projectId, asaInterfaceId: m.asaInterfaceId },
      },
      create: {
        projectId,
        asaInterfaceId: m.asaInterfaceId,
        cpInterfaceName: m.cpInterfaceName,
        cpIpOverride: m.cpIpOverride ?? null,
        cpMaskOverride: m.cpMaskOverride ?? null,
      },
      update: {
        cpInterfaceName: m.cpInterfaceName,
        cpIpOverride: m.cpIpOverride ?? null,
        cpMaskOverride: m.cpMaskOverride ?? null,
      },
    });
  }
  const steps: string[] = (() => {
      try {
        return typeof project.completedSteps === 'string' ? JSON.parse(project.completedSteps || '[]') : project.completedSteps || [];
      } catch {
        return [];
      }
    })();
  if (!steps.includes('map-interfaces')) {
    steps.push('map-interfaces');
    await prisma.project.update({
      where: { id: projectId },
      data: { completedSteps: JSON.stringify(steps) },
    });
  }
  return NextResponse.json({ ok: true });
}
