import shapes from './phosphor-shapes.json'
import type { MaterialIconName } from './material-icon'

/** Built-in artwork is drawn from our own layout and our existing Phosphor set. */
export function materialArtwork(name: MaterialIconName | 'theme-light' | 'theme-dark'): string {
  const dark = name === 'theme-dark'
  const background = dark ? '#131318' : '#f6f5fa'
  const surface = dark ? '#211f26' : '#fffbff'
  const primary = dark ? '#b8c4ff' : '#4559a8'
  const body = name.startsWith('theme-')
    ? `<rect width="240" height="144" rx="16" fill="${background}"/><rect x="12" y="16" width="36" height="12" rx="6" fill="${primary}"/><rect x="12" y="42" width="36" height="8" rx="4" fill="${primary}" opacity=".4"/><rect x="12" y="60" width="30" height="8" rx="4" fill="${primary}" opacity=".25"/><rect x="62" y="12" width="166" height="34" rx="12" fill="${surface}"/><rect x="62" y="56" width="76" height="76" rx="12" fill="${surface}"/><rect x="148" y="56" width="80" height="76" rx="12" fill="${surface}"/><path d="M74 73h48M74 89h36M160 73h48M160 89h38" stroke="${primary}" stroke-width="4" stroke-linecap="round" opacity=".6"/>`
    : `<rect width="96" height="96" rx="28" fill="#e3e6fa"/><g transform="translate(22 22) scale(.203125)" fill="#4559a8">${shapes[name as MaterialIconName]}</g>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${name.startsWith('theme-') ? '240 144' : '96 96'}">${body}</svg>`)}`
}
