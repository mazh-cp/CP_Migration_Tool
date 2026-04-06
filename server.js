'use strict';

/**
 * Standalone Express server for Palo Alto → Check Point R8x import API.
 * Default port 3001 to avoid conflict with Next.js (3000).
 * Set PALO_ALTO_EXPRESS_PORT to override.
 */

const app = require('./app');

const port = parseInt(process.env.PALO_ALTO_EXPRESS_PORT || '3001', 10);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Palo Alto import API listening on http://localhost:${port}`);
});
