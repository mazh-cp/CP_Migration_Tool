import type { NormalizedNATRule } from '../models/normalized';
import type { MappingDecision, CheckPointNatRule } from '../models/mapping';
import { createId } from '../utils/id';

export function mapNat(natRules: NormalizedNATRule[]): MappingDecision[] {
  const decisions: MappingDecision[] = [];
  let order = 0;

  for (const rule of natRules) {
    const decision = mapNatRule(rule, order++);
    decisions.push(decision);
  }

  return decisions;
}

function mapNatRule(rule: NormalizedNATRule, order: number): MappingDecision {
  const sourceId = rule.id;
  let confidenceScore = 1.0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  let type: 'static' | 'hide' | 'dynamic' = 'dynamic';
  if (rule.type === 'static') type = 'static';
  else if (rule.type === 'pat' || rule.type === 'hide') type = 'hide';
  else type = 'dynamic';

  const proposedTarget: CheckPointNatRule = {
    type,
    originalSource: rule.originalSrc,
    originalDestination: rule.originalDst,
    originalService: rule.originalSvc,
    translatedSource: rule.translatedSrc,
    translatedDestination: rule.translatedDst,
    translatedService: rule.translatedSvc,
    comments: `Order: ${order}`,
  };

  reasons.push(`${rule.type} NAT -> Check Point ${type}`);

  if (rule.type === 'no-nat') {
    warnings.push('No-NAT rules may need manual configuration in Check Point');
    confidenceScore = 0.7;
  }

  return {
    id: createId(),
    entityType: 'nat',
    sourceId,
    proposedTarget,
    confidenceScore,
    reasons,
    warnings,
  };
}
