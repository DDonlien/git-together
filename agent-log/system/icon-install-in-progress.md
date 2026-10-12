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

## 已提交源码与发布进行中

- 2026-10-12 10:45 UTC+8：图标提交48f19f0c18a9524f25ebaa27eb2313d86a8303e8已推送origin/main，GitHub API回读一致。只推进自身27个文件；主目录其他工作文件与暂存内容保留，正在开发的0.27.0版本未进入本轮包。
- 版本0.25.1在干净main镜像release-main-brand-fly4zgg1中构建；Windows工作流38197037620以同一source_commit启动，x86/x64原生构建进行中。
- macOS输出_builds/gittogether-0.25.1-macos-arm64-WklHwh：Developer ID签名、严格校验、staple/validate和spctl通过，notarytool返回Accepted，公证ID1d6f693c-7f34-4034-9667-38e6dc66c1a0。最终Tauri tar的更新签名、版本和解压结构验证通过。
- 包内CFBundleIconFile=icon.icns，与本轮生成文件逐字节相同；SHA256=35ccc37cb1e6b61ebe43dd5535149b12c801b4ec42043aec14321dcafa892a78，主程序目录仅有gittogether，版本与bundleId核对通过。
- 静态预览重载后显示0.25.1，24px品牌图标加载成功、32px开关与favicon核对一致；测试页颜色方案恢复跟随系统。
- 尚未发布正式Release；须等待两种Windows安装包及公共回读全部完成。

## 发布故障与恢复

- 首轮Windows任务38197037620：x64已经生成0.25.1安装器，但Cargo缓存中留有旧版安装器，数量断言失败；详见artifacts/brand-install/windows-x64.log。x86同一任务最终也失败。
- Windows状态读取曾遇GitHub API TLS handshake timeout，原package:desktop在收集阶段停止；已验证的Mac产物保留，未创建正式tag或Release。
- main中其他任务已经提交e644c9ac5b，打包前只清理当前架构生成的NSIS缓存输出。本轮复用该修复，不重复覆盖；再补上只读GitHub API暂时网络故障的最多三次重试，派发和下载不重放。
- 修改后的隔离main TypeScript检查通过。继续以未公开的0.25.1版本、同一个最终main提交重新执行三平台完整打包流程，不混用不同commit的构建报告。
