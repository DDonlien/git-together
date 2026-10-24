# 提供Presence独立账号注册登录与退出重登

- ID：`COLLAB-02-presence-account`。
- 原聚合 ID：`COLLAB-03-automatic-management`。
- 类型：`UI`。
- 状态：阻塞（沿用原需求记录）。
- 版本管理：Git。
- 实施提交：未核实（未取得与本文件具体范围直接对应且已核实的实施提交；来源快照、当前 HEAD 与迁移提交不替代业务实施版本，故省略文件名版本后缀）。
- 来源：`REQUIREMENTS.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`；标题路径：GitTogether 独立实现需求 / Presence账号与商业边界（2026-10-12）。
- 拆分前原稳定 ID：`COLLAB-03-automatic-management`, `COLLAB-03-settings`, `COLLAB-03-settings-spacing`, `COLLAB-03-settings-spacing-test`, `COLLAB-03-settings-spacing-release`, `COLLAB-03-identity`, `COLLAB-03-repository-ui`, `COLLAB-03-repository-icon`, `COLLAB-03-repository-icon-test`, `COLLAB-03-repository-icon-release`, `COLLAB-03-control`, `COLLAB-03-source`, `COLLAB-03-runtime`, `COLLAB-02-presence-account`, `COLLAB-02-source`, `COLLAB-02-password-length`, `COLLAB-02-commercial`, `COLLAB-02-organization-boundary`；不改写或重编号这些既有 ID。
- 拆分前标题：Presence账号与商业边界（2026-10-12）。
- 原稳定 ID：`COLLAB-02-presence-account`、`x`、`COLLAB-02-source`、`COLLAB-02-password-length`；保留既有编号与完成状态。
- 拆分状态说明：状态 property 沿用原聚合记录；本文件各 checkbox 为该目标的真实状态，未重新验收。


## 当前需求与范围
- [ ] \[COLLAB-02-presence-account] 按用户“补上”要求提供Presence独立账号注册/登录，账号管理、退出和重新登录；个人仓库及设备自动登记，密码修改仅在Web（COLLAB-03取代旧手工绑定/改密码入口）；原生端加密会话且不回传凭证。个人Docker只有一个账号，不提供组织空间；托管组织仅控制明确纳管项目。邮箱/密码首轮已接源码，GitHub/Gitea平台网页登录与跨平台身份绑定仍另行跟踪COLLAB-01-platform-login。真实用户注册和双设备Git写操作，以及正式客户端三平台发布分别验收，本项不以编译替代用户验收。
  - [x] \[COLLAB-02-source] 0.28.0账号设置及Rust有限命令已随66ace84推送main；当前工作区与隔离任务源码的TypeScript、Cargo --locked及生产构建通过。GitPresence 0.5.0已实际部署NAS，账号页面与注册开放状态HTTP200、容器healthy；个人镜像已构建且不含组织模块和源码映射。没有代用户注册或运行测试，真实双设备Git操作、正式客户端三平台包、官网镜像下载及收费服务仍待交付。
  - [x] \[COLLAB-02-password-length] 按用户2026-10-12要求，Presence注册和修改密码均接受至少8个字符，不强制字符组合；应用设置字段的提示和最短长度与网页、服务端一致。0.28.2为客户端源码修订，不在本轮发布安装包或操作已安装应用；线上网页以实际部署回读为准。 已通过仅本任务源码的TypeScript检查和生产构建；安装包另行交付。

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

按任务原语言改为 `issue_提供Presence独立账号注册登录与退出重登.md`；类型、旧 ID、来源、历史与原状态保留。实施提交未核实，省略版本后缀；本轮仅核对文档内容与直接引用。 本文件承接原聚合目标中的相关范围；全部拆分目标见“拆分关联”，完整既有 Comments 保存在首个任务。
