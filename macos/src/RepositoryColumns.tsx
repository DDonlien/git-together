import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { columnGap, columnLayoutMinimum, columnResizeBounds, defaultColumnRatios, resizeColumns, type ColumnBoundary, type ColumnRatios } from './column-layout';

const columnIds = ['repository-graph-column', 'repository-changes-column', 'repository-tree-column'] as const;
const columnNames = ['分支图', '更改与 Diff', '文件树'] as const;

export function RepositoryColumns({ children }: { children: [ReactNode, ReactNode, ReactNode] }) {
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; width: number; boundary: ColumnBoundary; ratios: ColumnRatios } | null>(null);
  const [ratios, setRatios] = useState<ColumnRatios>(defaultColumnRatios);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const observer = new ResizeObserver(() => setWidth(grid.current!.getBoundingClientRect().width - columnGap * 2));
    observer.observe(grid.current!);
    return () => observer.disconnect();
  }, []);
  const availableWidth = () => grid.current!.getBoundingClientRect().width - columnGap * 2;
  const hasCollapsedColumn = () => !!grid.current!.querySelector('.repository-column-heading.is-collapsed');
  const finishDrag = () => { drag.current = null; setDragging(false); };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setRatios(resizeColumns(current.ratios, current.boundary, current.ratios[current.boundary] + (event.clientX - current.startX) * 10 / current.width, availableWidth()));
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>, boundary: ColumnBoundary) => {
    if (event.key === 'Escape' && drag.current) {
      event.preventDefault();
      setRatios(drag.current.ratios);
      event.currentTarget.releasePointerCapture(drag.current.pointerId);
      finishDrag();
      return;
    }
    if (hasCollapsedColumn()) return;
    const currentWidth = availableWidth();
    const bounds = columnResizeBounds(ratios, boundary, currentWidth);
    const next = event.key === 'ArrowLeft' ? ratios[boundary] - 1 : event.key === 'ArrowRight' ? ratios[boundary] + 1 : event.key === 'Home' ? bounds.minimum : event.key === 'End' ? bounds.maximum : null;
    if (next === null) return;
    event.preventDefault();
    setRatios(resizeColumns(ratios, boundary, next, currentWidth));
  };
  const separator = (boundary: ColumnBoundary) => {
    const { minimum, maximum } = columnResizeBounds(ratios, boundary, width || columnLayoutMinimum(ratios) - columnGap * 2);
    return <div className="repository-column-resizer" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`调整${columnNames[boundary]}与${columnNames[boundary + 1]}比例`} aria-controls={`${columnIds[boundary]} ${columnIds[boundary + 1]}`} aria-valuemin={minimum * 10} aria-valuemax={maximum * 10} aria-valuenow={ratios[boundary] * 10} aria-valuetext={`${columnNames[boundary]} ${ratios[boundary] * 10}%，${columnNames[boundary + 1]} ${ratios[boundary + 1] * 10}%；每次调整10%`} aria-disabled={minimum === maximum} onPointerDown={event => {
      if (event.button !== 0 || hasCollapsedColumn() || minimum === maximum) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, startX: event.clientX, width: availableWidth(), boundary, ratios };
      setDragging(true);
    }} onPointerMove={move} onPointerUp={event => { move(event); finishDrag(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { if (drag.current) setRatios(drag.current.ratios); finishDrag(); }} onLostPointerCapture={finishDrag} onKeyDown={event => keyboard(event, boundary)}><span className="repository-column-grip" aria-hidden="true" /><span className="repository-column-ratio" aria-hidden="true">{ratios[boundary] * 10}% / {ratios[boundary + 1] * 10}%</span></div>;
  };
  const style = { '--graph-share': `${ratios[0]}fr`, '--changes-share': `${ratios[1]}fr`, '--tree-share': `${ratios[2]}fr`, '--columns-min-width': `${columnLayoutMinimum(ratios)}px` } as CSSProperties;
  // Keeping the cards mounted also keeps drafts and disclosure/source state.
  // A collapsed rail uses the original layout; expanding restores these shares.
  return <div className="repository-columns-scroll"><div ref={grid} className={`repository-columns${dragging ? ' is-resizing' : ''}`} style={style}>{children[0]}{separator(0)}{children[1]}{separator(1)}{children[2]}</div></div>;
}
