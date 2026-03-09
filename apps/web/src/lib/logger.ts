import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const isProd = process.env.NODE_ENV === 'production';

/**
 * Redact sensitive fields from log output.
 * Never log: passwords, tokens, secrets, API keys, config content, connection strings.
 */
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordHash',
  'token',
  'secret',
  'apiKey',
  'litellmApiKey',
  'content',
  '*.content',
  'err.password',
  'err.token',
  'err.secret',
  '*.password',
  '*.token',
  '*.secret',
];

export const logger = pino({
  level,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  serializers: {
    err: (err: Error & { statusCode?: number }) => {
      if (!err) return err;
      const base: Record<string, unknown> = {
        message: err.message,
        type: err.name,
      };
      if (err.statusCode) base.statusCode = err.statusCode;
      if (!isProd && err.stack) base.stack = err.stack;
      return base;
    },
  },
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, redact: redactPaths } }
      : undefined,
});
