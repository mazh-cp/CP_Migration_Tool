/**
 * Parse API response as JSON when possible. Production often returns HTML from
 * reverse proxies (413 body too large, 502 gateway) — res.json() then throws
 * "Unexpected token '<', \"<!DOCTYPE\"...".
 */
export async function readApiJson<T = unknown>(res: Response): Promise<{
  ok: boolean;
  status: number;
  data: T | null;
  isHtml: boolean;
  rawPreview: string;
}> {
  const text = await res.text();
  const trimmed = text.trim();
  const isHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML');

  if (!trimmed) {
    return { ok: res.ok, status: res.status, data: null, isHtml: false, rawPreview: '' };
  }

  if (isHtml) {
    return {
      ok: false,
      status: res.status,
      data: null,
      isHtml: true,
      rawPreview: trimmed.slice(0, 120),
    };
  }

  try {
    const data = JSON.parse(text) as T;
    return { ok: res.ok, status: res.status, data, isHtml: false, rawPreview: '' };
  } catch {
    return {
      ok: false,
      status: res.status,
      data: null,
      isHtml: false,
      rawPreview: trimmed.slice(0, 200),
    };
  }
}

export function formatApiFailureMessage(
  status: number,
  isHtml: boolean,
  data: unknown,
  rawPreview: string
): string {
  if (isHtml) {
    return [
      `The server returned an HTML error page (HTTP ${status}) instead of JSON.`,
      'Common causes on production:',
      '• Nginx/reverse proxy: request or body too large — increase client_max_body_size (e.g. 50m) and reload nginx.',
      '• Gateway timeout or 502/504 — check app logs: journalctl -u cp-migration-tool -f',
      '• Session lost — hard refresh, log in again, then retry.',
    ].join('\n');
  }

  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error: unknown }).error;
    if (typeof err === 'string') return err;
    if (Array.isArray(err)) return JSON.stringify(err);
  }

  if (rawPreview) {
    return `Request failed (HTTP ${status}): ${rawPreview}`;
  }

  return `Request failed (HTTP ${status})`;
}
