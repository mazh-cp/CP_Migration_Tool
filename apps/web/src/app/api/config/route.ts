import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { requireTenantSession } from '@/lib/project-access';

const PIN_COOKIE = 'cisco2cp_config_unlocked';
const PIN_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);

async function isConfigUnlocked(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PIN_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, PIN_SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const session = await requireTenantSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const unlocked = await isConfigUnlocked();
    const pinRequired = !!(process.env.CONFIG_PIN);
    const aiValidationEnabled = process.env.AI_VALIDATION_ENABLED === 'true';
    const aiValidationOutboundEnabled = process.env.AI_VALIDATION_OUTBOUND_ENABLED === 'true';
    const openAiApiKeyConfigured = !!process.env.OPENAI_API_KEY?.trim();

    if (!session.isPlatformAdmin) {
      return NextResponse.json({
        canManageAppConfig: false,
        configUnlocked: false,
        pinRequired,
        aiValidationEnabled,
        aiValidationOutboundEnabled,
        openAiApiKeyConfigured,
      });
    }

    const config = await prisma.appConfig.findUnique({ where: { id: 'default' } });
    return NextResponse.json({
      canManageAppConfig: true,
      modelFetchMethod: config?.modelFetchMethod ?? 'default',
      litellmBaseUrl: config?.litellmBaseUrl ?? '',
      litellmModel: config?.litellmModel ?? 'gpt-4',
      apiKeyConfigured: !!(config?.litellmApiKey),
      configUnlocked: unlocked,
      pinRequired,
      aiValidationEnabled,
      aiValidationOutboundEnabled,
      openAiApiKeyConfigured,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await requireTenantSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isPlatformAdmin) {
    return NextResponse.json({ error: 'Only the platform administrator can change application configuration' }, { status: 403 });
  }

  const unlocked = await isConfigUnlocked();
  if (process.env.CONFIG_PIN && !unlocked) {
    return NextResponse.json({ error: 'Config locked. Verify PIN first.' }, { status: 403 });
  }
  const body = (await req.json()) as {
    modelFetchMethod?: string;
    litellmBaseUrl?: string;
    litellmModel?: string;
    litellmApiKey?: string;
  };

  const updateData: {
    modelFetchMethod?: string;
    litellmBaseUrl?: string | null;
    litellmModel?: string | null;
    litellmApiKey?: string | null;
  } = {
    modelFetchMethod: body.modelFetchMethod ?? undefined,
    litellmBaseUrl: body.litellmBaseUrl ?? undefined,
    litellmModel: body.litellmModel ?? undefined,
  };

  if ('litellmApiKey' in body) {
    updateData.litellmApiKey = body.litellmApiKey && body.litellmApiKey.trim() ? body.litellmApiKey.trim() : null;
  }

  const config = await prisma.appConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      modelFetchMethod: body.modelFetchMethod ?? 'default',
      litellmBaseUrl: body.litellmBaseUrl ?? null,
      litellmModel: body.litellmModel ?? null,
      litellmApiKey: body.litellmApiKey && body.litellmApiKey.trim() ? body.litellmApiKey.trim() : null,
    },
    update: updateData,
  });

  const { litellmApiKey: _key, ...safeConfig } = config;
  return NextResponse.json(safeConfig);
}
