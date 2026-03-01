export type ValidationSeverity = 'info' | 'warn' | 'error';

export interface ValidationFinding {
  id: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
  affectedEntityRefs: string[];
  suggestedFix?: string;
}

export interface ValidationResult {
  findings: ValidationFinding[];
  hasErrors: boolean;
  hasWarnings: boolean;
}
