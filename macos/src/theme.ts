import type { CSSProperties } from 'react';

// The component library and app content share one semantic palette. These
// public tokens carry the Material 3 palette into menu and dialog portals too.
export const componentTheme: CSSProperties & Record<string, string> = {
  '--ogui-color-background': 'var(--window-background)',
  '--ogui-color-canvas': 'var(--content)',
  '--ogui-color-surface': 'var(--content)',
  '--ogui-color-surface-strong': 'var(--surface)',
  '--ogui-color-text': 'var(--text)',
  '--ogui-color-muted': 'var(--muted)',
  '--ogui-color-border': 'var(--line)',
  '--ogui-color-border-strong': 'var(--strong-line)',
  '--ogui-color-control': 'var(--surface)',
  '--ogui-color-control-hover': 'var(--surface-hover)',
  '--ogui-color-control-active': 'var(--selection)',
  '--ogui-color-accent': 'var(--blue)',
  '--ogui-color-accent-ink': 'var(--on-primary)',
  '--ogui-color-accent-soft': 'var(--blue-bg)',
  '--ogui-color-secondary': 'var(--teal)',
  '--ogui-color-tertiary': 'var(--purple)',
  '--ogui-color-focus': 'var(--blue)',
  '--ogui-color-danger': 'var(--danger)',
  '--ogui-color-success': 'var(--teal)',
  '--ogui-color-warning': 'var(--warning)',
  '--ogui-radius-control': 'var(--radius-control)',
  '--ogui-radius-surface': 'var(--radius-panel)',
  '--ogui-radius-capsule': '999px',
};
