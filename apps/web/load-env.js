#!/usr/bin/env node
/**
 * Load .env file and start Next.js (no shell expansion - handles $ and special chars in passwords).
 * Used for production/systemd to ensure env vars load correctly.
 */
const { readFileSync } = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const envPath = path.join(__dirname, '.env');
try {
  const content = readFileSync(envPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim().replace(/\r$/, '');
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
    }
    process.env[key] = value;
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.HOST = process.env.HOST || '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';

// Pass env explicitly so child gets our parsed values (avoid Next.js .env overwrite issues)
const env = { ...process.env };
const port = env.PORT;
const child = spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', port], {
  stdio: 'inherit',
  cwd: __dirname,
  env,
});
child.on('exit', (code) => process.exit(code || 0));
