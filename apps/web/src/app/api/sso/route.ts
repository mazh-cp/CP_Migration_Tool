import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/project-access';

export async function GET() {
  const session = await requireTenantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const idp = await prisma.identityProvider.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  if (!idp) {
    return NextResponse.json({ enabled: false, type: null, config: null });
  }

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(idp.config) as Record<string, unknown>;
  } catch {
    // ignore invalid JSON
  }
  return NextResponse.json({
    enabled: true,
    id: idp.id,
    type: idp.type,
    config,
    updatedAt: idp.updatedAt,
  });
}

const putSchema = {
  enabled: (v: unknown) => typeof v === 'boolean',
  type: (v: unknown): v is 'saml' | 'oidc' =>
    v === 'saml' || v === 'oidc' || v === null || v === undefined,
  config: (v: unknown) =>
    v === null || v === undefined || (typeof v === 'object' && v !== null && !Array.isArray(v)),
};

export async function PUT(req: Request) {
  const session = await requireTenantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { enabled?: boolean; type?: string | null; config?: Record<string, unknown> | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const enabled = body.enabled === true;
  const type = body.type ?? null;
  const config = body.config ?? null;

  if (!putSchema.enabled(body.enabled) && body.enabled !== undefined) {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }
  if (!putSchema.type(type)) {
    return NextResponse.json({ error: 'type must be saml or oidc when provided' }, { status: 400 });
  }
  if (!putSchema.config(config)) {
    return NextResponse.json({ error: 'config must be an object when provided' }, { status: 400 });
  }

  const existing = await prisma.identityProvider.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  if (!enabled) {
    if (existing) {
      await prisma.identityProvider.deleteMany({ where: { tenantId: session.tenantId } });
    }
    return NextResponse.json({ enabled: false, type: null, config: null });
  }

  if (!type || (type !== 'saml' && type !== 'oidc')) {
    return NextResponse.json({ error: 'type is required and must be saml or oidc' }, { status: 400 });
  }

  const configObj = config && typeof config === 'object' ? config : {};
  const configStr = JSON.stringify(configObj);

  if (existing) {
    await prisma.identityProvider.update({
      where: { id: existing.id },
      data: { type, config: configStr },
    });
    return NextResponse.json({
      enabled: true,
      type,
      config: configObj,
      updatedAt: new Date().toISOString(),
    });
  }

  const created = await prisma.identityProvider.create({
    data: { tenantId: session.tenantId, type, config: configStr },
  });
  return NextResponse.json({
    enabled: true,
    id: created.id,
    type: created.type,
    config: configObj,
    updatedAt: created.updatedAt,
  });
}
