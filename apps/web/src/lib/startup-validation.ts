/**
 * Startup validation — fail fast if required environment variables are missing.
 * Call from instrumentation or a startup check.
 */
export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const errors: string[] = [];

  if (!process.env.DATABASE_URL?.trim()) {
    errors.push('DATABASE_URL is required');
  }

  const hasAuth = process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD;
  if (!hasAuth) {
    errors.push('AUTH_USERNAME and AUTH_PASSWORD are required for authentication');
  }

  if (isProd) {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
      errors.push('SESSION_SECRET must be set and at least 32 characters in production');
    }
    if (hasAuth && process.env.AUTH_PASSWORD === 'changeme') {
      errors.push('AUTH_PASSWORD must be changed from default in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Startup validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}
