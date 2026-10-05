# GitTogether

一个从零实现的 TypeScript 多仓库工作台。0.2.0 从账号导入开始：设置连接账号，Dashboard 读取可访问仓库，再逐一关联已有本地 Git 目录。

这是独立的 `codex/standalone-ts` 分支，与原 GitButler fork 没有共同历史。支持 GitHub、指定域名的 Gitea 和同一 host 的多个账号。账号按令牌权限读取仓库；本地目录通过弹窗验证远端是否匹配。侧栏只显示各账号已关联的本地仓库。

桌面版使用系统安全存储加密保存账号与令牌；本地浏览器预览的账号只保存在服务会话里，重启服务后需要重新连接。localStorage 只保存外观与账号折叠偏好，不保存令牌。账号初始为空，没有内置场景/模拟数据。已有本地仓库可以只读查看真实更改、Diff 与最近历史，不自动克隆，不执行暂存、提交、拉取或推送；AI、Agent 与 Presence 在线连接尚未实现。

界面参照用户提供的 Wireframes v0.1 和系统设置截图：共享窗口背景、四周内缩的悬浮导航、无阴影的平面内容分组。采用系统字体与统一 OpenGlass UI 控件；Electron 在受支持的 macOS 上使用原生玻璃背景，React 控件本身不是 AppKit 原生控件。

```bash
cd macos
npm install
npm run dev -- --port 4173 --strictPort
npm run desktop
```

开发入口和验证说明见 [运行说明](docs/development.md)，页面行为见 [需求](REQUIREMENTS.md)，材质层次见 [视觉规范](DESIGN.md)，数据边界见 [架构](ARCHITECTURE.md)。
