import type { NormalizedVpn } from '@cisco2cp/core';

export interface VpnNotesBundle {
  note: string;
  remoteAccess: NormalizedVpn['remoteAccess'];
  siteToSite: NormalizedVpn['siteToSite'];
}

/**
 * Emit VPN review notes (the `vpn.notes.json` artifact). VPN is not converted to
 * Check Point rules automatically — communities, gateways, and encryption domains
 * must be recreated by hand; this bundle is the checklist for that work.
 */
export function exportVpnNotes(vpn: NormalizedVpn | undefined): VpnNotesBundle {
  return {
    note: 'VPN is not auto-migrated. Recreate Check Point VPN communities, gateways, and encryption domains manually using the details below. Pre-shared keys are never exported.',
    remoteAccess: vpn?.remoteAccess ?? [],
    siteToSite: vpn?.siteToSite ?? [],
  };
}
