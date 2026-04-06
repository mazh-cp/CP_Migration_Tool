import { strFromU8, unzipSync } from 'fflate';

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, '');
}

function decodeBase64ToUint8(data: string): Uint8Array | null {
  const cleaned = data.replace(/\s/g, '').replace(/^data:[^;]+;base64,/i, '');
  if (cleaned.length < 8) return null;
  try {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(cleaned, 'base64'));
    }
    const bin = atob(cleaned);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function isZipMagic(u8: Uint8Array): boolean {
  return u8.length >= 4 && u8[0] === 0x50 && u1(u8, 1) === 0x4b && u1(u8, 2) === 0x03 && u1(u8, 3) === 0x04;
}

function u1(u8: Uint8Array, i: number): number {
  return u8[i] ?? 0;
}

/** Treat string as byte sequence (Latin-1) for embedded binary ZIP pasted as "binary string". */
function stringToLatin1Bytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function scoreXmlCandidate(fileName: string, content: string, size: number): number {
  const hasConfig = /<config[\s/>]/i.test(content);
  const hasApi = /<response[\s/>]/i.test(content) && /<config[\s/>]/i.test(content);
  if (!hasConfig && !hasApi) return -1;
  let score = size;
  const ln = fileName.toLowerCase();
  if (ln.includes('running-config')) score += 1_000_000_000;
  if (ln.includes('merged-config') || ln.includes('merged_config')) score += 800_000_000;
  if (ln.includes('candidate-config')) score += 400_000_000;
  if (ln.includes('panorama')) score += 50_000_000;
  if (ln.includes('device-config') || ln.includes('device_config')) score += 40_000_000;
  if (ln.endsWith('.xml')) score += 10_000;
  return score;
}

/**
 * Extract the best PAN-OS XML document from a ZIP (export bundle, tech-support style zip, etc.).
 */
export function extractXmlFromZipBytes(zipBytes: Uint8Array): { xml: string; pickedFile: string } | null {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    return null;
  }
  let best: { name: string; content: string; score: number } | null = null;
  for (const name of Object.keys(files)) {
    if (name.endsWith('/')) continue;
    const u8 = files[name];
    if (!u8 || u8.length < 80) continue;
    let content: string;
    try {
      content = strFromU8(u8);
    } catch {
      continue;
    }
    const score = scoreXmlCandidate(name, content, u8.length);
    if (score < 0) continue;
    if (!best || score > best.score) {
      best = { name, content, score };
    }
  }
  if (!best) return null;
  return { xml: best.content, pickedFile: best.name };
}

function looksLikePanosSetCli(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length < 4) return false;
  let setCount = 0;
  for (const l of lines) {
    if (/^set\s+/i.test(l)) setCount++;
  }
  return setCount >= 4 && setCount >= lines.length * 0.45;
}

function looksLikeXmlDocument(text: string): boolean {
  const head = text.slice(0, 8000).trimStart();
  return head.startsWith('<') && /<\?xml|<config[\s/>]|<response[\s/>]/i.test(head);
}

export type PreparedPaloAltoInput =
  | { kind: 'xml'; xml: string; notes: string[] }
  | { kind: 'set'; text: string; notes: string[] }
  | { kind: 'none'; notes: string[] };

/**
 * Normalize pasted/uploaded Palo Alto exports into either XML (for the XML parser) or set-CLI text.
 * Supports: plain XML, API-wrapped XML, base64-encoded ZIP, raw ZIP bytes as Latin-1 string, and set-format CLI dumps.
 */
export function preparePaloAltoInput(raw: string): PreparedPaloAltoInput {
  const notes: string[] = [];
  let content = stripBom(raw).trim();
  if (!content) return { kind: 'none', notes: ['Palo Alto: empty input.'] };

  // 1) Base64 ZIP (common when pasting binary-safe)
  const b64 = decodeBase64ToUint8(content);
  if (b64 && isZipMagic(b64)) {
    const extracted = extractXmlFromZipBytes(b64);
    if (extracted) {
      notes.push(`Palo Alto: extracted XML from base64 ZIP entry "${extracted.pickedFile}".`);
      return { kind: 'xml', xml: extracted.xml, notes };
    }
    notes.push('Palo Alto: base64 decoded to ZIP but no XML with <config> or API <response> found inside.');
  }

  // 2) Raw ZIP as Latin-1 string (first bytes PK..)
  const latin = stringToLatin1Bytes(content);
  if (isZipMagic(latin)) {
    const extracted = extractXmlFromZipBytes(latin);
    if (extracted) {
      notes.push(`Palo Alto: extracted XML from binary ZIP entry "${extracted.pickedFile}".`);
      return { kind: 'xml', xml: extracted.xml, notes };
    }
    notes.push('Palo Alto: input looks like a ZIP file but no suitable XML entry was found.');
  }

  // 3) XML (GUI export, API, Panorama device XML, etc.)
  if (looksLikeXmlDocument(content)) {
    return { kind: 'xml', xml: content, notes };
  }

  // 4) set-format CLI (show config in set commands)
  if (looksLikePanosSetCli(content)) {
    notes.push('Palo Alto: detected set-format CLI configuration (not XML export).');
    return { kind: 'set', text: content, notes };
  }

  // 5) Try XML parse anyway (odd leading whitespace / BOM already stripped)
  if (content.includes('<config') || (content.includes('<response') && content.includes('config'))) {
    notes.push('Palo Alto: treating input as XML (heuristic).');
    return { kind: 'xml', xml: content, notes };
  }

  return { kind: 'none', notes: ['Palo Alto: could not detect XML, ZIP, or set-format CLI configuration.'] };
}
