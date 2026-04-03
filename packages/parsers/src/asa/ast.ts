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
  | ASAStatement;

export interface ASAParseResult {
  statements: ASAAstNode[];
  warnings: string[];
}
