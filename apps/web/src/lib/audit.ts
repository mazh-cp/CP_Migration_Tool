/**
 * Immutable audit logging. All records written server-side; redact secrets.
 */

import { prisma } from './prisma';

const REDACT = '[REDACTED]';

function redactDetails(details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const out: Record<string, unknown> = {};
  const secretKeys = ['password', 'passwordHash', 'content', 'apiKey', 'secret', 'token', 'authorization'];
  for (const [k, v] of Object.entries(details)) {
    const lower = k.toLowerCase();
    if (secretKeys.some((s) => lower.includes(s)) && typeof v === 'string') {
      out[k] = REDACT;
    } else {
      out[k] = v;
    }
  }
  return JSON.stringify(out);
}

export type AuditParams = {
  actorUserId: string;
  tenantId?: string | null;
  platformAdminSessionId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result: 'success' | 'failure';
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAudit(params: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: params.actorUserId,
      tenantId: params.tenantId ?? undefined,
      platformAdminSessionId: params.platformAdminSessionId ?? undefined,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? undefined,
      result: params.result,
      details: redactDetails(params.details ?? null),
      ipAddress: params.ipAddress ?? undefined,
      userAgent: params.userAgent ?? undefined,
    },
  });
}

export function getClientMeta(req: Request): { ipAddress?: string; userAgent?: string } {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? undefined;
  const ua = req.headers.get('user-agent') ?? undefined;
  return { ipAddress: ip, userAgent: ua };
}
