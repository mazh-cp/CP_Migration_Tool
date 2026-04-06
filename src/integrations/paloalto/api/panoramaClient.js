'use strict';

const { PanFirewallClient } = require('./panFirewallClient');

const ensureArray = (v) => (Array.isArray(v) ? v : v != null ? [v] : []);

class PanoramaClient extends PanFirewallClient {
  static async fromCredentials(host, username, password) {
    const tmp = await PanFirewallClient.fromCredentials(host, username, password);
    return new PanoramaClient(host, tmp.apiKey);
  }

  async getManagedDevices() {
    const r = await this.queryXpath('/config/mgt-config/devices').catch(() => null);
    const entries = ensureArray(r?.entry);
    return entries.map((e) => ({
      serial: e?.['@_name'] || e?.serial || '',
      hostname: e?.hostname || e?.['hostname'] || '',
      ipAddress: e?.ip_address || e?.['ip-address'] || '',
      connected: String(e?.connected || '').toLowerCase() === 'yes',
    }));
  }

  async getDeviceConfig(serialNumber) {
    const raw = await this.getDeviceConfigByTarget(serialNumber);
    return raw?.config ?? raw;
  }
}

module.exports = { PanoramaClient };
