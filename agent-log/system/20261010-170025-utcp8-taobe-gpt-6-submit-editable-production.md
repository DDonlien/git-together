# Submit可编辑说明接入实际客户端

- 用户原始 prompt：可以的实现
- 执行者：taobe；模型：gpt-6。环境只暴露该标识，未推测更细型号。
- 开始：2026-10-10 17:00:25 UTC+8；结束：2026-10-10 17:12:40 UTC+8。
- 工作目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts；分支main，HEAD 95527b84055ffe54bf7032ec8fed8f27d9ca5ea7。
- 需求：IMPORT-14-submit-popup / IMPORT-14-submit-popup-production。

## 当前依据与范围

- 用户已确认H5：每个分支自己的可编辑Summary / Description，内容自动预填，完整文件清单和一个统一提交按钮，无AI说明标签、步骤或分支切换。
- 已读取更新的production-submit日志；0.20.0已提供真实AI/Commit/Push接口，但Submit弹窗显示只读消息，草稿关闭即丢失。本轮只调整实际弹窗与草稿生命周期，保留既有执行链路和并行改动。
- 当前main与origin/main在fetch --prune后ahead/behind为0/0；模板source版本v1.9.1-260916-010202与本地一致。
- 不增加或运行测试，不构建/打包，不提交/推送源码，不对用户仓库执行AI或Git写入。类型检查、源码检查与实际AI/Git执行验收分别记录。

## 实施与验证

- RepositoryActionDialog：Submit移除只读Summary/Description消息底板，所有目标直接显示Summary单行必填与Description多行可选字段、分支图标和完整文件清单；没有AI说明标签、生成步骤、分支切换或额外确认。准备状态使用「正在准备提交内容…」。
- App内增加RepositoryActionDraftsProvider，共享会话内Map按repositoryId/branch/path隔离草稿；关闭弹窗、筛选和切页不清空。相同HEAD/changeKey复用已生成内容；新快照重新准备未编辑字段，编辑字段（包括用户清空的Description）保留。
- 生成回写读取最新字段修改标记，取消后丢弃迟到结果；所有目标生成完成且摘要非空才启用统一确认。确认沿用逐分支onCommit，传入最终draft，再onPush；Commit成功清除该分支草稿，Push失败保留已创建Commit及原重试逻辑。字段编辑更新待Commit UUID，避免修改内容仍复用旧请求身份。
- 样式限制为该弹窗：500px共享外宽、22px圆角、24px内缩、细边框编辑字段、字段和文件一起滚动，确认区保持在滚动区外；灵活缩小内容区给错误/准备状态留位置。
- package.json权威版本及package-lock两处根版本由0.20.0升为0.20.1，patch用于修正已接入Submit的编辑/草稿和视觉行为；无新增接口、依赖或存储格式。同步REQUIREMENTS/DESIGN/ARCHITECTURE/README。
- npm run check在0.20.0和最终0.20.1两次通过；git diff --check通过，版本一致性检查通过。未增加或运行测试，不构建/打包，不执行真实AI、Git Commit/Push，不提交/推送源码。
- 版本热更新后主预览已为0.20.1，授权助手仍0.20.0；核对4173/4174的工作目录和统一入口父子进程归属、Catalog确认为0账号/0仓库/0关联后，按现有自动就绪授权SIGTERM关闭本项目dev.ts统一入口，重新npm run dev，会话29653保留。
- 最终主服务和授权助手均0.20.1，助手configured=true已恢复加密应用配置，主instanceId=6482c71e-b10f-4454-9c82-b7dea809dabb；未读取或重放账号凭据。实际IAB打开4173呈现正常空账号Dashboard，控制台error/warn为空；4186已认可H5标签保留。
- 当前真实预览没有账号，未观察实际Submit弹窗的编辑/保留交互或真实AI/Git全链路。源码实现、H5视觉和真实执行分开记录，运行验收由IMPORT-14-production-submit-runtime继续追踪。
- 保留所有并行未提交修改，不重置、不暂存、不归属或提交其他对话的工作。
