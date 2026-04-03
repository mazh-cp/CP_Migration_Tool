import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { validateNormalizedObjectRename } from '@/lib/checkpoint-format';
import { requireProjectAccess } from '@/lib/project-access';
import { mapObjects, validate, buildMigrationReport } from '@cisco2cp/core';
import type { NormalizedObject } from '@cisco2cp/core';

const patchSchema = z
  .object({
    objectId: z.string().min(1),
    name: z.string().optional(),
    port: z.number().int().min(0).max(65535).optional(),
    portRange: z
      .object({
        from: z.number().int().min(0).max(65535),
        to: z.number().int().min(0).max(65535),
      })
      .optional(),
  })
  .refine(
    (d) => d.name !== undefined || d.port !== undefined || d.portRange !== undefined,
    { message: 'Provide name, port, or portRange' }
  );

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = auth.session.tenantId;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const data = await prisma.normalizedData.findFirst({
    where: { projectId, tenantId },
  });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const objects: NormalizedObject[] = JSON.parse(data.objectsJson);
  const idx = objects.findIndex((o) => o.id === body.objectId);
  if (idx < 0) return NextResponse.json({ error: 'Object not found' }, { status: 404 });

  const obj = { ...objects[idx] };

  if (body.name !== undefined) {
    const nameErr = validateNormalizedObjectRename(body.name);
    if (nameErr) {
      return NextResponse.json({ error: nameErr }, { status: 400 });
    }
    const trimmed = body.name.trim();
    const clash = objects.some((o) => o.id !== body.objectId && o.name === trimmed);
    if (clash) {
      return NextResponse.json({ error: 'Another object already uses this name' }, { status: 400 });
    }
    obj.name = trimmed;
  }

  if (obj.type === 'service') {
    if (body.portRange !== undefined) {
      const { from, to } = body.portRange;
      if (from > to) {
        return NextResponse.json({ error: 'portRange: from must be <= to' }, { status: 400 });
      }
      obj.portRange = { from, to };
      delete obj.port;
    } else if (body.port !== undefined) {
      obj.port = body.port;
      delete obj.portRange;
    }
  } else if (body.port !== undefined || body.portRange !== undefined) {
    return NextResponse.json({ error: 'Port can only be set on service objects' }, { status: 400 });
  }

  objects[idx] = obj;

  const decisions = mapObjects([obj]);
  for (const d of decisions) {
    await prisma.mappingDecisionRecord.upsert({
      where: {
        projectId_entityType_sourceId: {
          projectId,
          entityType: d.entityType,
          sourceId: d.sourceId,
        },
      },
      create: {
        projectId,
        tenantId,
        entityType: d.entityType,
        sourceId: d.sourceId,
        proposedTarget: JSON.stringify(d.proposedTarget),
        confidenceScore: d.confidenceScore,
        reasonsJson: JSON.stringify(d.reasons),
        warningsJson: JSON.stringify(d.warnings),
      },
      update: {
        proposedTarget: JSON.stringify(d.proposedTarget),
        reasonsJson: JSON.stringify(d.reasons),
        warningsJson: JSON.stringify(d.warnings),
      },
    });
  }

  const normalized = {
    objects,
    rules: JSON.parse(data.rulesJson),
    nat: JSON.parse(data.natJson),
    interfaces: JSON.parse(data.interfacesJson),
    zones: JSON.parse(data.zonesJson),
    warnings: JSON.parse(data.warningsJson),
  };
  const result = validate(normalized);
  const migrationReport = buildMigrationReport(normalized, result);

  await prisma.normalizedData.upsert({
    where: { projectId },
    create: {
      projectId,
      tenantId,
      objectsJson: JSON.stringify(objects),
      rulesJson: data.rulesJson,
      natJson: data.natJson,
      interfacesJson: data.interfacesJson,
      zonesJson: data.zonesJson,
      warningsJson: data.warningsJson,
      migrationReportJson: JSON.stringify(migrationReport),
    },
    update: {
      objectsJson: JSON.stringify(objects),
      migrationReportJson: JSON.stringify(migrationReport),
    },
  });

  return NextResponse.json(result);
}
