import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

// Finder starts apps with only system directories. Git's LFS filters and hooks
// need the same tool path as Git itself, without executing a user's shell setup.
export function gitToolEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (process.platform !== 'darwin') return env;
  const paths = (env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin').split(delimiter).filter(Boolean);
  return { ...env, PATH: [...new Set([...paths, join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'])].join(delimiter) };
}
