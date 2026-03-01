export interface Token {
  type: 'keyword' | 'string' | 'number' | 'ip' | 'eol' | 'eof';
  value: string;
  line: number;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const lines = input.split(/\r?\n/);

  const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d+)?$/;
  const numberRegex = /^\d+$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('!') || trimmed.startsWith(':')) {
      continue;
    }

    const parts = splitLine(trimmed);
    for (const part of parts) {
      if (ipRegex.test(part) || (part.includes('.') && /^\d+\.\d+/.test(part))) {
        tokens.push({ type: 'ip', value: part, line: i + 1 });
      } else if (numberRegex.test(part)) {
        tokens.push({ type: 'number', value: part, line: i + 1 });
      } else {
        tokens.push({ type: part.match(/^[a-zA-Z-]+$/) ? 'keyword' : 'string', value: part, line: i + 1 });
      }
    }
    tokens.push({ type: 'eol', value: '\n', line: i + 1 });
  }
  tokens.push({ type: 'eof', value: '', line: lines.length });

  return tokens;
}

function splitLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      current += c;
    } else if ((c === ' ' || c === '\t') && !inQuotes) {
      if (current) {
        result.push(current);
        current = '';
      }
    } else {
      current += c;
    }
  }
  if (current) result.push(current);
  return result;
}
