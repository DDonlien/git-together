import { fileURLToPath } from 'node:url';

export type RendererSource = { kind: 'file'; path: string } | { kind: 'url'; url: string };

/** A file URL has the opaque origin "null"; origin comparison alone is unsafe. */
export function isTrustedRendererURL(candidate: string, source: RendererSource): boolean {
  try {
    const url = new URL(candidate);
    if (source.kind === 'file') return url.protocol === 'file:' && fileURLToPath(url) === source.path;
    const expected = new URL(source.url);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === expected.origin;
  } catch { return false; }
}
