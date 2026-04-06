'use strict';

const axios = require('axios');
const https = require('https');
const { XMLParser } = require('fast-xml-parser');

const apiParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  isArray: (name) => name === 'entry' || name === 'member',
});

class PanFirewallClient {
  /**
   * @param {string} host
   * @param {string} apiKey
   */
  constructor(host, apiKey) {
    this.host = host;
    this.apiKey = apiKey;
    this.http = axios.create({
      baseURL: `https://${host}/api`,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30000,
      responseType: 'text',
      validateStatus: () => true,
    });
  }

  /**
   * @param {string} host
   * @param {string} username
   * @param {string} password
   */
  static async fromCredentials(host, username, password) {
    const http = axios.create({
      baseURL: `https://${host}/api`,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30000,
      responseType: 'text',
      validateStatus: () => true,
    });
    const u = encodeURIComponent(username);
    const p = encodeURIComponent(password);
    const { data, status } = await http.get(`/?type=keygen&user=${u}&password=${p}`);
    if (status >= 400) throw new Error(`PAN-OS keygen HTTP ${status}`);
    const parsed = apiParser.parse(data);
    const statusAttr = parsed?.response?.['@_status'];
    if (statusAttr === 'error') {
      const msg = parsed?.response?.result?.msg?.['#text'] || JSON.stringify(parsed?.response?.result);
      throw new Error(`PAN-OS keygen failed: ${msg}`);
    }
    const key =
      parsed?.response?.result?.key?.['#text'] ||
      (typeof parsed?.response?.result?.key === 'string' ? parsed.response.result.key : null);
    if (!key) throw new Error('PAN-OS keygen: no key in response');
    return new PanFirewallClient(host, key);
  }

  /**
   * @param {Record<string, string>} params
   */
  async _request(params) {
    const { data, status } = await this.http.get('/', {
      params: { ...params, key: this.apiKey },
    });
    if (status >= 400) throw new Error(`PAN-OS API HTTP ${status}`);
    const parsed = apiParser.parse(data);
    const st = parsed?.response?.['@_status'];
    if (st === 'error') {
      const msg = parsed?.response?.result?.msg?.['#text'] || JSON.stringify(parsed?.response?.result);
      throw new Error(`PAN-OS API error: ${msg}`);
    }
    return parsed?.response?.result;
  }

  /**
   * Raw XML body from PAN-OS API (for {@link parsePaloAltoXml} in @cisco2cp/parsers).
   * @param {Record<string, string>} params
   */
  async _getRawText(params) {
    const { data, status } = await this.http.get('/', {
      params: { ...params, key: this.apiKey },
    });
    if (status >= 400) throw new Error(`PAN-OS API HTTP ${status}`);
    if (typeof data !== 'string') throw new Error('PAN-OS API: expected text response');
    const parsed = apiParser.parse(data);
    const st = parsed?.response?.['@_status'];
    if (st === 'error') {
      const msg = parsed?.response?.result?.msg?.['#text'] || JSON.stringify(parsed?.response?.result);
      throw new Error(`PAN-OS API error: ${msg}`);
    }
    return data;
  }

  async getDeviceInfo() {
    const cmd = encodeURIComponent('<show><system><info></info></system></show>');
    return this._request({ type: 'op', cmd });
  }

  async getRunningConfig() {
    const result = await this._request({ type: 'config', action: 'show' });
    return result?.config ?? result;
  }

  /** Full running config as XML string (same as API returns). */
  async getRunningConfigRaw() {
    return this._getRawText({ type: 'config', action: 'show' });
  }

  /** Panorama: committed device config XML for a managed firewall serial. */
  async getDeviceConfigRaw(serial) {
    return this._getRawText({ type: 'config', action: 'show', target: serial });
  }

  /**
   * @param {string} xpath
   */
  async queryXpath(xpath) {
    return this._request({ type: 'config', action: 'show', xpath });
  }

  async getAddressObjects(vsys = 'vsys1') {
    const xpath = `/config/devices/entry/vsys/entry[@name='${vsys}']/address`;
    return this.queryXpath(xpath);
  }

  async getServiceObjects(vsys = 'vsys1') {
    const xpath = `/config/devices/entry/vsys/entry[@name='${vsys}']/service`;
    return this.queryXpath(xpath);
  }

  async getSecurityPolicies(vsys = 'vsys1') {
    const xpath = `/config/devices/entry/vsys/entry[@name='${vsys}']/rulebase/security/rules`;
    return this.queryXpath(xpath);
  }

  async getNatPolicies(vsys = 'vsys1') {
    const xpath = `/config/devices/entry/vsys/entry[@name='${vsys}']/rulebase/nat/rules`;
    return this.queryXpath(xpath);
  }

  async getVirtualRouters() {
    const xpath = `/config/devices/entry/network/virtual-router`;
    return this.queryXpath(xpath);
  }

  async getSharedObjects() {
    const xpath = `/config/shared`;
    return this.queryXpath(xpath);
  }

  /**
   * Panorama: committed config for a managed firewall (by serial).
   * @param {string} targetSerial
   */
  async getDeviceConfigByTarget(targetSerial) {
    return this._request({ type: 'config', action: 'show', target: targetSerial });
  }
}

module.exports = { PanFirewallClient };
