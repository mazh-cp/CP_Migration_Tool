import type { NormalizedResult } from '@cisco2cp/core';
import type { MappingDecision } from '@cisco2cp/core';
import { ANY_NET_ID, ANY_SVC_ID } from '@cisco2cp/core';

export interface ExportJsonInput {
  projectId: string;
  normalized: NormalizedResult;
  mappingDecisions: MappingDecision[];
}

export interface CheckPointJsonBundle {
  objects: unknown[];
  services: unknown[];
  groups: unknown[];
  rules: unknown[];
  nat: unknown[];
  zones: unknown[];
  meta: { projectId: string; exportedAt: string };
}

export function exportToJson(input: ExportJsonInput): CheckPointJsonBundle {
  const { projectId, normalized, mappingDecisions } = input;

  const objDecisions = mappingDecisions.filter((d) => d.entityType === 'object' || d.entityType === 'service');
  const ruleDecisions = mappingDecisions.filter((d) => d.entityType === 'rule');
  const natDecisions = mappingDecisions.filter((d) => d.entityType === 'nat');

  const objects: unknown[] = [];
  const services: unknown[] = [];
  const groups: unknown[] = [];
  const rules: unknown[] = [];
  const nat: unknown[] = [];
  const zones = normalized.zones.map((z) => ({ name: z.name }));

  const nameById = new Map<string, string>();
  nameById.set(ANY_NET_ID, 'Any');
  nameById.set(ANY_SVC_ID, 'Any');
  for (const obj of normalized.objects) {
    nameById.set(obj.id, obj.name);
  }

  for (const d of objDecisions) {
    const target = d.proposedTarget as { type: string; name: string; members?: string[] };
    if (target.type === 'group') {
      groups.push({ ...target, members: target.members || [] });
    } else if (
      target.type === 'service-tcp' ||
      target.type === 'service-udp' ||
      target.type === 'service-icmp'
    ) {
      services.push(target);
    } else {
      objects.push(target);
    }
  }

  for (const d of ruleDecisions) {
    const target = d.proposedTarget as unknown as { source?: string[]; destination?: string[]; service?: string[]; [k: string]: unknown };
    const rule = {
      ...target,
      source: target.source?.map((id: string) => nameById.get(id) || id) || [],
      destination: target.destination?.map((id: string) => nameById.get(id) || id) || [],
      service: target.service?.map((id: string) => nameById.get(id) || id) || [],
    };
    rules.push(rule);
  }

  for (const d of natDecisions) {
    nat.push(d.proposedTarget);
  }

  return {
    objects,
    services,
    groups,
    rules,
    nat,
    zones,
    meta: { projectId, exportedAt: new Date().toISOString() },
  };
}
