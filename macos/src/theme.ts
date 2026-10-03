import type { CSSProperties } from 'react';

// The component library and app content share one semantic palette. These
// public tokens are carried into OpenGlass's menu and dialog portals too.
export const componentTheme: CSSProperties & Record<string, string> = {
  '--ogui-color-background': 'var(--surface)',
  '--ogui-color-canvas': 'var(--content)',
  '--ogui-color-text': 'var(--text)',
  '--ogui-color-muted': 'var(--muted)',
  '--ogui-color-border': 'var(--line)',
  '--ogui-color-border-strong': 'var(--strong-line)',
  '--ogui-color-control': 'var(--content)',
  '--ogui-color-control-hover': 'var(--surface-hover)',
  '--ogui-color-control-active': 'var(--selection)',
  '--ogui-color-accent': '#0064dc',
  '--ogui-color-accent-ink': '#ffffff',
  '--ogui-color-accent-soft': 'var(--blue-bg)',
  '--ogui-color-focus': 'var(--blue)',
  '--ogui-color-danger': 'var(--danger)',
  '--ogui-color-success': 'var(--teal)',
  '--ogui-color-warning': 'var(--warning)',
  '--ogui-radius-control': '8px',
  '--ogui-radius-surface': '12px',
};
