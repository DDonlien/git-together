import type { Terminal } from '@xterm/xterm'

/** Read-only terminal output uses the same Material palette as every other view. */
export function observeTerminalTheme(terminal: Terminal): () => void {
  const update = () => {
    const css = getComputedStyle(document.documentElement)
    const color = (name: string) => css.getPropertyValue(name).trim()
    terminal.options.theme = { background: color('--surface'), foreground: color('--text'), cursor: color('--blue'), selectionBackground: color('--selection'), black: color('--muted'), brightBlack: color('--muted'), red: color('--danger'), green: color('--teal'), yellow: color('--warning'), blue: color('--blue'), magenta: color('--purple'), cyan: color('--teal'), white: color('--text') }
  }
  update()
  const observer = new MutationObserver(update)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
