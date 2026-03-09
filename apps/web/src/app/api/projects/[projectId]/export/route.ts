import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';
import {
  exportToJson,
  exportToCliTemplate,
  exportToGaiaClish,
  exportToSmartConsoleCsv,
} from '@cisco2cp/exporters';
import type { MappingDecision } from '@cisco2cp/core';

type ExportTarget = 'sms' | 'gateway' | 'both';
type SmsFormat = 'mgmt-api' | 'smartconsole' | 'both';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    target?: ExportTarget;
    smsFormat?: SmsFormat;
  };
  const target: ExportTarget = body.target ?? 'both';
  const smsFormat: SmsFormat = body.smsFormat ?? 'both';

  const [data, records, ifaceMappings] = await Promise.all([
    prisma.normalizedData.findUnique({ where: { projectId } }),
    prisma.mappingDecisionRecord.findMany({ where: { projectId } }),
    prisma.interfaceMappingRecord.findMany({ where: { projectId } }),
  ]);

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const normalized = {
    objects: JSON.parse(data.objectsJson),
    rules: JSON.parse(data.rulesJson),
    nat: JSON.parse(data.natJson),
    interfaces: JSON.parse(data.interfacesJson),
    zones: JSON.parse(data.zonesJson),
    warnings: JSON.parse(data.warningsJson),
  };

  const mappingDecisions: MappingDecision[] = records.map((r) => ({
    id: r.id,
    entityType: r.entityType as MappingDecision['entityType'],
    sourceId: r.sourceId,
    proposedTarget: JSON.parse(r.proposedTarget),
    confidenceScore: r.confidenceScore,
    reasons: JSON.parse(r.reasonsJson),
    warnings: JSON.parse(r.warningsJson),
    userOverride: r.userOverrideJson ? JSON.parse(r.userOverrideJson) : undefined,
  }));

  const bundle = exportToJson({ projectId, normalized, mappingDecisions });
  const includeSms = target === 'sms' || target === 'both';
  const includeGateway = target === 'gateway' || target === 'both';
  const includeMgmtApi = includeSms && (smsFormat === 'mgmt-api' || smsFormat === 'both');
  const includeSmartConsole = includeSms && (smsFormat === 'smartconsole' || smsFormat === 'both');

  const needsZip =
    (includeMgmtApi && includeSmartConsole) ||
    (includeMgmtApi && includeGateway) ||
    (includeSmartConsole && includeGateway) ||
    (includeGateway && includeMgmtApi);

  if (needsZip) {
    const zip = new JSZip();
    if (includeMgmtApi) {
      zip.file('sms/mgmt_api/bundle.json', JSON.stringify(bundle, null, 2));
      const cli = exportToCliTemplate(bundle);
      zip.file('sms/mgmt_api/run_import.cli', cli);
    }
    if (includeSmartConsole) {
      const csv = exportToSmartConsoleCsv(bundle);
      zip.file('sms/smartconsole/objects.csv', csv.objects);
      zip.file('sms/smartconsole/services.csv', csv.services);
      zip.file('sms/smartconsole/groups.csv', csv.groups);
      zip.file('sms/smartconsole/policy.csv', csv.policy);
      zip.file('sms/smartconsole/nat.csv', csv.nat);
    }
    if (includeGateway) {
      const mappings = ifaceMappings.map((m) => ({
        asaInterfaceId: m.asaInterfaceId,
        cpInterfaceName: m.cpInterfaceName,
        cpIpOverride: m.cpIpOverride ?? undefined,
        cpMaskOverride: m.cpMaskOverride ?? undefined,
      }));
      const gaia = exportToGaiaClish(normalized, mappings);
      zip.file('gateway/gaia_clish.txt', gaia);
    }
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="checkpoint-${projectId}.zip"`,
      },
    });
  }

  if (includeGateway && !includeSms) {
    const mappings = ifaceMappings.map((m) => ({
      asaInterfaceId: m.asaInterfaceId,
      cpInterfaceName: m.cpInterfaceName,
      cpIpOverride: m.cpIpOverride ?? undefined,
      cpMaskOverride: m.cpMaskOverride ?? undefined,
    }));
    const gaia = exportToGaiaClish(normalized, mappings);
    return new NextResponse(gaia, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="checkpoint-${projectId}-gateway.cli"`,
      },
    });
  }

  if (includeSmartConsole && !includeMgmtApi) {
    const zip = new JSZip();
    const csv = exportToSmartConsoleCsv(bundle);
    zip.file('objects.csv', csv.objects);
    zip.file('services.csv', csv.services);
    zip.file('groups.csv', csv.groups);
    zip.file('policy.csv', csv.policy);
    zip.file('nat.csv', csv.nat);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="checkpoint-${projectId}-smartconsole.zip"`,
      },
    });
  }

  return NextResponse.json(bundle, {
    headers: {
      'Content-Disposition': `attachment; filename="checkpoint-${projectId}.json"`,
    },
  });
}
