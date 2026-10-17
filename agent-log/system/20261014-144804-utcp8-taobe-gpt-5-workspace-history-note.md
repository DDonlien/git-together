# 仓库工作台历史说明移除

- 用户原始prompt：「移除这行字」，截图文字为「每个分支当前读取最近50条提交；图线只使用真实父节点…」。
- 模型：gpt-5；当前环境未暴露更精确版本，使用可得的最具体标识。
- 任务开始：2026-10-14 UTC+8；最早明确记录的预检时间为14:45:16。验证完成时间：14:48:04。
- 基准：codex-standalone-ts / main / 7220f0d5a3abb8afedaed3c34b60a93c2bd851b3。当前未提交源码版本0.33.1，由其他在途任务准备；不覆盖其版本改动，不独立打包。
- Git预检：fetch/prune后main相对origin/main为ahead 5 / behind 4；没有自动merge、rebase或推送，保留当前工作目录、索引及所有并行任务改动。
- 已读：当前根/macOS AGENTS、相关README/DESIGN/REQUIREMENTS/ARCHITECTURE、近期图谱操作日志、RepositoryView及远端warning来源。在线模板版本仍为v1.9.1-260916-010202。
- 需求：R-05-gitlens-graph-history-note。

## 实现与边界

只在RepositoryView呈现warnings时排除以「每个分支当前读取最近 」开头的历史说明，避免旧读取结果或保留快照继续显示该行。其他warning、数据、历史读取、加载更多和图谱逻辑不变；不产生空段落。补充DESIGN与需求记录。

## 验证与交付

npm run check、npm run build及git diff --check通过。构建保留既有约775KB的大chunk提示，没有新增构建错误。4173实际返回的RepositoryView模块含新warning过滤逻辑；未将模块回读当作真实账号页面或安装版验收。

按当前仓库约定不新增或运行测试；不操作用户已安装GitTogether，不重启现有4173/4174服务，不重新授权或读取凭据。当前任务只交付源码，提交/推送均未执行，未发布或更新安装包。修改只包含RepositoryView的一处呈现过滤、对应需求与DESIGN条目及本日志；其他在途功能及其0.33.1版本改动保留。
