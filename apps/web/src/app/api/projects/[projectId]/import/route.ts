import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { saveArtifact } from '@/lib/upload';
import { logger } from '@/lib/logger';
import { requireProjectAccess } from '@/lib/project-access';

const MAX_IMPORT_BYTES =
  (Number.parseInt(process.env.MAX_UPLOAD_MB || '25', 10) || 25) * 1024 * 1024;

const importSchema = z.object({
  sourceType: z.enum(['asa', 'ftd', 'fortinet', 'fortimanager', 'fortianalyzer', 'paloalto']),
  filename: z.string().max(512).optional(),
  content: z
    .string()
    .refine((s) => Buffer.byteLength(s, 'utf8') <= MAX_IMPORT_BYTES, 'Content exceeds upload limit'),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = auth.session.tenantId;

  try {
    const body = await req.json();
    const { sourceType, filename, content } = importSchema.parse(body);

    const ext =
      sourceType === 'ftd' || sourceType === 'fortimanager' || sourceType === 'fortianalyzer'
        ? 'json'
        : sourceType === 'fortinet'
          ? 'conf'
          : sourceType === 'paloalto'
            ? 'xml'
            : 'txt';
    const { path: filePath, size, sha256 } = await saveArtifact(
      projectId,
      filename || `import.${ext}`,
      content
    );

    const artifact = await prisma.rawArtifact.create({
      data: {
        projectId,
        tenantId,
        filename: filename || 'import',
        size,
        sha256,
        content,
        sourceType,
      },
    });

    await prisma.project.updateMany({
      where: { id: projectId, tenantId },
      data: { status: 'imported', currentStep: 'parse', completedSteps: JSON.stringify(['import']) },
    });

    logger.info({ projectId, artifactId: artifact.id, sha256 }, 'Artifact imported');
    return NextResponse.json({
      id: artifact.id,
      filename: artifact.filename,
      size: artifact.size,
      sha256: artifact.sha256,
      sourceType: artifact.sourceType,
      uploadedAt: artifact.uploadedAt,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('File too large')) {
      return NextResponse.json({ error: msg }, { status: 413 });
    }
    logger.error({ err, projectId }, 'Import failed');
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
