import { describe, it, expect, afterEach } from 'vitest';
import {
  getEnvBootstrapUsername,
  isEnvBootstrapUsername,
  isTenantAdministratorRole,
} from '../platform-roles';

describe('platform-roles', () => {
  const originalAuthUser = process.env.AUTH_USERNAME;

  afterEach(() => {
    if (originalAuthUser === undefined) {
      delete process.env.AUTH_USERNAME;
    } else {
      process.env.AUTH_USERNAME = originalAuthUser;
    }
  });

  it('isTenantAdministratorRole is true only for tenant admin membership', () => {
    expect(isTenantAdministratorRole('admin')).toBe(true);
    expect(isTenantAdministratorRole('member')).toBe(false);
    expect(isTenantAdministratorRole('viewer')).toBe(false);
    expect(isTenantAdministratorRole(undefined)).toBe(false);
  });

  it('isEnvBootstrapUsername follows AUTH_USERNAME', () => {
    process.env.AUTH_USERNAME = 'admin';
    expect(getEnvBootstrapUsername()).toBe('admin');
    expect(isEnvBootstrapUsername('admin')).toBe(true);
    expect(isEnvBootstrapUsername('other')).toBe(false);
  });
});