# Limitations

## Unsupported Features (MVP)

- **VPN**: Site-to-site VPN, remote access VPN, IPsec/IKE configs
- **Advanced Inspection**: IPS, URL filtering, malware inspection
- **Routing**: OSPF, BGP, EIGRP, static route migration
- **High Availability**: Failover, clustering
- **Complex object-group nesting**: Deep nesting may not fully resolve
- **ASA-specific syntax**: Some legacy or obscure commands
- **FTD**: Limited FTD JSON schema support; text parsing uses ASA logic
- **FortiGate / FortiOS**: IPv4 firewall policies, addresses, groups, custom services, and common object types are in scope; advanced UTM, SSL inspection profiles, SD-WAN, and VPN-heavy configs may be partial or unsupported—review warnings and validation after parse
- **FortiManager**: Imports are **per policy package** JSON bundle (paste/upload or live JSON-RPC pull). Object DB + IPv4 firewall policy for that package are in scope; features outside the exported CMDB slice (dynamic objects, full device provisioning, non-IPv4 policy types) may be partial—review warnings after parse
- **Palo Alto (PAN-OS)**: Imports **XML** (GUI/API/Panorama wrappers), **ZIP** bundles containing XML (base64 or raw ZIP bytes as a string—browser upload of binary ZIP is still read as text, so base64 ZIP paste is most reliable), or **set-format** CLI dumps (best-effort; prefer XML for completeness). No live device API in the app. **App-ID** / profiles may produce **warnings**; **NAT** and **multi-vsys** depend on export content

## Data Safety

- Secrets (passwords, keys, community strings) are redacted in previews
- Raw config content is never logged
- Export contains mapped objects only; no raw source in output

## Export

- JSON bundle: Complete structured export
- CLI template: Best-effort; review and adapt before applying
- API payload: Planned for next iteration
