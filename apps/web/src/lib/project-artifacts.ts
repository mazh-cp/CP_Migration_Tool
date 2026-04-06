import type { RawArtifact } from '@prisma/client';

const CONFIG_SOURCE_TYPES = new Set(['asa', 'ftd', 'fortinet', 'fortimanager', 'paloalto']);

/**
 * Latest firewall/config artifact (excludes FortiAnalyzer-only uploads).
 * Pass artifacts ordered by `uploadedAt` descending.
 */
export function pickLatestConfigArtifact(artifacts: RawArtifact[]): RawArtifact | null {
  return artifacts.find((a) => a.content && CONFIG_SOURCE_TYPES.has(a.sourceType)) ?? null;
}

/** Latest FortiAnalyzer enrichment file (same ordering). */
export function pickLatestFortiAnalyzerArtifact(artifacts: RawArtifact[]): RawArtifact | null {
  return artifacts.find((a) => a.content && a.sourceType === 'fortianalyzer') ?? null;
}
