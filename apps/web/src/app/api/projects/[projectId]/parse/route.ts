import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseASA } from '@cisco2cp/parsers';
import { parseFtdJson, parseFtdText } from '@cisco2cp/parsers';
import { normalizeAsa, normalizeFtd, validate } from '@cisco2cp/core';
import { mapObjects, mapPolicy, mapNat } from '@cisco2cp/core';
import { logger } from '@/lib/logger';
import { requireProjectAccess } from '@/lib/project-access';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { artifacts: true },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const artifact = project.artifacts[0];
  if (!artifact?.content) {
    return NextResponse.json({ error: 'No artifact content to parse' }, { status: 400 });
  }

  const job = await prisma.job.create({
    data: { projectId, type: 'parse', status: 'running', startedAt: new Date() },
  });

  try {
    let statements: { type: string; [k: string]: unknown }[];

    if (artifact.sourceType === 'asa') {
      const result = parseASA(artifact.content);
      statements = result.statements as { type: string; [k: string]: unknown }[];
    } else {
      try {
        const jsonResult = parseFtdJson(artifact.content);
        statements = (jsonResult.statements.length > 0
          ? jsonResult.statements
          : parseFtdText(artifact.content).statements) as { type: string; [k: string]: unknown }[];
      } catch {
        const textResult = parseFtdText(artifact.content);
        statements = textResult.statements as { type: string; [k: string]: unknown }[];
      }
    }

    const normalize = artifact.sourceType === 'asa' ? normalizeAsa : normalizeFtd;
    const normalized = normalize(statements as never);

    const mappingDecisions = [
      ...mapObjects(normalized.objects),
      ...mapPolicy(normalized.rules),
      ...mapNat(normalized.nat),
    ];

    const validation = validate(normalized);

    await prisma.normalizedData.upsert({
      where: { projectId },
      create: {
        projectId,
        objectsJson: JSON.stringify(normalized.objects),
        rulesJson: JSON.stringify(normalized.rules),
        natJson: JSON.stringify(normalized.nat),
        interfacesJson: JSON.stringify(normalized.interfaces),
        zonesJson: JSON.stringify(normalized.zones),
        warningsJson: JSON.stringify(normalized.warnings),
      },
      update: {
        objectsJson: JSON.stringify(normalized.objects),
        rulesJson: JSON.stringify(normalized.rules),
        natJson: JSON.stringify(normalized.nat),
        interfacesJson: JSON.stringify(normalized.interfaces),
        zonesJson: JSON.stringify(normalized.zones),
        warningsJson: JSON.stringify(normalized.warnings),
      },
    });

    for (const d of mappingDecisions) {
      await prisma.mappingDecisionRecord.upsert({
        where: {
          projectId_entityType_sourceId: {
            projectId,
            entityType: d.entityType,
            sourceId: d.sourceId,
          },
        },
        create: {
          projectId,
          entityType: d.entityType,
          sourceId: d.sourceId,
          proposedTarget: JSON.stringify(d.proposedTarget),
          confidenceScore: d.confidenceScore,
          reasonsJson: JSON.stringify(d.reasons),
          warningsJson: JSON.stringify(d.warnings),
        },
        update: {
          proposedTarget: JSON.stringify(d.proposedTarget),
          confidenceScore: d.confidenceScore,
          reasonsJson: JSON.stringify(d.reasons),
          warningsJson: JSON.stringify(d.warnings),
        },
      });
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: validation.hasErrors ? 'parsed' : 'mapped',
        currentStep: 'map-interfaces',
        completedSteps: JSON.stringify(['import', 'parse']),
      },
    });

    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'completed', finishedAt: new Date() },
    });

    logger.info({ projectId, jobId: job.id }, 'Parse completed');

    return NextResponse.json({
      objects: normalized.objects.length,
      rules: normalized.rules.length,
      nat: normalized.nat.length,
      interfaces: normalized.interfaces.length,
      warnings: normalized.warnings.length,
      findings: validation.findings.length,
    });
  } catch (err) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err, projectId }, 'Parse failed');
    return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
  }
}
