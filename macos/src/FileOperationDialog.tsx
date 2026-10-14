import { useEffect, useRef, useState } from 'react';
import { Button, Modal, Notice, Select } from './ui';
import { OutlinedTextField } from './material-inputs';
import { importAPI } from './import-api';
import type { FileOperationInput, FileOperationPlan } from './file-operation-model';

const labels = { copy: '复制', move: '移动', delete: '移入回收站' };
export function FileOperationDialog({ input, folders, onClose, onChanged }: { input: FileOperationInput; folders: string[]; onClose: () => void; onChanged: () => void }) {
  const [operation, setOperation] = useState(input.operation), [destination, setDestination] = useState(input.destination), [name, setName] = useState(input.name || '');
  const [plan, setPlan] = useState<FileOperationPlan | null>(null), [error, setError] = useState(''), [preparing, setPreparing] = useState(true), [applying, setApplying] = useState(false);
  const inFlight = useRef(false), operationId = useRef(crypto.randomUUID());
  useEffect(() => {
    let current = true, prepared: FileOperationPlan | null = null;
    setPlan(null); setError(''); setPreparing(true);
    const timer = setTimeout(() => {
      void importAPI('prepareFileOperation', { ...input, operation, destination, name }).then(value => {
        prepared = value;
        if (current) { setPlan(value); operationId.current = crypto.randomUUID(); }
        else void importAPI('discardFileOperation', { repositoryId: input.repositoryId, taskId: input.taskId, planId: value.planId }).catch(() => {});
      }).catch(problem => { if (current) setError(problem instanceof Error ? problem.message : '文件预览失败。'); }).finally(() => { if (current) setPreparing(false); });
    }, 200);
    return () => {
      current = false; clearTimeout(timer);
      if (prepared && !inFlight.current) void importAPI('discardFileOperation', { repositoryId: input.repositoryId, taskId: input.taskId, planId: prepared.planId }).catch(() => {});
    };
  }, [input, operation, destination, name]);
  const apply = async () => {
    if (!plan || inFlight.current) return;
    inFlight.current = true; setApplying(true); setError('');
    try {
      const result = await importAPI('applyFileOperation', { repositoryId: input.repositoryId, taskId: input.taskId, planId: plan.planId, operationId: operationId.current });
      onChanged();
      if (result.error) { setError(`已完成 ${result.completed}/${result.total} 项。${result.error}`); setPlan(null); }
      else onClose();
    } catch (problem) { onChanged(); setError(problem instanceof Error ? problem.message : '文件操作未完成，请刷新确认。'); }
    finally { inFlight.current = false; setApplying(false); }
  };
  return <Modal title={input.dropId ? '导入文件' : labels[operation]} onClose={() => { if (!inFlight.current) onClose(); }}>
    <div className="file-operation-dialog">
      {input.dropId && <Select label="导入方式" value={operation} disabled={applying} options={[{ value: 'copy', label: '复制，保留来源' }, { value: 'move', label: '移动到项目中' }]} onChange={event => { setPlan(null); setOperation(event.target.value as 'copy' | 'move'); }} />}
      {operation !== 'delete' && <><Select label="目标文件夹" value={destination} disabled={applying} options={[...new Set(['', destination, ...folders])].map(value => ({ value, label: value || '项目根目录' }))} onChange={event => { setPlan(null); setDestination(event.target.value); }} /><OutlinedTextField label="新名称（单个文件时可修改）" value={name} disabled={applying} onChange={event => { setPlan(null); setName(event.target.value); }} /></>}
      {preparing && <p role="status">正在检查文件与目标位置…</p>}
      {plan && <ul className="file-operation-preview">{plan.items.map((item, index) => <li key={`${item.source}:${index}`}><span>{item.source}</span><span>{item.target === null ? '系统回收站' : `→ ${item.target}`}</span></li>)}</ul>}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="modal-actions"><Button onClick={onClose} disabled={applying}>取消</Button><Button variant={operation === 'delete' ? 'danger' : 'primary'} disabled={!plan || preparing || applying} onClick={() => void apply()}>{applying ? '正在处理…' : labels[operation]}</Button></div>
    </div>
  </Modal>;
}
