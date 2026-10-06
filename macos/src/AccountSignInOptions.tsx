import type { ReactNode } from 'react';
import type { Provider } from './import-model';
import { Button, Icon, TextField } from './ui';

export function AccountSignInOptions({ provider, manual, busy, disabled, token, onToken, onManual, onWebAuthorization, children }: {
  provider: Provider; manual: boolean; busy: boolean; disabled: boolean; token: string;
  onToken: (value: string) => void; onManual: (value: boolean) => void; onWebAuthorization: () => void; children?: ReactNode;
}) {
  const useToken = provider === 'gitea' || manual;
  return <>
    {provider === 'github' && <Button variant="quiet" className="sign-in-alternative" disabled={busy} onClick={() => onManual(!manual)}>{manual ? '改用网页授权' : '使用访问令牌'}</Button>}
    {useToken && <TextField label="访问令牌" type="password" autoComplete="off" spellCheck={false} placeholder={provider === 'github' ? 'GitHub Personal Access Token' : 'Gitea Access Token'} value={token} onChange={event => onToken(event.target.value)} required disabled={busy} maxLength={4096} />}
    {children}
    <div className="account-form-actions"><Button variant="primary" type={useToken ? 'submit' : 'button'} disabled={busy || disabled || (useToken && !token.trim())} onClick={useToken ? undefined : onWebAuthorization} leadingIcon={busy ? <Icon name="spinner" className="spin" size={15} /> : !useToken ? <Icon name="external" size={15} /> : undefined}>{busy ? '正在连接…' : useToken ? '连接账号' : '通过 GitHub 网页授权'}</Button></div>
  </>;
}
