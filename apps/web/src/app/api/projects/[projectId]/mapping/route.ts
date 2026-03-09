import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const records = await prisma.mappingDecisionRecord.findMany({
    where: { projectId },
  });
  return NextResponse.json(
    records.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      sourceId: r.sourceId,
      proposedTarget: JSON.parse(r.proposedTarget),
      confidenceScore: r.confidenceScore,
      reasons: JSON.parse(r.reasonsJson),
      warnings: JSON.parse(r.warningsJson),
      userOverride: r.userOverrideJson ? JSON.parse(r.userOverrideJson) : undefined,
    }))
  );
}
