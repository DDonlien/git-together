# GitTogether 视觉规范

## 材质与层次

参照 [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)：Liquid Glass 用于侧栏、顶部导航、浮动操作栏、菜单和控件。表格、文件列表、Diff、表单使用稳定、近乎不透明的内容材料。避免把每个数据单元做成玻璃卡片。

桌面窗口以 Electron 的隐藏标题栏和原生 traffic lights 呈现。支持的系统使用 [electron-liquid-glass](https://github.com/Meridius-Labs/electron-liquid-glass)；浏览器控制组使用 [simple-liquid-glass](https://github.com/lucaperullo/simple-liquid-glass)。第三方效果用于本地预览；不调用 unstable variant API。

## 字体与颜色

字体使用 `-apple-system / BlinkMacSystemFont / SF Pro Text`，不下载替代字体。等宽采用 `SFMono-Regular / Menlo`。导航与正文 13px，辅助文字 11–12px，页标题 29px/600；数字采用 tabular figures。

正文深灰，次要文字低饱和灰；系统蓝用于选择和 Commit，紫色用于 Submit，青绿色用于 Get Latest。成功、警告和错误同时提供文字与图标，不仅用颜色。密集文件/仓库文字为 11px；Diff 片段为 9px 等宽，可滚动查看。

## 布局

桌面全窗口三层：全局 sidebar 208px、仓库上下文 190px、可伸缩中央内容；详情栏 300px。Dashboard 保留四个统计卡片、筛选栏和对齐的仓库列表。Repo 保留 Files/Commit，底部 Summary/Description 表单和 AI Gen/Commit，右侧 Graph/文件夹。收起详情栏释放中央宽度。

基本间距 4px，主要节奏 8/12/16/24/32px；仓库行 44px、worktree 行 37px，控件 28–34px；玻璃控制组为圆润 capsule，内容列表不堆叠大圆角卡片。920px 窗口收紧全局导航，移动视口将仓库上下文横排并允许内容纵向滚动。

## 可访问性与动效

按钮有清晰名称，列表 checkbox 具有 indeterminate；键盘焦点可见，菜单 Escape 关闭，弹窗包含焦点圈，Cmd+K 搜索，Cmd+Enter 提交。支持 dark、system 和 light，减少透明度与 prefers-reduced-motion。交互状态动画 120–180ms，不用持续装饰动效。

参考图定义信息布局；Liquid Glass 材质、字体、间距是本次用户明确授权的视觉更新，不做旧线框的逐像素主题复制。
