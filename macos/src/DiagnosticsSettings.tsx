import { useEffect, useId, useRef, useState } from 'react';
import { copyDiagnostics, diagnosticsStatus, openDiagnostics, recentDiagnostics } from './diagnostics-api';
import type { DiagnosticEvent, DiagnosticOutcome, DiagnosticRecord, DiagnosticsRecent, DiagnosticsStatus } from './diagnostics-model';
import { Button, Icon, Notice } from './ui';

const eventLabels: Record<DiagnosticEvent, string> = { lifecycle: '应用运行', api: '应用请求', 'provider-read': '远端读取', 'git-read': 'Git 读取', 'git-write': 'Git 操作', storage: '本地存储', authorization: '网页授权', update: '应用更新', refresh: '自动刷新', renderer: '界面运行', 'ui-action': '界面操作', performance: '运行状态' };
const outcomeLabels: Record<DiagnosticOutcome, string> = { start: '开始', success: '成功', partial: '部分完成', failure: '失败', cancelled: '已取消', paused: '已暂停', resumed: '已恢复', retry: '正在重试', online: '在线', offline: '离线', hidden: '界面隐藏', visible: '界面显示', blocked: '受阻', received: '已收到', accepted: '已接受', complete: '已完成', rejected: '被拒绝', failed: '失败', current: '已是最新', available: '有可用更新', ready: '已就绪', installing: '正在安装' };
const methodLabels: Partial<Record<NonNullable<DiagnosticRecord['method']>, string>> = { localWorkspace: '读取本地仓库', remoteWorkspace: '读取远端仓库', fetchRepository: '获取远端引用', submitCommit: '提交更改', pushCommit: '推送提交', generateCommitMessage: '生成提交说明', ignoreFile: '忽略文件', connect: '连接账号', refresh: '刷新仓库', start: '开始授权', poll: '检查授权', cancel: '取消授权', check: '检查更新', download: '下载', install: '安装', localDirectory: '读取文件夹', remoteFile: '读取远端文件', remoteHistory: '读取远端历史', remoteCommit: '读取远端提交', localCommit: '读取本地提交', executeGraph: '执行 Git 操作' };
const logTime = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const recordSearch = (record: DiagnosticRecord) => `${eventLabels[record.event]} ${outcomeLabels[record.outcome]} ${record.method ? methodLabels[record.method] || '' : ''} ${JSON.stringify(record)}`.toLocaleLowerCase();

function RecentLogRecord({ record }: { record: DiagnosticRecord }) {
  const date = new Date(record.time);
  const failed = ['failure', 'failed', 'rejected', 'blocked'].includes(record.outcome);
  return <details className="diagnostics-record" data-outcome={failed ? 'error' : record.outcome === 'partial' || record.outcome === 'retry' ? 'warning' : 'info'}>
    <summary><time dateTime={record.time} title={date.toLocaleString()}>{Number.isFinite(date.getTime()) ? logTime.format(date) : record.time}</time><span className="diagnostics-record-event">{eventLabels[record.event]}</span><span className="diagnostics-record-result">{outcomeLabels[record.outcome]}</span><span className="diagnostics-record-detail">{[record.method ? methodLabels[record.method] || record.method : '', record.code, record.httpStatus ? `HTTP ${record.httpStatus}` : ''].filter(Boolean).join(' · ')}</span><Icon name="right" size={13} /></summary>
    <pre tabIndex={0} aria-label="日志记录详细信息">{JSON.stringify(record, null, 2)}</pre>
  </details>;
}

