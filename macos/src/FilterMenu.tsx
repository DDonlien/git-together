import { Button, Icon, Menu, MenuItem } from './ui';

export interface FilterOption { value: string; label: string; detail?: string }

export function FilterOptions({ options, value, onChange }: { options: FilterOption[]; value: string; onChange: (value: string) => void }) {
  return <div className="filter-menu-options">{options.map(option => <MenuItem key={option.value} aria-current={option.value === value ? 'true' : undefined} onClick={() => onChange(option.value)}>
    <span className="filter-option-label"><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</span>
    <span className="filter-option-check">{option.value === value && <Icon name="check" size={15} />}</span>
  </MenuItem>)}</div>;
}

export function FilterMenu({ label, options, value, onChange }: { label: string; options: FilterOption[]; value: string; onChange: (value: string) => void }) {
  const selected = options.find(option => option.value === value) || options[0];
  return <Menu label={`${label}：${selected.label}`} placement="start" className="dashboard-filter" trigger={<Button variant="quiet" className="filter-trigger" title={[selected.label, selected.detail].filter(Boolean).join(' · ')} trailingIcon={<Icon name="down" size={12} />}><span>{selected.label}</span></Button>}>
    <FilterOptions options={options} value={value} onChange={onChange} />
  </Menu>;
}
