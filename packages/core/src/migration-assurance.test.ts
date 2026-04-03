import { describe, it, expect } from 'vitest';
import { parseFortinetConfig, scanFortinetConfigInventory } from '@cisco2cp/parsers';
import { normalizeAsa, validate, buildMigrationReport } from './index';
import { findOrphanObjects, buildFunctionalTestPlan } from './migration-assurance';
import * as fs from 'fs';
import * as path from 'path';

describe('migration assurance', () => {
  it('flags orphan objects not referenced by any policy', () => {
    const data = normalizeAsa([
      {
        type: 'object-network',
        name: 'orphan-host',
        host: '10.99.99.99',
        lineNumber: 1,
      } as never,
      {
        type: 'explicit-policy-rule',
        name: 'r1',
        enabled: true,
        sourceNames: ['all'],
        destinationNames: ['all'],
        serviceNames: ['ALL'],
        action: 'permit',
        log: 'none',
        lineNumber: 2,
      } as never,
    ]);
    const orphans = findOrphanObjects(data);
    expect(orphans.some((o) => o.name === 'orphan-host')).toBe(true);
  });

  it('buildFunctionalTestPlan includes one case per rule and NAT', () => {
    const confPath = path.join(process.cwd(), '../parsers/testdata/sample-fortinet.conf');
    const conf = fs.readFileSync(confPath, 'utf-8');
    const { statements } = parseFortinetConfig(conf);
    const normalized = normalizeAsa(statements);
    const plan = buildFunctionalTestPlan(normalized);
    expect(plan.length).toBe(normalized.rules.length + normalized.nat.length);
    expect(plan.some((p) => p.kind === 'policy-allow')).toBe(true);
  });

  it('buildMigrationReport v2 includes assurance with inventory hashes', () => {
    const confPath = path.join(process.cwd(), '../parsers/testdata/sample-fortinet.conf');
    const conf = fs.readFileSync(confPath, 'utf-8');
    const inv = scanFortinetConfigInventory(conf);
    const { statements } = parseFortinetConfig(conf);
    const normalized = normalizeAsa(statements);
    const vr = validate(normalized);
    const report = buildMigrationReport(normalized, vr, {
      sourceType: 'fortinet',
      parseStatements: statements,
      fortinetSourceInventory: inv,
    });
    expect(report.version).toBe(2);
    expect(report.assurance.sourceInventoryHash).toHaveLength(64);
    expect(report.assurance.parsedManifestHash).toHaveLength(64);
    expect(typeof report.assurance.overallCoveragePercent).toBe('number');
  });
});