export function DiagnosticsSettings() {
  const [status, setStatus] = useState<DiagnosticsStatus | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'open' | 'copy' | null>(null);
  const [expanded, setExpanded] = useState(false), [recent, setRecent] = useState<DiagnosticsRecent | null>(null);
  const [recentLoading, setRecentLoading] = useState(false), [recentError, setRecentError] = useState(''), [search, setSearch] = useState(''), [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const viewerId = useId(), mounted = useRef(true), readingRecent = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let reading = false;
    const read = () => { if (reading) return; reading = true; void diagnosticsStatus().then(value => { if (mounted.current) { setStatus(value); setError(''); } }).catch(() => { if (mounted.current) setError('无法读取本地日志状态，请检查程序与服务是否为最新版本。'); }).finally(() => { reading = false; }); };
    read(); const timer = setInterval(read, 10_000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);
  async function loadRecent() {
    if (readingRecent.current) return;
    readingRecent.current = true; setRecentLoading(true); setRecentError('');
    try { const value = await recentDiagnostics(); if (mounted.current) { setRecent(value); setUpdatedAt(new Date()); } }
    catch (problem) { if (mounted.current) setRecentError(problem instanceof Error ? problem.message : '日志读取失败，请重试。'); }
    finally { readingRecent.current = false; if (mounted.current) setRecentLoading(false); }
  }
  async function action(kind: 'open' | 'copy') {
    setBusy(kind); setError(''); setMessage('');
    try {
      if (kind === 'open') await openDiagnostics();
      else setMessage(`已复制 ${await copyDiagnostics()} 个日志文件。`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : '日志操作失败，请重试。'); }
    finally { setBusy(null); }
  }
  const retentionHours = status?.retentionHours || 168;
  const retentionLabel = retentionHours % 24 === 0 ? `${retentionHours / 24} 天` : `${retentionHours} 小时`;
  const capacityLabel = status ? `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(status.maxBytes / (1024 * 1024))} MB` : '';
  const writePaused = status?.writePaused === true;
  const capacityPruned = status?.capacityPruned ?? status?.capacityLimited ?? false;
  const statusError = writePaused && status?.error.startsWith('日志达到空间上限，') ? '' : status?.error;
  const query = search.trim().toLocaleLowerCase();
  const records = recent?.records.filter(record => !query || recordSearch(record).includes(query)) || [];
  const partialRecent = !!recent && (recent.hasOlder || recent.truncated);
  return <section className="settings-section" aria-labelledby="diagnostics-settings-title"><h2 id="diagnostics-settings-title">日志</h2><div className="settings-group">
    <div className="setting-row diagnostics-setting-row">
      <Button aria-expanded={expanded} aria-controls={viewerId} leadingIcon={<Icon name={expanded ? 'down' : 'right'} size={15} />} onClick={() => { setExpanded(!expanded); if (!expanded) void loadRecent(); }}>{expanded ? '收起日志' : '查看日志'}</Button>
      <Button disabled={!status || !!busy} onClick={() => void action('open')}>{busy === 'open' ? '正在打开…' : '打开日志文件夹'}</Button>
      <Button disabled={!status || !!busy} onClick={() => void action('copy')}>{busy === 'copy' ? '正在复制…' : '复制日志文件到剪贴板'}</Button>
    </div>
    <div aria-live="polite" className={error || statusError || writePaused || capacityPruned || status?.dropped || message ? 'diagnostics-feedback' : undefined}>{(error || statusError) && <Notice kind="error">{error || statusError}</Notice>}{writePaused && <Notice kind="warning">日志空间已满，暂时停止写入；现有日志仍可查看。</Notice>}{capacityPruned && <Notice kind="info">日志达到空间上限，已移除较早记录；当前记录可能不足 {retentionLabel}。</Notice>}{!!status?.dropped && <Notice kind="info">日志暂未能完整写入，累计 {status.dropped} 条记录未写入；性能记录可能不完整。</Notice>}{message && <Notice kind="success" onClose={() => setMessage('')}>{message}</Notice>}</div>
    {expanded && <section id={viewerId} className="diagnostics-viewer" aria-label="最近日志">
      <div className="diagnostics-viewer-toolbar"><label className="diagnostics-search"><Icon name="search" size={17} /><span className="sr-only">搜索日志</span><input type="search" placeholder="搜索日志…" value={search} onChange={event => setSearch(event.target.value)} /></label><Button disabled={recentLoading} leadingIcon={<Icon name={recentLoading ? 'spinner' : 'refresh'} className={recentLoading ? 'spin' : ''} size={15} />} onClick={() => void loadRecent()}>刷新日志</Button></div>
      <div className="diagnostics-viewer-meta" role="status"><span>{recent ? query ? `找到 ${records.length} 条 · ${partialRecent ? '读取到的' : '最近'} ${recent.records.length} 条中搜索` : partialRecent ? `读取到的 ${recent.records.length} 条 · 按时间倒序` : `最近 ${recent.records.length} 条 · 最新在前` : '最近记录'}{recentLoading ? ' · 正在读取…' : ''}</span>{updatedAt && <time dateTime={updatedAt.toISOString()}>更新于 {updatedAt.toLocaleTimeString()}</time>}</div>
      {recent && status && <p className="diagnostics-viewer-meta">界面最多显示 {recent.maxRecords} 条；日志文件最多保留 {retentionLabel}、{capacityLabel}（先到上限为准）。</p>}
      {recentError && <Notice kind="error">{recentError}{recent && ' 已保留上次读取的记录。'}</Notice>}
      {partialRecent && <Notice kind="info">这里只显示部分近期记录；其他记录可在日志文件夹中查看。搜索仅限当前记录。</Notice>}
      <div className="diagnostics-records" aria-label="日志记录" aria-busy={recentLoading}>{records.map((record, index) => <RecentLogRecord key={`${record.session}:${record.time}:${index}`} record={record} />)}{!records.length && <p className="diagnostics-viewer-empty">{recentLoading && !recent ? '正在读取日志…' : !recent ? '点击刷新日志重试。' : query ? '没有符合搜索条件的记录。' : '暂无日志记录。'}</p>}</div>
    </section>}
  </div></section>;
}
