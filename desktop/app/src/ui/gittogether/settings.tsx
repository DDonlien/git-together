import * as React from 'react'
import { Preferences as PreferencesController } from '../preferences/preferences'
import { PreferencesTab } from '../../models/preferences'
import { About as AboutController } from '../about/about'
import { RepositorySettings as RepositorySettingsController, RepositorySettingsTab } from '../repository-settings/repository-settings'
import { isRepositoryWithForkedGitHubRepository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter, DefaultDialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { LinkButton } from '../lib/link-button'
import { MaterialIcon, MaterialIconName } from './material-icon'

interface SettingsTab { readonly id: number; readonly title: string; readonly icon: MaterialIconName }
function SettingsNavigation({ tabs, selected, onSelect }: { tabs: ReadonlyArray<SettingsTab>; selected: number; onSelect: (id: number) => void }) {
  const onKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const move = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 0
    if (move) {
      event.preventDefault()
      const id = tabs[(index + move + tabs.length) % tabs.length].id
      onSelect(id)
      const parent = event.currentTarget.parentElement
      requestAnimationFrame(() => parent?.querySelector<HTMLButtonElement>(`[data-settings-tab="${id}"]`)?.focus())
    }
  }
  return <div className="gt-settings-tabs" role="tablist" aria-label="设置分类" aria-orientation="vertical">{tabs.map((tab, index) => <button key={tab.id} type="button" data-settings-tab={tab.id} role="tab" aria-selected={selected === tab.id} tabIndex={selected === tab.id ? 0 : -1} onClick={() => onSelect(tab.id)} onKeyDown={e => onKey(e, index)}><MaterialIcon name={tab.icon} size={19} />{tab.title}</button>)}</div>
}
const preferenceTabs: ReadonlyArray<SettingsTab> = [
  { id: PreferencesTab.Accounts, title: '账号', icon: 'User' },
  { id: PreferencesTab.Integrations, title: '编辑器与终端', icon: 'Terminal' },
  { id: PreferencesTab.Copilot, title: 'Copilot', icon: 'Robot' },
  { id: PreferencesTab.Git, title: 'Git', icon: 'GitCommit' },
  { id: PreferencesTab.Appearance, title: '外观', icon: 'PaintBrush' },
  { id: PreferencesTab.Notifications, title: '通知', icon: 'Bell' },
  { id: PreferencesTab.Prompts, title: '操作确认', icon: 'ShieldCheck' },
  { id: PreferencesTab.Advanced, title: '高级', icon: 'GearSix' },
  { id: PreferencesTab.Accessibility, title: '辅助功能', icon: 'Eye' },
]

/** These classes replace views only. Save, cancel, validation and all effects
 * are inherited from the pinned upstream controllers without modification. */
export class Preferences extends PreferencesController {
  public render() {
    const tabs = preferenceTabs.filter(tab => tab.id !== PreferencesTab.Copilot || this.isCopilotSdkEnabled)
    return <Dialog id="preferences" title="应用设置" onDismissed={this.onCancel} onSubmit={this.onSave}>
      {this.renderDisallowedCharactersError()}
      <div className="gt-settings-layout"><SettingsNavigation tabs={tabs} selected={this.state.selectedIndex} onSelect={id => this.onTabClicked(this.tabToVisualIndex(id))} /><div className="gt-settings-panel" role="tabpanel">{this.renderActiveTab()}</div></div>
      {this.renderFooter()}
    </Dialog>
  }
}
const repositoryTabs: ReadonlyArray<SettingsTab> = [
  { id: RepositorySettingsTab.Remote, title: '远端连接', icon: 'Globe' },
  { id: RepositorySettingsTab.IgnoredFiles, title: '忽略文件', icon: 'File' },
  { id: RepositorySettingsTab.GitConfig, title: 'Git 身份', icon: 'GitCommit' },
  { id: RepositorySettingsTab.ForkSettings, title: '仓库副本', icon: 'GitBranch' },
]
export class RepositorySettings extends RepositorySettingsController {
  public render() {
    const tabs = repositoryTabs.filter(tab => tab.id !== RepositorySettingsTab.ForkSettings || isRepositoryWithForkedGitHubRepository(this.props.repository))
    return <Dialog id="repository-settings" title={this.props.repository.name} onDismissed={this.props.onDismissed} onSubmit={this.onSubmit} disabled={this.state.disabled}>
      {this.renderErrors()}
      <div className="gt-settings-layout"><SettingsNavigation tabs={tabs} selected={this.state.selectedTab} onSelect={this.onTabClicked} /><div className="gt-settings-panel" role="tabpanel">{this.renderActiveTab()}</div></div>
      <DialogFooter><OkCancelButtonGroup okButtonText="保存" okButtonDisabled={this.state.saveDisabled} /></DialogFooter>
    </Dialog>
  }
}
export class About extends AboutController {
  public render() {
    return <Dialog id="about" title="关于 GitTogether" onDismissed={this.props.onDismissed} onSubmit={this.props.onDismissed}>
      {this.renderUpdateErrors()}
      <DialogContent><div className="about-brand"><MaterialIcon name="GitBranch" size={48} /><div><h2>GitTogether</h2><span>{this.props.applicationVersion} · {this.props.applicationArchitecture}</span></div></div>
        {this.renderUpdateDetails()}{this.renderUpdateButton()}
        <p>GitTogether 使用 GitHub Desktop 的开源执行基础。</p>
        <div className="terms-and-license-container"><LinkButton uri="https://github.com/DDonlien/git-together">项目与帮助</LinkButton><LinkButton onClick={this.props.onShowAcknowledgements}>开源许可与致谢</LinkButton><LinkButton onClick={this.props.onShowTermsAndConditions}>使用条款</LinkButton></div>
      </DialogContent><DefaultDialogFooter />
    </Dialog>
  }
}
