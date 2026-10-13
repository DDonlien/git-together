# 唯一分支的仓库创建参与识别

- 用户原始prompt：「默认隐藏‘我没有修改过的分支’这个功能，没有识别到‘创建’这个行为；如果一个仓库只有一个分支，且这个分支是我创建的，应该不进未修改过隐藏的范围，看看附件这个仓库的例子」。附件FreshLi4/case-pending，Gitea访问账号Taobe，只有默认main，尚未关联。
- 模型：gpt-6；当前环境仅提供这个最具体标识。
- 开始：2026-10-13 17:24:31 UTC+8；结束：2026-10-13 17:54:45 UTC+8。
- 需求：IMPORT-12-branch-behavior-created。最新用户要求补充此前提交作者条件；创建仓库及其唯一分支也视为参与。
- 主目录容器本身不是Git仓库；共享工作区codex-standalone-ts/main，HEAD 00959e0188fcba7bfec666b685e6d1fdaaf8d3b9，fetch/prune后origin/main aaa9962f0cd464e4251804cc8e55a7996b5d5c57，落后4条且存在其他任务大量未提交差异。保留索引和所有无关文件，在最新origin/main的独立main副本完成本任务，之后只同步本任务改动。
- 根/macOS AGENTS、需求、README和ARCHITECTURE已读。模板远端通用版本仍v1.9.1-260916-010202；本次不修改规则，不运行旧后台自动化测试，不操作已安装应用。
- 现有branchHiddenEntries只识别hasAccountCommits。Gitea创建活动的act_user是实际操作者；user_id是接收人，repo.owner是所属组织或用户，均不能替代创建者。官方契约：https://docs.gitea.com/api/operations/repo-list-activity-feeds/；源定义：https://github.com/go-gitea/gitea/blob/main/modules/structs/activity.go。
- 成功标准：创建者的唯一分支保留；明确其他创建者且无本账号提交可按原默认隐藏；创建证据不明保留可见；多分支维持原条件；显式隐藏、恢复及本地脏/未推送保护不变；有限请求与五分钟缓存；类型、Rust及生产构建通过，并区分受控场景与真实私人仓库/安装版验收。

## 实现与验证

- Rust新增account_created_repository，只在hide、完整唯一分支且没有本人提交时查询。先校验仓库remoteId和created_at，再按UTC创建日期读取Gitea活动；找到同仓库create_repo的act_user.login才返回明确创建结果。默认模式、多分支及已有本人提交不增加活动请求。成功创建结果账号/仓库内存缓存五分钟，十页100条上限；未知作为participationError/warning返回。
- RepositoryTask/远端DTO新增可选hasAccountCreation，提交字段不冒充创建参与。branchHiddenEntries保留创建者、唯一分支的未知创建身份、参与错误、本地dirty/未推送，以及显式恢复；手动hiddenEntries仍优先。设置说明和架构/README同步。
- 最新独立main 0.30.2：npm run check、npm run check:rust（locked）、npm run build通过。前端只新增设置说明改动；后续正式入口会再核对最终源。未新增/运行旧自动化套件。
- 实际Rust Provider.workspace有限localhost取样15种：本人创建、他人创建、账号大小写、缺记录、403、无效格式、缺操作者、错误仓库活动、错误metadata仓库、无效日期、第二页创建记录、十页上限、多分支、本人提交、默认不核对。15份输出均通过生产DTO校验；未知保留，明确其他创建者唯一分支按规则隐藏，多分支沿用原作者条件。
- 使用生产branchHiddenEntries核对手动隐藏、显式恢复、本地dirty、未推送HEAD、旧DTO缺少创建字段及default模式，结果符合预期；字符串创建值被DTO拒绝。Provider请求记录：本人创建连续3次刷新只读取活动1次；本人提交、多分支、default各0次；分页2次、上限10次。
- 生产App隔离页面开启隐藏后，本人创建main继续显示；明确其他创建者隐藏，未知记录main显示并有warning；浏览器手动隐藏/恢复循环成功。另一独立origin偏好仅开启隐藏、无手动恢复覆盖，main仍可见，截图：/Users/taobe/.codex/visualizations/2026/10/09/01a1214e-32cb-7e51-866b-953305f8e8f3/branch-created-preview.png。此为受控数据，不冒称真实私人仓库或安装版验收。
- FreshLi4/case-pending匿名API返回not found；现存4174有限读端点返回404，未进入真实账户边界，没有导出凭据、重启服务或操作安装版。本次实际创建者识别按官方契约与受控数据验收；唯一分支未知保留保证旧记录缺失不再造成自动隐藏。
- 8个本任务源码/文档改动已按唯一锚点同步到共享工作文件。REQUIREMENTS/ARCHITECTURE有其他任务并发改动，均保留；索引、共享HEAD、0.32.1版本清单和其他任务文件均未改变。发布使用独立main 0.30.2，后续状态待核验。

- 首次63b2f16a推送因main并发前进至0f0185b498被正常拒绝；独立干净main rebase成功，保留已提交的GitHub令牌刷新改动，不改共享工作区的索引/HEAD。上游已使用0.30.2，正式候选递增至0.30.3；之前0.30.2源码/受控验证仍按实际版本保留记录，最终版本另行核对。
- 共享工作区类型检查通过；其版本由其他任务并发变为0.32.2，本任务未修改该清单。独立发布副本移至容器内release-main-branch-created-9kf67r35以沿用共享_builds发布锁和缓存；临时浏览器/fixture服务已关闭。

## 最终交付与发布限制

- 最终源码提交b7fa5dbca810a3fa1dfc120f82ca95999b152365已普通推送main；保留上游0f0185b498令牌刷新实现，四份版本清单均0.30.3。无force push、reset/clean或安装版操作。
- rebase后的0.30.3 npm类型及生产构建通过；移动独立副本导致一次Rust缓存引用旧临时路径失败，只清理本任务副本的生成target后，locked Cargo检查通过（27.76秒）。最终生产Provider取样15种及客户端派生规则再次确认，活动调用仍为1/0/0/0/2/10；未运行旧自动化套件。
- 正式package:desktop入口在共享发布锁处停止，锁owner声明0.30.2/0f0185b498/github-token-refresh，未移除或占用另一任务的锁。为后续入口准备的本任务等待器后经PID79984、命令、cwd和无子进程核对被停止；未留下延迟发布动作或操作其他服务。
- 本任务分别只读核对默认与明确login.keychain-db的gittogether-notary profile，两次均exit69、No Keychain password item found；用户keychain列表只包含login。没有创建新公证凭据、修改Keychain、索取/导出密码、绕过公证或请求解锁。
- 0.30.3未产生新正式安装包、tag、Release或更新源；现有安装版未改动。源码/受控页面完成与生产发布配置阻塞分别记录，不把编译或截图等同私人账号/安装版验收。不重复询问同一个公证配置问题，其他任务正在处理对应缺失。
