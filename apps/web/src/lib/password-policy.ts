/**
 * Shared password complexity policy.
 *
 * Used by both the server (route validation, single source of truth) and the
 * client (live requirement checklist) so the two can never drift. Pure logic —
 * no bcrypt or Prisma imports — so it is trivially unit-testable.
 */

import { z } from 'zod';

/** bcrypt truncates input at 72 bytes; cap length so the whole password counts. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72;

/** Work factor for bcrypt.hash across the app. */
export const PASSWORD_HASH_ROUNDS = 12;

/** Lower-cased, exact-match denylist of trivially guessable passwords. */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'admin',
  'administrator',
  'changeme',
  'letmein',
  'welcome',
  'welcome1',
  'qwerty',
  'qwerty123',
  'iloveyou',
  '12345678',
  '123456789',
  '1234567890',
  'checkpoint',
  'checkpoint1',
]);

export type PasswordContext = {
  /** When provided, the password must not contain the username. */
  username?: string;
};

export type PasswordRequirement = {
  id: string;
  label: string;
  test: (password: string, ctx?: PasswordContext) => boolean;
};

/**
 * Ordered requirements. `label` is shown verbatim in the UI checklist and in
 * server error responses, so keep them human-readable.
 */
export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    id: 'length',
    label: `Between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH && p.length <= PASSWORD_MAX_LENGTH,
  },
  {
    id: 'lowercase',
    label: 'At least one lowercase letter',
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: 'uppercase',
    label: 'At least one uppercase letter',
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: 'digit',
    label: 'At least one number',
    test: (p) => /[0-9]/.test(p),
  },
  {
    id: 'special',
    label: 'At least one special character (e.g. !@#$%)',
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
  {
    id: 'not-common',
    label: 'Not a commonly used password',
    test: (p) => !COMMON_PASSWORDS.has(p.trim().toLowerCase()),
  },
  {
    id: 'not-username',
    label: 'Does not contain your username',
    test: (p, ctx) => {
      const username = ctx?.username?.trim().toLowerCase();
      if (!username || username.length < 3) return true;
      return !p.toLowerCase().includes(username);
    },
  },
];

export type PasswordRequirementStatus = {
  id: string;
  label: string;
  met: boolean;
};

/** Per-requirement pass/fail — drives the live checklist in the UI. */
export function evaluatePassword(password: string, ctx?: PasswordContext): PasswordRequirementStatus[] {
  return PASSWORD_REQUIREMENTS.map((r) => ({
    id: r.id,
    label: r.label,
    met: r.test(password, ctx),
  }));
}

/** Labels of the requirements the password fails. Empty array means it is acceptable. */
export function getPasswordViolations(password: string, ctx?: PasswordContext): string[] {
  return PASSWORD_REQUIREMENTS.filter((r) => !r.test(password, ctx)).map((r) => r.label);
}

export function isPasswordAcceptable(password: string, ctx?: PasswordContext): boolean {
  return getPasswordViolations(password, ctx).length === 0;
}

/**
 * Zod schema enforcing the full policy. Pass context (e.g. username) so
 * username-containment can be checked. The refinement surfaces every failed
 * requirement, not just the first.
 */
export function makePasswordSchema(ctx?: PasswordContext) {
  return z.string().superRefine((value, refinement) => {
    for (const violation of getPasswordViolations(value, ctx)) {
      refinement.addIssue({ code: z.ZodIssueCode.custom, message: violation });
    }
  });
}
