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
- [x] 仓库Actions六项凭据已齐备并按名称回读确认；API私钥已验证可读取既有Accepted公证任务，云端P12导入、Developer ID身份与公证凭据验证均通过。
- [x] 发布配置提交并推送：`b302ed1cb2e3d0d04c59c0aba233ca3b0350304a`；对应macOS与Windows云端来源/类型/测试/构建均通过。
- [ ] 真实标签触发、签名公证、三平台发布与公共更新回读通过。

不纳入当前工作区其他任务的忽略文件功能改动，不将实验分支自行合并到main；不操作用户安装版。

# Comments

## 20261026-151248_Codex_GPT-6.1-Sol

按用户当前要求改为推送版本标签后正式发布，不再由普通main推送触发。支持不在main上的轻量/附注标签；版本取自标签，Windows使用同标签工作流；再次校验远端标签并拒绝版本倒退。更新清单继续写入main固定公开路径，标签发布不合并来源分支或改写main源码版本。

旧Actions失败于文档链接格式化后未登记的8份上游Markdown摘要，已核对均为相对链接规范化并登记精确文档补丁，原始上游摘要和代码校验保留。3项标签回归（包含真实隔离Git仓库中的非main提交、附注标签、被移动标签拒绝）、YAML解析、语法与来源检查通过。Edge已登录GitHub，仓库仅有Tauri updater密钥；Apple/Developer ID凭据录入及真实标签发布待完成。当前并行忽略文件改动未纳入。

