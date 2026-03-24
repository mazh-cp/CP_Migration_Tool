import { createHash } from 'crypto';

export function sha256Json(value: unknown): string {
  const payload = JSON.stringify(value);
  return createHash('sha256').update(payload).digest('hex');
}
