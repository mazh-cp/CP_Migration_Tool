import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validate } from '@cisco2cp/core';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
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

  return NextResponse.json(result);
}
