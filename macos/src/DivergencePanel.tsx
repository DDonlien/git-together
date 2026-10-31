import { useEffect, useRef, useState } from 'react';
import { importAPI } from './import-api';
import type { RepositoryActionTarget } from './repository-action-model';
import type { Divergence, DivergenceMode } from './divergence-model';
import type { GraphMergePlan, GraphWriteResult } from './graph-operation-model';
import type { Branches, CommitPage, IntegrationPlan, IntegrationResult, RemoteCommit } from './integration-model';
import { isCommitDraft } from './local-submit-model';
import { RepositoryPreparedDiff } from './RepositoryPreparedDiff';
import { OutlinedTextField } from './material-inputs';
import { Button, Icon, Notice } from './ui';

const message = (problem: unknown) => problem instanceof Error ? problem.message : '操作未完成。';
type Plan = { kind: 'local'; value: GraphMergePlan } | { kind: 'integration'; value: IntegrationPlan };
type Result = { kind: 'local'; value: GraphWriteResult } | { kind: 'integration'; value: IntegrationResult };
const discard = (plan: Plan) => plan.kind === 'local'
  ? importAPI('discardGraphMerge', { repositoryId: plan.value.repositoryId, taskId: plan.value.taskId, planId: plan.value.id })
  : importAPI('discardIntegration', { repositoryId: plan.value.repositoryId, taskId: plan.value.taskId, planId: plan.value.id });

