import { parseASA } from '../asa/parser';
import type { ASAParseResult, ASAAstNode } from '../asa/ast';

export interface FTDParseResult {
  statements: ASAAstNode[];
  warnings: string[];
}

export function parseFtdText(content: string): FTDParseResult {
  const warnings: string[] = [];
  const result = parseASA(content);

  for (const w of result.warnings) {
    warnings.push(`FTD text: ${w}`);
  }

  return {
    statements: result.statements,
    warnings: [...warnings, ...result.warnings],
  };
}
