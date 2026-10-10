import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Point = { x: number; y: number };

export function actionNamePosition(point: Point, size: { width: number; height: number }, viewport: { width: number; height: number }) {
  // Keep the name beside (never under) the cursor; flip at window edges.
  const left = point.x + 12 + size.width <= viewport.width - 8 ? point.x + 12 : point.x - size.width - 12;
  const top = point.y + 16 + size.height <= viewport.height - 8 ? point.y + 16 : point.y - size.height - 12;
  return { left: Math.max(8, Math.min(left, viewport.width - size.width - 8)), top: Math.max(8, Math.min(top, viewport.height - size.height - 8)) };
}

// One table boundary covers disabled Git wrappers and enabled Hide without
// changing either control's click, layout or accessibility contract.
export function DashboardActionNames({ children }: { children: ReactNode }) {
  const [name, setName] = useState<{ label: string; point: Point; target?: HTMLElement } | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const close = () => setName(null);
  useLayoutEffect(() => {
    if (!name) return;
    const bounds = tooltip.current!.getBoundingClientRect();
    const position = actionNamePosition(name.point, bounds, { width: window.innerWidth, height: window.innerHeight });
    Object.assign(tooltip.current!.style, { left: `${position.left}px`, top: `${position.top}px`, visibility: 'visible' });
  }, [name]);
  const open = name !== null;
  useEffect(() => {
    if (!open) return;
    // Tab may scroll the table while focusing a sticky action. Keep keyboard
    // names anchored to that control; pointer names dismiss when scrolling.
    const scroll = () => setName(current => {
      if (!current?.target) return null;
      const bounds = current.target.getBoundingClientRect();
      return { ...current, point: { x: bounds.right, y: bounds.top } };
    });
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    document.addEventListener('visibilitychange', close);
    return () => {
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      document.removeEventListener('visibilitychange', close);
    };
  }, [open]);
  return <div className="dashboard-action-names"
    onPointerMove={event => {
      if (event.pointerType === 'touch') { close(); return; }
      const action = (event.target as Element).closest<HTMLElement>('[data-action-name]');
      setName(action ? { label: action.dataset.actionName!, point: { x: event.clientX, y: event.clientY } } : null);
    }}
    onPointerLeave={close} onPointerCancel={close} onPointerDownCapture={close} onClickCapture={close}
    onFocusCapture={event => {
      const action = (event.target as Element).closest<HTMLElement>('[data-action-name]');
      if (!action) return;
      const bounds = action.getBoundingClientRect();
      setName({ label: action.dataset.actionName!, point: { x: bounds.right, y: bounds.top }, target: action });
    }}
    onBlurCapture={close} onKeyDownCapture={event => { if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') close(); }}>
    {children}
    {name && createPortal(<div ref={tooltip} className="dashboard-action-name" role="tooltip" aria-hidden="true" style={{ visibility: 'hidden' }}>{name.label}</div>, document.body)}
  </div>;
}
