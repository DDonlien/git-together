# Desktop正式发布与0.33.0升级

- 用户原始prompt：那就把正式发布和自动更新补齐，签名、公证后发布，让现在的 0.33.0 能检查到并升级到最新版本，以后推送打包都要完成这一整套。
- 模型：GPT-6；运行环境仅公开家族标识，无法可靠取得更具体版本。
- 启动分支/提交/产品版本：main / f229f9296e981c225228ec9ee47d6c11a62908c2 / 0.36.5。
- 开始时间：2026-10-21 17:08 Asia/Shanghai。
- 结束时间：执行中。
- 是否提交：尚未。
- 需求：DESKTOP-01-updates、DESKTOP-01-updates-pipeline。

## 已阅读上下文与成功标准

已读根与macos的AGENTS、README、DESIGN、REQUIREMENTS和上一轮main-package日志；模板本地source版本与当前相同。fetch后main与origin一致，工作树干净。公开latest.json仍为0.33.0；此前0.36.5仅开发包，未发布。检查固定GitHub Desktop代码、旧0.33.0更新信任/归档验证及已有仓库外签名、公证配置入口。

完整交付为同源三平台成品、macOS Developer ID及Accepted公证/staple、旧版可验证的签名更新、原版Desktop更新器接入产品更新源、正式Release与完整公共回读。安装升级只在独立临时副本验证，用户安装版及真实账号/仓库不操作。保留原版Git、授权、凭据和后台语义；不恢复旧服务。

## 对话与行动

- 17:08—17:13：确认0.33.0的Mac归档校验要求GitTogether.app/Contents/MacOS/gittogether，Windows要求NSIS；新运行时需兼容两者，不能直接上传开发ZIP作为更新。新版本后续更新继续使用原版Squirrel执行器，产品更新源由编译配置指定。
- 17:13—17:35：实现0.37.0正式构建、签名公证、同源Windows双架构工作流及旧tar/NSIS兼容；新UI调用原版UpdateStore，更新说明换为产品源且独立失败不会破坏更新检查。新增稳定数据目录启动器、只读解密旧配置并经原版账号Store/Dispatcher导入；旧加密文件不覆盖。Developer ID、公证profile及仓库外更新私钥均可读取，公证history预检通过。类型/Cargo及30项回归通过；独立0.33.0更新器夹具编译通过，源自旧版的归档接受规则逐字节保留，不编译旧Git或授权后台。实际签名包、隔离升级和公开发布仍待执行。
- 17:32—17:40：首版代码4dea74a364已推送。首次手工Windows派发误传10位缩写，checkout把它当作分支名而失败，尚未进入构建；自动入口使用完整SHA。核对Electron公共服务当前源码，确认其Windows逻辑只读取一个RELEASES，不能把两种架构混用；改为main上的两个架构专用轻量清单，仍使用原版Squirrel。补充Windows实际NSIS安装后启动、系统凭据往返及原版Commit/Push验证。macOS首次production构建通过，上游Sass/许可校验完成；为统一最终来源，在公证提交前停止本任务旧签名流程，未公开任何新Release或更新清单。
- 17:41—17:49：完整来源dc38e1fe84已推送并构建production；macOS严格Developer ID签名通过，已送公证。Windows39578897785的x64进入setup，x86在Rustup选择非宿主工具链时要求--force-non-host；仅修正CI标志。旧0.33.0公开tar及签名通过新验证工具，篡改载荷及声称错误版本均被拒绝。发布入口允许在仅CI/日志/文档变化、来源摘要完全相同且为main祖先时复用已验收Mac成品；三平台和tag仍固定为同一应用源码提交，单独记录发布脚本提交，避免无源码变化的重复公证。公开前再次核对main状态，拒绝覆盖并行工作。
- 17:54—18:08：dc38的首轮Mac成品已由Apple接受（0419ee6c-6ff4-46c4-b51f-8ad3ff36c3e0），staple/validate及严格签名通过；主机spctl既有策略显示security disabled，未调整此系统设置，验收独立依赖Developer ID链及Apple票据。Git成品12项在处理夹具的原版LFS提示后通过；生产模式模型测试因虚构账号缺少SDK生产feature flag而正确回退Codex，补齐夹具授权标记，不改变真实授权逻辑；夹具临时路径改为canonical并在隔离全局gitconfig中预装LFS过滤器。
- 同期Windows39580005047的两种架构已通过setup/check/test；x86的原版Webpack 4GB堆参数超过32位Node地址空间，x64的Squirrel打包缺少因ignore-scripts而未生成的7z。补齐独立64位JS编译宿主（原生依赖及Electron/Rust仍为目标架构）与厂商7z安装脚本，保留原版Git代码；新构建脚本和更新说明兜底已改变来源摘要，因此最终三平台将重新固定在同一新源码，而不复用旧dc38成品。签名独立处理Mach-O和嵌套bundle，普通资源由bundle资源封印覆盖，避免逐个给PNG加签；严格深度验签及公证门槛保留。此前成品尚未发布。
- 18:12：核对0.33.0实际Presence文件位于稳定数据根目录，而开发版宿主使用presence子目录；正式版宿主改为使用原稳定根，开发版继续隔离。账号导入根作为私有子进程参数显式传递，避免随Presence目录变化而读错父目录；远端操作备份跟随同一根。没有读取或修改用户实际配置。来源/两层类型/Rust及31项回归均须在此最终来源再通过，之后重新生成三平台成品。
- 18:18—18:24：711bdb309d已推送，来源/类型/Rust及31项回归通过；Windows39583784347按该完整提交重建。新的Mac正式签名与明确证书链/Team/稳定标识校验通过，公证调用返回已观察过的status69/No Keychain password item；首轮同一profile已Accepted，按现有公证工具既定策略仅对此“尚未加载凭据”状态最多重试10分钟，不重建配置、不导出密码、不请求用户解锁，也不重试上传/认证/公证拒绝等其他错误。打包/验收脚本不改应用源码时继续单独记录pipeline提交并校验既有成品的来源及完整性；应用来源仍固定711b供三平台及tag使用。旧已公证dc38快照只作升级流程预演，不发布。
- 18:26：旧已公证快照的升级预演已经通过真实0.33.0更新器的检查、签名下载、归档校验、安装及staple/深度验签，并通过独立bundle ID的Squirrel签名更新与重启、版本/独立数据目录断言；随后实际启动被替换的应用时，夹具在private桥创建后过早读取尚未导航的iframe，改为有界等待frame导航。此项只改验收时序，不改应用。最终711b成品仍须重新通过同一流程后发布。

