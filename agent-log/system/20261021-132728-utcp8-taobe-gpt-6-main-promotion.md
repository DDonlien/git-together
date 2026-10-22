# GitHub Desktop 版本合并为 main

- 用户原始 prompt：
  > 把现在的这个版本合并到 MAIN 并提交吧，现在的版本很好；之前的 MAIN 反正有 GIT 记录作为保存；简单的直接 GIT MERGE 应该能处理大部分问题，甚至直接把现在的作为 MAIN 都可以
- 模型：GPT-6（当前环境只暴露家族标识）。
- 开始时间：2026-10-21 13:22:51 +08:00。
- 结束时间：2026-10-21 13:27:28 +08:00。
- 目标：将已认可的 github-desktop-based 433ae99073a125b03f45bd5ebe0153c37db95671 合并并提交到 main；没有请求推送、打包或发布。
- 基准：原main dfe04f0525cf178284c4bfeb26238fe5f1b656c7（产品0.34.4），github-desktop-based 0.36.4；fetch后两个分支与各自origin一致。共同祖先949f7ebc456dc6bf8f5812e971de2d5b60100c56，各有两个独有提交。
- 主工作树存在上一任务28文件的已验证失效分支提示修复，先保存为a1a883a727本地提交（0.34.5），防止合并覆盖；原分支工作树干净。

## 成功标准与上下文

- 使用真正main工作树；先普通merge，保留两边提交历史和原main引用。冲突以用户认可的Desktop执行基础为准，兼容必要的主线界面改动；不恢复旧Tauri/Git执行链。
- 阅读主/分支及macos AGENTS、DESKTOP-01、来源锁、开发/执行边界、此前合并记忆与本次上一任务日志。
- 不改写GitHub Desktop的Git、认证、凭据、Dispatcher或后台行为；来源校验、类型、当前有效回归和构建通过后完成main合并提交。
- 不操作已安装应用、真实账号或用户仓库；不推送或发布本次未授权的远端变更。

## 对话与行动

1. 用户明确允许把目前认可版本合并或作为main，取代分支文档中“不得自行合并”的旧范围。
2. 核对工作树、上游、共同祖先与差异；fetch --prune只更新origin追踪信息。
3. 上一任务已经通过类型/Cargo、构建与隔离Git/界面验证，按当前提交授权保存为独立a1a883a727。

## 验证与提交

- 合并和验证进行中。

4. main归档引用refs/archive/main-before-desktop-20261021-132219指向a1a883a727，普通git merge --no-ff --no-commit产生6文件冲突：DESIGN、macos版本/锁文件、import-model、ui、use-workspace。逐项兼容解决，产品有效版本采用0.36.4；账户头像/显示名称、限流字段、仓库使用记录、Warning与可关闭Notice均保留。账户自动刷新继续尊重Desktop后端保护条件。
5. 未改写上游Git/授权/凭据或后台；npm run verify:upstream已确认3895文件、68项允许的展示/身份差异。把已有Desktop CI触发分支扩为main和原分支，根README/ARCHITECTURE/开发文档说明当前main入口。
6. 旧main的0.34.5修复依赖已停用Tauri服务，Desktop桥未提供对应问题记录/清理命令；本次只保留源码和历史，不宣称已移植。正式发布链也保持开发版边界，自动更新仍不可用。
7. Node默认26.3.0超出根engines支持范围；后续最终检查/测试/构建使用已安装的Node22。仅复用原工作树已有的两组node_modules只读依赖，main输出与Presence编译缓存保持独立。

## 最终验证与结果

- Node22.23.2运行根npm run check：两层TypeScript与Presence Cargo --locked检查通过；首次Node26预检也通过，但最终证据采用受支持Node22。
- 根npm test：25/25通过，包含模型传输/取消、加密Presence存储、上游执行边界与原版对话框控制器校验；没有使用用户仓库或真实平台凭据。
- 根npm run build：通过。前端339模块、约883kB主JS；Desktop各webpack目标编译成功，完整可运行目录生成于main/desktop/out，含Git/LFS、Presence和本地界面。没有生成安装包或重启任何用户应用。
- 来源锁再次验证3895文件、68项允许差异，desktop/整个源码树和来源锁与433ae99073完全一致。
- 完整导入差异的git diff --cached --check报告432项原有空白警告，与949f7ebc..github-desktop-based基线完全相同；新增警告0。为保持上游来源一致，不清理既有vendor/license文件。针对合并解决及主线保留改动的git diff --check github-desktop-based通过，冲突条目清零。
- 构建提示保留：Vite大chunk；Webpack报告器解析import.meta失败但编译成功；版本JSON具名导入的两条预告；上游依赖URL弃用提示。它们未阻止构建，没有将这些提示写成运行失败或原生验收通过。
- 当前产品0.36.4（根、界面、Desktop app、Presence一致）。旧Tauri的0.34.5只是保留历史路径，不作为当前产品版本来源。
- 依赖链接仅存在本地，不进入Git；仓库本地exclude排除这两个node_modules链接。main的构建输出和Cargo缓存独立，原github-desktop-based工作树保持433ae99073且干净。
- 更新需求DESKTOP-01-main-promotion，更新根README/ARCHITECTURE、docs/development、docs/github-desktop-based及现有Desktop CI触发分支。
- 提交状态：本次创建普通双亲合并提交，两个父提交为a1a883a727（旧main与先前修复）和433ae99073（用户认可版本）；精确合并提交号以包含本日志的main HEAD为准。
- 没有push、强制改写、删除原分支、打包、正式发布或操作安装版。正式更新与Tauri失效分支清理的Desktop接入仍待后续范围，不能宣称已交付。
