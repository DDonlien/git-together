import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RepositoryOperationDialog } from './RepositoryOperationDialog';
import type { RepositoryActionMode, RepositoryActionTarget, RepositoryOperationState } from './repository-action-model';

type OperationInput = Omit<Parameters<typeof RepositoryOperationDialog>[0], 'onClose' | 'onCollapse' | 'visible' | 'onStateChange' | 'onFinished' | 'pauseRefresh'> & { scope: string };
type Operation = OperationInput & { id: string; state: RepositoryOperationState };
type Operations = {
  open: (input: OperationInput) => void; restore: (id: string) => void;
  get: (mode: RepositoryActionMode, scope: string, targets?: readonly RepositoryActionTarget[]) => Operation | undefined;
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
  const get = useCallback((mode: RepositoryActionMode, scope: string, targets: readonly RepositoryActionTarget[] = []) =>
    current.current.find(operation => operation.mode === mode && operation.scope === scope) ||
    current.current.find(operation => operation.mode === mode && operation.state !== 'completed' && overlaps(operation.targets, targets)), []);
  const blocked = useCallback((targets: readonly RepositoryActionTarget[]) => current.current.some(operation => operation.state !== 'completed' && overlaps(operation.targets, targets)), []);
  const open = useCallback((input: OperationInput) => {
    const existing = get(input.mode, input.scope, input.targets) || current.current.find(operation => operation.state !== 'completed' && overlaps(operation.targets, input.targets));
    if (existing) { restore(existing.id); return; }
    const operation: Operation = { ...input, id: crypto.randomUUID(), targets: structuredClone(input.targets), state: ['commit', 'submit', 'push'].includes(input.mode) ? 'ready' : 'preparing' };
    save([...current.current, operation]); restore(operation.id);
  }, [get, restore, save]);
  const close = useCallback((id: string) => { save(current.current.filter(operation => operation.id !== id)); if (activeRef.current === id) collapse(); }, [save, collapse]);
  const update = useCallback((id: string, state: RepositoryOperationState) => {
    const operation = current.current.find(operation => operation.id === id);
    if (!operation || operation.state === state) return;
    save(current.current.map(operation => operation.id === id ? { ...operation, state } : operation));
  }, [save]);
  const finish = useCallback((id: string) => {
    // Hidden completion belongs to its original button. It must never close
    // another task's dialog or reopen a background dialog over the page.
    const operation = current.current.find(item => item.id === id);
    if (activeRef.current === id && operation && ['commit', 'submit', 'push'].includes(operation.mode)) close(id); else update(id, 'completed');
  }, [close, update]);
  const value = useMemo(() => ({ open, restore, get, blocked }), [open, restore, get, blocked, operations]);
  return <OperationsContext.Provider value={value}>{children}{operations.map(operation =>
    <OperationDialog key={operation.id} operation={operation} visible={active === operation.id} onCollapse={collapse} onClose={close} onStateChange={update} onFinished={finish} pauseRepositoryRefresh={pauseRepositoryRefresh} />
  )}</OperationsContext.Provider>;
}
function OperationDialog({ operation, visible, onCollapse, onClose, onStateChange, onFinished, pauseRepositoryRefresh }: {
  operation: Operation; visible: boolean; onCollapse: () => void; onClose: (id: string) => void;
  onStateChange: (id: string, state: RepositoryOperationState) => void; onFinished: (id: string) => void;
  pauseRepositoryRefresh?: (repositoryIds: string[]) => () => void;
}) {
  const close = useCallback(() => onClose(operation.id), [operation.id, onClose]);
  const update = useCallback((state: RepositoryOperationState) => onStateChange(operation.id, state), [operation.id, onStateChange]);
  const finish = useCallback(() => onFinished(operation.id), [operation.id, onFinished]);
  const pauseRefresh = useCallback(() => pauseRepositoryRefresh?.(operation.targets.map(target => target.repositoryId)) || (() => {}), [operation.targets, pauseRepositoryRefresh]);
  return <RepositoryOperationDialog {...operation} visible={visible} onCollapse={onCollapse} onClose={close} onStateChange={update} onFinished={finish} pauseRefresh={pauseRefresh} />;
}
export function useRepositoryOperations(): Operations {
  const context = useContext(OperationsContext);
  if (!context) throw new Error('Repository operation provider is missing.');
  return context;
}
