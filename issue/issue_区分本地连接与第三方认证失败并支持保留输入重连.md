---
title: 区分本地连接与第三方认证失败并支持保留输入重连
id: IMPORT-10
原聚合 ID: '`IMPORT-native-browser`。'
type: CONTENT
status: 阻塞（沿用原需求记录）。
版本管理: Git。
来源: '`REQUIREMENTS.md` @ `28d96a4ecc63fe9e1024151ad3f43630c83a879b`；标题路径：任务清单 / Phase - v0.1.0 - 独立 TypeScript 客户端 / codex/standalone-ts: 账号与仓库导入（0.2.0–0.3.2）。'
拆分前原稳定 ID: '`IMPORT-native-browser`, `IMPORT-native-browser-live`, `IMPORT-01`, `IMPORT-02`, `IMPORT-02-repository-authentication`, `IMPORT-02-repository-access`, `IMPORT-02-git-auth-lifecycle`, `IMPORT-02-git-auth-lifecycle-source`, `IMPORT-02-git-native-remote`, `IMPORT-02-git-auth-lifecycle-runtime`, `IMPORT-02-edit`, `IMPORT-02-edit-remove`, `IMPORT-02-edit-remove-test`, `IMPORT-02-edit-test`, `IMPORT-03`, `IMPORT-04`, `IMPORT-04-worktrees`, `IMPORT-04-directory-display`, `IMPORT-04-directory-display-test`, `IMPORT-04-worktrees-test`, `IMPORT-04-account-batch`, `IMPORT-04-account-batch-feedback`, `IMPORT-04-account-batch-performance`, `IMPORT-04-account-batch-test`, `IMPORT-04-inline`, `IMPORT-04-path-hover`, `IMPORT-04-association-refresh`, `IMPORT-04-stale-worktrees`, `IMPORT-04-stale-branch-notices`, `IMPORT-04-open-folder`, `IMPORT-04-discovery-boundary`, `IMPORT-04-discovery-boundary-release`, `IMPORT-04-picker`, `IMPORT-04-picker-test`, `IMPORT-05`, `IMPORT-06`, `IMPORT-08`, `IMPORT-08-test`, `IMPORT-09`, `IMPORT-09-test`, `IMPORT-10`, `IMPORT-10-test`, `IMPORT-11`, `IMPORT-11-token-refresh`, `IMPORT-11-windows-oauth-port`, `IMPORT-11-connect`, `IMPORT-11-browser`, `IMPORT-11-native-keychain`, `IMPORT-11-native-keychain-test`, `IMPORT-11-native-keychain-live`, `IMPORT-11-browser-local`, `IMPORT-11-browser-local-code`, `IMPORT-11-browser-local-csp`, `IMPORT-11-browser-local-csp-test`, `IMPORT-11-browser-network`, `IMPORT-11-browser-network-test`, `IMPORT-11-browser-progress`, `IMPORT-11-browser-progress-test`, `IMPORT-11-browser-return`, `IMPORT-11-browser-live`, `IMPORT-11-secret`, `IMPORT-11-secret-persistence`, `IMPORT-11-secret-persistence-test`, `IMPORT-11-secret-persistence-live`, `IMPORT-11-browser-rebind`, `IMPORT-11-browser-rebind-test`, `IMPORT-11-ready`, `IMPORT-11-ready-test`, `IMPORT-11-callback-document`, `IMPORT-11-callback-document-test`, `IMPORT-11-callback-document-live`, `IMPORT-11-callback-feedback`, `IMPORT-11-callback-feedback-test`, `IMPORT-11-callback-feedback-live`, `IMPORT-11-secret-entry`, `IMPORT-11-secret-rotation`, `IMPORT-11-test`, `IMPORT-12`, `IMPORT-12-branch-behavior`, `IMPORT-12-branch-behavior-gitea`, `IMPORT-12-branch-behavior-created`, `IMPORT-12-branch-behavior-import`, `IMPORT-12-branch-behavior-import-test`, `IMPORT-12-branch-behavior-account`, `IMPORT-12-branch-behavior-activity-content`, `IMPORT-12-branch-behavior-activity-content-test`, `IMPORT-12-branch-behavior-account-test`, `IMPORT-12-update-settings`, `IMPORT-12-test`, `IMPORT-13`, `IMPORT-13-repository-pin`, `IMPORT-13-status-header`, `IMPORT-13-branches`, `IMPORT-13-branches-test`, `IMPORT-13-branches-folder`, `IMPORT-13-branches-folder-test`, `IMPORT-13-branches-motion`, `IMPORT-13-main`, `IMPORT-13-test`, `IMPORT-13-owner`, `IMPORT-13-owner-test`, `IMPORT-14`, `IMPORT-14-last-divider`, `IMPORT-14-last-divider-test`, `IMPORT-14-grouped-actions`, `IMPORT-14-header-alignment`, `IMPORT-14-header-alignment-runtime`, `IMPORT-14-header-count-corner`, `IMPORT-14-production-submit`, `IMPORT-14-submit-refresh-pause`, `IMPORT-14-submit-refresh-pause-test`, `IMPORT-14-submit-generation-job`, `IMPORT-14-submit-generation-job-test`, `IMPORT-14-production-submit-runtime`, `IMPORT-14-push-lfs-errors`, `IMPORT-14-submit-popup`, `IMPORT-14-submit-summary-only`, `IMPORT-14-submit-popup-width`, `IMPORT-14-windows-lfs-commit`, `IMPORT-14-commit-timeout-headless`, `IMPORT-14-submit-popup-production`, `IMPORT-14-submit-popup-h5`, `IMPORT-14-submit-ai`, `IMPORT-14-header-text`, `IMPORT-14-download-icon`, `IMPORT-14-grouped-icons`, `IMPORT-14-grouped-refinement`, `IMPORT-14-grouped-h5`, `IMPORT-14-branch-name-alignment`, `UI-04-repository-reveal`, `IMPORT-14-inline`, `IMPORT-14-number-ignore`, `IMPORT-14-read-badges`, `IMPORT-14-read-health-scope`, `IMPORT-14-read-badges-test`, `IMPORT-14-read-failure-live`, `IMPORT-14-check-cycle`, `IMPORT-14-change-trigger`, `IMPORT-14-zero-badges`, `IMPORT-14-diagnostics`, `IMPORT-14-performance`, `IMPORT-14-performance-source`, `IMPORT-14-performance-runtime`, `IMPORT-14-diagnostics-copy`, `IMPORT-14-diagnostics-test`, `IMPORT-14-operation-semantics`, `IMPORT-14-branch-download`, `IMPORT-14-branch-download-layout`, `IMPORT-14-branch-download-layout-test`, `IMPORT-14-operation-semantics-test`, `IMPORT-14-visible`, `IMPORT-14-hide`, `IMPORT-14-hide-counts`, `IMPORT-14-hide-header-count`, `IMPORT-14-operation-execution`, `IMPORT-14-operation-collapse`, `IMPORT-14-operation-collapse-icons`, `IMPORT-14-feedback`, `IMPORT-14-action-names`, `IMPORT-14-action-names-test`, `IMPORT-14-feedback-test`, `IMPORT-14-number-ignore-test`, `IMPORT-14-test`, `IMPORT-15`, `IMPORT-15-test`, `IMPORT-16`, `IMPORT-16-provider-budget`, `IMPORT-16-refresh-priority`, `IMPORT-16-provider-budget-source`, `IMPORT-16-provider-budget-diagnosis`, `IMPORT-16-provider-budget-validation`, `IMPORT-16-test`, `IMPORT-17`, `IMPORT-17-completeness`, `IMPORT-17-completeness-test`, `IMPORT-17-completeness-live`, `IMPORT-17-consistency`, `IMPORT-17-metadata`, `IMPORT-17-test`, `IMPORT-17-visibility`, `IMPORT-17-visibility-test`, `IMPORT-17-live`, `IMPORT-18`, `IMPORT-18-shell`, `IMPORT-18-shell-test`, `IMPORT-18-test`, `IMPORT-18-revert`, `IMPORT-18-revert-test`, `IMPORT-07`, `IMPORT-07-package`, `IMPORT-07-package-test`；不改写或重编号这些既有 ID。'
拆分前标题: 'codex/standalone-ts: 账号与仓库导入（0.2.0–0.3.2）。'
原稳定 ID: '`x`、`IMPORT-10`、`IMPORT-10-test`；保留既有编号与完成状态。'
拆分状态说明: 状态 property 沿用原聚合记录；本文件各 checkbox 为该目标的真实状态，未重新验收。
updated-time: '2026-10-24T16:22:34+00:00'
---

