import type { ASAAstNode, FortinetSourceInventory, FortiManagerSourceInventory } from '@cisco2cp/parsers';
import type { NormalizedResult, NormalizedPolicyRule } from './models/normalized';
import type { ValidationResult } from './models/validation';
import { buildMigrationAssurance, type MigrationAssurance } from './migration-assurance';

export interface MigrationReportManualItem {
  category: string;
  detail: string;
  ruleId?: string;
  ruleName?: string;
}

export interface MigrationReport {
  generatedAt: string;
  version: 2;
  summary: {
    objects: number;
    rules: number;
    disabledRules: number;
    natRules: number;
    interfaces: number;
    zones: number;
  };
  fortinet: {
    rulesWithUtmProfiles: number;
    rulesWithPolicyNat: number;
    rulesWithSchedule: number;
    rulesWithInterfaceContext: number;
  };
  validation: {
    errors: number;
    warnings: number;
    info: number;
  };
  manualReview: MigrationReportManualItem[];
  risks: string[];
  /** Adjacent rules with identical normalized src/dst/svc/action (policy order). */
  duplicatePolicyFingerprints: number;
  /** Inventory reconciliation, orphans, coverage, functional test outline. */
  assurance: MigrationAssurance;
}

export interface BuildMigrationReportOptions {
  sourceType?: 'fortinet' | 'fortimanager' | 'asa' | 'ftd' | 'paloalto';
  parseStatements?: ASAAstNode[];
  fortinetSourceInventory?: FortinetSourceInventory;
  fmgSourceInventory?: FortiManagerSourceInventory | null;
}

function ruleFingerprint(r: NormalizedPolicyRule): string {
  return JSON.stringify({
    action: r.action,
    s: [...r.sourceRefs].sort(),
    d: [...r.destinationRefs].sort(),
    v: [...r.serviceRefs].sort(),
  });
}

export function buildMigrationReport(
  data: NormalizedResult,
  validation: ValidationResult,
  options?: BuildMigrationReportOptions
): MigrationReport {
  const manualReview: MigrationReportManualItem[] = [];
  const risks: string[] = [];

  for (const w of data.warnings) {
    if (/VDOM|multi-VDOM|partial parse|unclosed block/i.test(w)) {
      risks.push(w);
    }
  }

  const withIface = data.rules.filter(
    (r) => (r.sourceInterfaceNames?.length ?? 0) + (r.destinationInterfaceNames?.length ?? 0) > 0
  ).length;

  for (const r of data.rules) {
    if (r.identityGroupNames?.length || r.identityUserNames?.length) {
      manualReview.push({
        category: 'identity-policy',
        detail: `User/group-based policy — map to Check Point Identity Awareness: groups=${(r.identityGroupNames ?? []).join(',') || '—'}; users=${(r.identityUserNames ?? []).join(',') || '—'}`,
        ruleId: r.ruleId,
        ruleName: r.name,
      });
    }
    if (r.possibleInternetServiceNames?.length) {
      manualReview.push({
        category: 'internet-service-isdb',
        detail: `Possible Forti ISDB / internet-service refs (not in config as objects): ${r.possibleInternetServiceNames.join(', ')}`,
        ruleId: r.ruleId,
        ruleName: r.name,
      });
    }
    if (r.utmProfileRefs && Object.keys(r.utmProfileRefs).length > 0) {
      manualReview.push({
        category: 'utm-profiles',
        detail: Object.entries(r.utmProfileRefs)
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
        ruleId: r.ruleId,
        ruleName: r.name,
      });
    }
    if (r.policyNatEnabled) {
      manualReview.push({
        category: 'policy-nat',
        detail: r.policyNatPoolName
          ? `SNAT enabled; pool: ${r.policyNatPoolName}`
          : 'SNAT enabled; pool not resolved from import',
        ruleId: r.ruleId,
        ruleName: r.name,
      });
    }
    if (r.scheduleName) {
      manualReview.push({
        category: 'schedule',
        detail: r.scheduleName,
        ruleId: r.ruleId,
        ruleName: r.name,
      });
    }
  }

  for (const f of validation.findings) {
    if (f.severity === 'error' || f.severity === 'warn') {
      manualReview.push({
        category: `validation-${f.severity}`,
        detail: `${f.code}: ${f.message}`,
      });
    }
  }

  let dupes = 0;
  for (let i = 1; i < data.rules.length; i++) {
    if (ruleFingerprint(data.rules[i]!) === ruleFingerprint(data.rules[i - 1]!)) {
      dupes++;
    }
  }

  const assurance = buildMigrationAssurance(data, options?.parseStatements, {
    fortinetInv: options?.fortinetSourceInventory,
    fmgInv: options?.fmgSourceInventory,
  });

  if (assurance.orphanObjects.length > 0) {
    manualReview.push({
      category: 'orphan-objects',
      detail: `${assurance.orphanObjects.length} object(s) defined but not referenced by any policy (e.g. ${assurance.orphanObjects
        .slice(0, 5)
        .map((o) => o.name)
        .join(', ')}${assurance.orphanObjects.length > 5 ? '…' : ''})`,
    });
  }
  if (!assurance.inventoryFullyAligned && assurance.inventoryMismatches.length > 0) {
    risks.push(
      `Source vs parsed inventory mismatch in ${assurance.inventoryMismatches.length} category/categories (see assurance.inventoryMismatches).`
    );
  }
  if (options?.fortinetSourceInventory && options.fortinetSourceInventory.vdomConfigLines > 0) {
    risks.push(
      'Multi-VDOM export detected: object/policy namespaces may collide if parsed as a flat config; review VDOM boundaries.'
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    version: 2,
    summary: {
      objects: data.objects.length,
      rules: data.rules.length,
      disabledRules: data.rules.filter((r) => !r.enabled).length,
      natRules: data.nat.length,
      interfaces: data.interfaces.length,
      zones: data.zones.length,
    },
    fortinet: {
      rulesWithUtmProfiles: data.rules.filter(
        (r) => r.utmProfileRefs && Object.keys(r.utmProfileRefs).length > 0
      ).length,
      rulesWithPolicyNat: data.rules.filter((r) => r.policyNatEnabled).length,
      rulesWithSchedule: data.rules.filter((r) => r.scheduleName).length,
      rulesWithInterfaceContext: withIface,
    },
    validation: {
      errors: validation.findings.filter((f) => f.severity === 'error').length,
      warnings: validation.findings.filter((f) => f.severity === 'warn').length,
      info: validation.findings.filter((f) => f.severity === 'info').length,
    },
    manualReview,
    risks,
    duplicatePolicyFingerprints: dupes,
    assurance,
  };
}