[执行对话](codex://threads/01a1663d-c20c-73c2-a046-f8409db545d7)

## 20261026-155757_Codex_GPT-6.1-Sol

六项Actions Secrets已按名称与更新时间回读确认，敏感值由用户在Edge本人录入。版本传播修复提交`30dfc52bff`已通过普通合并`d7b798de65d11cbcfdf44956dc6bb27d55c11276`与并行远端修复整合并推送；共享工作区的忽略文件修改未进入这些提交。

合并后的Windows云端测试发现新worktree fixture使用`realpathSync`仍保留8.3短路径，而Git输出长路径，三项直接路径比较失败。改为用`realpathSync.native`建立fixture根和核对清理根，仍保留真实路径、bare/prunable与Git对象保护断言；本机4项回归通过。发布前使用此修复，避免测试误判阻止三平台发布。

[执行对话](codex://threads/01a1663d-c20c-73c2-a046-f8409db545d7)

## 20261026-154623_Codex_GPT-6.1-Sol

发布触发与来源校验提交`b302ed1cb2e3d0d04c59c0aba233ca3b0350304a`已推送main，云端验证[40286264748](https://github.com/DDonlien/git-together/actions/runs/40286264748)的macOS与Windows来源检查、类型检查、测试和构建均成功。Edge中已保存Apple Key ID、Issuer ID和私钥，新增开发者权限密钥可读取既有0.37.0的Accepted公证记录；P12及导出密码的GitHub保存仍待本人完成。

进一步核对发现旧版本覆盖没有进入Desktop的构建常量、Material版本比对与最终运行时package.json，已补齐同一标签版本在这些位置的传递。保留源码版本供普通开发使用，不修改标签源文件。版本覆盖与更新器回归8项通过、标签来源3项通过、前后端TypeScript通过、3895份来源文件和90处精确补丁校验通过。当前共享adapter中的忽略文件改动仅保留在工作区，提交只包含版本常量这一处修改。

[执行对话](codex://threads/01a1663d-c20c-73c2-a046-f8409db545d7)

## 20261026-160822_Codex_GPT-6.1-Sol

真实标签`v0.38.2`指向`7ccffa403b57f630373f77bc3930bbdb78ca3ad9`，已成功触发[云端发布40289155778](https://github.com/DDonlien/git-together/actions/runs/40289155778)。六项凭据检查、P12导入、Developer ID身份与Apple公证凭据验证成功；尚未生成或公开新Release。生产构建失败于上游build.ts在DESKTOP_SKIP_PACKAGE=1时仍执行其专用setup-macos-keychain，尝试导入不存在的上游APPLE_APPLICATION_CERT。

将上游证书准备限制于实际启用上游打包时；GitTogether的独立正式打包继续使用工作流已导入的证书并严格签名、公证。已登记精确来源补丁，实际条件节点在16种环境组合的执行检查、3895份来源校验、7项后台边界检查与diff检查通过。保留失败标签来源不移动，修复后使用新标签v0.38.3继续真实发布。并行忽略文件改动未纳入。

[执行对话](codex://threads/01a1663d-c20c-73c2-a046-f8409db545d7)

## 20261026-162528_Codex_GPT-6.1-Sol

修复`ec941da92cd8055abe04a2750649e2125d689b35`的macOS与Windows常规云端检查、测试与构建均通过；标签`v0.38.3`触发[发布40290272166](https://github.com/DDonlien/git-together/actions/runs/40290272166)。真实Developer ID签名、严格校验、Apple公证Accepted（860000c4-ea9d-471d-9f34-cd643b9dfec2）、staple/validate、Gatekeeper和ZIP解压后校验均通过，macOS ZIP与tar已在Runner生成。隔离原生后台12组检查成功，但提交说明检查仍假设打开弹窗就自动生成，等待正文得到空值而停止，尚未触发Windows打包或公开Release。

当前界面和既有commit-draft-store回归明确规定打开草稿不自动请求模型。检查脚本改为点击现有“AI 生成说明”、等待实际生成状态后编辑，退出按钮使用当前“关闭”；保留手工草稿、真实HEAD/index/远端不变等原断言，不修改应用行为。7项草稿模型回归、脚本语法与diff检查通过。使用新标签v0.38.4继续完整发布验证。

[执行对话](codex://threads/01a1663d-c20c-73c2-a046-f8409db545d7)

## 20261026-170225_Codex_GPT-6.1-Sol

v0.38.4来源`e3dcedf7e080837df6de0545abe1673f54875662`的[主发布40292250892](https://github.com/DDonlien/git-together/actions/runs/40292250892)已通过macOS签名、公证Accepted（a5784a43-13fd-4f0c-88a7-4a2021aae854）、staple/validate、归档回读、原生后台/提交草稿/仓库发现检查，并自动调度[Windows发布40293922590](https://github.com/DDonlien/git-together/actions/runs/40293922590)，x86与x64打包及隔离安装/原生验证均成功。主任务回读两架构产物来源一致，三个更新包的签名生成与独立校验成功。

尚未公开Release：升级检查的finally在删除私有profile时抛ENOTEMPTY，并遮住了检查本身的错误。检查代码同时会在Squirrel重启实例仍占用profile时启动第二个使用该profile的实例。改为记录受控测试实例PID、确认其退出后再打开升级结果；cleanup等待拥有的子进程关闭、关闭测试HTTP连接，并对系统目录忙/ENOTEMPTY有限重试；catch先记录检查原始错误，避免再次被清理异常掩盖。不降低升级/配置保留/签名断言，不操作用户安装版。实际退出等待函数已用真实独立Node子进程验证存活、超时与退出三种结果；语法与diff通过。新标签v0.38.5继续完整验证，前述失败版本标签不移动。

[执行对话](codex://threads/01a1663d-c20c-73c2-a046-f8409db545d7)

## 20261026-171000_Codex_GPT-6.1-Sol

在本地既有0.37.0正式包的隔离临时副本上实际运行修复后的smoke-updates，完整成功：0.33.0签名升级安装、Squirrel签名桌面替换和重启、等待测试实例退出、生产更新桥、私有profile与测试工作文件保留均为true，进程退出码0。未启动或改动用户安装版，也未构建新产品包；该结果验证检查脚本修复，不能冒称尚未发布的0.38.5升级通过。

[执行对话](codex://threads/01a1663d-c20c-73c2-a046-f8409db545d7)
