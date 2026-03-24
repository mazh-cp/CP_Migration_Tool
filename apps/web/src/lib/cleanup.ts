/**
 * Weekly cleanup: prune expired sessions, delete stalled upload files.
 * Runs automatically every Saturday 2 AM via internal scheduler (instrumentation.ts),
 * or manually via npm run cleanup / POST /api/cron/cleanup.
 */

import { prisma } from './prisma';
import { readdir, stat, unlink } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const UPLOAD_MAX_AGE_DAYS = parseInt(process.env.CLEANUP_UPLOAD_DAYS || '30', 10);
const AUDIT_RETENTION_DAYS = parseInt(process.env.CLEANUP_AUDIT_RETENTION_DAYS || '365', 10);

export type CleanupResult = {
  expiredUserSessions: number;
  expiredPlatformAdminSessions: number;
  deletedUploadFiles: number;
  prunedAuditLogs: number;
  errors: string[];
};

export async function runWeeklyCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = {
    expiredUserSessions: 0,
    expiredPlatformAdminSessions: 0,
    deletedUploadFiles: 0,
    prunedAuditLogs: 0,
    errors: [],
  };

  const now = new Date();

  try {
    const expiredSessions = await prisma.userSession.deleteMany({
      where: {
        OR: [
          { status: { not: 'ACTIVE' } },
          { expiresAt: { lt: now } },
        ],
      },
    });
    result.expiredUserSessions = expiredSessions.count;
  } catch (e) {
    result.errors.push(`UserSession cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const expiredAdmin = await prisma.platformAdminSession.deleteMany({
      where: {
        OR: [
          { status: { not: 'ACTIVE' } },
          { expiresAt: { lt: now } },
        ],
      },
    });
    result.expiredPlatformAdminSessions = expiredAdmin.count;
  } catch (e) {
    result.errors.push(`PlatformAdminSession cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const cutoff = new Date(now.getTime() - UPLOAD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await deleteOldUploadFiles(UPLOAD_DIR, cutoff);
    result.deletedUploadFiles = deleted;
  } catch (e) {
    result.errors.push(`Upload cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (AUDIT_RETENTION_DAYS > 0) {
    try {
      const auditCutoff = new Date(
        now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000
      );
      const pruned = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: auditCutoff } },
      });
      result.prunedAuditLogs = pruned.count;
    } catch (e) {
      result.errors.push(`AuditLog prune: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

async function deleteOldUploadFiles(dir: string, cutoff: Date): Promise<number> {
  let deleted = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        deleted += await deleteOldUploadFiles(full, cutoff);
        try {
          const subEntries = await readdir(full);
          if (subEntries.length === 0) {
            const { rmdir } = await import('fs/promises');
            await rmdir(full);
          }
        } catch {
          // ignore
        }
      } else if (ent.isFile()) {
        const st = await stat(full);
        if (st.mtime < cutoff) {
          await unlink(full);
          deleted++;
        }
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  return deleted;
}
