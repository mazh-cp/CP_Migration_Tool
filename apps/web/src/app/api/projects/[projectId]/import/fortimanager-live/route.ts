import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { saveArtifact } from '@/lib/upload';
import { requireProjectAccess } from '@/lib/project-access';
import { logger } from '@/lib/logger';
import { fetchFortiManagerBundle, fortimanagerLogin } from '@/lib/fortimanager-fetch';

const bodySchema = z
  .object({
    baseUrl: z.string().url(),
    session: z.string().min(1).optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    adom: z.string().min(1),
    packageName: z.string().min(1),
    vdom: z.string().optional(),
    filename: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.session?.trim() && !(data.username && data.password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide session (FortiManager API session key) or username and password',
        path: ['session'],
      });
    }
  });

/**
 * Pull policy package + object database from FortiManager via JSON-RPC and store as fortimanager artifact.
 * Credentials are used only for this request and are not persisted.
 */
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
    const parsed = bodySchema.parse(body);

    let session = parsed.session?.trim();
    if (!session && parsed.username && parsed.password) {
      session = await fortimanagerLogin({
        baseUrl: parsed.baseUrl,
        username: parsed.username,
        password: parsed.password,
      });
    }
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 400 });
    }

    const bundle = await fetchFortiManagerBundle({
      baseUrl: parsed.baseUrl,
      session,
      adom: parsed.adom,
      packageName: parsed.packageName,
      vdom: parsed.vdom,
    });

    const content = JSON.stringify(bundle);
    const fname =
      parsed.filename?.trim() ||
      `fortimanager-${parsed.adom}-${parsed.packageName}${parsed.vdom ? `-${parsed.vdom}` : ''}.json`;

    const { size, sha256 } = await saveArtifact(projectId, fname, content);

    const artifact = await prisma.rawArtifact.create({
      data: {
        projectId,
        tenantId,
        filename: fname,
        size,
        sha256,
        content,
        sourceType: 'fortimanager',
      },
    });

    await prisma.project.updateMany({
      where: { id: projectId, tenantId },
      data: { status: 'imported', currentStep: 'parse', completedSteps: JSON.stringify(['import']) },
    });

    logger.info({ projectId, artifactId: artifact.id, adom: parsed.adom }, 'FortiManager live import');
    return NextResponse.json({
      id: artifact.id,
      filename: artifact.filename,
      size: artifact.size,
      sha256: artifact.sha256,
      sourceType: artifact.sourceType,
      uploadedAt: artifact.uploadedAt,
      bundleKeys: Object.keys(bundle),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    logger.error({ err, projectId }, 'FortiManager live import failed');
    return NextResponse.json({ error: 'FortiManager request failed' }, { status: 502 });
  }
}
