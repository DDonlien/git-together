import { IconButton } from './ui';

export function NavigationControls({ canGoBack, canRedo, refreshing = false, refreshDisabled = false, onBack, onRedo, onRefresh }: {
  canGoBack: boolean;
  canRedo: boolean;
  refreshing?: boolean;
  refreshDisabled?: boolean;
  onBack: () => void;
  onRedo: () => void;
  onRefresh: () => void;
}) {
  return <div className="app-navigation-controls" role="group" aria-label="页面导航与仓库刷新">
    <IconButton icon="left" label="返回" title="返回上一个页面" disabled={!canGoBack} onClick={onBack} />
    <IconButton icon="right" label="重做" title="重做页面导航" disabled={!canRedo} onClick={onRedo} />
    <IconButton icon="refresh" label={refreshing ? '正在刷新' : '刷新'} title={refreshing ? '正在刷新仓库列表' : '刷新仓库列表'} disabled={refreshing || refreshDisabled} className={refreshing ? 'is-refreshing' : ''} onClick={onRefresh} />
  </div>;
}
