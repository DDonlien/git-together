# 发布包含Presence的GitTogether桌面更新并保留跨平台要求

- ID：`PRESENCE-04-release`。
- 原聚合 ID：`PRESENCE-01-plugin`。
- 类型：`DOC`。
- 状态：进行中（原文同时包含已完成与未完成项）。
- 版本管理：Git。
- 实施提交：未核实（未取得与本文件具体范围直接对应且已核实的实施提交；来源快照、当前 HEAD 与迁移提交不替代业务实施版本，故省略文件名版本后缀）。
- 来源：`REQUIREMENTS.md` @ `28d96a4ecc63fe9e1024151ad3f43630c83a879b`；标题路径：任务清单 / Phase - v0.23.0 - Presence 插件与首个服务器 / presence/main: 接入真实团队协作状态。
- 拆分前原稳定 ID：`PRESENCE-01-plugin`, `PRESENCE-02-state`, `PRESENCE-03-nas`, `PRESENCE-04-release`；不改写或重编号这些既有 ID。
- 拆分前标题：presence/main: 接入真实团队协作状态。
- 原稳定 ID：`PRESENCE-04-release`；保留既有编号与完成状态。
- 拆分状态说明：状态 property 沿用原聚合记录；本文件各 checkbox 为该目标的真实状态，未重新验收。


## 当前需求与范围
- [ ] \[PRESENCE-04-release] 发布包含 Presence 的 GitTogether 0.23.0 桌面更新。2026-10-12 新增 RUN-01-windows-policy 要求下一次正式版同一源码/版本同时交付 macOS、Windows x86 与 x64；当前 Windows 原生适配和双架构安装包尚未完成，因此本轮未运行会直接公开仅 macOS 资产的既有发布入口，0.23.0 尚未正式发布。正式交付仍须复用签名/公证、核验三平台安装包及公共更新源，不操作用户安装版。

## 检查与验收边界

以上勾选与结果沿用迁移前的当前需求文档；历史记录中的实现、测试、编译、视觉与用户验收彼此独立。本次只迁移文档并检查结构 / 引用，没有重新执行产品构建或用户验收，也没有凭历史日志新增完成勾选。


## 拆分关联

本次从同一旧迁移 Issue 按独立交付目标整理；同一目标的实现、依赖与验收子项保留在一起。

- [通过Presence插件订阅并展示真实团队协作状态](issue_%E9%80%9A%E8%BF%87Presence%E6%8F%92%E4%BB%B6%E8%AE%A2%E9%98%85%E5%B9%B6%E5%B1%95%E7%A4%BA%E7%9C%9F%E5%AE%9E%E5%9B%A2%E9%98%9F%E5%8D%8F%E4%BD%9C%E7%8A%B6%E6%80%81.md)
- [在NAS部署独立GitPresence服务并验证Bridge通信](issue_%E5%9C%A8NAS%E9%83%A8%E7%BD%B2%E7%8B%AC%E7%AB%8BGitPresence%E6%9C%8D%E5%8A%A1%E5%B9%B6%E9%AA%8C%E8%AF%81Bridge%E9%80%9A%E4%BF%A1.md)
- [发布包含Presence的GitTogether桌面更新并保留跨平台要求](issue_%E5%8F%91%E5%B8%83%E5%8C%85%E5%90%ABPresence%E7%9A%84GitTogether%E6%A1%8C%E9%9D%A2%E6%9B%B4%E6%96%B0%E5%B9%B6%E4%BF%9D%E7%95%99%E8%B7%A8%E5%B9%B3%E5%8F%B0%E8%A6%81%E6%B1%82.md)

原文件的共用上下文及完整既有 Comments 仅保留在[首个任务](issue_%E9%80%9A%E8%BF%87Presence%E6%8F%92%E4%BB%B6%E8%AE%A2%E9%98%85%E5%B9%B6%E5%B1%95%E7%A4%BA%E7%9C%9F%E5%AE%9E%E5%9B%A2%E9%98%9F%E5%8D%8F%E4%BD%9C%E7%8A%B6%E6%80%81.md)，来源与历史没有删去。

## Comments

### 2026-10-24 07:08:20 UTC — Agent（纠正迁移命名）

按任务原语言改为 `issue_发布包含Presence的GitTogether桌面更新并保留跨平台要求.md`；类型、旧 ID、来源、历史与原状态保留。实施提交未核实，省略版本后缀；本轮仅核对文档内容与直接引用。 本文件承接原聚合目标中的相关范围；全部拆分目标见“拆分关联”，完整既有 Comments 保存在首个任务。
