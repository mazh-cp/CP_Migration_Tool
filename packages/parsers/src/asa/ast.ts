export interface ASAStatement {
  type: string;
  lineNumber?: number;
  raw?: string;
}

export interface ObjectNetwork extends ASAStatement {
  type: 'object-network';
  name: string;
  host?: string;
  subnet?: string;
  subnetMask?: string;
  range?: { from: string; to: string };
  fqdn?: string;
}

export interface ObjectGroupNetwork extends ASAStatement {
  type: 'object-group-network';
  name: string;
  entries: Array<
    | { type: 'network'; name?: string; subnet: string; mask?: string }
    | { type: 'host'; name?: string; host: string }
    | { type: 'range'; from: string; to: string }
    | { type: 'object'; name: string }
  >;
}

export interface ObjectService extends ASAStatement {
  type: 'object-service';
  name: string;
  proto: 'tcp' | 'udp' | 'icmp';
  port?: number;
  portRange?: { from: number; to: number };
}

export interface ObjectGroupService extends ASAStatement {
  type: 'object-group-service';
  name: string;
  entries: Array<
    | { type: 'port-object'; proto: 'tcp' | 'udp'; port?: number; range?: { from: number; to: number } }
    | { type: 'service-object'; name: string }
    | { type: 'group-object'; name: string }
  >;
}

export interface AccessListExtended extends ASAStatement {
  type: 'access-list-extended';
  name: string;
  action: 'permit' | 'deny';
  proto: string;
  src: string;
  srcWildcard?: string;
  srcPort?: string;
  dst: string;
  dstWildcard?: string;
  dstPort?: string;
  options?: string[];
}

export interface NatStatement extends ASAStatement {
  type: 'nat';
  insideInterface?: string;
  outsideInterface?: string;
  src: string;
  dst?: string;
  static?: boolean;
  pat?: boolean;
  translatedSrc?: string;
  translatedDst?: string;
}

export interface InterfaceStatement extends ASAStatement {
  type: 'interface';
  name: string;
  ipAddress?: string;
  mask?: string;
  securityLevel?: number;
}

export interface NameIfStatement extends ASAStatement {
  type: 'nameif';
  interfaceName: string;
  zoneName: string;
}

/** Multi-field policy (e.g. FortiGate) mapped into the same normalized rule model. */
export interface ExplicitPolicyRule extends ASAStatement {
  type: 'explicit-policy-rule';
  name?: string;
  /** FortiOS policyid / FMG id for analytics merge (e.g. FortiAnalyzer hits). */
  ruleId?: string;
  enabled: boolean;
  sourceNames: string[];
  destinationNames: string[];
  serviceNames: string[];
  action: 'permit' | 'deny' | 'reject';
  log: 'none' | 'log' | 'alert';
  /** FortiGate srcintf / dstintf names (topology — map in UI). */
  sourceInterfaceNames?: string[];
  destinationInterfaceNames?: string[];
  /** FortiOS firewall policy schedule name. */
  scheduleName?: string;
  /** UTM / security profile refs (Forti → Check Point manual mapping). */
  utmProfileRefs?: Record<string, string>;
  /** Policy-level SNAT when set nat enable + poolname (pool name string if present). */
  policyNatPoolName?: string;
  policyNatEnabled?: boolean;
  /** FortiOS `set groups` / `set users` (Identity Awareness mapping required). */
  identityGroupNames?: string[];
  identityUserNames?: string[];
  /** Dotted names resembling Forti ISDB / internet-service (manual mapping). */
  possibleInternetServiceNames?: string[];
}

/** FortiGate VIP (DNAT) — normalized to static destination NAT. */
export interface FortinetVipStatement extends ASAStatement {
  type: 'fortinet-vip';
  name: string;
  extip?: string;
  mappedip?: string;
  extintf?: string;
  extport?: string;
  mappedport?: string;
}

/** FortiGate IP pool (SNAT range). */
export interface FortinetIppoolStatement extends ASAStatement {
  type: 'fortinet-ippool';
  name: string;
  startip?: string;
  endip?: string;
}

