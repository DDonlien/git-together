import { IconButton } from './ui';
import './SidebarHeader.css';

export function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return <div className="sidebar-header">
    <IconButton className="sidebar-disclosure" icon="sidebar" label={collapsed ? '展开侧边栏' : '收起侧边栏'} aria-expanded={!collapsed} aria-controls="global-sidebar" onClick={onToggle} />
    <span className="sidebar-brand" hidden={collapsed}><img className="sidebar-brand-mark" src={`${import.meta.env.BASE_URL}brand/app-icon.png`} alt="" width={24} height={24} />GitTogether</span>
  </div>;
}
