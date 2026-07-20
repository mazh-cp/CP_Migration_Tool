import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { NormalizedObject, NormalizedPolicyRule } from '@cisco2cp/core';
import { ANY_NET_ID, ANY_SVC_ID, mapPolicy, validate, buildMigrationReport } from '@cisco2cp/core';
import { prisma } from '@/lib/prisma';
import { validateCheckPointExportName } from '@/lib/checkpoint-format';
import { requireProjectAccess } from '@/lib/project-access';

const bodySchema = z.object({
  ruleId: z.string().min(1),
  name: z.string(),
  enabled: z.boolean(),
  comments: z.string(),
  action: z.enum(['allow', 'deny', 'reject']),
  log: z.enum(['none', 'log', 'alert']),
  sourceRefs: z.array(z.string()),
  destinationRefs: z.array(z.string()),
  serviceRefs: z.array(z.string()),
});

function validateRefArrays(
  sourceRefs: string[],
  destinationRefs: string[],
  serviceRefs: string[],
  objectIds: Set<string>
): string | null {
  const check = (refs: string[], label: string): string | null => {
    for (const id of refs) {
      if (!id.trim()) return `${label}: empty reference is not allowed`;
      if (objectIds.has(id) || id === ANY_NET_ID || id === ANY_SVC_ID) continue;
      return `${label}: unknown object id "${id}" (use Map Objects or Validate to add objects)`;
    }
    return null;
  };
  return (
    check(sourceRefs, 'Source') ||
    check(destinationRefs, 'Destination') ||
    check(serviceRefs, 'Service')
  );
}

/**
 * Updates a normalized access rule and refreshes its mapping row so validate/export stay aligned.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = auth.session.tenantId;

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    body = bodySchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const nameErr = validateCheckPointExportName(body.name);
  if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 });

  const data = await prisma.normalizedData.findFirst({
    where: { projectId, tenantId },
  });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rules: NormalizedPolicyRule[] = JSON.parse(data.rulesJson);
  const idx = rules.findIndex((r) => r.id === body.ruleId);
  if (idx === -1) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  const objects = JSON.parse(data.objectsJson) as NormalizedObject[];
  const objectIds = new Set(objects.map((o) => o.id));
  const refErr = validateRefArrays(body.sourceRefs, body.destinationRefs, body.serviceRefs, objectIds);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 400 });

  const updated: NormalizedPolicyRule = {
    ...rules[idx],
    name: body.name.trim(),
    enabled: body.enabled,
    comments: body.comments.trim() || undefined,
    action: body.action,
    log: body.log,
    sourceRefs: [...body.sourceRefs],
    destinationRefs: [...body.destinationRefs],
    serviceRefs: [...body.serviceRefs],
  };
  rules[idx] = updated;

  const normalized = {
    objects,
    rules,
    nat: JSON.parse(data.natJson),
    interfaces: JSON.parse(data.interfacesJson),
    zones: JSON.parse(data.zonesJson),
    warnings: JSON.parse(data.warningsJson),
  };

  const validation = validate(normalized);
  const migrationReport = buildMigrationReport(normalized, validation);

  const [mappingDecision] = mapPolicy([updated]);

  await prisma.normalizedData.update({
    where: { projectId },
    data: {
      rulesJson: JSON.stringify(rules),
      migrationReportJson: JSON.stringify(migrationReport),
    },
  });

  await prisma.mappingDecisionRecord.upsert({
    where: {
      projectId_entityType_sourceId: {
        projectId,
        entityType: 'rule',
        sourceId: body.ruleId,
      },
    },
    create: {
      id: randomUUID(),
      projectId,
      tenantId,
      entityType: 'rule',
      sourceId: body.ruleId,
      proposedTarget: JSON.stringify(mappingDecision.proposedTarget),
      confidenceScore: mappingDecision.confidenceScore,
      reasonsJson: JSON.stringify(mappingDecision.reasons),
      warningsJson: JSON.stringify(mappingDecision.warnings),
      userOverrideJson: JSON.stringify({
        changed: true,
        notes: 'patch-rule: rule+refs',
        timestamp: new Date().toISOString(),
      }),
    },
    update: {
      proposedTarget: JSON.stringify(mappingDecision.proposedTarget),
      confidenceScore: mappingDecision.confidenceScore,
      reasonsJson: JSON.stringify(mappingDecision.reasons),
      warningsJson: JSON.stringify(mappingDecision.warnings),
      userOverrideJson: JSON.stringify({
        changed: true,
        notes: 'patch-rule: rule+refs',
        timestamp: new Date().toISOString(),
      }),
    },
  });

  return NextResponse.json({
    ok: true,
    hasErrors: validation.hasErrors,
    hasWarnings: validation.hasWarnings,
  });
}
