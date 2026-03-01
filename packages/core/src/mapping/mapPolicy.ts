import type { NormalizedPolicyRule } from '../models/normalized';
import type { MappingDecision, CheckPointRule } from '../models/mapping';
import { createId } from '../utils/id';

export function mapPolicy(rules: NormalizedPolicyRule[]): MappingDecision[] {
  const decisions: MappingDecision[] = [];

  for (const rule of rules) {
    const decision = mapRule(rule);
    decisions.push(decision);
  }

  return decisions;
}

function mapRule(rule: NormalizedPolicyRule): MappingDecision {
  const sourceId = rule.id;
  let confidenceScore = 1.0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  const action = rule.action === 'allow' ? 'accept' : rule.action === 'deny' ? 'drop' : 'reject';
  const track = rule.log === 'none' ? 'none' : rule.log === 'alert' ? 'alert' : 'log';

  if (rule.sourceRefs.length === 0 || rule.destinationRefs.length === 0) {
    warnings.push('Rule has any source or destination; verify intended scope');
    confidenceScore = 0.9;
  }

  const proposedTarget: CheckPointRule = {
    type: 'access-rule',
    name: rule.name || rule.id,
    source: rule.sourceRefs,
    destination: rule.destinationRefs,
    service: rule.serviceRefs,
    action,
    track,
    comments: rule.comments,
  };

  reasons.push(`Access rule: ${rule.action} -> ${action}, log: ${rule.log} -> ${track}`);

  return {
    id: createId(),
    entityType: 'rule',
    sourceId,
    proposedTarget,
    confidenceScore,
    reasons,
    warnings,
  };
}
