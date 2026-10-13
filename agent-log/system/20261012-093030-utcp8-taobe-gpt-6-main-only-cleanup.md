# main 分支核对与清理

- 用户原始 prompt：确认一下最近的、最新的改动都在 main，然后远端和本地删除 main 以外的分支
- 模型：GPT-6。运行时只提供此标识，未提供更精确版本。
- 开始时间：2026-10-12 09:04:45 UTC+8（首次时钟核对）。
- 开始分支与提交：main，c971a86f6814fc342f9ec4356ebc474278451852；工作区codex-standalone-ts。执行中其他任务推进至6fa089a1055536bfd06313bd5107835cf2e7a9f0。
- 结束时间：2026-10-12 09:30:30 UTC+8。
- 提交/推送：本任务未创建代码提交；已执行用户授权的origin分支删除。治理记录仍在main工作区，其他任务的进行中改动未被代为提交。

## 上下文及确认

- 阅读当前AGENTS、README、RUN-01-main-delivery及旧工作区Git边界；远端agent-template与当前通用前缀一致。只操作用户DDonlien/git-together的origin，不向GitButler来源仓库发送写入。
- 真正main位于codex-standalone-ts。main目录的git-together/main及desktop-overview-split工作区停留在2026-08-22旧实现；二者状态干净。
- 初始origin抓取仅配置四个分支，不能由默认fetch/prune推断远端分支已完整核对。已显式刷新全部origin heads并读取ls-remote：实际686个heads，远端默认main，仓库isFork=false。
- 近期origin refs仅main及codex/standalone-ts；后者fcc93b344a已是main祖先。main/origin/main差异0/0，最近头像、Windows、Presence及发布提交均在main。第三方旧upstream缓存有10月GitButler提交，与独立客户端范围无关，不能为表面合并状态复活旧代码。
- 主工作区有其他任务正在编辑的未提交文件，均在main工作区，完整保留；单独发布快照目录只有main且干净，不在共享repo引用清理时改动它。
- 当前仅origin为已配置远端；另有717条旧upstream本地缓存引用。计划恢复备份后，原子删除685个origin heads，删除两个本地旧分支，清理缓存并收敛origin抓取配置。

## 执行与验证

- 执行前登记RUN-01-main-only；仅限定用户origin/本地分支，主工作区及所有其他任务文件保持原位。
- 创建完整Git bundle及删除前引用/工作区清单。首次SHA计算使用当前Python不支持的file_digest，未执行任何删除；改为分块SHA-256后重新核对bundle和所有待删引用覆盖。
- 备份：`/Users/taobe/Projects/GitHub/Personal/git-together/_backups/main-only-20261012-sisz_fso/before.bundle`，237184679字节，SHA-256为`39b45ce93d545c5036454b03a35716d2c914a0b1b6a30dce37275fb3a6684676`。bundle verify通过，全部685个待删远端及2个本地引用均与备份提交号一致。清单、私有删除日志及最终verification.json同目录，目录0700、文件0600。
- 远端删除采用一次atomic push，每个ref带期望提交号校验，只发送`:refs/heads/...`删除项，明确排除main。685条删除全部成功，ls-remote实际heads仅main；默认分支仍main。
- origin抓取由四个具体分支收敛为`+refs/heads/main:refs/remotes/origin/main`，避免已删除ref导致后续fetch失败。两个旧工作区只用no-deref更新HEAD为原提交，未检出文件或改动索引；清洁状态及原SHA在变更后均核对。
- 删除本地desktop/overview-split和git-together/main；手动事务清理1399条残留跟踪引用（含旧upstream缓存），push已自动清理3条匹配旧抓取映射的引用。origin/HEAD继续指向origin/main，最终本地heads仅main，远端跟踪只剩origin/main及其HEAD别名。
- 最终已刷新origin，main/origin/main/实际远端main均为532da7a47c799c2bc6036b8a37799903460dd47b，ahead/behind为0/0。删除前清单中所有10月GitTogether提交tip均为main祖先，删除前main也被保留；旧工作区原提交与干净文件状态保持。
- 主工作区最终核对时有54条未提交/未跟踪记录，包含其他任务持续编辑和本任务治理记录，均保留在main工作区，不能当作已推送。没有提交这些进行中内容或操作其应用逻辑。
- 更新当前AGENTS的工作区说明及RUN-01-main-only完成状态。此次为Git元数据维护，未更改应用版本、构建/安装包或公开Release；未运行应用测试，不操作用户安装版。没有向第三方来源仓库发送写入。
