# Mapping Matrix

| ASA Feature | Normalized | Check Point Equivalent | Notes / Limitations |
|-------------|------------|------------------------|---------------------|
| object network host | host | host object | 1:1 |
| object network subnet | network | network object | 1:1 |
| object network range | range | address-range | 1:1 |
| object network fqdn | fqdn | host (fallback) | CP has native FQDN; manual review recommended |
| object-group network | group | group | 1:1 |
| object service tcp/udp | service | service-tcp / service-udp | 1:1 |
| object-group service | service-group | group | Mixed protocols → warning |
| access-list extended | NormalizedPolicyRule | Access Control rule | allow→accept, deny→drop |
| nat static | static | static nat | 1:1 |
| nat dynamic/pat | dynamic/pat | hide nat | Best-effort |
| interface / nameif | NormalizedInterface/Zone | zone | Zone mapping support |

## Unsupported (MVP)
- VPN configs
- Advanced inspection / IPS
- Routing protocols
- Object groups with complex nesting
