import { prisma } from '@/lib/prisma';
import { parseASA } from '@cisco2cp/parsers';
import { parseFtdJson, parseFtdText } from '@cisco2cp/parsers';
import { normalizeAsa, normalizeFtd, validate } from '@cisco2cp/core';
import { mapObjects, mapPolicy, mapNat } from '@cisco2cp/core';
import { logger } from '@/lib/logger';

/**
 * Long-running parse/normalize/map work. Invoked without awaiting the HTTP response
 * so reverse proxies (504 gateway timeout) do not kill the request mid-parse.
 */
export async function executeParseJob(jobId: string, projectId: string, tenantId: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    include: { artifacts: true },
  });
  if (!project) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: 'Project not found', finishedAt: new Date() },
    });
    return;
  }

  const artifact = project.artifacts[0];
  if (!artifact?.content) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: 'No artifact content to parse', finishedAt: new Date() },
    });
    return;
  }

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
        tenantId,
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
          tenantId,
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
      where: { id: jobId },
      data: { status: 'completed', finishedAt: new Date() },
    });

    logger.info({ projectId, jobId }, 'Parse completed');
  } catch (err) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err, projectId, jobId }, 'Parse failed');
  }
}
