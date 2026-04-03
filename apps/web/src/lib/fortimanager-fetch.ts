/**
 * FortiManager JSON-RPC client (server-side only). Session is never logged.
 */

import { isIPv4, isIPv6 } from 'node:net';

const allowPrivateFmgUrls =
  process.env.FMG_ALLOW_PRIVATE_URLS === '1' || process.env.FMG_ALLOW_PRIVATE_URLS === 'true';

function ipv4ToUint32(ip: string): number {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return 0xffffffff;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToUint32(ip);
  if (n === 0xffffffff) return true;
  if ((n & 0xff000000) === 0x7f000000) return true; // 127.0.0.0/8
  if ((n & 0xff000000) === 0x0a000000) return true; // 10.0.0.0/8
  if ((n & 0xfff00000) === 0xac100000) return true; // 172.16.0.0/12
  if ((n & 0xffff0000) === 0xc0a80000) return true; // 192.168.0.0/16
  if ((n & 0xffff0000) === 0xa9fe0000) return true; // 169.254.0.0/16
  if ((n & 0xff000000) === 0) return true; // 0.0.0.0/8
  if (n >= 0x64400000 && n <= 0x647fffff) return true; // 100.64.0.0/10 CGNAT
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(lower);
  if (m) return isBlockedIPv4(m[1]);
  return false;
}

/**
 * Reject loopback, link-local, and private IPs in the URL host to reduce SSRF from server-side fetch.
 * Set FMG_ALLOW_PRIVATE_URLS=true for lab installs. Hostnames are not resolved (DNS rebinding is out of scope).
 */
export function assertFortiManagerBaseUrlSafe(baseUrl: string): void {
  if (allowPrivateFmgUrls) return;
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Invalid FortiManager URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('FortiManager URL must use http or https');
  }
  const host = url.hostname;
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    throw new Error('FortiManager URL host is not allowed');
  }
  if (isIPv4(host) && isBlockedIPv4(host)) {
    throw new Error('FortiManager URL must not use a loopback, link-local, or private IP');
  }
  if (isIPv6(host) && isBlockedIPv6(host)) {
    throw new Error('FortiManager URL must not use a loopback, link-local, or private IP');
  }
}

export interface FortiManagerFetchParams {
  baseUrl: string;
  /** API user session from GUI or from login */
  session: string;
  adom: string;
  packageName: string;
  vdom?: string;
}

export interface FortiManagerLoginParams {
  baseUrl: string;
  username: string;
  password: string;
}

function jsonRpcUrl(baseUrl: string): string {
  const u = baseUrl.replace(/\/$/, '');
  return `${u}/jsonrpc`;
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('FortiManager returned non-JSON response');
  }
}

/**
 * Obtain session key via /sys/login/user (same as FortiManager JSON API).
 */
export async function fortimanagerLogin(params: FortiManagerLoginParams): Promise<string> {
  const { baseUrl, username, password } = params;
  assertFortiManagerBaseUrlSafe(baseUrl);
  const res = await fetch(jsonRpcUrl(baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'exec',
      params: [{ url: '/sys/login/user', data: { user: username, passwd: password } }],
      id: 1,
    }),
  });
  const j = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(`FortiManager login HTTP ${res.status}`);
  }
  const err = j.error as { message?: string } | undefined;
  if (err?.message) {
    throw new Error(err.message);
  }
  const session = j.session as string | undefined;
  if (!session) {
    throw new Error('FortiManager login: no session in response');
  }
  return session;
}

async function fmgGet(baseUrl: string, session: string, url: string): Promise<unknown> {
  const res = await fetch(jsonRpcUrl(baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'get',
      params: [{ url }],
      session,
      id: Math.floor(Math.random() * 1e9),
    }),
  });
  const j = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(`FortiManager get HTTP ${res.status}`);
  }
  const err = j.error as { message?: string } | undefined;
  if (err?.message) {
    throw new Error(`${url}: ${err.message}`);
  }
  return j.result;
}

/**
 * Pull object DB + policy package from FortiManager into one bundle for parseFortiManagerExport.
 */
export async function fetchFortiManagerBundle(
  params: FortiManagerFetchParams
): Promise<Record<string, unknown>> {
  const { baseUrl, session, adom, packageName, vdom } = params;
  assertFortiManagerBaseUrlSafe(baseUrl);
  const pkgBase = `/pm/config/adom/${encodeURIComponent(adom)}/pkg/${encodeURIComponent(packageName)}`;
  const vdomSeg = vdom ? `/vdom/${encodeURIComponent(vdom)}` : '';

  const objBase = `/pm/config/adom/${encodeURIComponent(adom)}/obj/firewall`;

  const [address, addrgrp, serviceCustom, serviceGroup, policy] = await Promise.all([
    fmgGet(baseUrl, session, `${objBase}/address`),
    fmgGet(baseUrl, session, `${objBase}/addrgrp`),
    fmgGet(baseUrl, session, `${objBase}/service/custom`),
    fmgGet(baseUrl, session, `${objBase}/service/group`),
    fmgGet(baseUrl, session, `${pkgBase}${vdomSeg}/firewall/policy`),
  ]);

  return {
    adom,
    package: packageName,
    vdom: vdom ?? null,
    address,
    addrgrp,
    serviceCustom,
    serviceGroup,
    policy,
  };
}
