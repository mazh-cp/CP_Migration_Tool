import { v5 as uuidv5 } from 'uuid';
import type { NormalizedObject } from '../models/normalized';

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace for deterministic UUIDs

/** Built-in constants - never emit as regular objects in export */
export const ANY_NET_ID = '__ANY_NETWORK__';
export const ANY_SVC_ID = '__ANY_SERVICE__';

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function maskToCidr(mask: string): number {
  if (mask.includes('/')) return parseInt(mask.split('/')[1] || '32', 10);
  const parts = mask.split('.').map(Number);
  let cidr = 0;
  for (const p of parts) {
    if (p === 255) cidr += 8;
    else if (p > 0) {
      let m = p;
      while (m) {
        cidr += m & 1;
        m >>= 1;
      }
      break;
    }
  }
  return cidr;
}

function canonicalNetworkKey(attrs: {
  host?: string;
  subnet?: string;
  subnetMask?: string;
  range?: { from: string; to: string };
  name?: string;
}): string {
  if (attrs.host) return `net:host:${attrs.host}`;
  if (attrs.subnet) {
    const cidr = attrs.subnet.includes('/')
      ? attrs.subnet
      : attrs.subnetMask
        ? `${attrs.subnet}/${maskToCidr(attrs.subnetMask)}`
        : `${attrs.subnet}/32`;
    return `net:subnet:${cidr}`;
  }
  if (attrs.range?.from && attrs.range?.to) return `net:range:${attrs.range.from}-${attrs.range.to}`;
  if (attrs.name) return `net:name:${normalizeKey(attrs.name)}`;
  throw new Error('Invalid network attrs');
}

function canonicalServiceKey(attrs: {
  proto: string;
  port?: number;
  portRange?: { from: number; to: number };
  name?: string;
}): string {
  if (attrs.name) return `svc:name:${normalizeKey(attrs.name)}`;
  const p = (attrs.proto || 'tcp').toLowerCase();
  if (attrs.port != null) return `svc:${p}:${attrs.port}`;
  if (attrs.portRange) return `svc:${p}:${attrs.portRange.from}-${attrs.portRange.to}`;
  return `svc:${p}:any`;
}

function canonicalGroupKey(type: 'network' | 'service', name: string): string {
  return `grp:${type}:${normalizeKey(name)}`;
}

function stableId(key: string): string {
  return uuidv5(key, NAMESPACE);
}

export class ObjectRegistry {
  private byId = new Map<string, NormalizedObject>();
  private byKey = new Map<string, string>();
  private nameToId = new Map<string, string>();

  createOrGetNetworkObject(
    key: string,
    attrs: {
      type: 'host' | 'network' | 'range' | 'fqdn';
      name: string;
      value?: string;
      values?: [string, string];
      sourceLine?: number;
    }
  ): string {
    const canonical = key.startsWith('net:') ? key : canonicalNetworkKey(attrs as never);
    const existing = this.byKey.get(canonical);
    if (existing) return existing;

    const id = stableId(canonical);
    const obj: NormalizedObject = {
      id,
      type: attrs.type,
      name: attrs.name,
      value: attrs.value,
      values: attrs.values,
      sourceLine: attrs.sourceLine,
    };
    this.byId.set(id, obj);
    this.byKey.set(canonical, id);
    this.nameToId.set(normalizeKey(attrs.name), id);
    return id;
  }

  createOrGetServiceObject(
    key: string,
    attrs: {
      name: string;
      proto: 'tcp' | 'udp' | 'icmp';
      port?: number;
      portRange?: { from: number; to: number };
      sourceLine?: number;
    }
  ): string {
    const canonical = key.startsWith('svc:') ? key : canonicalServiceKey(attrs);
    const existing = this.byKey.get(canonical);
    if (existing) return existing;

    const id = stableId(canonical);
    const obj: NormalizedObject = {
      id,
      type: 'service',
      name: attrs.name,
      proto: attrs.proto,
      port: attrs.port,
      portRange: attrs.portRange,
      sourceLine: attrs.sourceLine,
    };
    this.byId.set(id, obj);
    this.byKey.set(canonical, id);
    this.nameToId.set(normalizeKey(attrs.name), id);
    return id;
  }

  createOrGetGroupObject(
    key: string,
    attrs: {
      type: 'group' | 'service-group';
      name: string;
      members: string[];
      proto?: 'tcp' | 'udp';
      sourceLine?: number;
    }
  ): string {
    const gtype = attrs.type === 'service-group' ? 'service' : 'network';
    const canonical = key.startsWith('grp:') ? key : canonicalGroupKey(gtype, attrs.name);
    const existing = this.byKey.get(canonical);
    if (existing) return existing;

    const id = stableId(canonical);
    const obj: NormalizedObject = {
      id,
      type: attrs.type,
      name: attrs.name,
      members: attrs.members,
      proto: attrs.proto,
      sourceLine: attrs.sourceLine,
    };
    this.byId.set(id, obj);
    this.byKey.set(canonical, id);
    this.nameToId.set(normalizeKey(attrs.name), id);
    return id;
  }

  resolveByName(name: string): string | undefined {
    return this.nameToId.get(normalizeKey(name));
  }

  getById(id: string): NormalizedObject | undefined {
    return this.byId.get(id);
  }

  listAll(): NormalizedObject[] {
    return Array.from(this.byId.values());
  }

  hasId(id: string): boolean {
    return this.byId.has(id) || id === ANY_NET_ID || id === ANY_SVC_ID;
  }

  registerByName(name: string, id: string): void {
    const n = normalizeKey(name);
    this.nameToId.set(n, id);
  }

  clear(): void {
    this.byId.clear();
    this.byKey.clear();
    this.nameToId.clear();
  }
}

export function createServiceKey(proto: string, port?: number, portRange?: { from: number; to: number }): string {
  const p = proto.toLowerCase();
  if (port != null) return `svc:${p}:${port}`;
  if (portRange) return `svc:${p}:${portRange.from}-${portRange.to}`;
  return `svc:${p}:any`;
}
