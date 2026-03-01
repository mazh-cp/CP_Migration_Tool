import type {
  NormalizedResult,
  NormalizedObject,
  NormalizedPolicyRule,
} from '../models/normalized';
import type { ValidationFinding, ValidationResult } from '../models/validation';
import { createId } from '../utils/id';
import { ANY_NET_ID, ANY_SVC_ID } from '../registry/ObjectRegistry';

export interface ReferentialIntegrityResult {
  ok: boolean;
  missing: Array<{ ruleId: string; field: string; missingId: string }>;
  autoFixed: Array<{ ruleId: string; field: string; missingId: string }>;
}

export function validate(data: NormalizedResult): ValidationResult {
  const findings: ValidationFinding[] = [];

  validateUniqueness(data, findings);
  validateMissingRefs(data, findings);
  validateServiceDefinitions(data, findings);

  const hasErrors = findings.some((f) => f.severity === 'error');
  const hasWarnings = findings.some((f) => f.severity === 'warn');

  return { findings, hasErrors, hasWarnings };
}

function validateUniqueness(data: NormalizedResult, findings: ValidationFinding[]): void {
  const names = new Map<string, string[]>();

  for (const obj of data.objects) {
    const arr = names.get(obj.name) || [];
    arr.push(obj.id);
    names.set(obj.name, arr);
  }

  for (const [name, ids] of names) {
    if (ids.length > 1) {
      findings.push({
        id: createId(),
        severity: 'warn',
        code: 'DUPLICATE_NAME',
        message: `Duplicate object name: ${name}`,
        affectedEntityRefs: ids,
        suggestedFix: 'Rename or merge duplicate objects',
      });
    }
  }
}

const BUILTIN_IDS = new Set([ANY_NET_ID, ANY_SVC_ID]);

function validateMissingRefs(data: NormalizedResult, findings: ValidationFinding[]): void {
  const objectIds = new Set(data.objects.map((o) => o.id));
  for (const id of BUILTIN_IDS) objectIds.add(id);

  for (const rule of data.rules) {
    for (const ref of [...rule.sourceRefs, ...rule.destinationRefs, ...rule.serviceRefs]) {
      if (ref && !objectIds.has(ref)) {
        findings.push({
          id: createId(),
          severity: 'error',
          code: 'MISSING_REF',
          message: `Rule ${rule.id} references missing object: ${ref}`,
          affectedEntityRefs: [rule.id, ref],
          suggestedFix: 'Create missing object or update reference',
        });
      }
    }
  }
}

function validateServiceDefinitions(data: NormalizedResult, findings: ValidationFinding[]): void {
  for (const obj of data.objects) {
    if (obj.type === 'service' && obj.proto && !obj.port && !obj.portRange) {
      findings.push({
        id: createId(),
        severity: 'info',
        code: 'SERVICE_NO_PORT',
        message: `Service ${obj.name} has no port defined`,
        affectedEntityRefs: [obj.id],
        suggestedFix: 'Add port or port range',
      });
    }
  }
}

function collectReferencedIds(rules: NormalizedPolicyRule[]): Array<{ ruleId: string; field: string; id: string }> {
  const refs: Array<{ ruleId: string; field: string; id: string }> = [];
  for (const rule of rules) {
    for (const id of rule.sourceRefs)
      if (id) refs.push({ ruleId: rule.id, field: 'source', id });
    for (const id of rule.destinationRefs)
      if (id) refs.push({ ruleId: rule.id, field: 'destination', id });
    for (const id of rule.serviceRefs)
      if (id) refs.push({ ruleId: rule.id, field: 'service', id });
  }
  return refs;
}

/**
 * Pre-export referential integrity check. Optionally auto-fix by creating placeholder objects.
 */
export function validateReferentialIntegrity(
  data: NormalizedResult,
  options: { autoFix?: boolean; strict?: boolean } = {}
): ReferentialIntegrityResult {
  const { autoFix = true, strict = false } = options;
  const objectIds = new Set(data.objects.map((o) => o.id));
  objectIds.add(ANY_NET_ID);
  objectIds.add(ANY_SVC_ID);

  const refs = collectReferencedIds(data.rules);
  const missing: Array<{ ruleId: string; field: string; missingId: string }> = [];
  const autoFixed: Array<{ ruleId: string; field: string; missingId: string }> = [];

  for (const { ruleId, field, id } of refs) {
    if (objectIds.has(id)) continue;
    missing.push({ ruleId, field, missingId: id });
  }

  if (strict && missing.length > 0) {
    return { ok: false, missing, autoFixed };
  }

  if (autoFix && missing.length > 0) {
    const seenIds = new Set<string>();
    for (const { ruleId, field, missingId } of missing) {
      if (seenIds.has(missingId)) continue;
      seenIds.add(missingId);
      const isService = field === 'service';
      const placeholder: NormalizedObject = isService
        ? {
            id: missingId,
            type: 'service',
            name: `MISSING_${missingId.slice(0, 8)}`,
            proto: 'tcp',
            port: 0,
            comments: 'AUTO PLACEHOLDER; created to satisfy referential integrity; review required',
          }
        : {
            id: missingId,
            type: 'host',
            name: `MISSING_${missingId.slice(0, 8)}`,
            value: '0.0.0.0',
            comments: 'AUTO PLACEHOLDER; created to satisfy referential integrity; review required',
          };
      data.objects.push(placeholder);
      objectIds.add(missingId);
      autoFixed.push({ ruleId, field, missingId });
    }
  }

  return {
    ok: missing.length === 0 || autoFix,
    missing: autoFix ? [] : missing,
    autoFixed,
  };
}