/**
 * FortiGate `config vpn ipsec phase1-interface` entry — captured as a
 * site-to-site VPN review note. `pskConfigured` records only that a psksecret
 * was present; the secret value is never captured.
 */
export interface FortinetVpnPhase1Statement extends ASAStatement {
  type: 'fortinet-vpn-phase1';
  name: string;
  remoteGw?: string;
  iface?: string;
  proposal?: string;
  pskConfigured?: boolean;
}

/**
 * PAN-OS `network/ike/gateway` entry — captured as a site-to-site VPN review
 * note. `pskConfigured` is a presence flag; the key value is never captured.
 */
export interface PanIkeGatewayStatement extends ASAStatement {
  type: 'pan-ike-gateway';
  name: string;
  peer?: string;
  iface?: string;
  pskConfigured?: boolean;
}

/** ASA `ip local pool` — remote-access VPN address pool. */
export interface IpLocalPoolStatement extends ASAStatement {
  type: 'ip-local-pool';
  name: string;
  range: string;
  mask?: string;
}

/** ASA `group-policy NAME internal|attributes` block. */
export interface GroupPolicyStatement extends ASAStatement {
  type: 'group-policy';
  name: string;
  vpnTunnelProtocol?: string[];
  splitTunnelList?: string;
}

/**
 * ASA `tunnel-group NAME ...` fragment. ASA splits a tunnel group across a
 * `type` line and one or more `*-attributes` blocks, so a single group emits
 * multiple fragments (each carrying whatever fields that line declared);
 * normalization merges them by name. `tunnelType` is only set on the `type` line.
 */
export interface TunnelGroupStatement extends ASAStatement {
  type: 'tunnel-group';
  name: string;
  tunnelType?: 'remote-access' | 'ipsec-l2l';
  addressPool?: string;
  defaultGroupPolicy?: string;
  /** True when a pre-shared key is present. The key itself is never captured. */
  pskConfigured?: boolean;
}

/** ASA `crypto map NAME SEQ ...` line (site-to-site VPN). */
export interface CryptoMapStatement extends ASAStatement {
  type: 'crypto-map';
  name: string;
  seq: number;
  matchAcl?: string;
  peer?: string;
  ifaceName?: string;
}

export type ASAVpnStatement =
  | IpLocalPoolStatement
  | GroupPolicyStatement
  | TunnelGroupStatement
  | CryptoMapStatement;

/** ASA `failover ...` line — HA config captured as review notes (key values masked). */
export interface HaStatement extends ASAStatement {
  type: 'ha-config';
  detail: string;
}

/** ASA inspection config (policy-map inspects / threat-detection) — review notes only. */
export interface InspectionStatement extends ASAStatement {
  type: 'inspection';
  source: 'policy-map' | 'threat-detection';
  name?: string;
  inspects: string[];
}

/** ASA static route: `route IFNAME dest mask nexthop [metric]`. */
export interface RouteStatement extends ASAStatement {
  type: 'route';
  ifName: string;
  dest: string;
  mask: string;
  nextHop: string;
  metric?: number;
}

/** ASA dynamic routing block header: `router ospf|bgp|eigrp ID` (captured as review notes). */
export interface DynamicRoutingStatement extends ASAStatement {
  type: 'dynamic-routing';
  protocol: 'ospf' | 'bgp' | 'eigrp' | 'rip';
  processOrAs?: string;
  /** Selected sub-lines (network / neighbor / router-id) kept verbatim for review. */
  details: string[];
}

export type ASAAstNode =
  | ObjectNetwork
  | ObjectGroupNetwork
  | ObjectService
  | ObjectGroupService
  | AccessListExtended
  | NatStatement
  | InterfaceStatement
  | NameIfStatement
  | ExplicitPolicyRule
  | FortinetVipStatement
  | FortinetIppoolStatement
  | FortinetVpnPhase1Statement
  | PanIkeGatewayStatement
  | ASAVpnStatement
  | RouteStatement
  | DynamicRoutingStatement
  | HaStatement
  | InspectionStatement
  | ASAStatement;

export interface ASAParseResult {
  statements: ASAAstNode[];
  warnings: string[];
}