# Description

## 当前需求与范围
- [x] \[IMPORT-10] 区分本地服务连接失败、超时、静态托管不支持和第三方认证失败；添加账号前检查本地连接，失败可重新连接且保留输入。服务会话重启后不把旧 revision 当作新会话的最新状态；旧客户端/服务版本不一致时明确提示刷新。
  - [x] \[IMPORT-10-test] 只读测试验证本地服务、GitHub 身份与仓库读取；回归覆盖断连/超时/重试/会话重启/版本不一致，不记录或持久化用户测试 token。当前本地 API HTTP 200；旧截图断连未复现，不认定服务退出为根因；源码/服务测试不替代浏览器目视。

## 检查与验收边界

以上勾选与结果沿用迁移前的当前需求文档；历史记录中的实现、测试、编译、视觉与用户验收彼此独立。本次只迁移文档并检查结构 / 引用，没有重新执行产品构建或用户验收，也没有凭历史日志新增完成勾选。


## 拆分关联

本次从同一旧迁移 Issue 按独立交付目标整理；同一目标的实现、依赖与验收子项保留在一起。

- [统一Electron与GitHub网页授权入口并完善等待与重试流程](issue_%E7%BB%9F%E4%B8%80Electron%E4%B8%8EGitHub%E7%BD%91%E9%A1%B5%E6%8E%88%E6%9D%83%E5%85%A5%E5%8F%A3%E5%B9%B6%E5%AE%8C%E5%96%84%E7%AD%89%E5%BE%85%E4%B8%8E%E9%87%8D%E8%AF%95%E6%B5%81%E7%A8%8B.md)
- [建立独立账号设置页并精简说明与版本号布局](issue_%E5%BB%BA%E7%AB%8B%E7%8B%AC%E7%AB%8B%E8%B4%A6%E5%8F%B7%E8%AE%BE%E7%BD%AE%E9%A1%B5%E5%B9%B6%E7%B2%BE%E7%AE%80%E8%AF%B4%E6%98%8E%E4%B8%8E%E7%89%88%E6%9C%AC%E5%8F%B7%E5%B8%83%E5%B1%80.md)
- [安全保存账号凭据并避免暴露给渲染进程与localStorage](issue_%E5%AE%89%E5%85%A8%E4%BF%9D%E5%AD%98%E8%B4%A6%E5%8F%B7%E5%87%AD%E6%8D%AE%E5%B9%B6%E9%81%BF%E5%85%8D%E6%9A%B4%E9%9C%B2%E7%BB%99%E6%B8%B2%E6%9F%93%E8%BF%9B%E7%A8%8B%E4%B8%8ElocalStorage.md)
- [读取账号全部可访问仓库并立即显示在侧栏](issue_%E8%AF%BB%E5%8F%96%E8%B4%A6%E5%8F%B7%E5%85%A8%E9%83%A8%E5%8F%AF%E8%AE%BF%E9%97%AE%E4%BB%93%E5%BA%93%E5%B9%B6%E7%AB%8B%E5%8D%B3%E6%98%BE%E7%A4%BA%E5%9C%A8%E4%BE%A7%E6%A0%8F.md)
- [在Dashboard关联验证并管理已有本地仓库目录](issue_%E5%9C%A8Dashboard%E5%85%B3%E8%81%94%E9%AA%8C%E8%AF%81%E5%B9%B6%E7%AE%A1%E7%90%86%E5%B7%B2%E6%9C%89%E6%9C%AC%E5%9C%B0%E4%BB%93%E5%BA%93%E7%9B%AE%E5%BD%95.md)
- [移除添加仓库与演示场景的旧入口和模拟运行逻辑](issue_%E7%A7%BB%E9%99%A4%E6%B7%BB%E5%8A%A0%E4%BB%93%E5%BA%93%E4%B8%8E%E6%BC%94%E7%A4%BA%E5%9C%BA%E6%99%AF%E7%9A%84%E6%97%A7%E5%85%A5%E5%8F%A3%E5%92%8C%E6%A8%A1%E6%8B%9F%E8%BF%90%E8%A1%8C%E9%80%BB%E8%BE%91.md)
- [区分本地连接与第三方认证失败并支持保留输入重连](issue_%E5%8C%BA%E5%88%86%E6%9C%AC%E5%9C%B0%E8%BF%9E%E6%8E%A5%E4%B8%8E%E7%AC%AC%E4%B8%89%E6%96%B9%E8%AE%A4%E8%AF%81%E5%A4%B1%E8%B4%A5%E5%B9%B6%E6%94%AF%E6%8C%81%E4%BF%9D%E7%95%99%E8%BE%93%E5%85%A5%E9%87%8D%E8%BF%9E.md)
- [按用户标注调整Dashboard仓库行与搜索筛选布局](issue_%E6%8C%89%E7%94%A8%E6%88%B7%E6%A0%87%E6%B3%A8%E8%B0%83%E6%95%B4Dashboard%E4%BB%93%E5%BA%93%E8%A1%8C%E4%B8%8E%E6%90%9C%E7%B4%A2%E7%AD%9B%E9%80%89%E5%B8%83%E5%B1%80.md)
- [通过心跳前台恢复与联网事件更新真实仓库状态](issue_%E9%80%9A%E8%BF%87%E5%BF%83%E8%B7%B3%E5%89%8D%E5%8F%B0%E6%81%A2%E5%A4%8D%E4%B8%8E%E8%81%94%E7%BD%91%E4%BA%8B%E4%BB%B6%E6%9B%B4%E6%96%B0%E7%9C%9F%E5%AE%9E%E4%BB%93%E5%BA%93%E7%8A%B6%E6%80%81.md)
- [按组织本地状态类型与可见性筛选仓库](issue_%E6%8C%89%E7%BB%84%E7%BB%87%E6%9C%AC%E5%9C%B0%E7%8A%B6%E6%80%81%E7%B1%BB%E5%9E%8B%E4%B8%8E%E5%8F%AF%E8%A7%81%E6%80%A7%E7%AD%9B%E9%80%89%E4%BB%93%E5%BA%93.md)
- [为Dashboard制作JetBrains Ring UI试用外观](issue_%E4%B8%BADashboard%E5%88%B6%E4%BD%9CJetBrains%20Ring%20UI%E8%AF%95%E7%94%A8%E5%A4%96%E8%A7%82.md)

