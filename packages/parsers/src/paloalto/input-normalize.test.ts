import { readFileSync } from 'fs';
import { join } from 'path';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parsePaloAltoXml } from './parse-paloalto-xml';
import { extractXmlFromZipBytes, preparePaloAltoInput } from './input-normalize';

const sampleXml = readFileSync(join(process.cwd(), 'testdata/sample-panos-minimal.xml'), 'utf-8');

describe('preparePaloAltoInput', () => {
  it('passes through plain XML', () => {
    const p = preparePaloAltoInput(sampleXml);
    expect(p.kind).toBe('xml');
    if (p.kind === 'xml') expect(p.xml).toContain('<config>');
  });

  it('extracts XML from a ZIP (nested running-config name)', () => {
    const zipped = zipSync({ 'export/nested/running-config.xml': strToU8(sampleXml) });
    const extracted = extractXmlFromZipBytes(zipped);
    expect(extracted).not.toBeNull();
    expect(extracted!.pickedFile).toContain('running-config');
    const p = preparePaloAltoInput(Buffer.from(zipped).toString('latin1'));
    expect(p.kind).toBe('xml');
    if (p.kind === 'xml') {
      expect(p.xml).toContain('pa-host-a');
      expect(p.notes.some((n) => /ZIP/i.test(n))).toBe(true);
    }
  });

  it('extracts XML from base64-encoded ZIP', () => {
    const zipped = zipSync({ 'config.xml': strToU8(sampleXml) });
    const b64 = Buffer.from(zipped).toString('base64');
    const p = preparePaloAltoInput(b64);
    expect(p.kind).toBe('xml');
    if (p.kind === 'xml') expect(p.xml).toContain('<config>');
  });

  it('detects set-format CLI', () => {
    const setDump = `
# comment
set vsys vsys1 address h1 ip-netmask 10.0.0.1
set vsys vsys1 address h2 ip-netmask 10.0.0.2
set vsys vsys1 rulebase security rules r1 from trust
set vsys vsys1 rulebase security rules r1 to untrust
set vsys vsys1 rulebase security rules r1 source any
set vsys vsys1 rulebase security rules r1 destination any
set vsys vsys1 rulebase security rules r1 application any
set vsys vsys1 rulebase security rules r1 service application-default
set vsys vsys1 rulebase security rules r1 action allow
`;
    const p = preparePaloAltoInput(setDump);
    expect(p.kind).toBe('set');
  });
});

describe('parsePaloAltoXml end-to-end inputs', () => {
  it('parses API-wrapped response', () => {
    const wrapped = `<?xml version="1.0"?><response status="success"><result>${sampleXml.replace(
      /^<\?xml[^>]*>\s*/,
      ''
    )}</result></response>`;
    const { statements, warnings } = parsePaloAltoXml(wrapped);
    expect(statements.length).toBeGreaterThan(0);
    expect(warnings.every((w) => !/no <config>/i.test(w))).toBe(true);
  });

  it('parses set-format minimal config', () => {
    const setDump = `
set vsys vsys1 address h1 ip-netmask 10.0.0.1/32
set vsys vsys1 service web protocol tcp port 443
set vsys vsys1 rulebase security rules r1 from trust
set vsys vsys1 rulebase security rules r1 to untrust
set vsys vsys1 rulebase security rules r1 source h1
set vsys vsys1 rulebase security rules r1 destination any
set vsys vsys1 rulebase security rules r1 application any
set vsys vsys1 rulebase security rules r1 service web
set vsys vsys1 rulebase security rules r1 action allow
`;
    const { statements, warnings } = parsePaloAltoXml(setDump);
    expect(statements.some((s) => s.type === 'object-network')).toBe(true);
    expect(statements.some((s) => s.type === 'explicit-policy-rule')).toBe(true);
    expect(warnings.some((w) => /set-format/i.test(w))).toBe(true);
  });
});
