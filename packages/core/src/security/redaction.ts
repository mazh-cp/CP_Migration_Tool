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
  // `pre-shared-key [0|8] X` — incl. ASA failover-link IPsec and ikev1/ikev2 tunnel-groups.
  { pattern: /\b(pre-shared-key(?:\s+[08])?\s+)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /\b(authentication-key(?:\s+\d+)?\s+)\S+/gi, replacement: `$1${MASK}` },
  // `failover key [hexadecimal|0|8] X` — before the generic key rule so the level
  // token / `hexadecimal` keyword is not mistaken for the key value.
  { pattern: /\b(failover\s+key\s+(?:hexadecimal\s+|[08]\s+)?)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /\b(snmp-server\s+community\s+)\S+/gi, replacement: `$1${MASK}` },
  // `password`/`passwd [7|5|0] <secret>` (usernames, BGP neighbors, legacy ASA passwd…).
  { pattern: /\b(pass(?:word|wd)(?:\s+\d+)?\s+)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /\b(secret(?:\s+\d+)?\s+)\S+/gi, replacement: `$1${MASK}` },
  // Keyed shared secret with an explicit key-id (`key 7 <hash>`).
  { pattern: /\b(key\s+\d+\s+)\S+/gi, replacement: `$1${MASK}` },
  // Bare `key <secret>` (aaa-server TACACS+/RADIUS shared key). Skip a following
  // key-id digit (handled above); earlier rules already consumed failover/isakmp keys.
  { pattern: /\b(key\s+)(?!\d+\b)\S+/gi, replacement: `$1${MASK}` },
  { pattern: /-----BEGIN.*?-----[\s\S]*?-----END.*?-----/g, replacement: `${MASK}REDACTED${MASK}` },
];

export function redactSecrets(content: string): string {
  let result = content;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
