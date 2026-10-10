# 最近功能检查与完整更新交付

- 用户请求：检查最近对话的功能是否都好了，好了的话推送打包，让我能更新到。
- 范围确认：用户选择补齐Pull、Get Latest、Clean和后台实际Git fetch后再发布。
- 执行者：taobe；模型：gpt-6（未推测更细型号）。
- 开始：2026-10-10 17:25:47 UTC+8；恢复发布：2026-10-10 21:38:09 UTC+8；发布核验完成：2026-10-10 21:57:15 UTC+8。
- 结束时执行提交：是；产品实现与文档已推送main，公共校验修复83b8f58也已正常推送。本文作为交付收尾记录同步。
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


## 实际推送与发布阻塞

- 检查并纳入最近并行实现，M3对话已idle完成。100文件统一提交f8441b052820d04d1d3aa0615fd9099c5be88d82，正常push main成功；远端main完整SHA回读相同，工作目录干净。
- 运行现有npm run package:desktop，发布权限/main预检后，notarytool history以gittogether-notary提前失败：No Keychain password item found for profile。退出69；未进入包装、签名、公证提交或公开新版本。release lock已正常清理，没有0.21.0产物或新tag。
- security默认及搜索钥匙串均为/Users/taobe/Library/Keychains/login.keychain-db；Developer ID预期身份存在（2个valid）。分别尝试默认profile、显式login.keychain-db及verbose仍返回相同not-found；不读取/导出密码，不假设凭据为何变化。
- 公开GitHub latest实际回读仍v0.17.3，两旧资产齐全；没有把source push冒称安装版更新。
- CUA尝试已安装GitTogether返回Mac locked且自动解锁失败，已请求用户手工解锁。Codex终端面板打开请求queued；随后请求用户通过notarytool交互式恢复同名profile，本机输入Apple ID/App专用密码，不通过聊天传递。
- RUN-01-recent-delivery保持未完成，待安全公证凭据恢复后重跑原入口，完成公证、stable/latest发布和公开清单/完整ZIP验证；现有App未安装/重启。

- 本轮暂停记录时间：2026-10-10 19:35:52 UTC+8。任务未完成；等待本机公证凭据恢复。

## 安全恢复与正式交付

- 用户补充原文：「已解锁」「已恢复，但有一说一这不能每次要我手动操作吧」。21:38开始复核，两个新notarytool进程读取同名profile均成功，历史4项；Git main干净且与origin/main相同，完整SHA为e86dc9face68d18573dd9c08de0586e9a8be3eea。发布入口默认复用gittogether-notary，源码没有删除凭据的步骤。此次正常发布不再输入凭据；此前读取失败原因没有得到证实，不把锁屏推断成确定原因，也不读取、导出或记录密码。
- 重跑原桌面发布入口，501/501回归、类型和生产构建通过（仅既有bundle大小警告）；隔离源快照、Developer ID签名和deep/strict校验完成。Apple公证131b0111-1cb1-46b1-932f-de2eb6b52199为Accepted，staple/validate及后续签名校验通过。
- 21:46公开回读确认v0.21.0为stable/latest且非draft/prerelease，tag和打包源码均为e86dc9face68d18573dd9c08de0586e9a8be3eea。最终ZIP为110946064字节，SHA-256为eccfc4479ee5f43e0825c7d54efadc9501606596bb06983a452e6d90af127959。两正式资产完整上传，GitHub远端digest与本机一致；发行说明已补充最近界面、实际Git操作、AI/Commit/Push与历史保护行为并公开回读。
- 发布完成后的公共校验因Node连接被关闭而退出，记录UND_ERR_SOCKET（HTTP/2栈）及独立探测的UND_ERR_CONNECT_TIMEOUT；同URL系统curl访问正常。最小修复scripts/desktop-release.ts，让公开API/Atom/清单使用与ZIP一致的macOS HTTPS下载工具，保留HTTPS/重定向限制、超时、HTTP状态和完整校验，不改代理或TLS。
- 修复后类型、15/15发布回归及502/502收尾全套通过。使用既有可重入verifyPublicDesktopRelease只读核对已发布资产，公共latest、tag、Atom、清单及完整ZIP的大小/SHA-256/SHA-512均相同，build-info写入publicUpdateVerified=true；没有重建或替换已发布包。自动公共校验修复83b8f58已提交并推送main，后续发布直接使用修复流程。
- 产品版本仍0.21.0：此处仅修复未装入App的发布校验脚本和文档，正式App/ZIP保持原签名、公证、源码摘要及tag来源；不把收尾main提交冒称0.21.0的原始打包提交。
- 本地预览与授权助手实际回读同为0.21.0，configured=true，继续保持运行。README日志入口改为界面实际的「设置 → 日志 → 打开日志文件夹」，补充复制日志文件入口。
- 用户回复解锁后，CUA应用操作接口仍两次返回Mac locked且自动解锁失败；已经异步请求再次解锁并保持到检查结束，尚未收到新回复。因此未观察安装版页面发现0.21.0；该项独立保留RUN-01-recent-installed-check。未替用户下载到安装器、安装、替换或重启现有App，不把公共更新源验证冒称安装版观察。
- RUN-01-recent-delivery交付完成，补记RUN-01-notary-reuse并保持正常自动复用；记录实际故障才安全处理，不保证凭据永久有效。完整发布链接：https://github.com/DDonlien/git-together/releases/tag/v0.21.0 。
- 本地产物：项目容器_builds/gittogether-0.21.0-macos-arm64-AQRvMl；恢复打包日志/tmp/gittogether-021-package-restored.log、公共恢复/tmp/gittogether-021-public-recovery.log及收尾回归/tmp/gittogether-021-release-recovery-*.log，均未进入版本资产。
