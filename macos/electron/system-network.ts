import { net, session, type Session } from 'electron';

/** Shared by desktop accounts and the isolated OAuth helper. No renderer credentials. */
export function fetchWithSession(network: Pick<Session, 'fetch'>): typeof fetch {
  return (input, init) => network.fetch(input instanceof URL ? input.href : input, { ...init, credentials: 'omit' });
}

// Chromium reads the OS proxy/PAC configuration and responds to network changes.
// Do not guess a VPN port or silently fall back to a different credential route.
export const systemFetch = fetchWithSession(net);

export async function createLoopbackFetch(): Promise<typeof fetch> {
  const local = session.fromPartition('gittogether-oauth-loopback', { cache: false });
  // Only the fixed, protected preview bridge uses this session. Remote traffic
  // stays on the system route even if the user's proxy includes loopback hosts.
  await local.setProxy({ mode: 'direct' });
  return fetchWithSession(local);
}
