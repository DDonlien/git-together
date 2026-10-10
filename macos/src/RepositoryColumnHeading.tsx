import { useEffect, useState, type ReactNode } from 'react';
import { Icon, IconButton, type IconName } from './ui';

export function RepositoryColumnHeading({ title, titleContent, disclosureLabel = title, icon, controls, children, expandRequest }: {
  title: string; titleContent?: ReactNode; disclosureLabel?: string; icon: IconName; controls: string; children?: ReactNode; expandRequest?: number;
}) {
  // Keep disclosure state in the heading so changing visibility never remounts
  // sibling task cards, graphs or their independent drafts and selections.
  const [collapsed, setCollapsed] = useState(false);
  // An explicit Commit entry reveals this column without resetting mounted drafts.
  useEffect(() => { if (expandRequest) setCollapsed(false); }, [expandRequest]);
  return <header className={`repository-column-heading${collapsed ? ' is-collapsed' : ''}`}>
    <Icon name={icon} size={17} /><h2>{collapsed ? title : titleContent ?? title}</h2>
    {children != null ? <div className="repository-column-accessory">{children}</div> : null}
    <IconButton type="button" icon={collapsed ? 'right' : 'left'} className="repository-column-disclosure" label={`${collapsed ? '展开' : '收起'}${disclosureLabel}`} aria-expanded={!collapsed} aria-controls={controls} onClick={() => setCollapsed(value => !value)} />
  </header>;
}