/** Kept inside the interrupted operation so closing a preview retains its context. */
export function DivergencePanel({ target, mode, onBusy, onAttempted, blocked = false }: {
  target: RepositoryActionTarget; mode: DivergenceMode; onBusy: (key: string, busy: boolean) => void; onAttempted: () => void; blocked?: boolean;
}) {
  const [state, setState] = useState<Divergence | null>(null), [error, setError] = useState('');
  const [reading, setReading] = useState(true), [preparing, setPreparing] = useState(false), [writing, setWriting] = useState(false), [loading, setLoading] = useState(false);
  const [choice, setChoice] = useState<'merge' | 'rebase' | null>(null), [destination, setDestination] = useState<'local' | 'remote'>('local');
  const [branches, setBranches] = useState<Branches | null>(null), [branchName, setBranchName] = useState(''), [page, setPage] = useState<CommitPage | null>(null);
  const [commits, setCommits] = useState<RemoteCommit[]>([]), [targetCommit, setTargetCommit] = useState(''), [manualCommit, setManualCommit] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null), [result, setResult] = useState<Result | null>(null);
  const [uncertain, setUncertain] = useState(false), [summary, setSummary] = useState(''), [description, setDescription] = useState(''), [acknowledged, setAcknowledged] = useState(false);
  const [revision, setRevision] = useState(0), [showRestore, setShowRestore] = useState(false), [confirmRestore, setConfirmRestore] = useState(false);
  const preparation = useRef<{ controller: AbortController; generationId: string } | null>(null), saved = useRef<Plan | null>(null);
  const operationId = useRef(crypto.randomUUID()), applying = useRef(false);
  const panelKey = JSON.stringify([target.repositoryId, target.task.id]);
  const branch = branches?.branches.find(item => item.name === branchName);
  const selectedCommit = manualCommit.trim() || targetCommit;
  useEffect(() => {
    const controller = new AbortController(); setReading(true); setError(''); setState(null);
    void importAPI('inspectDivergence', { repositoryId: target.repositoryId, taskId: target.task.id, mode }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setState(value); })
      .catch(problem => { if (!controller.signal.aborted) setError(message(problem)); })
      .finally(() => { if (!controller.signal.aborted) setReading(false); });
    return () => controller.abort();
  }, [target.repositoryId, target.task.id, mode, revision]);
  useEffect(() => {
    onBusy(panelKey, preparing || writing);
    return () => onBusy(panelKey, false);
  }, [preparing, writing, onBusy, panelKey]);
  useEffect(() => () => {
    preparation.current?.controller.abort();
    if (saved.current) { void discard(saved.current).catch(() => undefined); saved.current = null; }
  }, []);
  useEffect(() => {
    if (!choice || !state?.diverged) return;
    const controller = new AbortController(); setBranches(null); setPage(null); setLoading(true); setError('');
    void importAPI('integrationBranches', { repositoryId: state.repositoryId, taskId: state.taskId }, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setBranches(value); setBranchName(value.branches.some(item => item.name === state.branch) ? state.branch : value.branches[0]?.name || ''); } })
      .catch(problem => { if (!controller.signal.aborted) setError(message(problem)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [choice, state]);
  useEffect(() => {
    if (!state?.diverged || !branch) return;
    const controller = new AbortController(); setPage(null); setCommits([]); setTargetCommit(branch.head); setManualCommit(''); setLoading(true); setError('');
    void importAPI('integrationCommits', { repositoryId: state.repositoryId, taskId: state.taskId, remoteBranch: branch.name, remoteHead: branch.head, page: 0 }, controller.signal)
      .then(value => { if (!controller.signal.aborted) { if (value.localHead !== state.head) throw new Error('本地提交已变化，请重新核验。'); setPage(value); setCommits(value.commits); } })
      .catch(problem => { if (!controller.signal.aborted) setError(message(problem)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [state, branch?.name, branch?.head]);
  async function more() {
    if (!state?.diverged || !branch || !page?.hasMore || loading) return;
    setLoading(true);
    try { const next = await importAPI('integrationCommits', { repositoryId: state.repositoryId, taskId: state.taskId, remoteBranch: branch.name, remoteHead: branch.head, page: page.page + 1 });
      if (next.localHead !== state.head) throw new Error('本地提交已变化，请重新核验。'); setPage(next); setCommits(previous => [...previous, ...next.commits]);
    } catch (problem) { setPage(null); setError(message(problem)); } finally { setLoading(false); }
  }
  async function prepare() {
    if (!state?.diverged || !branch || !page || !choice || state.dirty || preparing || preparation.current || writing || blocked) return;
    const controller = new AbortController(), generationId = crypto.randomUUID();
    preparation.current = { controller, generationId }; setPreparing(true); setError(''); setAcknowledged(false);
    const cancel = () => { void importAPI('cancelGraphPreparation', { repositoryId: target.repositoryId, taskId: target.task.id, generationId }).catch(() => undefined); };
    controller.signal.addEventListener('abort', cancel, { once: true });
    try {
      let next: Plan;
      if (choice === 'merge' && destination === 'local') {
        const value = await importAPI('prepareGraphMerge', { repositoryId: state.repositoryId, taskId: state.taskId, expectedHead: state.head, changeKey: state.changeKey, sources: [{ kind: 'remote', name: branch.name, taskId: '' }], generationId, requireClean: true, expectedRemoteHead: branch.head }, controller.signal);
        next = { kind: 'local', value };
        if (value.sources.length !== 1 || value.sources[0].head !== branch.head || value.localChanges.length) { await discard(next); throw new Error('合并预览与核验状态不一致，请重新检查。'); }
      } else {
        const value = await importAPI('prepareIntegration', { repositoryId: state.repositoryId, taskId: state.taskId, expectedHead: state.head, changeKey: state.changeKey, mode: choice === 'rebase' ? 'rebase' : 'remote-merge', remoteBranch: branch.name, remoteHead: branch.head, targetCommit: choice === 'rebase' ? selectedCommit : branch.head, generationId }, controller.signal);
        next = { kind: 'integration', value };
      }
      if (controller.signal.aborted) { await discard(next); return; }
      saved.current = next; setPlan(next); setSummary(next.value.summary); setDescription(next.value.description);
    } catch (problem) { if (!controller.signal.aborted) setError(message(problem)); }
    finally { controller.signal.removeEventListener('abort', cancel); if (preparation.current?.generationId === generationId) { preparation.current = null; setPreparing(false); } }
  }
  function cancelPlan() { if (saved.current) { void discard(saved.current).catch(() => undefined); saved.current = null; } setPlan(null); setAcknowledged(false); }
  async function apply() {
    if (!plan || !state?.diverged || writing || applying.current || blocked) return;
    if ((plan.kind === 'local' || plan.value.mode === 'remote-merge') && !isCommitDraft({ summary, description })) return;
    if (plan.kind === 'integration' && plan.value.mode === 'rebase' && !acknowledged) return;
    applying.current = true; setWriting(true); setError('');
    try {
      if (plan.kind === 'local') { const value = await importAPI('applyGraphMerge', { repositoryId: state.repositoryId, taskId: state.taskId, planId: plan.value.id, operationId: operationId.current, summary, description }); setResult({ kind: 'local', value }); }
      else { const value = await importAPI('applyIntegration', { repositoryId: state.repositoryId, taskId: state.taskId, planId: plan.value.id, operationId: operationId.current, summary, description, acknowledgeRewrite: acknowledged }); setResult({ kind: 'integration', value }); }
      saved.current = null; onAttempted();
    } catch (problem) {
      setUncertain(true); onAttempted(); setError(`${message(problem)} 请检查实际 Git 状态后重新打开操作，不要重复执行。`);
    } finally { applying.current = false; setWriting(false); }
  }
  async function restore() {
    if (!plan || plan.kind !== 'integration' || !state?.diverged || !confirmRestore || writing || applying.current || blocked) return;
    applying.current = true; setWriting(true); setError('');
    try {
      const value = await importAPI('restoreIntegration', { repositoryId: state.repositoryId, taskId: state.taskId, planId: plan.value.id, operationId: crypto.randomUUID(), acknowledgeRestore: true });
      setResult({ kind: 'integration', value }); setShowRestore(false); onAttempted();
    } catch (problem) { setUncertain(true); onAttempted(); setError(`${message(problem)} 请检查实际 Git 状态及恢复引用，不要重复执行。`); }
    finally { applying.current = false; setWriting(false); }
  }
  return <div className="divergence-panel">
    {reading && <p role="status"><Icon name="spinner" className="spin" size={14} /> 正在核验远端提交及共同祖先…</p>}
    {error && <Notice kind="error">{error}</Notice>}
    {state && !state.diverged && <p className="muted">当前未证实本地与目标远端分叉；请检查原始错误。</p>}
    {state?.diverged && <>
      <p><strong>已确认分叉</strong> · 本地领先 {state.ahead}，远端领先 {state.behind}</p>
      <dl className="divergence-identities"><dt>本地分支</dt><dd>{state.branch} · {state.path}<br /><code>{state.head}</code></dd><dt>当前远端</dt><dd>{state.remote} / {state.branch}<br /><code>{state.remoteHead}</code></dd>{state.pushRemote && <><dt>原推送目标</dt><dd>{state.pushRemote} / {state.branch}</dd></>}<dt>共同祖先</dt><dd>{state.bases.map(base => <code key={base}>{base}<br /></code>)}</dd></dl>
      <details><summary>本地独有提交（{state.ahead}）</summary><ul>{state.localCommits.map(commit => <li key={commit}><code>{commit}</code></li>)}</ul>{state.commitsTruncated && <p>仅显示 100 个；完整列表尚未读取。</p>}</details>
      {state.dirty && <Notice kind="warning">工作目录有未提交或暂存更改；请先处理并保留这些更改，再准备整合。</Notice>}
      {!choice && !plan && !result && !uncertain && <div className="divergence-actions"><Button type="button" disabled={state.dirty || blocked} onClick={() => setChoice('merge')}><Icon name="sparkle" size={14} /> AI MERGE</Button><Button type="button" disabled={state.dirty || blocked} onClick={() => setChoice('rebase')}><Icon name="sparkle" size={14} /> AI REBASE</Button></div>}
      {choice && !plan && !result && !uncertain && <div className="divergence-review">
        <strong>{choice === 'merge' ? 'AI MERGE' : 'AI REBASE'}</strong>
        {choice === 'merge' && <label>合并目标 <select value={destination} disabled={preparing} onChange={event => setDestination(event.target.value as 'local' | 'remote')}><option value="local">当前本地分支</option><option value="remote">指定远端分支（确认后推送）</option></select></label>}
        {branches && <label>{choice === 'merge' && destination === 'remote' ? '目标远端分支' : '来源远端分支'} <select value={branchName} disabled={preparing || loading} onChange={event => setBranchName(event.target.value)}>{branches.branches.map(item => <option value={item.name} key={item.name}>{branches.remote} / {item.name} · {item.head.slice(0, 12)}</option>)}</select></label>}
        {branches?.limited && <p className="muted">分支列表仅显示前 500 项。</p>}
        {branches && destination === 'remote' && choice === 'merge' && !branches.pushRemote && <Notice kind="warning">无法确认推送目标：{branches.pushError}</Notice>}
        {branch && page && <><p>所选远端 SHA：<code>{branch.head}</code> · 本地领先 {page.ahead}，远端领先 {page.behind}</p><p>共同祖先：{page.bases.length ? page.bases.map(base => <code key={base}>{base} </code>) : '未找到'}</p></>}
        {choice === 'rebase' && page && <><label>变基到远端的具体提交 <select value={targetCommit} disabled={preparing || loading} onChange={event => setTargetCommit(event.target.value)}>{commits.map(commit => <option value={commit.id} key={commit.id}>{commit.id.slice(0, 12)} · {commit.summary}</option>)}</select></label>{page.hasMore && <Button type="button" disabled={loading || preparing} onClick={() => void more()}>加载更早提交</Button>}<OutlinedTextField label="或输入远端完整提交 SHA（优先于上方选择）" value={manualCommit} disabled={preparing} onChange={event => setManualCommit(event.target.value)} /><p className="muted">仅能选择不早于共同祖先的提交。变基将重写本地独有提交的 SHA，已发布的提交可能影响协作者；不会自动强推。</p></>}
        <p className="muted">预览在隔离目录中运行；工作目录必须干净。线性变基最多 500 个提交；浅克隆、子模块、需要签名或启用相关钩子的仓库暂不支持此流程。</p>
        {loading && <p role="status">正在读取远端分支和提交…</p>}
        <div className="divergence-actions"><Button type="button" disabled={preparing} onClick={() => { setChoice(null); setError(''); }}>取消</Button>{preparing ? <Button type="button" onClick={() => preparation.current?.controller.abort()}>取消准备</Button> : <Button type="button" variant="primary" disabled={state.dirty || loading || !page || !branch || !page.bases.length || blocked || choice === 'rebase' && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(selectedCommit) || choice === 'merge' && destination === 'remote' && !branches?.pushRemote} onClick={() => void prepare()}>准备 AI 预览</Button>}</div>
      </div>}
      {preparing && <p role="status"><Icon name="spinner" className="spin" size={14} /> 正在隔离目录准备 AI 整合…</p>}
      {plan && !result && !uncertain && <div className="divergence-review">
        {plan.kind === 'local' ? <p>来源 {state.remote}/{branchName} → 本地 {state.branch} · {state.path}</p> : <dl className="divergence-identities"><dt>来源</dt><dd>{plan.value.mode === 'rebase' ? `本地 ${plan.value.branch}` : `本地 ${plan.value.branch} · ${plan.value.path}`}<br /><code>{plan.value.head}</code></dd><dt>目标</dt><dd>{plan.value.mode === 'rebase' ? `${plan.value.remote}/${plan.value.remoteBranch} 的选定提交` : `${plan.value.pushRemote}/${plan.value.remoteBranch} · 合并后推送`}<br /><code>{plan.value.targetCommit}</code></dd><dt>远端当前 SHA</dt><dd><code>{plan.value.remoteHead}</code></dd><dt>共同祖先</dt><dd><code>{plan.value.base}</code></dd></dl>}
        {plan.value.resolvedConflicts.length > 0 && <p>AI 已处理 {plan.value.resolvedConflicts.length} 个文本冲突文件；请审阅最终差异。</p>}
        {plan.value.unchanged ? <Notice kind="info">所选历史无需修改，请重新选择。</Notice> : <><RepositoryPreparedDiff files={plan.value.files} patch={plan.value.patch} />
          {plan.kind === 'integration' && plan.value.mode === 'rebase' ? <><details open><summary>将重放的本地独有提交（{plan.value.replay.length}）</summary><ul>{plan.value.replay.map(commit => <li key={commit.id}><code>{commit.id}</code> {commit.summary}</li>)}</ul></details><p>变基后的预览 HEAD：<code>{plan.value.resultHead}</code></p><label><input type="checkbox" checked={acknowledged} disabled={writing} onChange={event => setAcknowledged(event.target.checked)} /> 我理解提交 SHA 和签名会改变，已发布历史可能影响协作者；不会自动强制推送。</label></> : <><OutlinedTextField label="Summary" value={summary} disabled={writing} onChange={event => setSummary(event.target.value)} /><OutlinedTextField label="Description（选填）" type="textarea" rows={2} value={description} disabled={writing} onChange={event => setDescription(event.target.value)} /><p className="muted">{plan.kind === 'local' ? '确认后创建本地合并提交；请检查差异，随后自行选择是否推送。' : '确认后在本地创建合并提交，并向所选远端分支执行普通推送；不会强制推送。所选远端已包含在本地历史时，请使用普通 Push。若远端恰好在核验与推送之间被他人强制回退，普通推送不能保证按显示的远端 SHA 原子检查。'}</p></>}
        </>}
        <div className="divergence-actions"><Button type="button" disabled={writing} onClick={cancelPlan}>取消预览</Button><Button type="button" variant="primary" disabled={writing || blocked || plan.value.unchanged || (plan.kind === 'integration' && plan.value.mode === 'rebase' ? !acknowledged : !isCommitDraft({ summary, description }))} onClick={() => void apply()}>{writing ? '正在执行…' : plan.kind === 'local' ? '确认合并并提交到本地' : plan.value.mode === 'rebase' ? '确认变基到所选提交' : '确认合并并推送远端'}</Button></div>
      </div>}
      {result?.kind === 'local' && <Notice kind={result.value.warning ? 'warning' : 'success'}>{result.value.warning ? `${result.value.warning} 返回的 HEAD：${result.value.head}。请检查实际状态。` : `本地合并已完成：${result.value.head}。请刷新并检查后再决定推送。`}</Notice>}
      {result?.kind === 'integration' && <Notice kind={['partial','created-not-pushed','unknown'].includes(result.value.status) ? 'warning' : 'success'}>{result.value.warning || (result.value.status === 'rebased' ? `本地变基已完成：${result.value.head}。没有自动推送。` : result.value.status === 'restored' ? `已恢复变基前的本地分支：${result.value.head}。`  : result.value.status === 'pushed' ? `合并已推送到 ${result.value.remoteBranch}：${result.value.commitId}。本地分支未改变。` : '所选历史无需修改。')}{result.value.recoveryRef && <> 恢复引用：<code>{result.value.recoveryRef}</code>。</>}</Notice>}
      {result?.kind === 'integration' && result.value.status === 'rebased' && !uncertain && <div className="divergence-review">
        {!showRestore ? <Button type="button" disabled={writing} onClick={() => setShowRestore(true)}>恢复变基前状态</Button> : <><p>恢复会将当前分支回到变基前的提交；仅当分支仍处于本次结果且工作目录和暂存区均无新更改时允许。变基结果也会保存在恢复引用中。</p><label><input type="checkbox" checked={confirmRestore} onChange={event => setConfirmRestore(event.target.checked)} /> 我确认恢复变基前的本地分支。</label><div className="divergence-actions"><Button type="button" disabled={writing} onClick={() => { setShowRestore(false); setConfirmRestore(false); }}>取消恢复</Button><Button type="button" variant="primary" disabled={writing || blocked || !confirmRestore} onClick={() => void restore()}>{writing ? '正在恢复…' : '确认恢复'}</Button></div></>}
        <p className="muted">此恢复按钮在预览有效期内可用；关闭或过期后可使用上方恢复引用检查原提交。</p>
      </div>}
    </>}
    {error && !uncertain && !preparing && !writing && <Button type="button" onClick={() => { cancelPlan(); setChoice(null); setRevision(value => value + 1); }}>重新核验</Button>}
  </div>;
}
