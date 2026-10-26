---
title: 推送版本标签后自动签名打包并发布桌面更新
type: CI
status: in-progress
importance: p0
emergency: p1
created-time: 2026-10-26
tags:
  - release
  - github-actions
---

# Description

用户要求像必乐App一样由GitHub完成发布：在准备发布的分支提交上推送版本标签，即自动构建、macOS Developer ID签名、Apple公证、Windows x86/x64打包、上传正式Release并更新现有应用更新源。

- [x] 发布触发由main分支推送改为`vMAJOR.MINOR.PATCH`标签推送；版本来自标签，构建精确标签提交。
- [x] 支持标签提交不在main；保留远端标签校验、不可覆盖正式版本与防止版本倒退。
- [x] Windows构建从同一标签加载工作流，产物来源仍核对精确提交。
- [x] 标签发布只在main写入固定Windows更新清单，不合并发布分支或改写main源码版本。
- [x] 查明旧Actions在准备依赖后失败：八份上游Markdown链接的已有格式化差异未登记来源校验；保留原上游摘要并增加精确文档补丁摘要。
- [x] 必要静态检查与标签来源回归通过：3项标签回归、2份YAML解析、发布脚本语法、3895份上游来源文件校验与diff空白检查。
- [ ] 仓库Actions凭据配置齐备：Tauri updater与Apple API三项已保存；Developer ID Application P12已由钥匙串导出，P12与导出密码的GitHub录入待完成。
- [x] 发布配置提交并推送：`b302ed1cb2e3d0d04c59c0aba233ca3b0350304a`；对应macOS与Windows云端来源/类型/测试/构建均通过。
- [ ] 真实标签触发、签名公证、三平台发布与公共更新回读通过。

不纳入当前工作区其他任务的忽略文件功能改动，不将实验分支自行合并到main；不操作用户安装版。

# Comments

## 20261026-151248_Codex_GPT-6.1-Sol

按用户当前要求改为推送版本标签后正式发布，不再由普通main推送触发。支持不在main上的轻量/附注标签；版本取自标签，Windows使用同标签工作流；再次校验远端标签并拒绝版本倒退。更新清单继续写入main固定公开路径，标签发布不合并来源分支或改写main源码版本。

旧Actions失败于文档链接格式化后未登记的8份上游Markdown摘要，已核对均为相对链接规范化并登记精确文档补丁，原始上游摘要和代码校验保留。3项标签回归（包含真实隔离Git仓库中的非main提交、附注标签、被移动标签拒绝）、YAML解析、语法与来源检查通过。Edge已登录GitHub，仓库仅有Tauri updater密钥；Apple/Developer ID凭据录入及真实标签发布待完成。当前并行忽略文件改动未纳入。

[执行对话](codex://threads/01a1663d-c20c-73c2-a046-f8409db545d7)

## 20261026-154623_Codex_GPT-6.1-Sol

发布触发与来源校验提交`b302ed1cb2e3d0d04c59c0aba233ca3b0350304a`已推送main，云端验证[40286264748](https://github.com/DDonlien/git-together/actions/runs/40286264748)的macOS与Windows来源检查、类型检查、测试和构建均成功。Edge中已保存Apple Key ID、Issuer ID和私钥，新增开发者权限密钥可读取既有0.37.0的Accepted公证记录；P12及导出密码的GitHub保存仍待本人完成。

进一步核对发现旧版本覆盖没有进入Desktop的构建常量、Material版本比对与最终运行时package.json，已补齐同一标签版本在这些位置的传递。保留源码版本供普通开发使用，不修改标签源文件。版本覆盖与更新器回归8项通过、标签来源3项通过、前后端TypeScript通过、3895份来源文件和90处精确补丁校验通过。当前共享adapter中的忽略文件改动仅保留在工作区，提交只包含版本常量这一处修改。

[执行对话](codex://threads/01a1663d-c20c-73c2-a046-f8409db545d7)
