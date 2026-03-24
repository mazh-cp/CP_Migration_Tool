import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { requireProjectAccess } from '@/lib/project-access';
import { redactForAi } from '@/lib/ai/redaction';
import { OpenAiValidationProvider } from '@/lib/ai/openai-provider';
import { getClientMeta, writeAudit } from '@/lib/audit';

function isAiValidationEnabled(): boolean {
  return process.env.AI_VALIDATION_ENABLED === 'true';
}

function isAiOutboundEnabled(): boolean {
  return process.env.AI_VALIDATION_OUTBOUND_ENABLED === 'true';
}

function getArrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!isAiValidationEnabled()) {
    return NextResponse.json(
      { error: 'AI validation is disabled. Set AI_VALIDATION_ENABLED=true to enable this endpoint.' },
      { status: 403 }
    );
  }

  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const [project, normalized] = await Promise.all([
      prisma.project.findFirst({
        where: { id: projectId, tenantId: auth.session.tenantId },
        select: { id: true, name: true, sourceType: true, status: true, updatedAt: true },
      }),
      prisma.normalizedData.findFirst({
        where: { projectId, tenantId: auth.session.tenantId },
      }),
    ]);

    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!normalized) {
      return NextResponse.json(
        { error: 'No normalized data found. Run parse/normalize before AI validation.' },
        { status: 400 }
      );
    }

    const payload = {
      project,
      normalized: {
        objects: JSON.parse(normalized.objectsJson),
        rules: JSON.parse(normalized.rulesJson),
        nat: JSON.parse(normalized.natJson),
        interfaces: JSON.parse(normalized.interfacesJson),
        zones: JSON.parse(normalized.zonesJson),
        warnings: JSON.parse(normalized.warningsJson),
      },
    };

    const { redacted, summary } = redactForAi(payload);
    const outboundEnabled = isAiOutboundEnabled();
    const provider = new OpenAiValidationProvider();
    const providerResult = await provider.validate({
      projectId: project.id,
      tenantId: auth.session.tenantId,
      sourceType: project.sourceType,
      redactedPayload: redacted,
      outboundEnabled,
    });

    const { ipAddress, userAgent } = getClientMeta(req);
    await writeAudit({
      actorUserId: auth.session.userId,
      tenantId: auth.session.tenantId,
      action: 'ai_validate',
      resourceType: 'Project',
      resourceId: project.id,
      result: 'success',
      details: {
        provider: providerResult.provider,
        model: providerResult.model,
        outboundEnabled,
        outboundCalled: !!providerResult.outboundCalled,
        requestHash: providerResult.requestHash ?? null,
        responseHash: providerResult.responseHash ?? null,
        findingsCount: providerResult.findings.length,
        redactionSummary: summary,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      mode: outboundEnabled ? 'phase-2' : 'scaffold',
      outboundEnabled,
      outboundCalls: !!providerResult.outboundCalled,
      provider: providerResult.provider,
      model: providerResult.model,
      note: providerResult.note,
      redactionSummary: summary,
      audit: {
        requestHash: providerResult.requestHash ?? null,
        responseHash: providerResult.responseHash ?? null,
      },
      counts: {
        objects: getArrayCount((redacted as { normalized?: { objects?: unknown } }).normalized?.objects),
        rules: getArrayCount((redacted as { normalized?: { rules?: unknown } }).normalized?.rules),
      },
      findings: providerResult.findings,
    });
  } catch (err) {
    logger.error({ err, projectId }, 'AI validation failed');
    return NextResponse.json({ error: 'AI validation failed' }, { status: 500 });
  }
}
