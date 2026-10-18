import * as React from 'react'
import { GenericGitAuthentication as CredentialsController } from '../generic-git-auth/generic-git-auth'
import { SSHKeyPassphrase as KeyController } from '../ssh/ssh-key-passphrase'
import { SSHUserPassword as PasswordController } from '../ssh/ssh-user-password'
import { AddSSHHost as HostController } from '../ssh/add-ssh-host'
import { InitializeLFS as LFSController } from '../lfs/initialize-lfs'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { PasswordTextBox } from '../lib/password-text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

/** Views only: all state, credential submission and cancellation are inherited. */
export class GenericGitAuthentication extends CredentialsController {
  public render() {
    const disabled = !this.state.password.length || !this.state.username.length
    return <Dialog id="generic-git-auth" title="连接远端仓库" onDismissed={this.props.onDismiss} onSubmit={this.save} role="alertdialog" ariaDescribedBy="generic-git-auth-error">
      <DialogContent><p id="generic-git-auth-error">远端需要验证身份，请使用此服务器接受的账号和凭据继续。</p><p><code>{this.props.remoteUrl}</code></p><div className="gt-auth-fields">
        {this.props.username === undefined ? <TextBox label="用户名" autoFocus value={this.state.username} onValueChanged={this.onUsernameChange} /> : <p>账号：<strong>{this.props.username}</strong></p>}
        <PasswordTextBox label="密码或访问令牌" value={this.state.password} onValueChanged={this.onPasswordChange} ariaDescribedBy="credential-help" />
      </div><p id="credential-help">如果服务器要求个人访问令牌，请在密码栏中填写令牌。</p></DialogContent>
      <DialogFooter><OkCancelButtonGroup okButtonText="继续连接" okButtonDisabled={disabled} /></DialogFooter>
    </Dialog>
  }
}
export class SSHKeyPassphrase extends KeyController {
  public render() {
    return <Dialog id="ssh-key-passphrase" title="解锁 SSH 密钥" backdropDismissable={false} onSubmit={this.onSubmit} onDismissed={this.onCancel}>
      <DialogContent><p>请输入此密钥的口令：</p><p><code>{this.props.keyPath}</code></p><div className="gt-auth-fields"><PasswordTextBox label="密钥口令" value={this.state.passphrase} onValueChanged={this.onValueChanged} /><Checkbox label="记住此密钥口令" value={this.state.rememberPassphrase ? CheckboxValue.On : CheckboxValue.Off} onChange={this.onRememberPassphraseChanged} /></div></DialogContent>
      <DialogFooter><OkCancelButtonGroup okButtonText="解锁" onCancelButtonClick={this.onCancel} okButtonDisabled={this.state.passphrase.length === 0} /></DialogFooter>
    </Dialog>
  }
}
export class SSHUserPassword extends PasswordController {
  public render() {
    return <Dialog id="ssh-user-password" title="SSH 身份验证" backdropDismissable={false} onSubmit={this.onSubmit} onDismissed={this.onCancel}>
      <DialogContent><p>账号：<strong>{this.props.username}</strong></p><div className="gt-auth-fields"><PasswordTextBox label="密码" value={this.state.password} onValueChanged={this.onValueChanged} /><Checkbox label="记住此密码" value={this.state.rememberPassword ? CheckboxValue.On : CheckboxValue.Off} onChange={this.onRememberPasswordChanged} /></div></DialogContent>
      <DialogFooter><OkCancelButtonGroup okButtonText="继续连接" onCancelButtonClick={this.onCancel} okButtonDisabled={this.state.password.length === 0} /></DialogFooter>
    </Dialog>
  }
}
export class AddSSHHost extends HostController {
  public render() {
    return <Dialog id="add-ssh-host" title="验证 SSH 主机" backdropDismissable={false} onSubmit={this.onSubmit} onDismissed={this.onCancel}>
      <DialogContent><p>尚未确认此服务器的身份。请核对服务器提供的指纹后，再决定是否继续连接。</p><dl className="gt-facts"><dt>主机</dt><dd>{this.props.host}</dd><dt>地址</dt><dd>{this.props.ip}</dd><dt>密钥类型</dt><dd>{this.props.keyType}</dd><dt>指纹</dt><dd><code>{this.props.fingerprint}</code></dd></dl></DialogContent>
      <DialogFooter><OkCancelButtonGroup okButtonText="确认并连接" cancelButtonText="拒绝连接" onCancelButtonClick={this.onCancel} /></DialogFooter>
    </Dialog>
  }
}
export class InitializeLFS extends LFSController {
  public render() {
    const repositories = this.props.repositories
    return <Dialog id="initialize-lfs" title="设置 Git LFS" backdropDismissable={false} onSubmit={this.onInitialize} onDismissed={this.props.onDismissed}>
      <DialogContent><p>这些仓库使用 Git LFS 管理大文件。继续提交前，需要先设置 Git LFS。</p>{repositories.length <= 10 ? <ul className="gt-path-list">{repositories.map(repo => <li key={repo.id}><strong>{repo.name}</strong><small>{repo.path}</small></li>)}</ul> : <p>{repositories.length} 个仓库需要设置。</p>}</DialogContent>
      <DialogFooter><OkCancelButtonGroup okButtonText="设置 Git LFS" cancelButtonText="暂不设置" onCancelButtonClick={this.props.onDismissed} /></DialogFooter>
    </Dialog>
  }
}
