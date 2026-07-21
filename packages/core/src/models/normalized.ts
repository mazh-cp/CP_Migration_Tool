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
  /** FortiOS schedule name (manual layer / zone mapping). */
  scheduleName?: string;
  /** FortiGate srcintf names (topology — not Check Point refs until mapped). */
  sourceInterfaceNames?: string[];
  destinationInterfaceNames?: string[];
  /** Forti UTM / profile refs for manual Check Point mapping. */
  utmProfileRefs?: Record<string, string>;
  /** Policy SNAT: Forti `set nat enable` (+ optional poolname). */
  policyNatEnabled?: boolean;
  policyNatPoolName?: string;
  identityGroupNames?: string[];
  identityUserNames?: string[];
  possibleInternetServiceNames?: string[];
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

/**
 * VPN is captured as review notes, not converted rules — Check Point VPN
 * communities require manual recreation. `pskConfigured` records only that a
 * key was present; the key value is never stored.
 */
export interface NormalizedRemoteAccessVpn {
  poolName?: string;
  poolRange?: string;
  splitTunnelList?: string;
  protocols: string[];
}

export interface NormalizedSiteToSiteVpn {
  name: string;
  peer?: string;
  matchAcl?: string;
  pskConfigured?: boolean;
}

export interface NormalizedVpn {
  remoteAccess: NormalizedRemoteAccessVpn[];
  siteToSite: NormalizedSiteToSiteVpn[];
}

/** Static route — converted to a Check Point Gaia static route. */
export interface NormalizedRoute {
  id: string;
  destCidr: string;
  nextHop: string;
  interfaceName?: string;
  metric?: number;
}

/** Dynamic routing (OSPF/BGP/EIGRP/RIP) — captured as review notes, not converted. */
export interface NormalizedDynamicRouting {
  protocol: string;
  processOrAs?: string;
  details: string[];
}

/** High availability (ASA failover) — review notes; recreate as ClusterXL / Gaia HA. */
export interface NormalizedHa {
  details: string[];
}

/** Advanced inspection (policy-map inspects, threat-detection) — review notes; map to Threat Prevention blades. */
export interface NormalizedInspection {
  policyMaps: { name: string; inspects: string[] }[];
  threatDetection: string[];
}

export interface NormalizedResult {
  objects: NormalizedObject[];
  rules: NormalizedPolicyRule[];
  nat: NormalizedNATRule[];
  interfaces: NormalizedInterface[];
  zones: NormalizedZone[];
  /** Static routes (convertible to Gaia static routes). */
  routes?: NormalizedRoute[];
  /** Dynamic routing protocols (review notes only). */
  dynamicRouting?: NormalizedDynamicRouting[];
  /** Present only when the source defined VPN (ASA remote-access / site-to-site). */
  vpn?: NormalizedVpn;
  /** ASA failover config detected (review notes only). */
  ha?: NormalizedHa;
  /** Inspection / threat-detection config detected (review notes only). */
  inspection?: NormalizedInspection;
  warnings: string[];
}
