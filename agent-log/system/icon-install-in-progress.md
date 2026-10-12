# GitTogether 品牌图标实装

- 用户原始prompt：`实装到我们的仓库和应用本身`。
- 模型：gpt-6，运行环境没有暴露更细的可靠型号后缀。
- 起始目录：codex-standalone-ts，main，532da7a47c；首个时钟采样2026-10-12 09:24:43 UTC+8。
- 开始工作区版本0.24.0；执行期间其他任务改动版本到0.25.0。本轮保护工作区及其他任务的暂存内容，发布版本按实际已提交main单独分配。
- 结束时间：执行中；本轮提交/推送/发布：待完成。
- 需求ID：CONTENT-01-icon-install，继承CONTENT-01-icon-selected-exports。

## 上下文与范围

- 阅读当前用户选定图、两张导出PNG、根/macOS规则、发布脚本与Windows原生构建上下文。通用source版本仍v1.9.1-260916-010202。
- 当前原生图标仍是Electron占位图；HTML没有favicon；SidebarHeader显示品牌文字，保留32px展开/收起按钮和收起状态。
- MEMORY.md仅用于定位Tauri正式发布及Windows平台验收边界，实际流程与状态重新核对；当前脚本已要求Mac/Windows x86/x64联合发布。
- 用户持续授权自动main提交/推送、公证及正式发布，保留不操作已安装GitTogether的约定。
- 其他任务正在修改远程控制、性能、授权和文档。本轮只提交图标及必要入口、源图、版本与文档，从干净的已提交main镜像打包，保留主工作区状态。

## 实施与行动记录

1. 将选定的圆角、正方形和透明图形保存为可追踪的品牌原图。
2. 使用官方Tauri图标工具派生ICNS/ICO/各尺寸PNG；macOS沿用圆角版，Windows及favicon使用正方形版。
3. SidebarHeader品牌文字前加入24px图标，保留原收起按钮、32px行高和隐藏品牌组的逻辑；HTML接入favicon。
4. 后续执行检查、已提交源码构建、图标包资源检查、main推送、Mac签名公证与Windows两架构构建、公共更新资产回读。

## 验证与交付

- 选定圆角原图SHA256为32da699b322ea96d800ddd15f7163935a334569a88e2eea9a20638e893bc5f7d；正方形为7596a9d53fd8530d349c838e296a0a3d676c80f02eac70b878311c8fbe03376c；透明图形为992a0e53e1e60919713fd83e3d3995df07bdead8278feef3bd2ae8b86db7bc8e。源文件逐字节复制，未重绘。
- 官方Tauri CLI 2.12.1生成ICNS16–1024/retina、ICO16/24/32/48/64/256、PNG32/128/256/512；native托盘复用default_window_icon，因此同一品牌PNG覆盖托盘入口。
- 干净main镜像在ee4c087316基线上分配0.25.1。TypeScript检查、284模块Vite生产构建、Cargo --locked检查和diff检查均通过；构建保留原有大chunk提示。
- 隔离静态浏览器实测亮暗主题品牌图标加载、24px图标、32px侧栏开关、收起隐藏和展开恢复；favicon进入构建。保存JPEG截图artifacts/brand-install/sidebar-brand-light.jpg。隔离页无账号/API，仅验收本轮品牌；没有将其当作真实Git或账号功能验收。
- 未运行自动测试或操作安装版。Mac/Windows x86/x64最终签名、公证与公共更新源回读仍待发布流程完成。
- 同步README品牌入口、DESIGN品牌规范、REQUIREMENTS稳定ID；完成后按实际结束时间归档。
