/**
 * One-off backfill: re-run secret redaction over existing NormalizedData rows.
 *
 * Rows parsed before the redaction fix may hold raw config lines (with
 * credentials) inside warningsJson / migrationReportJson. New parses are
 * redacted at parse time; this script cleans historical rows in place.
 *
 * Run from repo root: cd apps/web && npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/redact-normalized-data.ts
 * Dry run (report only): add --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { redactSecrets } from '@cisco2cp/core';

const prisma = new PrismaClient();

/** Redact every string value in a parsed JSON structure. */
function redactDeep(value: unknown): unknown {
  if (typeof value === 'string') return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v);
    }
    return out;
  }
  return value;
}

/** Returns the redacted JSON string, or null when nothing changed / unparseable. */
function redactJsonColumn(json: string | null | undefined): string | null {
  if (!json) return null;
  try {
    const redacted = JSON.stringify(redactDeep(JSON.parse(json)));
    return redacted === JSON.stringify(JSON.parse(json)) ? null : redacted;
  } catch {
    return null; // leave malformed JSON untouched
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const rows = await prisma.normalizedData.findMany({
    select: { id: true, projectId: true, warningsJson: true, migrationReportJson: true },
  });

  let changed = 0;
  for (const row of rows) {
    const warnings = redactJsonColumn(row.warningsJson);
    const report = redactJsonColumn(row.migrationReportJson);
    if (!warnings && !report) continue;

    changed++;
    console.log(
      `${dryRun ? '[dry-run] would redact' : 'Redacting'} project ${row.projectId}` +
        `${warnings ? ' (warnings)' : ''}${report ? ' (migration report)' : ''}`
    );
    if (!dryRun) {
      await prisma.normalizedData.update({
        where: { id: row.id },
        data: {
          ...(warnings ? { warningsJson: warnings } : {}),
          ...(report ? { migrationReportJson: report } : {}),
        },
      });
    }
  }

  console.log(`${dryRun ? 'Would redact' : 'Redacted'} ${changed} of ${rows.length} row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
