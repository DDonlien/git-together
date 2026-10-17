import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RepositoryOperationDialog } from './RepositoryOperationDialog';
import type { RepositoryActionMode, RepositoryActionTarget, RepositoryOperationState } from './repository-action-model';
import { RepositoryGraphActionDialog, type GraphOperationInput } from './RepositoryGraphActionDialog';
import { graphOperationScope, type GraphAction } from './graph-operation-model';

type OperationInput = (Omit<Parameters<typeof RepositoryOperationDialog>[0], 'onClose' | 'onCollapse' | 'visible' | 'onStateChange' | 'onFinished'> & { scope: string; kind?: 'repository' }) | GraphOperationInput;
type Operation = OperationInput & { id: string; state: RepositoryOperationState };
type Operations = {
  open: (input: OperationInput) => void; restore: (id: string) => void;
  get: (mode: RepositoryActionMode | GraphAction, scope: string, targets?: readonly RepositoryActionTarget[]) => Operation | undefined;
  blocked: (targets: readonly RepositoryActionTarget[]) => boolean;
};
const OperationsContext = createContext<Operations | null>(null);
const overlaps = (left: readonly RepositoryActionTarget[], right: readonly RepositoryActionTarget[]) => left.some(a => a.task.path && right.some(b => b.task.path === a.task.path));

export function RepositoryOperationProvider({ sessionId, children, pauseRepositoryRefresh }: { sessionId: string; children: ReactNode; pauseRepositoryRefresh?: (repositoryIds: string[]) => () => void }) {
  const [operations, setOperations] = useState<Operation[]>([]), current = useRef<Operation[]>([]);
  const [active, setActive] = useState<string | null>(null), activeRef = useRef<string | null>(null);
  const save = useCallback((next: Operation[]) => { current.current = next; setOperations(next); }, []);
  const restore = useCallback((id: string) => { activeRef.current = id; setActive(id); }, []);
  const collapse = useCallback(() => { activeRef.current = null; setActive(null); }, []);
  useEffect(() => { save([]); collapse(); }, [sessionId, save, collapse]);
  const get = useCallback((mode: RepositoryActionMode | GraphAction, scope: string, targets: readonly RepositoryActionTarget[] = []) =>
    current.current.find(operation => operation.mode === mode && operation.scope === scope) ||
    current.current.find(operation => operation.mode === mode && operation.state !== 'completed' && overlaps(operation.targets, targets)), []);
  const blocked = useCallback((targets: readonly RepositoryActionTarget[]) => current.current.some(operation => operation.state !== 'completed' && overlaps(operation.targets, targets)), []);
  const open = useCallback((input: OperationInput) => {
    const existing = get(input.mode, input.scope, input.targets) || current.current.find(operation => operation.state !== 'completed' && !(input.kind === 'graph' && input.mode === 'abort' && operation.state === 'failed') && overlaps(operation.targets, input.targets));
    if (existing) { restore(existing.id); return; }
    const operation: Operation = { ...input, id: crypto.randomUUID(), targets: structuredClone(input.targets), state: input.kind === 'graph' || input.mode === 'commit' || input.mode === 'push' ? 'ready' : 'preparing' };
    save([...current.current, operation]); restore(operation.id);
  }, [get, restore, save]);
  const close = useCallback((id: string) => { save(current.current.filter(operation => operation.id !== id)); if (activeRef.current === id) collapse(); }, [save, collapse]);
  const update = useCallback((id: string, state: RepositoryOperationState) => {
    const operation = current.current.find(operation => operation.id === id);
    if (!operation || operation.state === state) return;
    save(current.current.map(operation => operation.id === id ? { ...operation, state } : operation));
  }, [save]);
  const changeTarget = useCallback((id: string, task: RepositoryActionTarget['task']) => {
    const operation = current.current.find(item => item.id === id);
    if (!operation || operation.kind !== 'graph' || operation.state === 'working') return;
    const targets = [{ repositoryId: operation.repository.id, repositoryName: operation.repository.fullName, task: structuredClone(task) }];
    const busy = current.current.find(item => item.id !== id && item.state !== 'completed' && !(operation.mode === 'abort' && item.state === 'failed') && overlaps(item.targets, targets));
    if (busy) { restore(busy.id); return; }
    save(current.current.map(item => item.id === id && item.kind === 'graph' ? { ...item, targets, scope: graphOperationScope(item.repository.id, item.mode, task.id, item.commit?.id), state: 'ready' } : item));
  }, [save, restore]);
  const finish = useCallback((id: string) => {
    // Hidden completion belongs to its original button. It must never close
    // another task's dialog or reopen a background dialog over the page.
    const operation = current.current.find(item => item.id === id);
    if (operation?.kind === 'graph' && operation.mode === 'abort') save(current.current.filter(item => item.id === id || item.state !== 'failed' || !overlaps(item.targets, operation.targets)));
    if (activeRef.current === id && operation && ['commit', 'submit', 'push'].includes(operation.mode)) close(id); else update(id, 'completed');
  }, [close, update, save]);
  const value = useMemo(() => ({ open, restore, get, blocked }), [open, restore, get, blocked, operations]);
  return <OperationsContext.Provider value={value}>{children}{operations.map(operation =>
    <OperationDialog key={operation.id} operation={operation} visible={active === operation.id} onCollapse={collapse} onClose={close} onStateChange={update} onFinished={finish} onTargetChange={changeTarget} />
  )}</OperationsContext.Provider>;
}
function OperationDialog({ operation, visible, onCollapse, onClose, onStateChange, onFinished, onTargetChange }: {
  operation: Operation; visible: boolean; onCollapse: () => void; onClose: (id: string) => void;
  onStateChange: (id: string, state: RepositoryOperationState) => void; onFinished: (id: string) => void;
  onTargetChange: (id: string, task: RepositoryActionTarget['task']) => void;
}) {
  const close = useCallback(() => onClose(operation.id), [operation.id, onClose]);
  const update = useCallback((state: RepositoryOperationState) => onStateChange(operation.id, state), [operation.id, onStateChange]);
  const finish = useCallback(() => onFinished(operation.id), [operation.id, onFinished]);
  const target = useCallback((task: RepositoryActionTarget['task']) => onTargetChange(operation.id, task), [operation.id, onTargetChange]);
  return operation.kind === 'graph' ? <RepositoryGraphActionDialog {...operation} working={operation.state === 'working'} visible={visible} onCollapse={onCollapse} onClose={close} onStateChange={update} onFinished={finish} onTargetChange={target} /> : <RepositoryOperationDialog {...operation} visible={visible} onCollapse={onCollapse} onClose={close} onStateChange={update} onFinished={finish} />;
}
export function useRepositoryOperations(): Operations {
  const context = useContext(OperationsContext);
  if (!context) throw new Error('Repository operation provider is missing.');
  return context;
}
