import type { NormalizedResult } from '@cisco2cp/core';

export interface InterfaceMapping {
  asaInterfaceId: string;
  cpInterfaceName: string;
  cpIpOverride?: string;
  cpMaskOverride?: string;
}

/**
 * Export Gaia clish commands for interfaces and basic system config.
 * Gateway-only export (no policy).
 * Uses interface mappings when provided to output Check Point interface names (MGMT, eth0, etc.).
 */
export function exportToGaiaClish(
  normalized: NormalizedResult,
  interfaceMappings?: InterfaceMapping[]
): string {
  const mapByAsaId = new Map(
    (interfaceMappings || []).map((m) => [m.asaInterfaceId, m])
  );

  const lines: string[] = [
    '# Check Point Gaia clish - interfaces (from ASA conversion)',
    '# Review and adapt before applying on gateway',
    '',
  ];

  for (const iface of normalized.interfaces) {
    const mapping = mapByAsaId.get(iface.id);
    const cpName = mapping?.cpInterfaceName ?? iface.name;
    const ip = mapping?.cpIpOverride ?? iface.ip;
    const mask = mapping?.cpMaskOverride ?? iface.mask;
    if (ip && (mask || (iface.mask && !mapping?.cpMaskOverride))) {
      const m = mask ?? iface.mask ?? '255.255.255.0';
      const cidr = maskToCidr(m);
      lines.push(`set interface ${cpName} ipv4-address ${ip} mask-length ${cidr}`);
    } else {
      lines.push(`# set interface ${cpName} ipv4-address <ip> mask-length <bits>`);
    }
  }

  if (normalized.zones.length > 0) {
    lines.push('');
    lines.push('# Zone names (reference for policy layers)');
    for (const z of normalized.zones) {
      lines.push(`# zone: ${z.name}`);
    }
  }

  lines.push('');
  lines.push('# Add static routes manually if needed');
  lines.push('# add route <dest> mask <mask> gateway <gw>');

  return lines.join('\n');
}

function maskToCidr(mask: string): number {
  if (mask.includes('/')) return parseInt(mask.split('/')[1] || '32', 10);
  const parts = mask.split('.').map(Number);
  let cidr = 0;
  for (const p of parts) {
    if (p === 255) cidr += 8;
    else if (p > 0) {
      let m = p;
      while (m) {
        cidr += m & 1;
        m >>= 1;
      }
      break;
    }
  }
  return cidr || 24;
}
