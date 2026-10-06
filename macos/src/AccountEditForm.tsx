import { useRef, useState, type FormEvent } from 'react';
import { providerName, type Account, type UpdateAccountInput } from './import-model';
import { Button, Icon, Notice, TextField } from './ui';

export function AccountEditForm({ account, busy, onSubmit, onSaved, onCancel, onRemove }: {
  account: Account;
  busy: boolean;
  onSubmit: (input: UpdateAccountInput) => Promise<unknown>;
  onSaved: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const pending = busy || saving;
  const changed = name.trim() !== account.name || !!token.trim();
  const canSave = !!name.trim() && changed && !pending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave || submitting.current) return;
    submitting.current = true; setSaving(true); setError('');
    let saved = false;
    try {
      await onSubmit({ accountId: account.id, name: name.trim(), ...(token.trim() ? { token: token.trim() } : {}) });
      saved = true;
    } catch (problem) { setError(problem instanceof Error ? problem.message : '账号更新失败，请重试。'); }
    finally { submitting.current = false; setSaving(false); }
    if (saved) onSaved();
  }

  return <form className="account-edit-form" aria-label="编辑账号" onSubmit={event => void submit(event)}>
    <div className="account-edit-identity"><span className={`provider-mark ${account.provider}`}><Icon name="branch" size={17} /></span><div><strong>{account.login}</strong><small>{providerName(account.provider)} · {new URL(account.host).host}</small></div></div>
    <TextField label="账号名称" value={name} onChange={event => setName(event.target.value)} required maxLength={120} disabled={pending} autoComplete="off" autoFocus />
    <TextField label="访问令牌" type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="留空保留当前令牌" maxLength={4096} disabled={pending} autoComplete="new-password" />
    {error && <Notice kind="error">{error}</Notice>}
    <div className="modal-actions"><Button variant="quiet" type="button" className="danger-text remove-account-button" disabled={pending} onClick={onRemove}>移除</Button><Button disabled={pending} onClick={onCancel}>取消</Button><Button variant="primary" type="submit" disabled={!canSave}>{pending ? '正在保存…' : '保存更改'}</Button></div>
  </form>;
}
