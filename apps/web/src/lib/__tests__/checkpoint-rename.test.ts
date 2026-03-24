import { describe, expect, it } from 'vitest';
import { validateNormalizedObjectRename } from '../checkpoint-format';

describe('validateNormalizedObjectRename', () => {
  it('allows dots and typical firewall-style names', () => {
    expect(validateNormalizedObjectRename('10.130.128.50')).toBeNull();
    expect(validateNormalizedObjectRename('10.130.128.50_abc')).toBeNull();
  });
  it('rejects empty', () => {
    expect(validateNormalizedObjectRename('')).toBeTruthy();
    expect(validateNormalizedObjectRename('   ')).toBeTruthy();
  });
});
