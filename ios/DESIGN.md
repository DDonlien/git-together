# iOS 视觉规范

继承 [GitTogether Material 3](../DESIGN.md)。原生层参考 [必乐](https://github.com/DDonlien/belle-app/blob/main/ios/DESIGN.md)，正文不改成必乐的系统分组列表配色。

- 底部使用真实系统 TabView，仓库、设备、设置和搜索均由系统布局；搜索使用 `.searchable` 和 search Tab，iOS 26 自动绘制 Liquid Glass，不叠加手绘玻璃或空 accessory。
- 正文复用 `macos/src/material-tokens.css`：亮色背景#f6f5fa、内容#fffbff、容器#eeedf4、主色#4559a8；暗色背景#131318、内容#211f26、容器#2b2930、主色#b8c4ff。正文卡片20pt圆角，控件12pt，页面16pt间距。
- 手机工作台的 Graph、更改、文件和设备通过分段控件访问，共享分支及提交选择；宽屏并排显示Graph、更改和文件。设备入口独立保留，不按布局隐藏worktree信息。
- 复用 Dashboard、Graph、Summary、Description、Commit、Submit、Presence 等现有文案。圆形远程操作图标带中文无障碍名称；危险操作明确确认，不依靠颜色解释含义。
- 系统字体支持Dynamic Type；文件路径、设备名、错误和分支允许换行，提交号使用等宽字体。触控目标至少44pt，保留滚动和系统键盘安全区。
- Git修改、编辑器未保存、未推送和离线为独立事实。编辑器没有来源时显示“编辑器未接入”；失联显示“状态未知”，不沿用“在线/干净”。协议只公开worktree标识，不显示虚构绝对路径。
