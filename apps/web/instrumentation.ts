/**
 * Next.js instrumentation: runs when the Node.js server starts.
 * Schedules internal weekly cleanup (2 AM every Saturday) unless disabled.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const enabled = process.env.CLEANUP_INTERNAL_ENABLED !== 'false';
  if (!enabled) return;

  const cron = await import('node-cron');
  const { runWeeklyCleanup } = await import('./src/lib/cleanup');
  const { logger } = await import('./src/lib/logger');

  // 2 AM every Saturday: 0 2 * * 6
  cron.schedule('0 2 * * 6', async () => {
    try {
      logger.info('Internal cleanup: starting scheduled run');
      const result = await runWeeklyCleanup();
      logger.info(
        {
          expiredUserSessions: result.expiredUserSessions,
          expiredPlatformAdminSessions: result.expiredPlatformAdminSessions,
          deletedUploadFiles: result.deletedUploadFiles,
          prunedAuditLogs: result.prunedAuditLogs,
        },
        'Internal cleanup: completed'
      );
      if (result.errors.length > 0) {
        logger.warn({ errors: result.errors }, 'Internal cleanup: partial errors');
      }
    } catch (e) {
      logger.error({ err: e }, 'Internal cleanup: failed');
    }
  });

  logger.info('Internal cleanup: scheduled for 2 AM every Saturday');
}
