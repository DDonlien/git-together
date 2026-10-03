# GitTogether

一个从零实现的 TypeScript 多仓库工作台。Dashboard 聚合仓库与本地工作目录，仓库界面把文件选择、Diff、提交表单和历史放在一个连续的工作流里。

这是独立的 `codex/standalone-ts` 分支，与原 GitButler fork 没有共同历史。当前可运行版本使用本地演示数据：页面操作会改变演示状态并保存到本机，尚未连接真实 Git、AI 或 Presence。

界面参照用户提供的 Wireframes v0.1 和系统设置截图：共享窗口背景、四周内缩的悬浮导航、无阴影的平面内容分组。采用系统字体与统一 OpenGlass UI 控件；Electron 在受支持的 macOS 上使用原生玻璃背景，React 控件本身不是 AppKit 原生控件。

```bash
cd macos
npm install
npm run dev -- --port 4173 --strictPort
npm run desktop
```

开发入口和验证说明见 [运行说明](docs/development.md)，页面行为见 [需求](REQUIREMENTS.md)，材质层次见 [视觉规范](DESIGN.md)，数据边界见 [架构](ARCHITECTURE.md)。
