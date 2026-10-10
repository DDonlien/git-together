import * as React from 'react';
import { createComponent, type EventName } from '@lit/react';
import { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field.js';
import { MdFilledTextField } from '@material/web/textfield/filled-text-field.js';
import { MdIconButton } from '@material/web/iconbutton/icon-button.js';
import { Icon } from './ui';

const OutlinedField = createComponent({
  tagName: 'md-outlined-text-field', elementClass: MdOutlinedTextField, react: React,
  events: { onChange: 'input' as EventName<InputEvent & { target: MdOutlinedTextField }> },
});
const FilledField = createComponent({
  tagName: 'md-filled-text-field', elementClass: MdFilledTextField, react: React,
  events: { onValueChange: 'input' as EventName<InputEvent & { target: MdFilledTextField }> },
});
const MaterialIconButton = createComponent({ tagName: 'md-icon-button', elementClass: MdIconButton, react: React });

export function OutlinedTextField({ className = '', ...props }: React.ComponentProps<typeof OutlinedField>) {
  // The host participates in the existing dialog focus trap; Material delegates
  // focus to its internal input. Disabled fields must leave the tab sequence.
  return <OutlinedField {...props} tabIndex={props.disabled ? -1 : 0} className={`material-text-field ${props.type === 'textarea' ? 'material-textarea' : ''} ${className}`} />;
}

// Material Web has no Search bar element. Compose its official field/buttons
// using the M3 search container tokens, retaining in-place desktop filtering.
export function SearchBar({ value, onChange, placeholder, inputRef }: {
  value: string; onChange: (value: string) => void; placeholder: string; inputRef?: React.RefObject<HTMLElement | null>;
}) {
  const field = React.useRef<MdFilledTextField>(null);
  const setRef = React.useCallback((element: MdFilledTextField | null) => {
    field.current = element;
    if (inputRef) inputRef.current = element;
  }, [inputRef]);
  return <FilledField ref={setRef} className="search-field material-search-bar" type="search" aria-label={placeholder} placeholder={placeholder} value={value} tabIndex={0} onValueChange={event => onChange(event.target.value)}>
    <MaterialIconButton slot="leading-icon" aria-label="聚焦搜索" tabIndex={0} onClick={() => field.current?.focus()}><Icon name="search" size={24} /></MaterialIconButton>
    {value && <MaterialIconButton slot="trailing-icon" aria-label="清空搜索" tabIndex={0} onClick={() => { onChange(''); field.current?.focus(); }}><Icon name="close" size={24} /></MaterialIconButton>}
  </FilledField>;
}
