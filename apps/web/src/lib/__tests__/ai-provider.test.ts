import { describe, expect, it } from 'vitest';
import { OpenAiValidationProvider } from '../ai/openai-provider';

describe('OpenAI validation provider scaffold', () => {
  it('does not call outbound when feature flag is disabled in input', async () => {
    const provider = new OpenAiValidationProvider();
    const result = await provider.validate({
      projectId: 'p1',
      tenantId: 't1',
      sourceType: 'ftd',
      redactedPayload: { normalized: { rules: [] } },
      outboundEnabled: false,
    });

    expect(result.provider).toBe('openai');
    expect(result.outboundCalled).toBe(false);
    expect(result.requestHash).toBeTruthy();
    expect(result.responseHash).toBeUndefined();
    expect(result.findings).toEqual([]);
  });
});
