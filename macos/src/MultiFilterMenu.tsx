import { useState, type KeyboardEvent } from 'react';
import { Button, Icon, Popover } from './ui';
import { isSelected, isUnrestricted, type FilterSelection, type MultiFilterGroup } from './dashboard-filters';

export function MultiFilterMenu({ label, groups, selections, onToggle, note }: { label: string; groups: MultiFilterGroup[]; selections: Record<string, FilterSelection>; onToggle: (groupId: string, value: string) => void; note?: string }) {
  const [open, setOpen] = useState(false);
  const restricted = groups.some(group => !isUnrestricted(selections[group.id], group.options));
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const inputs = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    if (!inputs.length) return;
    const index = inputs.indexOf(document.activeElement as HTMLInputElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 : event.key === 'ArrowDown' ? (index + 1) % inputs.length : (index - 1 + inputs.length) % inputs.length;
    event.preventDefault(); inputs[next].focus();
  }
  return <Popover label={`${label}筛选`} open={open} onOpenChange={setOpen} placement="start" className="dashboard-filter" trigger={<Button variant="quiet" className="filter-trigger" aria-haspopup="dialog" onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }} trailingIcon={<Icon name="down" size={12} />}><span>{label}{restricted ? ' · 已筛选' : ''}</span></Button>}>
    <div className="multi-filter-options" onKeyDown={navigate} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      {groups.map(group => <fieldset className="multi-filter-group" key={group.id}>
        <legend><span>{group.label}</span>{group.detail && <small>{group.detail}</small>}</legend>
        {group.options.length ? group.options.map(option => <label className="multi-filter-option" key={option.value}>
          <input type="checkbox" checked={isSelected(selections[group.id], option.value)} onChange={() => onToggle(group.id, option.value)} aria-label={`${group.label}：${option.label}${group.detail ? ` · ${group.detail}` : ''}`} />
          <span className="filter-option-label"><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</span>
        </label>) : <p className="multi-filter-empty">没有可筛选的仓库</p>}
      </fieldset>)}
      {note && <p className="multi-filter-note">{note}</p>}
    </div>
  </Popover>;
}
