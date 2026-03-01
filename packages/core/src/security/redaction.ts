const SECRET_PATTERNS = [
  { pattern: /enable secret \d+ \K[\S]+/gi, mask: '***' },
  { pattern: /password \d+ \K[\S]+/gi, mask: '***' },
  { pattern: /secret \d+ \K[\S]+/gi, mask: '***' },
  { pattern: /snmp-server community \K[\S]+/gi, mask: '***' },
  { pattern: /key \d+ \K[\S]+/gi, mask: '***' },
  { pattern: /pre-shared-key \K[\S]+/gi, mask: '***' },
  { pattern: /authentication-key \K[\S]+/gi, mask: '***' },
  { pattern: /crypto isakmp key \K[\S]+/gi, mask: '***' },
  { pattern: /-----BEGIN.*?-----[\s\S]*?-----END.*?-----/g, mask: '***REDACTED***' },
];

export function redactSecrets(content: string): string {
  let result = content;
  for (const { pattern, mask } of SECRET_PATTERNS) {
    result = result.replace(pattern, mask);
  }
  return result;
}
