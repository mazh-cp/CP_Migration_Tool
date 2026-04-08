'use strict';

const express = require('express');
const Joi = require('joi');
const { uploadSingle, handleUploadError } = require('../../middleware/fileUpload');
const {
  connectionSchema,
  panoramaSchema,
  downloadR8xSchema,
  validateBody,
} = require('../../integrations/paloalto/validators/configValidator');
const {
  assertPaloAltoHostSafe,
  HostPolicyError,
} = require('../../integrations/paloalto/utils/paloAltoHostGuard');
const { PanFirewallClient } = require('../../integrations/paloalto/api/panFirewallClient');
const { PanoramaClient } = require('../../integrations/paloalto/api/panoramaClient');

const router = express.Router();

const vsysFromRequestSchema = Joi.string().max(64).pattern(/^[a-zA-Z0-9._-]+$/).default('vsys1');

let migrationStackPromise = null;
function getMigrationStack() {
  if (!migrationStackPromise) {
    migrationStackPromise = Promise.all([import('@cisco2cp/parsers'), import('@cisco2cp/exporters')]).then(
      ([parsers, exporters]) => ({
        parsePaloAltoXml: parsers.parsePaloAltoXml,
        buildR8xMigrationFromStatements: exporters.buildR8xMigrationFromStatements,
        getR8xMigrationSummary: exporters.getR8xMigrationSummary,
      })
    );
  }
  return migrationStackPromise;
}

/** Binary ZIP uploads must be decoded as Latin-1 so byte 0x50 0x4b is preserved. */
function bufferToPaloAltoString(buf) {
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return buf.toString('latin1');
  return buf.toString('utf8');
}

async function xmlStringToR8x(xml, vsys) {
  const { parsePaloAltoXml, buildR8xMigrationFromStatements, getR8xMigrationSummary } = await getMigrationStack();
  const { statements, warnings } = parsePaloAltoXml(xml);
  const r8x = buildR8xMigrationFromStatements(statements, warnings, { sourceVsys: vsys });
  return { r8x, summary: getR8xMigrationSummary(r8x) };
}

async function createFirewallClient(body) {
  await assertPaloAltoHostSafe(body.host);
  if (body.apiKey) return new PanFirewallClient(body.host, body.apiKey);
  return PanFirewallClient.fromCredentials(body.host, body.username, body.password);
}

async function createPanoramaClient(body) {
  await assertPaloAltoHostSafe(body.host);
  if (body.apiKey) return new PanoramaClient(body.host, body.apiKey);
  return PanoramaClient.fromCredentials(body.host, body.username, body.password);
}

function parseVsys(req) {
  const raw =
    req.query.vsys != null ? String(req.query.vsys) : req.body?.vsys != null ? String(req.body.vsys) : 'vsys1';
  const { error, value } = vsysFromRequestSchema.validate(raw);
  if (error) {
    return { error: true };
  }
  return { error: false, vsys: value };
}

router.post('/test-connection', validateBody(connectionSchema), async (req, res) => {
  try {
    const client = await createFirewallClient(req.body);
    const info = await client.getDeviceInfo();
    const sys = info?.system || info;
    const hostname = sys?.hostname || sys?.['hostname'] || req.body.host;
    const model = sys?.model || sys?.['model'] || '';
    const version = sys?.version || sys?.['sw-version'] || '';
    const serial = sys?.serial || sys?.['serial'] || '';
    return res.status(200).json({
      success: true,
      device: { hostname, model, version, serial },
      tlsNote: 'TLS certificate verification is disabled for user-supplied firewall hosts (self-signed certs).',
    });
  } catch (err) {
    if (err instanceof HostPolicyError) {
      return res.status(400).json({ error: 'Host rejected by policy' });
    }
    return res.status(502).json({ error: 'Connection failed' });
  }
});

router.post('/fetch-config', validateBody(connectionSchema), async (req, res) => {
  try {
    const client = await createFirewallClient(req.body);
    const xml = await client.getRunningConfigRaw();
    const vsys = req.body.vsys || 'vsys1';
    const { r8x, summary } = await xmlStringToR8x(xml, vsys);
    return res.status(200).json({ success: true, summary, r8x });
  } catch (err) {
    if (err instanceof HostPolicyError) {
      return res.status(400).json({ error: 'Host rejected by policy' });
    }
    return res.status(502).json({ error: 'Fetch failed' });
  }
});

router.post(
  '/upload-config',
  (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) return handleUploadError(err, req, res, next);
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Missing configFile upload' });
      }
      const vsysParsed = parseVsys(req);
      if (vsysParsed.error) {
        return res.status(400).json({ error: 'Invalid vsys' });
      }
      const raw = bufferToPaloAltoString(req.file.buffer);
      const { r8x, summary } = await xmlStringToR8x(raw, vsysParsed.vsys);
      return res.status(200).json({ success: true, summary, r8x });
    } catch {
      return res.status(400).json({ error: 'Upload parse failed' });
    }
  }
);

router.post('/download', validateBody(downloadR8xSchema), (req, res) => {
  const r8x = req.body?.r8x;
  res.setHeader('Content-Disposition', 'attachment; filename="cp_r8x_import.json"');
  return res.status(200).json(r8x);
});

router.post('/panorama/devices', validateBody(panoramaSchema), async (req, res) => {
  try {
    const client = await createPanoramaClient(req.body);
    const devices = await client.getManagedDevices();
    return res.status(200).json({ success: true, devices });
  } catch (err) {
    if (err instanceof HostPolicyError) {
      return res.status(400).json({ error: 'Host rejected by policy' });
    }
    return res.status(502).json({ error: 'Panorama request failed' });
  }
});

router.post('/panorama/fetch-device', validateBody(panoramaSchema), async (req, res) => {
  try {
    const serial = req.body.targetSerial;
    if (!serial) {
      return res.status(400).json({ error: 'targetSerial is required for Panorama device fetch' });
    }
    const client = await createPanoramaClient(req.body);
    const xml = await client.getDeviceConfigRaw(serial);
    const vsysName = req.body.vsys || 'vsys1';
    const { r8x, summary } = await xmlStringToR8x(xml, vsysName);
    return res.status(200).json({ success: true, summary, r8x });
  } catch (err) {
    if (err instanceof HostPolicyError) {
      return res.status(400).json({ error: 'Host rejected by policy' });
    }
    return res.status(502).json({ error: 'Panorama device fetch failed' });
  }
});

module.exports = router;
