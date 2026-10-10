# 最近功能检查与完整更新交付

- 用户请求：检查最近对话的功能是否都好了，好了的话推送打包，让我能更新到。
- 范围确认：用户选择补齐Pull、Get Latest、Clean和后台实际Git fetch后再发布。
- 执行者：taobe；模型：gpt-6（未推测更细型号）。
- 开始：2026-10-10 17:25:47 UTC+8；当前检查记录：2026-10-10 19:06:14 UTC+8；交付结束时间待实际发布完成后补记。
- 根目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts；main；起始HEAD95527b84055ffe54bf7032ec8fed8f27d9ca5ea7。
- 阅读根及macos规则，模板v1.9.1-260916-010202一致；只读最近相关对话，未发送消息、重置或丢弃并行改动。
- 需求：RUN-01-recent-delivery、IMPORT-14-operation-execution、IMPORT-14-production-submit-runtime、IMPORT-14-header-alignment-runtime。

## 实施与实际验证

- 新增有限fetchRepository/prepareSync/applySync/discardSync，服务保存十分钟预览并绑定账号、任务、HEAD/refs/index/文件指纹；路径/凭据均由保存关联确定，不接受渲染器命令、远端或token。按common Git目录队列串行后台fetch与写入，账号变化和迟到结果复核。
- Pull只ff并补齐LFS；Clean按已核验远端恢复/补齐/删除全部差异（含ignored），HEAD/index保持；Get Latest核验depth1快照与当前LFS后再替换并实际删除独占旧对象/历史缓存，未推送提交及共享主目录拒绝，linked worktree独立化且保护其它目录历史。嵌套仓库/子模块和现有index锁拒绝，不跟随外部符号链接。
- 前端五组/六Git图标、范围固定、具体路径预览、一次确认、失败停止、重新预览未完成目录；Reconcile和手动Fetch已移除，后台真实fetch沿用五分钟、读取反馈/数量保留及退避。
- 初审481/469/12失败均旧UI契约；修正最新六动作/表头/官方字段断言。最终0.21.0类型、501/501全套、Sites4/4、生产构建与差异检查通过；新增18项真实Git/LFS及Codex错误分类回归。日志/tmp/gittogether-021-*.log，非版本资产。
- 生产App隔离真实双分支Submit手工修改重开保留、各自Commit→Push；发现后台fetch抢锁实际导致Push失败并修复等待队列，重验远端各自说明成功。中栏Commit只选中main，历史仅Push，确认推送显示已在远端。
- 真实Codex请求首次401，正常CLI配置探测成功；移除忽略用户配置参数，保留空私有目录、禁用工具/hooks/plugins及有限schema、源上下文/返回后复核。真实AI双分支生成→手工编辑→单一确认Commit→Push成功，远端main为更新README文本（已核对），feature为新增feature.txt文本文件（已核对），完整正文相符，两目录干净。
- Pull预览并ff补齐真实远端文件；过期预览如实拒绝并重新预览成功；Clean实际移除临时额外文件；linked Get Latest实际count1/shallow true，其他主目录count3保留。单独18回归证明独占对象/历史LFS实际删除、失败/共享/未推送保护。
- 实际表头与胶囊中心1167/1239/1296/1380一致；图标pointer；侧栏32px上下padding0。800×588实际窄视口弹窗与底部按钮在视口内，官方M3shadow字段正常，暗色截图在ignored artifacts/release-audit。
- 临时QA服务和renderer关闭，临时Git已删除，未写用户仓库。版本0.20.3→0.21.0新增能力，package及lock两根版本同步。先说明影响，再停止已确认本项目dev及由其管理的helper，统一入口恢复0.21.0，加密配置configured=true；浏览器账号仍0/0/0，不冒称用户登录。

## 发布阶段

- 待最终并行对话收尾后统一提交/推送main，并执行现有签名、公证、staple/validate、公开stable/latest与完整资产回读；未安装或重启现有App。真实发布证据及结束时间在完成后追加。
