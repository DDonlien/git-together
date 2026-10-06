import { useEffect, useRef, useState } from 'react';
import type { Catalog, GitHubAuthorization } from './import-model';
import type { WorkspaceController } from './use-workspace';
import { openGitHubAuthorization, waitForGitHubAuthorization } from './github-auth-flow';
import { Button, Icon, Modal, Notice } from './ui';

export function GitHubAuthorizationModal({ session, opened, controller, onComplete, onClose, onRestart }: {
  session: GitHubAuthorization; opened: boolean; controller: WorkspaceController;
  onComplete: (catalog: Catalog) => void; onClose: () => void; onRestart: () => void;
}) {
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [pageOpened, setPageOpened] = useState(opened);
  const [closing, setClosing] = useState(false);
  const [cancelUnconfirmed, setCancelUnconfirmed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const completed = useRef(false);
  const closingRef = useRef(false);
  const lifecycle = useRef(0);
  const latest = useRef({ controller, onComplete, onClose, onRestart });
  latest.current = { controller, onComplete, onClose, onRestart };
  useEffect(() => {
    const generation = ++lifecycle.current;
    const cancellation = new AbortController(); abort.current = cancellation;
    void waitForGitHubAuthorization(session, (id, signal) => latest.current.controller.pollGithubAuthorization(id, signal), cancellation.signal)
      .then(catalog => { if (!cancellation.signal.aborted) { completed.current = true; latest.current.onComplete(catalog); } })
      .catch(problem => { if (!cancellation.signal.aborted) setError(problem instanceof Error ? problem.message : '授权失败，请重试。'); });
    return () => {
      cancellation.abort();
      // React Strict Mode immediately replays this effect. Only a real unmount
      // should cancel the server session, not its development-only replay.
      queueMicrotask(() => { if (lifecycle.current === generation && !completed.current) void latest.current.controller.cancelGithubAuthorization(session.id).catch(() => {}); });
    };
  }, [session.id, session.expiresAt, session.interval]);
  async function finish(restart = false) {
    if (closingRef.current) return;
    if (cancelUnconfirmed) { latest.current.onClose(); return; }
    closingRef.current = true; setClosing(true); abort.current?.abort();
    try {
      const result = await latest.current.controller.cancelGithubAuthorization(session.id);
      completed.current = true;
      if (!result.cancelled) latest.current.onComplete(result.catalog);
      else if (restart) latest.current.onRestart();
      else latest.current.onClose();
    } catch {
      setError('已停止检测，但未能确认服务端取消。请重新连接检查账号。');
      setCancelUnconfirmed(true);
    } finally { closingRef.current = false; setClosing(false); }
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(session.userCode); setCopyMessage('已复制'); }
    catch { setCopyMessage('无法复制，请手动输入验证码。'); }
  }
  return <Modal title="通过 GitHub 授权" onClose={() => void finish()}>
    <div className="github-authorization">
      <p>在 GitHub 网页输入验证码，并确认连接 GitTogether。</p>
      <div className="authorization-code"><code aria-label="GitHub 授权验证码">{session.userCode}</code><Button variant="quiet" leadingIcon={<Icon name="copy" size={16} />} onClick={() => void copyCode()}>复制验证码</Button></div>
      {copyMessage && <span className="muted" role="status">{copyMessage}</span>}
      {!pageOpened && <Notice kind="info">授权网页未能自动打开，请点击下方按钮。</Notice>}
      {error ? <Notice kind="error">{error}</Notice> : <div className="authorization-wait" role="status"><Icon name="spinner" className="spin" size={16} /><span>等待 GitHub 授权，完成后将自动连接…</span></div>}
    </div>
    <div className="modal-actions"><Button disabled={closing} onClick={() => void finish()}>{closing ? '正在取消…' : cancelUnconfirmed ? '关闭' : '取消授权'}</Button>{error && !cancelUnconfirmed ? <Button variant="primary" disabled={closing} onClick={() => void finish(true)}>重新授权</Button> : !error && <Button variant="primary" disabled={closing} leadingIcon={<Icon name="external" size={16} />} onClick={() => { void openGitHubAuthorization().then(setPageOpened); }}>打开 GitHub</Button>}</div>
  </Modal>;
}
