/**
 * Next.js instrumentation — runs once on server startup.
 * Validates required environment variables and fails fast if missing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { validateEnv } = await import('./src/lib/startup-validation');
      validateEnv();
    } catch (err) {
      console.error('Startup validation failed:', err instanceof Error ? err.message : err);
      throw err;
    }
  }
}
