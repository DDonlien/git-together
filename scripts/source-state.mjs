import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export function sourceState(root) {
  const hash = createHash('sha256');
  function add(path) { hash.update(path); hash.update(readFileSync(join(root, path))); }
  function directory(path) {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${path}/${entry.name}`;
      if (entry.isDirectory()) directory(file); else add(file);
    }
  }
  for (const path of ['macos/src', 'desktop/app/src/ui/gittogether', 'desktop/gittogether-presence/src']) directory(path);
  for (const path of ['scripts/runtime-bootstrap.cjs', 'scripts/desktop.mjs', 'package.json', 'macos/package.json', 'macos/package-lock.json', 'macos/vite.config.mjs', 'desktop/app/package.json', 'desktop/tsconfig.json', 'desktop/gittogether-presence/Cargo.toml', 'desktop/gittogether-presence/Cargo.lock', 'docs/github-desktop-upstream.json']) add(path);
  return hash.digest('hex');
}
