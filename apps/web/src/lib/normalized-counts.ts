import { prisma } from '@/lib/prisma';

export interface NormalizedCounts {
  objects: number;
  rules: number;
  nat: number;
  interfaces: number;
  warnings: number;
}

/** SQLite raw queries may return BigInt — JSON.stringify cannot serialize BigInt. */
function toNumber(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Cheap counts only — same numbers the old synchronous POST /parse returned in JSON.
 */
export async function getNormalizedCounts(
  projectId: string,
  tenantId: string | null
): Promise<NormalizedCounts | null> {
  const exists = await prisma.normalizedData.findFirst({
    where: { projectId, tenantId },
    select: { id: true },
  });
  if (!exists) return null;

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
    if (!row) return null;
    return {
      objects: toNumber(row.objects),
      rules: toNumber(row.rules),
      nat: toNumber(row.nat),
      interfaces: toNumber(row.interfaces),
      warnings: toNumber(row.warnings),
    };
  } catch {
    const data = await prisma.normalizedData.findFirst({
      where: { projectId, tenantId },
    });
    if (!data) return null;
    return {
      objects: (JSON.parse(data.objectsJson) as unknown[]).length,
      rules: (JSON.parse(data.rulesJson) as unknown[]).length,
      nat: (JSON.parse(data.natJson) as unknown[]).length,
      interfaces: (JSON.parse(data.interfacesJson) as unknown[]).length,
      warnings: (JSON.parse(data.warningsJson) as unknown[]).length,
    };
  }
}
