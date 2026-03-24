import type { AiValidationInput, AiValidationProvider, AiValidationProviderResult } from './provider';
import { sha256Json } from './hash';

export class OpenAiValidationProvider implements AiValidationProvider {
  readonly providerName = 'openai';

  async validate(input: AiValidationInput): Promise<AiValidationProviderResult> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const requestBody = {
      model,
      input: [
        {
          role: 'system',
          content:
            'You are a firewall migration validation assistant. Return concise findings only. Input is already redacted.',
        },
        {
          role: 'user',
          content: JSON.stringify(input.redactedPayload),
        },
      ],
      max_output_tokens: 800,
    };
    const requestHash = sha256Json(requestBody);
    if (!input.outboundEnabled) {
      return {
        provider: this.providerName,
        model,
        findings: [],
        note: 'Outbound AI requests are disabled by feature flag.',
        requestHash,
        outboundCalled: false,
      };
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return {
        provider: this.providerName,
        model,
        findings: [],
        note: 'OPENAI_API_KEY is not configured. Outbound request skipped.',
        requestHash,
        outboundCalled: false,
      };
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return {
        provider: this.providerName,
        model,
        findings: [],
        note: `OpenAI request failed with status ${response.status}`,
        requestHash,
        responseHash: sha256Json({ status: response.status }),
        outboundCalled: true,
      };
    }

    const data = (await response.json()) as {
      output_text?: string;
    };
    const outputText = (data.output_text || '').trim();
    const findings = outputText
      ? outputText
          .split(/\r?\n/)
          .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
          .filter((line) => line.length > 0)
      : [];

    const responseHash = sha256Json({ outputText });
    return {
      provider: this.providerName,
      model,
      findings,
      note: findings.length === 0 ? 'No findings returned by model.' : undefined,
      requestHash,
      responseHash,
      outboundCalled: true,
    };
  }
}
