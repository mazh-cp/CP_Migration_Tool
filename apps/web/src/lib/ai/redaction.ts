type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

const SECRET_KEYS = [
  'password',
  'passphrase',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'credential',
  'privatekey',
  'private_key',
  'sha256',
  'content',
];

const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const FQDN_RE = /\b(?=.{4,253}\b)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}\b/g;

export interface RedactionSummary {
  redactedSecrets: number;
  redactedIps: number;
  redactedEmails: number;
  redactedFqdns: number;
}

export interface RedactionResult {
  redacted: JsonLike;
  summary: RedactionSummary;
}

class RedactionState {
  summary: RedactionSummary = {
    redactedSecrets: 0,
    redactedIps: 0,
    redactedEmails: 0,
    redactedFqdns: 0,
  };
  private ipMap = new Map<string, string>();
  private emailMap = new Map<string, string>();
  private fqdnMap = new Map<string, string>();

  redactString(input: string): string {
    let out = input;
    out = out.replace(IPV4_RE, (match) => {
      if (!this.ipMap.has(match)) this.ipMap.set(match, `IP_${this.ipMap.size + 1}`);
      this.summary.redactedIps += 1;
      return this.ipMap.get(match) as string;
    });
    out = out.replace(EMAIL_RE, (match) => {
      const key = match.toLowerCase();
      if (!this.emailMap.has(key)) this.emailMap.set(key, `EMAIL_${this.emailMap.size + 1}`);
      this.summary.redactedEmails += 1;
      return this.emailMap.get(key) as string;
    });
    out = out.replace(FQDN_RE, (match) => {
      const key = match.toLowerCase();
      if (!this.fqdnMap.has(key)) this.fqdnMap.set(key, `FQDN_${this.fqdnMap.size + 1}`);
      this.summary.redactedFqdns += 1;
      return this.fqdnMap.get(key) as string;
    });
    return out;
  }
}

export function redactForAi(input: unknown): RedactionResult {
  const state = new RedactionState();
  const redacted = redactValue(input, state, '');
  return { redacted, summary: state.summary };
}

function redactValue(value: unknown, state: RedactionState, keyPath: string): JsonLike {
  if (value == null) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return state.redactString(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, state, keyPath));
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const out: Record<string, JsonLike> = {};
    for (const [k, v] of Object.entries(rec)) {
      const lower = k.toLowerCase();
      if (SECRET_KEYS.some((sk) => lower.includes(sk))) {
        state.summary.redactedSecrets += 1;
        out[k] = '[REDACTED_SECRET]';
        continue;
      }
      out[k] = redactValue(v, state, keyPath ? `${keyPath}.${k}` : k);
    }
    return out;
  }
  return String(value);
}
