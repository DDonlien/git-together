# GitTogether 视觉规范

## 窗口层级

以用户 2026-10-03 的 macOS 系统设置截图为容器层级参考：整个窗口共享一层背景；最左侧导航四周内缩，位于独立悬浮圆角容器内；右侧按语义使用平面填充分组。这是本应用的设计选择，不把单个参考应用概括成所有 macOS 应用的强制布局。

窗口内缩8px、导航与工作区间距16px；侧栏22px圆角，有完整细边缘和轻投影。右侧内容组16px圆角、纯填充、无投影、无背景模糊/折射、无外部立体描边；组内细分隔线保留。顶栏和各页外壳直接位于共享背景，不包一整页立体面板，也不把每一行做成浮动卡片。

## 材料与组件

参照 [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials) 和 [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)：材料服务导航和控制，不覆盖或折射密集内容。玻璃只用于悬浮导航、独立控件、菜单等控制层；右侧批量工具栏本身是平面内容分组，其按钮可保留控件层次。

浏览器统一使用 [OpenGlass UI](https://github.com/moekoelueker/open-glass-ui) 0.4.0；[LiqUIdify](https://github.com/tuliopc23/LiqUIdify) 仅为对照，不混装另一套控件。`ui.tsx` 适配公共契约，`theme.ts` 定义公共令牌；尺寸修正使用公开属性/样式类，不访问私有光学 DOM。小控件不叠加第二层背景模糊，内容分组明确关闭库默认 elevation。

Electron 使用隐藏标题栏、真实窗口按钮和 [electron-liquid-glass](https://github.com/Meridius-Labs/electron-liquid-glass) 系统背景视图。窗口按钮位于悬浮侧栏内，随图标栏调整位置。React 控件不是 AppKit 原生控件；没有 macOS 27 运行验收。

## 字体与颜色

系统字体 `-apple-system / BlinkMacSystemFont / SF Pro Text`，等宽 `SFMono-Regular / Menlo`，不下载替代字体。导航/正文13px、仓库表与文件12px、辅助信息10–12px、Diff等宽11px，页面标题26px，指南标题28px。数字使用 tabular figures。

亮色窗口 `#eef0f2`、内容 `#fff`、次级填充 `#f5f5f7`；暗色窗口 `#24292c`、悬浮导航深色半透明、内容 `#2b3033`、次级填充 `#33393c`。选中态清晰但不增加阴影。蓝/紫/青绿区分选择与操作；成功、失败、警告同时显示文字/图标，不能只靠颜色表达。

## 布局

全局导航216px，1350px以下196px；0.2.0 在桌面最小窗口仍保留可读的账号名和仓库名。Dashboard统计与每个账号的仓库表、只读文件/Diff/历史、独立设置中的账号/外观/指南分别使用平面分组。旧上下文/详情/提交表单是历史演示布局，不再进入运行入口。

基本间距4px，主要节奏8/12/16/24px；仓库行48px、worktree行42px、文件行36px，常规控件32px、图标按钮28px。

920×640桌面最小尺寸下保留196px文字导航，设置入口固定可达，仓库表只在自身容器横向滚动。760px以下导航56px、内缩6px、侧栏18px圆角；保留简短账号名及折叠控制，文件/Diff纵向排列，属于浏览器回退布局。

## 可访问性与动效

按钮有清晰名称；账号展开状态提供 aria-expanded，具体仓库图标标识 Presence 未连接/在线/提醒（当前没有真实连接）。键盘焦点可见，弹窗包含焦点圈，Escape 关闭并恢复焦点，Cmd+K 搜索。支持 dark、system 和 light，减少透明度与 prefers-reduced-motion。交互状态动画 120–180ms，不用持续装饰动效。运行入口没有提交快捷键或模拟提交。

账号导入层级（2026-10-04）：左下角设置是独立页面；头像、全局 Presence、指南快捷入口、侧栏添加仓库、右上角添加仓库、演示场景、Dashboard 大标题/演示说明行全部移除。设置只配置身份；Dashboard 以账号为维度显示远端仓库，本地路径只在具体仓库 popup 配置。

用户ZIP定义页面与交互，系统设置截图定义本次共享背景/浮动导航/平面内容的关系。不复制系统设置内容、个人账号照片或系统图标，不声称跨应用逐像素一致。调整前规范保存在 `archive/design/DESIGN-20261003231645.md`。
