#!/usr/bin/env npx ts-node
/**
 * Weekly cleanup script. Run via cron every Saturday at 2 AM:
 * 0 2 * * 6 cd /path/to/apps/web && npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/weekly-cleanup.ts
 *
 * Or: 0 2 * * 6 curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/cleanup
 */

import { runWeeklyCleanup } from '../src/lib/cleanup';

async function main() {
  console.log('[cleanup] Starting weekly cleanup at', new Date().toISOString());
  const result = await runWeeklyCleanup();
  console.log('[cleanup] Expired UserSessions:', result.expiredUserSessions);
  console.log('[cleanup] Expired PlatformAdminSessions:', result.expiredPlatformAdminSessions);
  console.log('[cleanup] Deleted upload files:', result.deletedUploadFiles);
  console.log('[cleanup] Pruned audit logs:', result.prunedAuditLogs);
  if (result.errors.length > 0) {
    console.error('[cleanup] Errors:', result.errors);
    process.exit(1);
  }
  console.log('[cleanup] Done');
}

main().catch((e) => {
  console.error('[cleanup] Fatal:', e);
  process.exit(1);
});
