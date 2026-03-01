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

export type ASAAstNode =
  | ObjectNetwork
  | ObjectGroupNetwork
  | ObjectService
  | ObjectGroupService
  | AccessListExtended
  | NatStatement
  | InterfaceStatement
  | NameIfStatement
  | ASAStatement;

export interface ASAParseResult {
  statements: ASAAstNode[];
  warnings: string[];
}
