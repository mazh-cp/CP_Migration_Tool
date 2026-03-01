export type MappingEntityType = 'object' | 'service' | 'rule' | 'nat' | 'zone';

export interface UserOverride {
  changed: boolean;
  notes?: string;
  timestamp: string;
}

export interface MappingDecision {
  id: string;
  entityType: MappingEntityType;
  sourceId: string;
  proposedTarget: CheckPointTarget;
  confidenceScore: number;
  reasons: string[];
  warnings: string[];
  userOverride?: UserOverride;
}

export type CheckPointTarget =
  | CheckPointNetworkObject
  | CheckPointService
  | CheckPointGroup
  | CheckPointRule
  | CheckPointNatRule;

export interface CheckPointNetworkObject {
  type: 'host' | 'network' | 'range' | 'group';
  name: string;
  ipAddress?: string;
  subnet?: string;
  subnetMask?: string;
  rangeFrom?: string;
  rangeTo?: string;
  members?: string[];
}

export interface CheckPointService {
  type: 'service-tcp' | 'service-udp' | 'service-icmp';
  name: string;
  port?: number;
  portFrom?: number;
  portTo?: number;
  protocol?: string;
}

export interface CheckPointGroup {
  type: 'group';
  name: string;
  members: string[];
}

export interface CheckPointRule {
  type: 'access-rule';
  name: string;
  source: string[];
  destination: string[];
  service: string[];
  action: 'accept' | 'drop' | 'reject';
  track: 'none' | 'log' | 'alert';
  comments?: string;
}

export interface CheckPointNatRule {
  type: 'static' | 'hide' | 'dynamic';
  originalSource?: string;
  originalDestination?: string;
  originalService?: string;
  translatedSource?: string;
  translatedDestination?: string;
  translatedService?: string;
  comments?: string;
}
