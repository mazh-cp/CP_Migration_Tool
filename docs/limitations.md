# Limitations

## Unsupported Features (MVP)

- **VPN**: Site-to-site VPN, remote access VPN, IPsec/IKE configs
- **Advanced Inspection**: IPS, URL filtering, malware inspection
- **Routing**: OSPF, BGP, EIGRP, static route migration
- **High Availability**: Failover, clustering
- **Complex object-group nesting**: Deep nesting may not fully resolve
- **ASA-specific syntax**: Some legacy or obscure commands
- **FTD**: Limited FTD JSON schema support; text parsing uses ASA logic

## Data Safety

- Secrets (passwords, keys, community strings) are redacted in previews
- Raw config content is never logged
- Export contains mapped objects only; no raw source in output

## Export

- JSON bundle: Complete structured export
- CLI template: Best-effort; review and adapt before applying
- API payload: Planned for next iteration
