import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { exportToJson, exportToCliTemplate } from '@cisco2cp/exporters';
import type { MappingDecision } from '@cisco2cp/core';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { format } = (await req.json().catch(() => ({}))) as { format?: string };

  const [data, records] = await Promise.all([
    prisma.normalizedData.findUnique({ where: { projectId } }),
    prisma.mappingDecisionRecord.findMany({ where: { projectId } }),
  ]);

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const normalized = {
    objects: JSON.parse(data.objectsJson),
    rules: JSON.parse(data.rulesJson),
    nat: JSON.parse(data.natJson),
    interfaces: JSON.parse(data.interfacesJson),
    zones: JSON.parse(data.zonesJson),
    warnings: JSON.parse(data.warningsJson),
  };

  const mappingDecisions: MappingDecision[] = records.map((r) => ({
    id: r.id,
    entityType: r.entityType as MappingDecision['entityType'],
    sourceId: r.sourceId,
    proposedTarget: JSON.parse(r.proposedTarget),
    confidenceScore: r.confidenceScore,
    reasons: JSON.parse(r.reasonsJson),
    warnings: JSON.parse(r.warningsJson),
    userOverride: r.userOverrideJson ? JSON.parse(r.userOverrideJson) : undefined,
  }));

  const bundle = exportToJson({ projectId, normalized, mappingDecisions });

  if (format === 'cli') {
    const cli = exportToCliTemplate(bundle);
    return new NextResponse(cli, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="checkpoint-${projectId}.cli"`,
      },
    });
  }

  return NextResponse.json(bundle);
}
