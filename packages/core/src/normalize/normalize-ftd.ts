import { normalizeAsa } from './normalize-asa';
import type { NormalizedResult } from '../models/normalized';
import type { ASAAstNode } from '@cisco2cp/parsers';

export function normalizeFtd(statements: ASAAstNode[]): NormalizedResult {
  return normalizeAsa(statements);
}
