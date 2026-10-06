import { Icon, IconButton } from './ui';

export function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return <div className="brand">
    <span className="brand-identity" hidden={collapsed}><Icon name="branch" size={21} /><span>GitTogether</span></span>
    <IconButton className="sidebar-disclosure" icon="sidebar" label={collapsed ? '展开侧边栏' : '收起侧边栏'} aria-expanded={!collapsed} aria-controls="global-sidebar" onClick={onToggle} />
  </div>;
}
