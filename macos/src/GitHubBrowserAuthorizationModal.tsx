import { useEffect, useRef, useState } from 'react';
import type { Catalog } from './import-model';
import type { GitHubWebSession } from './github-web-model';
import { cancelGitHubWebAuthorization, reopenGitHubWebWindow, waitForGitHubWebAuthorization } from './github-web-api';
import { Button, Icon, Modal, Notice } from './ui';

export function GitHubBrowserAuthorizationModal({ session, opened, onComplete, onClose, onRestart }: {
  session: GitHubWebSession; opened: boolean; onComplete: (catalog: Catalog) => void; onClose: () => void; onRestart: () => void;
}) {
  const [error, setError] = useState(''); const [pageOpened, setPageOpened] = useState(opened);
  const [closing, setClosing] = useState(false); const [unconfirmed, setUnconfirmed] = useState(false);
  const cancellation = useRef<AbortController | null>(null); const completed = useRef(false); const closingRef = useRef(false);
  const lifecycle = useRef(0); const latest = useRef({ onComplete, onClose, onRestart }); latest.current = { onComplete, onClose, onRestart };
  useEffect(() => {
    const generation = ++lifecycle.current; const abort = new AbortController(); cancellation.current = abort;
    void waitForGitHubWebAuthorization(session, abort.signal).then(catalog => {
      if (!abort.signal.aborted) { completed.current = true; latest.current.onComplete(catalog); }
    }).catch(problem => { if (!abort.signal.aborted) setError(problem instanceof Error ? problem.message : '授权未完成，请重试。'); });
    return () => {
      abort.abort();
      // A Strict Mode replay is not a user cancellation. Real unmounts stop the
      // pending callback, and a failed cancellation is not reported as success.
      queueMicrotask(() => { if (generation === lifecycle.current && !completed.current) void cancelGitHubWebAuthorization(session.id).catch(() => console.warn('GitHub 授权取消未确认；请在设置中检查账号连接状态。')); });
    };
  }, [session.id, session.expiresAt]);
  async function finish(restart = false) {
    if (closingRef.current) return;
    if (unconfirmed) { latest.current.onClose(); return; }
    closingRef.current = true; setClosing(true); cancellation.current?.abort();
    try {
      const result = await cancelGitHubWebAuthorization(session.id); completed.current = true;
      if (!result.cancelled) latest.current.onComplete(result.catalog);
      else if (restart) latest.current.onRestart();
      else latest.current.onClose();
    } catch { setError('已停止检测，但未能确认授权服务取消。请返回设置检查账号。'); setUnconfirmed(true); }
    finally { closingRef.current = false; setClosing(false); }
  }
  return <Modal title="通过 GitHub 授权" onClose={() => void finish()}>
    <div className="github-authorization"><p>在 GitHub 完成登录和授权，完成后将自动返回。</p>
      {!pageOpened && <Notice kind="info">授权网页未能自动打开，请点击下方按钮。</Notice>}
      {error ? <Notice kind="error">{error}</Notice> : <div className="authorization-wait" role="status"><Icon name="spinner" size={16} className="spin" /><span>等待 GitHub 授权…</span></div>}
    </div><div className="modal-actions"><Button disabled={closing} onClick={() => void finish()}>{closing ? '正在确认取消…' : unconfirmed ? '关闭' : '取消授权'}</Button>
      {error && !unconfirmed ? <Button variant="primary" disabled={closing} onClick={() => void finish(true)}>重新授权</Button> : !error && <Button variant="primary" disabled={closing} leadingIcon={<Icon name="external" size={16} />} onClick={() => setPageOpened(reopenGitHubWebWindow(session.authorizationURL))}>打开 GitHub</Button>}
    </div>
  </Modal>;
}
