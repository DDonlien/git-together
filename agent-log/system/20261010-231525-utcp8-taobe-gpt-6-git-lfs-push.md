# Push错误去重与Git LFS工具查找

- 用户原始prompt：那就修复这两个问题吧，错误提示只保留一处并统一样式，App 要能找到本机已安装的 Git LFS，修好后自动推送、打包发布。
- 模型：gpt-6；运行环境仅暴露此标识，没有可验证的更具体版本。执行者：taobe。
- 开始：2026-10-10 23:15:25 UTC+8；结束：进行中；是否提交：尚未。
- 启动目录：codex-standalone-ts；main；HEAD 6f1a64aeb5；已发布0.21.0，工作区有其他对话待交付0.21.1 UI改动。
- 需求：IMPORT-14-push-lfs-errors；RUN-01-update-pipeline。

## 上下文与成功标准

- 阅读根/macOS AGENTS、需求、源码和近期日志；source v1.9.1-260916-010202通用规则一致，fetch后main与origin/main为0/0。保留并行字段字号、表头角标与文档改动，只归属本任务变更。
- 前一轮已确认：弹窗内层catch把同一失败存入分支条目，外层catch又存入弹窗错误，分别用普通文字及Notice显示。从Finder启动的App仅有系统PATH，已安装LFS位于用户.local/bin，标准pre-push钩子的可用性检查退出2。此次不重复操作已安装应用，不替用户推送其工作目录。
- 成功标准：每次失败只显示一个共享Notice，仍可辨认失败分支；最小Finder环境中真实Git钩子及Git LFS命令找到工具；实际生产界面失败/重试验证和回归通过；main推送、Developer ID签名、公证和完整公共更新校验完成。
- 复用既有gittogether-notary及GitHub配置，不触发安装/启动/替换/重启用户已安装GitTogether。

## 行动记录

- 正在实施统一错误来源与共享Git工具搜索路径。

- 实施完成：删除分支错误副本及内层重复catch，唯一Notice保留失败仓库/分支；两个Git执行入口共用子进程PATH补齐，已知LFS错误使用固定安全提示和有限诊断分类。
- 类型检查、36/36相关回归和生产构建通过；Finder最小PATH的未修复真实临时Push复现失败，修复后找到私有用户目录LFS测试工具并执行真实pre-push/Push。另用实际本机Git LFS执行version，在最小PATH下经正式Git执行入口读到3.7.1，无用户仓库或远端写入。生产构建仅保留既有大chunk警告。
- 另一个已授权字号补丁正在隔离干净main快照构建0.21.1；当前任务先完成验收，后续发布独立补丁版本，避免重用版本或同时占用发布锁。

- 23:25–23:27：生产App/HTTP配真实隔离Git的双分支Submit，首分支已Commit后由受控pre-push失败中止；弹窗role=alert恰为1，class=notice error，文本包含仓库/失败分支。恢复实际LFS钩子，在最小Finder PATH下两分支各执行真实本机3.7.1 pre-push，最终均推送成功；每分支总Commit数为2（初始1+本次1），无重复Commit，两目录干净、远端Summary一致，控制台无error/warn。AI说明为确定性隔离fixture，本轮不再验证真实AI。截图artifacts/push-lfs-errors/single-error.png，临时服务与仓库收尾清理。
- Sites4/4及差异检查通过。继0.21.1独立字号补丁，递增patch至0.21.2，因为本次修复错误呈现与既有Git工具环境，不新增能力；同步package/lock根版本和README当前来源。

- 全套505/505产品回归通过，0.21.2再次类型检查通过。只归属本任务代码、补丁版本及对应文档段落，不将并行表头改动混入提交。
