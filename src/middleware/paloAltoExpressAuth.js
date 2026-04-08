'use strict';

/**
 * When PALO_ALTO_EXPRESS_API_KEY is set, require Authorization: Bearer <key> or X-API-Key.
 * In production the server exits at startup if the key is missing (see server.js).
 */
function requirePaloAltoExpressApiKey(req, res, next) {
  const key = process.env.PALO_ALTO_EXPRESS_API_KEY?.trim();
  if (!key) {
    return next();
  }
  const auth = req.headers.authorization;
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const headerKey = req.headers['x-api-key'];
  const sent = bearer || (typeof headerKey === 'string' ? headerKey.trim() : '');
  if (sent !== key) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

module.exports = { requirePaloAltoExpressApiKey };
