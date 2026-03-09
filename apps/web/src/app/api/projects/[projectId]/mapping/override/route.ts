import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';

const overrideSchema = z.object({
  entityType: z.string(),
  sourceId: z.string(),
  proposedTarget: z.record(z.unknown()),
  notes: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { entityType, sourceId, proposedTarget, notes } = overrideSchema.parse(body);

  await prisma.mappingDecisionRecord.upsert({
    where: {
      projectId_entityType_sourceId: { projectId, entityType, sourceId },
    },
    create: {
      projectId,
      entityType,
      sourceId,
      proposedTarget: JSON.stringify(proposedTarget),
      confidenceScore: 1,
      reasonsJson: '["User override"]',
      warningsJson: '[]',
      userOverrideJson: JSON.stringify({ changed: true, notes, timestamp: new Date().toISOString() }),
    },
    update: {
      proposedTarget: JSON.stringify(proposedTarget),
      userOverrideJson: JSON.stringify({ changed: true, notes, timestamp: new Date().toISOString() }),
    },
  });

  return NextResponse.json({ ok: true });
}
