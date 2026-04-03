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

  if (rule.sourceInterfaceNames?.length || rule.destinationInterfaceNames?.length) {
    const parts = [
      ...(rule.sourceInterfaceNames ?? []).map((n) => `srcintf:${n}`),
      ...(rule.destinationInterfaceNames ?? []).map((n) => `dstintf:${n}`),
    ];
    warnings.push(
      `FortiGate interface/zone context (${parts.join(', ')}); map to installation targets / topology in SmartConsole`
    );
    confidenceScore = Math.min(confidenceScore, 0.85);
  }

  if (rule.utmProfileRefs && Object.keys(rule.utmProfileRefs).length > 0) {
    warnings.push(
      'Rule has Forti UTM/security profiles; recreate IPS/AV/URL/etc. in Check Point manually (see normalized rule comments)'
    );
    confidenceScore = Math.min(confidenceScore, 0.8);
  }

  if (rule.identityGroupNames?.length || rule.identityUserNames?.length) {
    warnings.push(
      'Rule uses Forti user/group identity; map to Check Point Identity Awareness — do not treat as IP-only access'
    );
    confidenceScore = Math.min(confidenceScore, 0.65);
  }

  if (rule.possibleInternetServiceNames?.length) {
    warnings.push(
      `Possible Forti internet-service / ISDB names on rule: ${rule.possibleInternetServiceNames.join(', ')} — map or define explicitly in Check Point`
    );
    confidenceScore = Math.min(confidenceScore, 0.75);
  }

  const proposedTarget: CheckPointRule = {
    type: 'access-rule',
    name: rule.name || rule.id,
    source: rule.sourceRefs,
    destination: rule.destinationRefs,
    service: rule.serviceRefs,
    action,
    track,
    enabled: rule.enabled,
    comments: rule.comments,
  };

  reasons.push(`Access rule: ${rule.action} -> ${action}, log: ${rule.log} -> ${track}${rule.enabled ? '' : '; disabled'}`);

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
