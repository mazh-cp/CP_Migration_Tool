import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { scanFortinetConfigInventory } from './fortinet-inventory';
import { parseFortinetConfig } from './fortinet-parser';

const sample = fs.readFileSync(
  path.join(process.cwd(), 'testdata/sample-fortinet.conf'),
  'utf-8'
);

describe('scanFortinetConfigInventory', () => {
  it('counts edits per config path for sample FortiOS backup', () => {
    const inv = scanFortinetConfigInventory(sample);
    expect(inv.configVersion).toMatch(/FGT-VM64/i);
    expect(inv.configEditCounts['firewall address']).toBe(2);
    expect(inv.configEditCounts['firewall policy']).toBe(3);
    expect(inv.configEditCounts['firewall vip']).toBe(1);
    expect(inv.configEditCounts['firewall ippool']).toBe(1);
    expect(inv.configEditCounts['system interface']).toBe(2);
  });

  it('aligns with parseFortinetConfig statement counts for tracked paths', () => {
    const inv = scanFortinetConfigInventory(sample);
    const { statements } = parseFortinetConfig(sample);
    const byType: Record<string, number> = {};
    for (const s of statements) {
      byType[s.type] = (byType[s.type] || 0) + 1;
    }
    let customSvc = 0;
    for (const s of statements) {
      if (s.type === 'object-service' && 'lineNumber' in s && (s as { lineNumber?: number }).lineNumber != null) {
        customSvc++;
      }
    }
    expect(inv.configEditCounts['firewall address']).toBe(byType['object-network']);
    expect(inv.configEditCounts['firewall policy']).toBe(byType['explicit-policy-rule']);
    expect(inv.configEditCounts['firewall service custom']).toBe(customSvc);
  });
});
