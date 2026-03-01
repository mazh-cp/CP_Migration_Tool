import type {
  CheckPointNetworkObject,
  CheckPointService,
  CheckPointGroup,
  CheckPointRule,
  CheckPointNatRule,
} from '../models/mapping';

export type CPObject = CheckPointNetworkObject | CheckPointService | CheckPointGroup;
export type CPRule = CheckPointRule;
export type CPNat = CheckPointNatRule;
