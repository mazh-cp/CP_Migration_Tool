import { describe, it, expect } from 'vitest';
import {
  getPasswordViolations,
  isPasswordAcceptable,
  evaluatePassword,
  makePasswordSchema,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../password-policy';

describe('password policy', () => {
  it('accepts a strong password meeting every requirement', () => {
    expect(isPasswordAcceptable('Str0ng&Passphrase!')).toBe(true);
    expect(getPasswordViolations('Str0ng&Passphrase!')).toEqual([]);
  });

  it('rejects passwords that are too short', () => {
    expect(isPasswordAcceptable('Ab1!')).toBe(false);
    expect(getPasswordViolations('Ab1!')).toContain(
      `Between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`
    );
  });

  it('requires each character class', () => {
    // 12+ chars but missing classes
    expect(getPasswordViolations('alllowercase1!')).toContain('At least one uppercase letter');
    expect(getPasswordViolations('ALLUPPERCASE1!')).toContain('At least one lowercase letter');
    expect(getPasswordViolations('NoDigitsHere!!')).toContain('At least one number');
    expect(getPasswordViolations('NoSpecials1234')).toContain(
      'At least one special character (e.g. !@#$%)'
    );
  });

  it('rejects passwords longer than the max length', () => {
    const tooLong = 'Aa1!' + 'x'.repeat(PASSWORD_MAX_LENGTH);
    expect(isPasswordAcceptable(tooLong)).toBe(false);
  });

  it('rejects common passwords case-insensitively', () => {
    expect(isPasswordAcceptable('Password123')).toBe(false);
    expect(getPasswordViolations('CHECKPOINT1')).toContain('Not a commonly used password');
  });

  it('rejects passwords containing the username', () => {
    const violations = getPasswordViolations('Alice-Secret99!', { username: 'alice' });
    expect(violations).toContain('Does not contain your username');
  });

  it('ignores very short usernames for the containment check', () => {
    // 2-char username should not disqualify passwords that happen to contain it
    expect(getPasswordViolations('Str0ng&Passphrase!', { username: 'ab' })).toEqual([]);
  });

  it('evaluatePassword reports per-requirement status for the UI', () => {
    const items = evaluatePassword('short', { username: 'bob' });
    const byId = Object.fromEntries(items.map((i) => [i.id, i.met]));
    expect(byId.length).toBe(false);
    expect(byId.lowercase).toBe(true);
    expect(byId.uppercase).toBe(false);
  });

  it('makePasswordSchema surfaces every failed requirement', () => {
    const schema = makePasswordSchema({ username: 'carol' });
    const result = schema.safeParse('weak');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(1);
    }
    expect(schema.safeParse('Str0ng&Passphrase!').success).toBe(true);
  });
});
