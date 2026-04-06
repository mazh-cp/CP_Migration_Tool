import { XMLParser } from 'fast-xml-parser';

/**
 * Parse PAN-OS XML (exported config or API `config` element) into plain objects.
 * `entry` / `member` are always arrays for stable iteration.
 */
export function parsePanosXmlString(xml: string): unknown {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (tagName) => tagName === 'entry' || tagName === 'member',
    trimValues: true,
  });
  return parser.parse(xml);
}

export function extractConfigRoot(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.config && typeof o.config === 'object') return o.config as Record<string, unknown>;
  // API: <response><result><config>…</config></result></response>
  const resp = o.response as Record<string, unknown> | undefined;
  if (resp?.result && typeof resp.result === 'object') {
    const r = resp.result as Record<string, unknown>;
    if (r.config && typeof r.config === 'object') return r.config as Record<string, unknown>;
  }
  // Some exports / RPC styles: <response><config>…</config></response>
  if (resp?.config && typeof resp.config === 'object') return resp.config as Record<string, unknown>;
  // Bare <result><config>…
  const topResult = o.result as Record<string, unknown> | undefined;
  if (topResult?.config && typeof topResult.config === 'object') {
    return topResult.config as Record<string, unknown>;
  }
  return null;
}

/** Normalize XMLParser output to a plain array. */
export function ensureArray<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

export function entryName(entry: Record<string, unknown> | undefined): string | undefined {
  if (!entry) return undefined;
  const n = entry['@_name'];
  return typeof n === 'string' ? n : undefined;
}

type MemberXml = string | { '#text'?: string };

export function memberTexts(members: unknown): string[] {
  const arr = ensureArray<MemberXml>(members as MemberXml | MemberXml[] | undefined | null);
  const out: string[] = [];
  for (const m of arr) {
    if (typeof m === 'string') out.push(m.trim());
    else if (m && typeof m === 'object' && '#text' in m && typeof m['#text'] === 'string') {
      out.push(m['#text'].trim());
    }
  }
  return out.filter(Boolean);
}
