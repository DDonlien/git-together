export function remoteIdentity(raw: string): string | null {
  // Compare repository identity without returning credentials or transport details.
  const scp = /^(?:[^@/:]+@)?([^/:]+):(.+)$/.exec(raw);
  try {
    const url = new URL(raw.includes('://') ? raw : scp ? `ssh://${scp[1]}/${scp[2]}` : 'invalid:');
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    return `${url.hostname.toLowerCase()}/${decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').toLowerCase()}`;
  } catch { return null; }
}
