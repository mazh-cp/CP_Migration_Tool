'use strict';

/**
 * Standalone Express server for Palo Alto → Check Point R8x import API.
 * Default port 3001 to avoid conflict with Next.js (3000).
 * Set PALO_ALTO_EXPRESS_PORT to override.
 */

function validateProductionConfig() {
  const prod = process.env.NODE_ENV === 'production';
  if (!prod) return;

  if (!process.env.PALO_ALTO_EXPRESS_API_KEY?.trim()) {
    // eslint-disable-next-line no-console
    console.error(
      'FATAL: PALO_ALTO_EXPRESS_API_KEY must be set when NODE_ENV=production. Refusing to start.'
    );
    process.exit(1);
  }

  const allowlist = process.env.PALO_ALTO_HOST_ALLOWLIST?.trim();
  const allowAny =
    process.env.PALO_ALTO_ALLOW_ANY_HOST === 'true' || process.env.PALO_ALTO_ALLOW_ANY_HOST === '1';
  if (!allowlist && !allowAny) {
    // eslint-disable-next-line no-console
    console.error(
      'FATAL: Set PALO_ALTO_HOST_ALLOWLIST (comma-separated hosts) or PALO_ALTO_ALLOW_ANY_HOST=true when NODE_ENV=production.'
    );
    process.exit(1);
  }
}

validateProductionConfig();

const app = require('./app');

const port = parseInt(process.env.PALO_ALTO_EXPRESS_PORT || '3001', 10);

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Palo Alto import API listening on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production' && !process.env.PALO_ALTO_EXPRESS_API_KEY?.trim()) {
    // eslint-disable-next-line no-console
    console.warn(
      'Warning: PALO_ALTO_EXPRESS_API_KEY is not set; API is open to anyone who can reach this port. Set the key for production-like environments.'
    );
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    !process.env.PALO_ALTO_HOST_ALLOWLIST?.trim() &&
    process.env.PALO_ALTO_ALLOW_ANY_HOST !== 'true' &&
    process.env.PALO_ALTO_ALLOW_ANY_HOST !== '1'
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      'Warning: PALO_ALTO_HOST_ALLOWLIST is empty; any resolvable non-loopback host may be used (metadata/link-local still blocked). Set an allowlist for stricter SSRF protection.'
    );
  }
});

function gracefulShutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received; closing server…`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error('Forced exit after shutdown timeout');
    process.exit(1);
  }, 30_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('unhandledRejection', reason);
});

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('uncaughtException', err);
  process.exit(1);
});
