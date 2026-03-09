import { prisma } from './prisma';

/**
 * LiteLLM model fetch - uses OpenAI-compatible API exposed by LiteLLM proxy.
 * Call this when modelFetchMethod is 'litellm' to get AI completions.
 */
export interface LiteLLMOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

/**
 * Get LiteLLM config from database (server-side only).
 * API key is never exposed to client - use this in API routes or server components.
 */
export async function getLiteLLMConfig(): Promise<LiteLLMOptions | null> {
  const config = await prisma.appConfig.findUnique({ where: { id: 'default' } });
  if (!config || config.modelFetchMethod !== 'litellm' || !config.litellmBaseUrl || !config.litellmModel) {
    return null;
  }
  return {
    baseUrl: config.litellmBaseUrl,
    model: config.litellmModel,
    apiKey: config.litellmApiKey ?? undefined,
  };
}

export async function litellmCompletion(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: LiteLLMOptions
): Promise<string> {
  const url = `${options.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.apiKey && { Authorization: `Bearer ${options.apiKey}` }),
    },
    body: JSON.stringify({
      model: options.model,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LiteLLM error ${res.status}: ${err}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}
