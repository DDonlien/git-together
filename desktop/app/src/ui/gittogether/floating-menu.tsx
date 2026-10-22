import * as React from 'react'

/** Keep menu controls inside the modal's DOM and use the native popover layer
 * so our rounded, scrolling dialogs never clip a menu. Actions stay upstream. */
export function MaterialFloatingMenu({ anchor, onRef, children }: React.PropsWithChildren<{ anchor: HTMLElement | null; onRef: (element: HTMLDivElement | null) => void }>) {
  const menu = React.useRef<HTMLDivElement | null>(null)
  const ref = React.useCallback((element: HTMLDivElement | null) => { menu.current = element; onRef(element) }, [onRef])
  React.useLayoutEffect(() => {
    const element = menu.current
    if (!element || !anchor) return
    element.showPopover()
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      element.style.maxHeight = `${Math.max(100, window.innerHeight - 32)}px`
      const menuRect = element.getBoundingClientRect()
      element.style.left = `${Math.max(16, Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - 16))}px`
      element.style.top = `${rect.bottom + menuRect.height + 8 < window.innerHeight - 16 ? rect.bottom + 8 : Math.max(16, rect.top - menuRect.height - 8)}px`
    }
    place()
    element.querySelector<HTMLElement>('[role=menu]')?.focus()
    const observer = new ResizeObserver(place)
    observer.observe(element); observer.observe(anchor)
    window.addEventListener('resize', place)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); if (element.isConnected) element.hidePopover() }
  }, [anchor])
  return <div {...{ popover: 'manual' }} ref={ref} className="gt-floating-menu">{children}</div>
}
