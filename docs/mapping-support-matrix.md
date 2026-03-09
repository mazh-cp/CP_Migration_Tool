# Mapping Support Matrix

ASA/FTD source features and their Check Point conversion status.

| Source Feature | ASA/FTD Syntax Area | Normalized Support | Check Point Mapping | Confidence | Notes |
|----------------|---------------------|--------------------|---------------------|------------|-------|
| object network host | ASA/FTD | Yes | host object | High | 1:1 |
| object network subnet | ASA/FTD | Yes | network object | High | 1:1 |
| object network range | ASA/FTD | Yes | address-range | High | 1:1 |
| object network fqdn | ASA/FTD | Yes | host (fallback) | Medium | Manual review recommended |
| object-group network | ASA/FTD | Yes | group | High | 1:1 |
| object service tcp/udp | ASA/FTD | Yes | service-tcp / service-udp | High | 1:1 |
| object-group service | ASA/FTD | Yes | group | Medium | Mixed protocols → warning |
| access-list extended | ASA/FTD | Yes | Access Control rule | High | allow→accept, deny→drop |
| nat static | ASA | Yes | static nat | High | 1:1 |
| nat dynamic/pat | ASA | Yes | hide nat | Medium | Best-effort |
| interface / nameif | ASA | Yes | NormalizedInterface | High | Zone mapping via Map Interfaces |
| route | ASA | Partial | Gaia routes | Medium | Via Gaia export |

## Unsupported (MVP)

- VPN configs (site-to-site, remote access)
- Advanced inspection / IPS / URL filtering
- Routing protocols (OSPF, BGP, EIGRP)
- High availability (failover, clustering)
- Complex object-group nesting
- FTD JSON schema (limited); text parsing uses ASA logic

## Export Formats

| Format | Target | Use Case |
|--------|--------|----------|
| JSON bundle | SMS | Mgmt API, automation |
| CLI template | SMS | Scripted import |
| SmartConsole CSV | SMS | GUI import |
| Gaia clish | Gateway | Interface/route config |
