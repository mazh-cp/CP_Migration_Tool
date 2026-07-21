import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/project-access';
import {
  exportToJson,
  exportToCliTemplate,
  exportToGaiaClish,
  exportToSmartConsoleCsv,
  exportVpnNotes,
} from '@cisco2cp/exporters';
import type { MappingDecision, NormalizedVpn, NormalizedRoute } from '@cisco2cp/core';

type ExportTarget = 'sms' | 'gateway' | 'both';
type SmsFormat = 'mgmt-api' | 'smartconsole' | 'both';

async function markExportCompleted(projectId: string, tenantId: string) {
  const row = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    select: { completedSteps: true },
  });
  let steps: string[] = [];
  if (row?.completedSteps) {
    try {
      steps = JSON.parse(row.completedSteps);
    } catch {
      steps = [];
    }
  }
  if (!steps.includes('export')) steps.push('export');
  await prisma.project.updateMany({
    where: { id: projectId, tenantId },
    data: {
      status: 'exported',
      currentStep: 'export',
      completedSteps: JSON.stringify(steps),
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const auth = await requireProjectAccess(projectId, true);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = auth.session.tenantId;

  const body = (await req.json().catch(() => ({}))) as {
    target?: ExportTarget;
    smsFormat?: SmsFormat;
  };
  const target: ExportTarget = body.target ?? 'both';
  const smsFormat: SmsFormat = body.smsFormat ?? 'both';

  const [data, records, ifaceMappings] = await Promise.all([
    prisma.normalizedData.findFirst({ where: { projectId, tenantId } }),
    prisma.mappingDecisionRecord.findMany({ where: { projectId, tenantId } }),
    prisma.interfaceMappingRecord.findMany({ where: { projectId, tenantId } }),
  ]);

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const safeParse = <T,>(json: string | null | undefined, fallback: T): T => {
    try {
      return json ? (JSON.parse(json) as T) : fallback;
    } catch {
      return fallback;
    }
  };

  const vpn = safeParse<NormalizedVpn | undefined>(data.vpnJson, undefined);
  const normalized = {
    objects: JSON.parse(data.objectsJson),
    rules: JSON.parse(data.rulesJson),
    nat: JSON.parse(data.natJson),
    interfaces: JSON.parse(data.interfacesJson),
    zones: JSON.parse(data.zonesJson),
    routes: safeParse<NormalizedRoute[]>(data.routesJson, []),
    vpn,
    warnings: JSON.parse(data.warningsJson),
  };
  const vpnNotes = exportVpnNotes(vpn);
  const hasVpn = vpnNotes.remoteAccess.length > 0 || vpnNotes.siteToSite.length > 0;

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

  let migrationReport: unknown;
  try {
    migrationReport = JSON.parse(data.migrationReportJson || '{}');
  } catch {
    migrationReport = undefined;
  }

  const bundle = exportToJson({
    projectId,
    normalized,
    mappingDecisions,
    migrationReport:
      migrationReport && typeof migrationReport === 'object' && Object.keys(migrationReport).length > 0
        ? migrationReport
        : undefined,
  });
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
      if (bundle.meta.migrationReport != null) {
        zip.file('sms/mgmt_api/migration-report.json', JSON.stringify(bundle.meta.migrationReport, null, 2));
        const assurance = (bundle.meta.migrationReport as { assurance?: { functionalTestPlan?: unknown } })
          .assurance;
        if (assurance?.functionalTestPlan != null) {
          zip.file(
            'sms/mgmt_api/functional-test-plan.json',
            JSON.stringify(assurance.functionalTestPlan, null, 2)
          );
        }
      }
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
    if (hasVpn) {
      zip.file('vpn.notes.json', JSON.stringify(vpnNotes, null, 2));
    }
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
    await markExportCompleted(projectId, tenantId);
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
    await markExportCompleted(projectId, tenantId);
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
    if (hasVpn) {
      zip.file('vpn.notes.json', JSON.stringify(vpnNotes, null, 2));
    }
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
    await markExportCompleted(projectId, tenantId);
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="checkpoint-${projectId}-smartconsole.zip"`,
      },
    });
  }

  await markExportCompleted(projectId, tenantId);
  return NextResponse.json(hasVpn ? { ...bundle, vpnNotes } : bundle, {
    headers: {
      'Content-Disposition': `attachment; filename="checkpoint-${projectId}.json"`,
    },
  });
}