原文件的共用上下文及完整既有 Comments 仅保留在[首个任务](issue_%E7%BB%9F%E4%B8%80Electron%E4%B8%8EGitHub%E7%BD%91%E9%A1%B5%E6%8E%88%E6%9D%83%E5%85%A5%E5%8F%A3%E5%B9%B6%E5%AE%8C%E5%96%84%E7%AD%89%E5%BE%85%E4%B8%8E%E9%87%8D%E8%AF%95%E6%B5%81%E7%A8%8B.md)，来源与历史没有删去。

# Comments

## 20261024-070820_Agent

原记录标题：2026-10-24 07:08:20 UTC — Agent（纠正迁移命名）

按任务原语言改为 `issue_区分本地连接与第三方认证失败并支持保留输入重连.md`；类型、旧 ID、来源、历史与原状态保留。实施提交未核实，省略版本后缀；本轮仅核对文档内容与直接引用。 本文件承接原聚合目标中的相关范围；全部拆分目标见“拆分关联”，完整既有 Comments 保存在首个任务。

原记录未提供完整 Agent / 模型详情及原执行会话链接，未补造。

## 20261024-162234_Codex

按用户最新手写模板迁移属性和正文结构，保留任务语义、来源、原始状态及历史内容；本次未重新执行业务验收。

原版本关联记录（照录来源，不将本次文档迁移提交当作业务实施提交）：
- 实施提交：未核实（未取得与本文件具体范围直接对应且已核实的实施提交；来源快照、当前 HEAD 与迁移提交不替代业务实施版本，故省略文件名版本后缀）。

本次执行环境未提供具体模型标识，未补造 Model-Detail。

[本次文档迁移对话](codex://threads/01a157b3-610c-73b4-ae06-163c0f8490d3)
