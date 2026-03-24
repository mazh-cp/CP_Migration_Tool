import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';

/**
 * Array element counts only — avoids serializing huge normalized JSON (which can
 * trigger gateway 504 on large configs while GET /normalized streams megabytes).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = auth.session.tenantId;

  const exists = await prisma.normalizedData.findFirst({
    where: { projectId, tenantId },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        objects: number;
        rules: number;
        nat: number;
        interfaces: number;
        warnings: number;
      }>
    >`
      SELECT
        CASE WHEN json_valid(objectsJson) THEN json_array_length(objectsJson) ELSE 0 END AS objects,
        CASE WHEN json_valid(rulesJson) THEN json_array_length(rulesJson) ELSE 0 END AS rules,
        CASE WHEN json_valid(natJson) THEN json_array_length(natJson) ELSE 0 END AS nat,
        CASE WHEN json_valid(interfacesJson) THEN json_array_length(interfacesJson) ELSE 0 END AS interfaces,
        CASE WHEN json_valid(warningsJson) THEN json_array_length(warningsJson) ELSE 0 END AS warnings
      FROM NormalizedData
      WHERE projectId = ${projectId} AND tenantId = ${tenantId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      objects: row.objects ?? 0,
      rules: row.rules ?? 0,
      nat: row.nat ?? 0,
      interfaces: row.interfaces ?? 0,
      warnings: row.warnings ?? 0,
    });
  } catch {
    const data = await prisma.normalizedData.findFirst({
      where: { projectId, tenantId },
    });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      objects: (JSON.parse(data.objectsJson) as unknown[]).length,
      rules: (JSON.parse(data.rulesJson) as unknown[]).length,
      nat: (JSON.parse(data.natJson) as unknown[]).length,
      interfaces: (JSON.parse(data.interfacesJson) as unknown[]).length,
      warnings: (JSON.parse(data.warningsJson) as unknown[]).length,
    });
  }
}
