import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const ts = require('typescript');

// UI render helpers may change. Original event handlers and lifecycle bodies
// must still be byte-identical, independent of their access modifiers.
export function controllerState(base, path) {
  const source = readFileSync(join(base, path), 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = [];
  const visit = node => {
    if (ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        const name = member.name?.getText(tree) ?? (ts.isConstructorDeclaration(member) ? 'constructor' : '');
        if (name.startsWith('render') || name === 'allPopupContent' || (path.endsWith('/preferences/advanced.tsx') && name === 'reportDesktopUsageLabel')) continue;
        if (member.body) callbacks.push([node.name?.text, name, member.body.getText(tree)]);
        else if (member.initializer && (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))) callbacks.push([node.name?.text, name, member.initializer.getText(tree)]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return createHash('sha256').update(JSON.stringify(callbacks)).digest('hex');
}
