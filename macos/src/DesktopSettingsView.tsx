import { useState } from 'react';
import type { WorkspaceController } from './use-workspace';
import { Button, Select, Notice } from './ui';
import { PresenceSettings } from './PresenceSettings';
import { UpdateSettings } from './UpdateSettings';
import { DiagnosticsSettings } from './DiagnosticsSettings';
import { importAPI } from './import-api';
import { DesktopAccounts } from './DesktopAccounts';

export function DesktopSettingsView({ controller, onDashboard }: { controller: WorkspaceController; onDashboard: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(''); try { await action(); await controller.reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  return <main className="settings-view"><div className="settings-scroll">
    <div className="settings-heading"><h1>设置</h1><Button variant="quiet" onClick={onDashboard}>Dashboard</Button></div>
    <DesktopAccounts controller={controller} />
    {error && <Notice kind="error">{error}</Notice>}
    <section className="settings-section"><h2>本地仓库</h2><div className="settings-group"><div className="setting-row"><span>添加已有 Git 仓库<small>支持已有的 GitHub、Gitea、GitLab 等远端连接</small></span><Button disabled={busy} onClick={() => void run(async () => { const path = await window.gittogether!.chooseDirectory(); if (path) await importAPI('link', { repositoryId: '', path }); })}>选择目录</Button></div></div></section>
    <section className="settings-section"><h2>外观</h2><div className="settings-group"><div className="setting-row"><span>颜色方案<small>跟随系统，或选择亮色与暗色</small></span><Select label={<span className="sr-only">颜色方案</span>} options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '亮色' }, { value: 'dark', label: '暗色' }]} value={controller.preferences.theme} onChange={e => controller.updatePreferences({ theme: e.target.value as 'light' | 'dark' | 'system' })} /></div></div></section>
    <PresenceSettings disabled={busy} />
    <section className="settings-section"><h2>Git 与工具</h2><div className="settings-group"><div className="setting-row"><span>Git、编辑器和安全确认<small>管理提交身份、默认分支、通知和操作偏好</small></span><Button onClick={() => void window.gittogether?.presentation?.('Preferences')}>打开设置</Button></div></div></section>
    <UpdateSettings busy={busy} updates={controller.updates} />
    <DiagnosticsSettings />
    <section className="settings-section"><Button variant="quiet" onClick={() => void window.gittogether?.presentation?.('About')}>关于 GitTogether</Button></section>
    </div></main>;
}
