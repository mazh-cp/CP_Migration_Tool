# Limitations

Every parse produces a **coverage report** (in the migration report, shown on the Export page): converted counts, review-note categories, and unsupported source constructs grouped by command. Nothing is silently dropped — anything not converted is either surfaced as a **review note** or listed under **not migrated**.

## Converted to Check Point

- **Objects / services / groups**: hosts, networks, ranges, FQDNs, TCP/UDP/ICMP services, and network/service groups. **Object-group nesting** resolves order-independently (forward references and multi-level nesting); unknown or self-referencing members produce warnings.
- **Access policy**: extended ACLs / FortiGate & PAN security rules → Check Point rules.
- **NAT**: best-effort (ASA twice-NAT, FortiGate VIP/ippool, PAN where present in the export).
- **Static routing**: ASA `route` / `ipv6 route` → Gaia `set static-route` / `set ipv6 static-route`.
- **IPv6**: ASA IPv6 objects and `any4`/`any6` ACLs; FortiGate `address6` / `addrgrp6` / `policy6`; Palo Alto IPv6 addresses.

## Captured as review notes (manual recreation required)

- **VPN**: ASA remote-access + site-to-site (tunnel-groups, group-policies, crypto maps, pools), FortiGate `vpn ipsec phase1-interface`, and Palo Alto IKE gateways are exported as `vpn.notes.json`. **Pre-shared keys are never captured** — only a presence flag. Recreate Check Point VPN communities/gateways manually.
- **Dynamic routing**: OSPF / BGP / EIGRP / RIP are captured as notes (and Gaia comments); configure Gaia routing manually. Routing authentication secrets are masked.
- **High availability**: ASA `failover` is captured as notes; plan Check Point ClusterXL / Gaia clustering. Failover keys are masked.
- **Advanced inspection**: `policy-map` inspects and `threat-detection` are captured as notes; map to Check Point Threat Prevention / Application Control blades manually.

## Still out of scope

- **IPS / URL filtering / malware inspection profiles** beyond the inspection notes above (no auto-conversion to Threat Prevention policy).
- **IPv6 interface addressing and IPv6 NAT** (IPv6 objects/routes/policies are supported; interface IPv6 and v6 NAT remain manual).
- **ASA-specific / legacy syntax**: uncommon commands appear under **not migrated** in the coverage report rather than being converted.
- **FTD**: FTD JSON schema support is limited; text parsing uses ASA logic.
- **FortiGate / FortiOS**: advanced UTM, SSL inspection profiles, and SD-WAN are partial or note-only — review warnings after parse.
- **FortiManager**: per **policy package** JSON bundle (paste/upload or live JSON-RPC pull); dynamic objects, full device provisioning, and multi-ADOM breadth are partial.
- **Palo Alto (PAN-OS)**: imports **XML** (GUI/API/Panorama wrappers), base64 **ZIP**-of-XML, or best-effort **set-format** dumps (prefer XML). No live device API. **App-ID** / profiles surface as warnings; **NAT** and **multi-vsys** depend on export content.

## Data Safety

- Uploaded configs may contain credentials. Secrets (enable/user/`passwd` passwords, SNMP communities, PSKs, OSPF/BGP auth keys, failover keys, AAA `key`, PEM blocks) are **masked at parse time** and via `redactSecrets()` before anything is persisted, shown in the coverage report, returned by the API, or written to an export bundle.
- Raw config content is never logged and is never returned to lower-privileged users (project GET strips artifact `content`).
- Export contains mapped objects and review notes only; no raw source config in output.

## Export

- JSON bundle: Complete structured export
- CLI template: Best-effort; review and adapt before applying
- API payload: Planned for next iteration
