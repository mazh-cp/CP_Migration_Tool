export interface AiValidationInput {
  projectId: string;
  tenantId: string;
  sourceType: string;
  redactedPayload: unknown;
  outboundEnabled: boolean;
}

export interface AiValidationProviderResult {
  provider: string;
  model: string;
  findings: string[];
  note?: string;
  requestHash?: string;
  responseHash?: string;
  outboundCalled?: boolean;
}

export interface AiValidationProvider {
  readonly providerName: string;
  validate(input: AiValidationInput): Promise<AiValidationProviderResult>;
}
