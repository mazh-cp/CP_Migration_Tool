export type NormalizedObjectType =
  | 'host'
  | 'network'
  | 'range'
  | 'fqdn'
  | 'group'
  | 'service'
  | 'service-group';

export interface NormalizedObject {
  id: string;
  type: NormalizedObjectType;
  name: string;
  value?: string;
  values?: string[];
  proto?: 'tcp' | 'udp' | 'icmp' | 'ip';
  port?: number;
  portRange?: { from: number; to: number };
  members?: string[];
  comments?: string;
  tags?: string[];
  sourceLine?: number;
  sourceRef?: string;
}

export interface NormalizedInterface {
  id: string;
  name: string;
  ip?: string;
  mask?: string;
  securityLevel?: number;
  zoneId?: string;
  vlan?: string;
}

export interface NormalizedZone {
  id: string;
  name: string;
  interfaceIds?: string[];
}

export interface NormalizedPolicyRule {
  id: string;
  ruleId?: string;
  name?: string;
  enabled: boolean;
  sourceRefs: string[];
  destinationRefs: string[];
  serviceRefs: string[];
  action: 'allow' | 'deny' | 'reject';
  log: 'none' | 'log' | 'alert';
  scheduleRef?: string;
  timeCreated?: string;
  owner?: string;
  comments?: string;
  hitCount?: number;
  sourceLines?: number[];
}

export type NatType = 'static' | 'dynamic' | 'hide' | 'pat' | 'no-nat';

export interface NormalizedNATRule {
  id: string;
  type: NatType;
  originalSrc?: string;
  originalDst?: string;
  originalSvc?: string;
  translatedSrc?: string;
  translatedDst?: string;
  translatedSvc?: string;
  interfaceRef?: string;
  zoneRef?: string;
  order: number;
  sourceLines?: number[];
}

export interface NormalizedResult {
  objects: NormalizedObject[];
  rules: NormalizedPolicyRule[];
  nat: NormalizedNATRule[];
  interfaces: NormalizedInterface[];
  zones: NormalizedZone[];
  warnings: string[];
}
