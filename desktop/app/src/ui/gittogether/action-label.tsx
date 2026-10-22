import type * as React from 'react'

const labels: Readonly<Record<string, string>> = {
  Ok: '确认', OK: '确认', Cancel: '取消', Close: '关闭', Save: '保存', Continue: '继续', Retry: '重试',
  Abort: '中止', 'Ignore and Continue': '忽略并继续', 'Ignore and continue': '忽略并继续',
  "I'm sure": '确认强制推送', 'Not Now': '暂不设置', 'Not now': '暂不设置',
  'Initialize Git LFS': '设置 Git LFS', 'Abort Merge': '中止合并', 'Abort merge': '中止合并',
  'Continue Merge': '继续合并', 'Continue merge': '继续合并',
  'Abort Rebase': '中止变基', 'Abort rebase': '中止变基', 'Continue Rebase': '继续变基', 'Continue rebase': '继续变基',
  'Discard Changes': '丢弃更改', 'Discard changes': '丢弃更改',
  'Force Push': '强制推送', 'Force push': '强制推送', 'Create Branch': '新建分支', 'Create branch': '新建分支',
  Rename: '重命名', Delete: '删除', Remove: '移除', Add: '添加', Clone: '下载', Publish: '发布',
}
/** Action labels only. Never translate repository names, paths or other data. */
export const materialActionLabel = (label: React.ReactNode): React.ReactNode => typeof label === 'string' ? labels[label] ?? label : label
