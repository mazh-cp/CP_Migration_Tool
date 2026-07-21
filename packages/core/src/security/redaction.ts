/**
 * Best-effort masking of credential material in raw firewall config text.
 *
 * JavaScript RegExp has no PCRE `\K`, so each pattern captures the keyword
 * prefix and re-emits it via `$1`, masking only the secret token.
 * Order matters: specific multi-word patterns run before generic ones.
 */
const MASK = '***';

const SECRET_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\b(enable\s+secret(?:\s+\d+)?\s+)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /\b(crypto\s+isakmp\s+key\s+)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /\b(message-digest-key\s+\d+\s+md5\s+)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /\b(pre-shared-key\s+)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /\b(authentication-key(?:\s+\d+)?\s+)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /\b(snmp-server\s+community\s+)\S+/gi, replacement: `$1${MASK}` },
  // Generic `password [7|5|0] <secret>` (usernames, BGP neighbors, failover keys…).
  { pattern: /\b(password(?:\s+\d+)?\s+)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /\b(secret(?:\s+\d+)?\s+)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /\b(key\s+\d+\s+)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /-----BEGIN.*?-----[\s\S]*?-----END.*?-----/g, replacement: `${MASK}REDACTED${MASK}` },
];

export function redactSecrets(content: string): string {
  let result = content;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
