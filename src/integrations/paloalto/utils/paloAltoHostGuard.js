'use strict';

const dns = require('dns').promises;
const net = require('net');

class HostPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HostPolicyError';
  }
}

/** @param {string} ip */
function ipv4ToUint32(ip) {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return 0xffffffff;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Always block loopback, link-local / metadata (169.254), and 0.0.0.0/8.
 * @param {string} ip
 * @param {boolean} blockPrivateRfc1918
 */
function isForbiddenIPv4(ip, blockPrivateRfc1918) {
  const n = ipv4ToUint32(ip);
  if (n === 0xffffffff) return true;
  if ((n & 0xff000000) === 0x7f000000) return true; // 127.0.0.0/8
  if ((n & 0xffff0000) === 0xa9fe0000) return true; // 169.254.0.0/16
  if ((n & 0xff000000) === 0) return true; // 0.0.0.0/8
  if (blockPrivateRfc1918) {
    if ((n & 0xff000000) === 0x0a000000) return true; // 10.0.0.0/8
    if ((n & 0xfff00000) === 0xac100000) return true; // 172.16.0.0/12
    if ((n & 0xffff0000) === 0xc0a80000) return true; // 192.168.0.0/16
  }
  return false;
}

/** @param {string} ip */
function isForbiddenIPv6(ip, blockPrivateRfc1918) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('ff')) return true; // multicast
  if (blockPrivateRfc1918 && (lower.startsWith('fc') || lower.startsWith('fd'))) return true;
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(lower);
  if (m) return isForbiddenIPv4(m[1], blockPrivateRfc1918);
  return false;
}

function parseAllowlist() {
  const raw = process.env.PALO_ALTO_HOST_ALLOWLIST || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Strip optional :port from host (not for bracketed IPv6).
 * @param {string} host
 */
function normalizeHostInput(host) {
  const h = String(host).trim().toLowerCase();
  if (!h) return '';
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    if (end > 0) return h.slice(1, end);
    return h;
  }
  if (h.includes(':') && net.isIPv6(h)) return h;
  if (h.includes(':') && !net.isIPv6(h)) {
    return h.split(':')[0];
  }
  return h;
}

function hostOnAllowlist(hostNorm, allowlist) {
  if (allowlist.length === 0) return true;
  return allowlist.some((entry) => entry === hostNorm);
}

/**
 * Resolve and verify target is not loopback / link-local / (optional) RFC1918.
 * Call before creating PanFirewallClient.
 * @param {string} host
 * @returns {Promise<void>}
 */
async function assertPaloAltoHostSafe(host) {
  const hostNorm = normalizeHostInput(host);
  if (!hostNorm || hostNorm.length > 253) {
    throw new HostPolicyError('Invalid firewall host');
  }

  const allowlist = parseAllowlist();
  if (!hostOnAllowlist(hostNorm, allowlist)) {
    throw new HostPolicyError('Host is not permitted (PALO_ALTO_HOST_ALLOWLIST)');
  }

  const blockPrivate =
    process.env.PALO_ALTO_BLOCK_PRIVATE_HOSTS === 'true' ||
    process.env.PALO_ALTO_BLOCK_PRIVATE_HOSTS === '1';

  if (net.isIPv4(hostNorm)) {
    if (isForbiddenIPv4(hostNorm, blockPrivate)) throw new HostPolicyError('Target IP is not permitted');
    return;
  }
  if (net.isIPv6(hostNorm)) {
    if (isForbiddenIPv6(hostNorm, blockPrivate)) throw new HostPolicyError('Target IP is not permitted');
    return;
  }

  const blockedHostnames = new Set(['metadata.google.internal', 'metadata.goog']);
  if (blockedHostnames.has(hostNorm)) {
    throw new HostPolicyError('Target host is not permitted');
  }

  let results;
  try {
    results = await dns.lookup(hostNorm, { all: true, verbatim: true });
  } catch {
    throw new HostPolicyError('Could not resolve firewall host');
  }
  if (!results || results.length === 0) {
    throw new HostPolicyError('Could not resolve firewall host');
  }
  for (const { address } of results) {
    if (net.isIPv4(address)) {
      if (isForbiddenIPv4(address, blockPrivate)) {
        throw new HostPolicyError('Resolved address is not permitted');
      }
    } else if (net.isIPv6(address)) {
      if (isForbiddenIPv6(address, blockPrivate)) {
        throw new HostPolicyError('Resolved address is not permitted');
      }
    }
  }
}

module.exports = {
  assertPaloAltoHostSafe,
  normalizeHostInput,
  parseAllowlist,
  HostPolicyError,
};
