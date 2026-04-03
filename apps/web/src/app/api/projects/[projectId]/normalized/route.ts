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

  const data = await prisma.normalizedData.findFirst({
    where: { projectId, tenantId: auth.session.tenantId },
  });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let migrationReport: unknown = {};
  try {
    migrationReport = JSON.parse(data.migrationReportJson || '{}');
  } catch {
    migrationReport = {};
  }

  return NextResponse.json({
    objects: JSON.parse(data.objectsJson),
    rules: JSON.parse(data.rulesJson),
    nat: JSON.parse(data.natJson),
    interfaces: JSON.parse(data.interfacesJson),
    zones: JSON.parse(data.zonesJson),
    warnings: JSON.parse(data.warningsJson),
    migrationReport,
  });
}
