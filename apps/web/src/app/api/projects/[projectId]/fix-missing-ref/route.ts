import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { validateCheckPointObject } from '@/lib/checkpoint-format';
import { requireProjectAccess } from '@/lib/project-access';
import { mapObjects, mapPolicy, validate } from '@cisco2cp/core';
import type { NormalizedObject, NormalizedPolicyRule } from '@cisco2cp/core';

const fixSchema = z.object({
  fixes: z.array(
    z.union([
      z.object({
        findingId: z.string(),
        ruleId: z.string(),
        missingObjectId: z.string(),
        fixType: z.enum(['create_placeholder', 'replace_with_any']),
      }),
      z.object({
        findingId: z.string(),
        ruleId: z.string(),
        missingObjectId: z.string(),
        fixType: z.literal('create_custom'),
        object: z.object({
          type: z.enum(['host', 'network', 'range', 'fqdn']),
          name: z.string(),
          value: z.string().optional(),
          rangeFrom: z.string().optional(),
          rangeTo: z.string().optional(),
        }),
      }),
    ])
  ),
});

const ANY_OBJECT_ID = 'any-00000000-0000-0000-0000-000000000000';
const ANY_OBJECT: NormalizedObject = {
  id: ANY_OBJECT_ID,
  type: 'network',
  name: 'Any',
  value: '0.0.0.0/0',
  comments: 'Placeholder for any - matches all addresses',
};

function ensureAnyObject(objects: NormalizedObject[]): NormalizedObject[] {
  if (objects.some((o) => o.id === ANY_OBJECT_ID)) return objects;
  return [...objects, ANY_OBJECT];
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: z.infer<typeof fixSchema>;
  try {
    const raw = await req.json();
    body = fixSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const data = await prisma.normalizedData.findUnique({
    where: { projectId },
  });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let objects: NormalizedObject[] = JSON.parse(data.objectsJson);
  let rules: NormalizedPolicyRule[] = JSON.parse(data.rulesJson);

  const hadAny = objects.some((o) => o.id === ANY_OBJECT_ID);
  objects = ensureAnyObject(objects);
  const objectIds = new Set(objects.map((o) => o.id));
  const objectsToMap: NormalizedObject[] = [];
  const rulesToUpdate = new Set<string>();

  // Validate all create_custom fixes before applying
  for (const fix of body.fixes || []) {
    if (fix.fixType === 'create_custom' && 'object' in fix) {
      const errs = validateCheckPointObject({
        type: fix.object.type,
        name: fix.object.name,
        value: fix.object.value,
        rangeFrom: fix.object.rangeFrom,
        rangeTo: fix.object.rangeTo,
      });
      if (errs.length > 0) {
        return NextResponse.json(
          { error: 'Invalid Check Point Gaia format', details: errs },
          { status: 400 }
        );
      }
    }
  }

  for (const fix of body.fixes || []) {
    const { missingObjectId, ruleId, fixType } = fix;
    if (!missingObjectId || !ruleId) continue;

    if (fixType === 'create_placeholder') {
      if (!objectIds.has(missingObjectId)) {
        const shortId = missingObjectId.slice(0, 8);
        const placeholder: NormalizedObject = {
          id: missingObjectId,
          type: 'network',
          name: `placeholder-${shortId}`,
          value: '0.0.0.0/0',
          comments: 'Created to fix missing reference from rule',
        };
        objects.push(placeholder);
        objectIds.add(missingObjectId);
        objectsToMap.push(placeholder);
      }
    } else if (fixType === 'create_custom' && 'object' in fix) {
      if (!objectIds.has(missingObjectId)) {
        const obj = fix.object;
        const custom: NormalizedObject = {
          id: missingObjectId,
          type: obj.type,
          name: obj.name.trim(),
          comments: 'Created via Validate page - Check Point Gaia format',
        };
        if (obj.type === 'range' && obj.rangeFrom && obj.rangeTo) {
          custom.values = [obj.rangeFrom.trim(), obj.rangeTo.trim()];
        } else if (obj.value) {
          custom.value = obj.value.trim();
        }
        objects.push(custom);
        objectIds.add(missingObjectId);
        objectsToMap.push(custom);
      }
    } else if (fixType === 'replace_with_any') {
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule) continue;

      const replaceRef = (arr: string[]) =>
        arr.map((id) => (id === missingObjectId ? ANY_OBJECT_ID : id));

      rule.sourceRefs = replaceRef(rule.sourceRefs);
      rule.destinationRefs = replaceRef(rule.destinationRefs);
      rule.serviceRefs = replaceRef(rule.serviceRefs);
      rulesToUpdate.add(ruleId);
    }
  }

  // Add mapping decisions for new objects (including Any if it was added)
  const newObjects = [...objectsToMap];
  if (!hadAny && body.fixes?.some((f) => f.fixType === 'replace_with_any')) {
    newObjects.push(ANY_OBJECT);
  }

  if (newObjects.length > 0) {
    const newDecisions = mapObjects(newObjects);
    for (const d of newDecisions) {
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
  }

  // Update mapping decisions for rules that had refs replaced
  if (rulesToUpdate.size > 0) {
    const ruleDecisions = mapPolicy(rules);
    for (const d of ruleDecisions) {
      if (rulesToUpdate.has(d.sourceId)) {
        await prisma.mappingDecisionRecord.upsert({
          where: {
            projectId_entityType_sourceId: {
              projectId,
              entityType: 'rule',
              sourceId: d.sourceId,
            },
          },
          create: {
            projectId,
            entityType: 'rule',
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
    }
  }

  // Persist normalized data
  await prisma.normalizedData.upsert({
    where: { projectId },
    create: {
      projectId,
      objectsJson: JSON.stringify(objects),
      rulesJson: JSON.stringify(rules),
      natJson: data.natJson,
      interfacesJson: data.interfacesJson,
      zonesJson: data.zonesJson,
      warningsJson: data.warningsJson,
    },
    update: {
      objectsJson: JSON.stringify(objects),
      rulesJson: JSON.stringify(rules),
    },
  });

  // Re-validate and return
  const result = validate({
    objects,
    rules,
    nat: JSON.parse(data.natJson),
    interfaces: JSON.parse(data.interfacesJson),
    zones: JSON.parse(data.zonesJson),
    warnings: JSON.parse(data.warningsJson),
  });

  return NextResponse.json(result);
}
