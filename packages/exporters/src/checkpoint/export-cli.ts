import type { CheckPointJsonBundle } from './export-json';

export function exportToCliTemplate(bundle: CheckPointJsonBundle): string {
  const lines: string[] = [
    '# Check Point CLI Template (beta)',
    '# Generated from Cisco ASA/FTD conversion',
    '# Review and adapt before applying',
    '',
  ];

  lines.push('# --- Network Objects ---');
  for (const obj of bundle.objects as Array<{ type: string; name: string; ipAddress?: string; subnet?: string }>) {
    if (obj.type === 'host' && obj.ipAddress) {
      lines.push(`add host name ${obj.name} ip-address ${obj.ipAddress}`);
    } else if (obj.type === 'network' && obj.subnet) {
      lines.push(`add network name ${obj.name} subnet ${obj.subnet}`);
    } else if (obj.type === 'range') {
      const o = obj as { rangeFrom?: string; rangeTo?: string };
      if (o.rangeFrom && o.rangeTo) {
        lines.push(`add address-range name ${obj.name} from ${o.rangeFrom} to ${o.rangeTo}`);
      }
    }
  }

  lines.push('');
  lines.push('# --- Services ---');
  for (const svc of bundle.services as Array<{ type: string; name: string; port?: number; portFrom?: number; portTo?: number }>) {
    if (svc.type === 'service-tcp' && svc.port) {
      lines.push(`add service tcp name ${svc.name} port ${svc.port}`);
    } else if (svc.type === 'service-udp' && svc.port) {
      lines.push(`add service udp name ${svc.name} port ${svc.port}`);
    }
  }

  lines.push('');
  lines.push('# --- Groups ---');
  for (const grp of bundle.groups as Array<{ name: string; members: string[] }>) {
    lines.push(`add group name ${grp.name} members ${(grp.members || []).join(',')}`);
  }

  lines.push('');
  lines.push('# --- Access Rules (example) ---');
  for (const rule of bundle.rules as Array<{ name: string; source: string[]; destination: string[]; service: string[]; action: string }>) {
    const src = (rule.source || ['Any']).join(',');
    const dst = (rule.destination || ['Any']).join(',');
    const svc = (rule.service || ['Any']).join(',');
    lines.push(`# Rule: ${rule.name} - ${rule.action} ${src} -> ${dst} : ${svc}`);
  }

  lines.push('');
  lines.push('# --- End ---');
  return lines.join('\n');
}
