import { useState, type ReactNode } from 'react';
import { Icon, IconButton, type IconName } from './ui';

export function RepositoryColumnHeading({ title, titleContent, disclosureLabel = title, icon, controls, children }: {
  title: string; titleContent?: ReactNode; disclosureLabel?: string; icon: IconName; controls: string; children?: ReactNode;
}) {
  // Keep disclosure state in the heading so changing visibility never remounts
  // sibling task cards, graphs or their independent drafts and selections.
  const [collapsed, setCollapsed] = useState(false);
  return <header className={`repository-column-heading${collapsed ? ' is-collapsed' : ''}`}>
    <Icon name={icon} size={17} /><h2>{collapsed ? title : titleContent ?? title}</h2>
    {children != null ? <div className="repository-column-accessory">{children}</div> : null}
    <IconButton type="button" icon={collapsed ? 'right' : 'down'} className="repository-column-disclosure" label={`${collapsed ? '展开' : '收起'}${disclosureLabel}`} aria-expanded={!collapsed} aria-controls={controls} onClick={() => setCollapsed(value => !value)} />
  </header>;
}
