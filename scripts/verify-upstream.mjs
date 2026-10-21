import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'docs/github-desktop-upstream.json'), 'utf8'));
const sha = path => createHash('sha256').update(readFileSync(join(root, 'desktop', path))).digest('hex');
const errors = [];
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
for (const file of ['macos/package.json', 'desktop/app/package.json']) {
  if (JSON.parse(readFileSync(join(root, file), 'utf8')).version !== version) errors.push('Product version mismatch: ' + file);
}
if (!readFileSync(join(root, 'desktop/gittogether-presence/Cargo.toml'), 'utf8').includes('version = "' + version + '"')) errors.push('Presence version mismatch');
for (const [path, expected] of Object.entries(lock.sha256)) {
  try { if (sha(path) !== (lock.patches[path]?.sha256 || expected)) errors.push(`Modified upstream file: ${path}`); }
  catch { errors.push(`Missing upstream file: ${path}`); }
}
// No new Git backend or credential code can be inserted alongside upstream.
function check(path) {
  for (const entry of readdirSync(join(root, 'desktop', path), { withFileTypes: true })) {
    const next = `${path}/${entry.name}`;
    if (entry.isDirectory()) check(next);
    else if (!lock.sha256[next] && !next.startsWith('app/src/ui/gittogether/')) errors.push(`Unapproved upstream addition: ${next}`);
  }
}
check('app/src');
const presentationPatches = new Set([
  ".gitignore",
  "app/package.json",
  "app/src/crash/crash-app.tsx",
  "app/src/crash/index.tsx",
  "app/src/main-process/menu/build-default-menu.ts",
  "app/src/main-process/show-uncaught-exception.ts",
  "app/src/ui/about/about-test-dialog.tsx",
  "app/src/ui/about/about.tsx",
  "app/src/ui/app.tsx",
  "app/src/ui/banners/update-available.tsx",
  "app/src/ui/branches/no-branches.tsx",
  "app/src/ui/branches/no-pull-requests.tsx",
  "app/src/ui/changes/filter-changes-list.tsx",
  "app/src/ui/changes/multiple-selection.tsx",
  "app/src/ui/changes/no-changes.tsx",
  "app/src/ui/check-runs/ci-check-run-no-steps.tsx",
  "app/src/ui/check-runs/ci-check-run-popover.tsx",
  "app/src/ui/check-runs/ci-check-run-rerun-dialog.tsx",
  "app/src/ui/copilot/copilot-disclaimer.tsx",
  "app/src/ui/dialog/content.tsx",
  "app/src/ui/dialog/dialog.tsx",
  "app/src/ui/dialog/footer.tsx",
  "app/src/ui/dialog/header.tsx",
  "app/src/ui/dialog/ok-cancel-button-group.tsx",
  "app/src/ui/diff/index.tsx",
  "app/src/ui/diff/submodule-diff.tsx",
  "app/src/ui/dropdown-select-button.tsx",
  "app/src/ui/generic-git-auth/generic-git-auth.tsx",
  "app/src/ui/history/selected-commits.tsx",
  "app/src/ui/index.tsx",
  "app/src/ui/installing-update/installing-update.tsx",
  "app/src/ui/lfs/initialize-lfs.tsx",
  "app/src/ui/lib/authentication-form.tsx",
  "app/src/ui/lib/button.tsx",
  "app/src/ui/lib/text-box.tsx",
  "app/src/ui/move-to-applications-folder.tsx",
  "app/src/ui/multi-commit-operation/dialog/warn-force-push-dialog.tsx",
  "app/src/ui/no-repositories/no-repositories-view.tsx",
  "app/src/ui/notifications/pull-request-checks-failed.tsx",
  "app/src/ui/octicons/octicon.tsx",
  "app/src/ui/preferences/accessibility.tsx",
  "app/src/ui/preferences/advanced.tsx",
  "app/src/ui/preferences/appearance.tsx",
  "app/src/ui/preferences/copilot.tsx",
  "app/src/ui/preferences/git.tsx",
  "app/src/ui/preferences/notifications.tsx",
  "app/src/ui/preferences/preferences.tsx",
  "app/src/ui/push-needs-pull/push-needs-pull-warning.tsx",
  "app/src/ui/remove-repository/confirm-remove-repository.tsx",
  "app/src/ui/repositories-list/repositories-list.tsx",
  "app/src/ui/repository-settings/repository-settings.tsx",
  "app/src/ui/saml-reauth-required/saml-reauth-required.tsx",
  "app/src/ui/sign-in/sign-in.tsx",
  "app/src/ui/ssh/add-ssh-host.tsx",
  "app/src/ui/ssh/ssh-key-passphrase.tsx",
  "app/src/ui/ssh/ssh-user-password.tsx",
  "app/src/ui/terminal.tsx",
  "app/src/ui/test-notifications/test-notifications.tsx",
  "app/src/ui/thank-you/thank-you.tsx",
  "app/src/ui/tutorial/done.tsx",
  "app/src/ui/tutorial/tutorial-panel.tsx",
  "app/src/ui/tutorial/welcome.tsx",
  "app/src/ui/untrusted-certificate/untrusted-certificate.tsx",
  "app/src/ui/welcome/start.tsx",
  "app/src/ui/welcome/welcome.tsx",
  "app/src/ui/workflow-push-rejected/workflow-push-rejected.tsx",
  "app/static/index.html",
  "tsconfig.json"
]);
for (const path of Object.keys(lock.patches)) {
  if (!presentationPatches.has(path)) errors.push(`Non-presentation upstream patch: ${path}`);
}

if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Verified ${Object.keys(lock.sha256).length} upstream files at ${lock.ref} (${lock.commit}); ${Object.keys(lock.patches).length} presentation/identity patches.`);
