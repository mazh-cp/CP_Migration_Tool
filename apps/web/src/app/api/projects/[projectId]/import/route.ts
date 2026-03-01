import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { saveArtifact } from '@/lib/upload';
import { logger } from '@/lib/logger';

const importSchema = z.object({
  sourceType: z.enum(['asa', 'ftd']),
  filename: z.string().optional(),
  content: z.string(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const body = await req.json();
    const { sourceType, filename, content } = importSchema.parse(body);

    const { path: filePath, size, sha256 } = await saveArtifact(
      projectId,
      filename || `import.${sourceType === 'asa' ? 'txt' : 'json'}`,
      content
    );

    const artifact = await prisma.rawArtifact.create({
      data: {
        projectId,
        filename: filename || 'import',
        size,
        sha256,
        content,
        sourceType,
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'imported', currentStep: 'parse', completedSteps: JSON.stringify(['import']) },
    });

    logger.info({ projectId, artifactId: artifact.id, sha256 }, 'Artifact imported');
    return NextResponse.json(artifact);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    logger.error({ err, projectId }, 'Import failed');
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
