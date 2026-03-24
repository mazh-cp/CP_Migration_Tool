import { randomUUID } from 'crypto';
import type { MappingDecision } from '@cisco2cp/core';
import { parseASA } from '@cisco2cp/parsers';
import { parseFtdJson, parseFtdText } from '@cisco2cp/parsers';
import { normalizeAsa, normalizeFtd, validate } from '@cisco2cp/core';
import { mapObjects, mapPolicy, mapNat } from '@cisco2cp/core';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/** SQLite variable limit — keep batches small enough for createMany. */
const MAPPING_BATCH = 80;

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
    const t0 = Date.now();
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
    logger.info(
      { projectId, jobId, phase: 'parse', ms: Date.now() - t0, statements: statements.length },
      'Parse: lexer/parser done'
    );

    const t1 = Date.now();
    const normalize = artifact.sourceType === 'asa' ? normalizeAsa : normalizeFtd;
    const normalized = normalize(statements as never);
    logger.info(
      {
        projectId,
        jobId,
        phase: 'normalize',
        ms: Date.now() - t1,
        objects: normalized.objects.length,
        rules: normalized.rules.length,
        nat: normalized.nat.length,
      },
      'Parse: normalize done'
    );

    const t2 = Date.now();
    const mappingDecisions: MappingDecision[] = [
      ...mapObjects(normalized.objects),
      ...mapPolicy(normalized.rules),
      ...mapNat(normalized.nat),
    ];
    logger.info(
      { projectId, jobId, phase: 'map', ms: Date.now() - t2, decisions: mappingDecisions.length },
      'Parse: map decisions built'
    );

    const validation = validate(normalized);

    const t3 = Date.now();
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
    logger.info({ projectId, jobId, phase: 'persist_normalized', ms: Date.now() - t3 }, 'Parse: normalized row written');

    const t4 = Date.now();
    await prisma.mappingDecisionRecord.deleteMany({ where: { projectId } });
    for (let i = 0; i < mappingDecisions.length; i += MAPPING_BATCH) {
      const batch = mappingDecisions.slice(i, i + MAPPING_BATCH);
      await prisma.mappingDecisionRecord.createMany({
        data: batch.map((d) => ({
          id: d.id || randomUUID(),
          projectId,
          tenantId,
          entityType: d.entityType,
          sourceId: d.sourceId,
          proposedTarget: JSON.stringify(d.proposedTarget),
          confidenceScore: d.confidenceScore,
          reasonsJson: JSON.stringify(d.reasons),
          warningsJson: JSON.stringify(d.warnings),
        })),
      });
    }
    logger.info(
      {
        projectId,
        jobId,
        phase: 'persist_mappings',
        ms: Date.now() - t4,
        rows: mappingDecisions.length,
        batches: Math.ceil(mappingDecisions.length / MAPPING_BATCH) || 0,
      },
      'Parse: mapping rows written (batched)'
    );

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

    logger.info({ projectId, jobId, totalMs: Date.now() - t0 }, 'Parse completed');
  } catch (err) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err, projectId, jobId }, 'Parse failed');
  }
}