## 验证与剩余工作

执行中：实现有效正式构建/发布入口、升级兼容与隔离验证，完成前不声明正式发布。
- 18:39：Windows x64已完成真实NSIS安装与应用启动，凭据往返夹具使用了Electron评估域中不存在的全局require，改用主模块require；同时补齐iframe导航等待。x86的7z是构建宿主工具，厂商仅发布x64/arm64，选择器改用既有64位JS编译宿主，目标Electron/Rust/原生模块仍为ia32。原版LFS在每次重新注册仓库时都会要求初始化，隔离Mac夹具明确同意初始化后12项Git检查通过；将此同意加入首次注册和重新注册两个位置，不修改原版控制器。变更desktop.mjs使来源摘要变化，最终三平台固定在新提交重建。此前711b的公证凭据10分钟重试超时，未提交新Apple任务；dc38的Accepted只作为预演证据，不用于新成品报告。
- 18:45—18:52：最终8d9a13f243签名包完成31项隔离成品检查。Submit测试按钮实际范围为一个工作目录，改为在生成结束后核对该目录的手工Summary/Description均未被覆盖；其他worktree并发/取消仍由实际API检查。重启恢复测试等待原版Store异步载入，未调用手工刷新，全部仓库/多worktree关联及文件状态恢复通过。仅修改验收夹具，不改应用。旧已公证快照的0.33.0与Squirrel双更新器预演完整通过，最终包仍须有自己的Accepted后再重跑。
- Windows39586104451的x64完成NSIS真实安装、原生凭据往返、原版Commit/Push、文件/index保留及production更新桥检查。x86完整编译已成功，打包器26的新版原生解压模块明确不提供ia32构建；让打包器在64位宿主运行，显式选择ia32目标并继续验证应用/Presence/Git的PE架构。CI将发布工具从workflow自身提交检出到ignored artifacts，应用仍从固定8d9a13f243干净检出，包内来源和三平台应用摘要不变；发布入口也可在仅工具/验收/文档差异时复用同源production构建，单独记录pipeline提交，避免把CI修正冒充新的应用源码。
- 公证非秘密诊断：login钥匙串unlocked=true；Xcode 1.1.3与CommandLineTools 1.1.2的notarytool、默认及显式login查询均返回69/No Keychain password item found。精确profile账号/标签的只读metadata查询也返回-25300，未读取密码、未重新配置/解锁/改ACL。GitHub仓库secrets列表为空，无既有云端公证凭据可复用。此为凭据不可读取，尚未提交最终8d的Apple审核，也不是Apple拒绝该包。
