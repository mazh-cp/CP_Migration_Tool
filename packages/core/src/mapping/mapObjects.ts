import type { NormalizedObject } from '../models/normalized';
import type { MappingDecision, CheckPointTarget } from '../models/mapping';
import { createId } from '../utils/id';

export function mapObjects(objects: NormalizedObject[]): MappingDecision[] {
  const decisions: MappingDecision[] = [];

  for (const obj of objects) {
    const decision = mapObject(obj);
    if (decision) decisions.push(decision);
  }

  return decisions;
}

function mapObject(obj: NormalizedObject): MappingDecision | null {
  const sourceId = obj.id;
  let proposedTarget: CheckPointTarget;
  let confidenceScore = 1.0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (obj.type === 'host') {
    proposedTarget = {
      type: 'host',
      name: obj.name,
      ipAddress: obj.value,
    };
    reasons.push('Direct equivalent: host -> Check Point host object');
  } else if (obj.type === 'network') {
    proposedTarget = {
      type: 'network',
      name: obj.name,
      subnet: obj.value?.split('/')[0],
      subnetMask: obj.value?.includes('/') ? obj.value.split('/')[1] : undefined,
    };
    reasons.push('Direct equivalent: network -> Check Point network object');
  } else if (obj.type === 'range') {
    proposedTarget = {
      type: 'range',
      name: obj.name,
      rangeFrom: obj.values?.[0],
      rangeTo: obj.values?.[1],
    };
    reasons.push('Direct equivalent: range -> Check Point range object');
  } else if (obj.type === 'fqdn') {
    proposedTarget = {
      type: 'host',
      name: obj.name,
      ipAddress: obj.value,
    };
    warnings.push('FQDN mapped to host; Check Point supports FQDN objects natively - consider remapping');
    confidenceScore = 0.8;
    reasons.push('FQDN mapped as host; manual review recommended');
  } else if (obj.type === 'group') {
    proposedTarget = {
      type: 'group',
      name: obj.name,
      members: obj.members || [],
    };
    reasons.push('Direct equivalent: group -> Check Point group');
  } else if (obj.type === 'service') {
    const cpType =
      obj.proto === 'tcp'
        ? 'service-tcp'
        : obj.proto === 'udp'
          ? 'service-udp'
          : obj.proto === 'icmp'
            ? 'service-icmp'
            : 'service-tcp';
    proposedTarget = {
      type: cpType,
      name: obj.name,
      port: obj.port,
      portFrom: obj.portRange?.from,
      portTo: obj.portRange?.to,
      protocol: obj.proto,
    };
    reasons.push(`Service ${obj.proto} -> Check Point ${cpType}`);
  } else if (obj.type === 'service-group') {
    proposedTarget = {
      type: 'group',
      name: obj.name,
      members: obj.members || [],
    };
    if (obj.members && obj.members.length > 1) {
      warnings.push('Service group contains multiple members; verify protocol consistency');
      confidenceScore = 0.9;
    }
    reasons.push('Service group -> Check Point group');
  } else {
    return null;
  }

  return {
    id: createId(),
    entityType: obj.type === 'service' || obj.type === 'service-group' ? 'service' : 'object',
    sourceId,
    proposedTarget,
    confidenceScore,
    reasons,
    warnings,
  };
}
