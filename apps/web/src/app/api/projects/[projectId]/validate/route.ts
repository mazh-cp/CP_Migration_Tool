import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validate } from '@cisco2cp/core';
import { requireProjectAccess } from '@/lib/project-access';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const data = await prisma.normalizedData.findUnique({
    where: { projectId },
  });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const normalized = {
    objects: JSON.parse(data.objectsJson),
    rules: JSON.parse(data.rulesJson),
    nat: JSON.parse(data.natJson),
    interfaces: JSON.parse(data.interfacesJson),
    zones: JSON.parse(data.zonesJson),
    warnings: JSON.parse(data.warningsJson),
  };

  const result = validate(normalized);

  // Enrich MISSING_REF findings with human-readable rule names and field context
  for (const f of result.findings) {
    if (f.code === 'MISSING_REF' && f.affectedEntityRefs.length >= 2) {
      const [ruleId, missingId] = f.affectedEntityRefs;
      const rule = normalized.rules.find((r: { id: string; name?: string; ruleId?: string }) => r.id === ruleId);
      const ruleName = rule?.name || rule?.ruleId || ruleId;
      let field = 'object';
      if (rule) {
        const r = rule as { sourceRefs?: string[]; destinationRefs?: string[]; serviceRefs?: string[] };
        if (r.sourceRefs?.includes(missingId)) field = 'Source';
        else if (r.destinationRefs?.includes(missingId)) field = 'Destination';
        else if (r.serviceRefs?.includes(missingId)) field = 'Service';
      }
      f.message = `Rule "${ruleName}" references missing ${field} (object not in source config)`;
    }
  }

  return NextResponse.json(result);
}
