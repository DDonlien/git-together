# 明确GitTogether开源与GitPresence个人部署和组织付费边界

- ID：`COLLAB-02-commercial`。
- 原聚合 ID：`COLLAB-03-automatic-management`。
- 类型：`UI`。
- 状态：阻塞（沿用原需求记录）。
- 版本管理：Git。
- 实施提交：未核实（未取得与本文件具体范围直接对应且已核实的实施提交；来源快照、当前 HEAD 与迁移提交不替代业务实施版本，故省略文件名版本后缀）。
- 来源：`REQUIREMENTS.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`；标题路径：GitTogether 独立实现需求 / Presence账号与商业边界（2026-10-12）。
- 拆分前原稳定 ID：`COLLAB-03-automatic-management`, `COLLAB-03-settings`, `COLLAB-03-settings-spacing`, `COLLAB-03-settings-spacing-test`, `COLLAB-03-settings-spacing-release`, `COLLAB-03-identity`, `COLLAB-03-repository-ui`, `COLLAB-03-repository-icon`, `COLLAB-03-repository-icon-test`, `COLLAB-03-repository-icon-release`, `COLLAB-03-control`, `COLLAB-03-source`, `COLLAB-03-runtime`, `COLLAB-02-presence-account`, `COLLAB-02-source`, `COLLAB-02-password-length`, `COLLAB-02-commercial`, `COLLAB-02-organization-boundary`；不改写或重编号这些既有 ID。
- 拆分前标题：Presence账号与商业边界（2026-10-12）。
- 原稳定 ID：`COLLAB-02-commercial`、`COLLAB-02-organization-boundary`；保留既有编号与完成状态。
- 拆分状态说明：状态 property 沿用原聚合记录；本文件各 checkbox 为该目标的真实状态，未重新验收。


## 当前需求与范围
- [ ] \[COLLAB-02-commercial] 用户商业方向：GitTogether开源，GitPresence源码private，官网分发单账号个人Docker，NAS单独托管付费组织服务。账号代表用户，组织用独立ID、成员关系、项目纳管和命令范围隔离；客户端不以可修改的UI标志作为授权。GitPresence当前已private、GitTogether为public，但GitTogether尚未选择和加入开源许可证；官网Docker下载、Web组织管理源码本轮完成，组织计费和正式收费服务尚未上线。
  - [ ] \[COLLAB-02-organization-boundary] 自有Presence组织独立维护，不与GitHub/Gitea组织一一对应，不因Git平台存在组织、用户属于该组织或具有管理员权限而自动创建Presence组织、加入成员或授予控制权。管理员明确选择纳管项目，可涵盖不同平台及不同外部组织的仓库；未纳管仓库仍可按个人账号使用。未来GitHub/Gitea账号绑定只关联身份及仓库访问，不自动继承组织角色。COLLAB-03已补Web管理及双ownership校验，真实跨组织权限验收仍待完成。

## 检查与验收边界

以上勾选与结果沿用迁移前的当前需求文档；历史记录中的实现、测试、编译、视觉与用户验收彼此独立。本次只迁移文档并检查结构 / 引用，没有重新执行产品构建或用户验收，也没有凭历史日志新增完成勾选。


## 拆分关联

本次从同一旧迁移 Issue 按独立交付目标整理；同一目标的实现、依赖与验收子项保留在一起。

- [让Presence按个人身份自动纳管可访问仓库](issue_%E8%AE%A9Presence%E6%8C%89%E4%B8%AA%E4%BA%BA%E8%BA%AB%E4%BB%BD%E8%87%AA%E5%8A%A8%E7%BA%B3%E7%AE%A1%E5%8F%AF%E8%AE%BF%E9%97%AE%E4%BB%93%E5%BA%93.md)
- [提供Presence独立账号注册登录与退出重登](issue_%E6%8F%90%E4%BE%9BPresence%E7%8B%AC%E7%AB%8B%E8%B4%A6%E5%8F%B7%E6%B3%A8%E5%86%8C%E7%99%BB%E5%BD%95%E4%B8%8E%E9%80%80%E5%87%BA%E9%87%8D%E7%99%BB.md)
- [明确GitTogether开源与GitPresence个人部署和组织付费边界](issue_%E6%98%8E%E7%A1%AEGitTogether%E5%BC%80%E6%BA%90%E4%B8%8EGitPresence%E4%B8%AA%E4%BA%BA%E9%83%A8%E7%BD%B2%E5%92%8C%E7%BB%84%E7%BB%87%E4%BB%98%E8%B4%B9%E8%BE%B9%E7%95%8C.md)

原文件的共用上下文及完整既有 Comments 仅保留在[首个任务](issue_%E8%AE%A9Presence%E6%8C%89%E4%B8%AA%E4%BA%BA%E8%BA%AB%E4%BB%BD%E8%87%AA%E5%8A%A8%E7%BA%B3%E7%AE%A1%E5%8F%AF%E8%AE%BF%E9%97%AE%E4%BB%93%E5%BA%93.md)，来源与历史没有删去。

## Comments

### 2026-10-24 07:08:20 UTC — Agent（纠正迁移命名）

按任务原语言改为 `issue_明确GitTogether开源与GitPresence个人部署和组织付费边界.md`；类型、旧 ID、来源、历史与原状态保留。实施提交未核实，省略版本后缀；本轮仅核对文档内容与直接引用。 本文件承接原聚合目标中的相关范围；全部拆分目标见“拆分关联”，完整既有 Comments 保存在首个任务。
