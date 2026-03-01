/**
 * LiteLLM model fetch - uses OpenAI-compatible API exposed by LiteLLM proxy.
 * Call this when modelFetchMethod is 'litellm' to get AI completions.
 */
export interface LiteLLMOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
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
