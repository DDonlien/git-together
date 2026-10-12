# Windows 原生适配与双架构打包

- 用户原始prompt：那就把 Windows 的适配和 x86、x64 打包流程做好，实际构建校验通过，下个版本跟 macOS 一起发布，不要只是记规则。
- 模型：gpt-6（运行环境提供的最具体标识，未推测其他版本）；执行者：taobe。
- 启动分支/提交/产品版本：main，caf1175002，0.23.0。
- 开始：2026-10-12 08:14:26 UTC+8（首次时钟记录）；结束：2026-10-12 11:35:04 UTC+8（最终公开资产/版本核验时钟）。
- 本轮提交：按已有持续授权分段提交并推送，实际构建未通过前不标记需求完成；不操作用户已安装应用。
- 需求ID：RUN-01-windows-packaging。

## 上下文与实施

- 阅读根/macOS规则、上次Windows发布政策、Rust后台、Tauri配置和正式发布脚本；MEMORY.md仅用于定位既有Tauri生产边界，当前源码与发布条件重新核对。起始源码干净，fetch后main为0/0。通用模板前一任务核对一致，本轮不修改规则。
- 当前Windows平台实现缺口包括无条件Unix导入、macOS Keychain、HOME/PATH、进程组、/usr/bin/open和macOS-only更新tar校验。GitHub Actions仓库已启用，无已有工作流，采用Windows-2022原生MSVC双目标。
- 同一React/Tauri/Rust客户端增加Windows DPAPI用户级加密、私有ACL、KnownFolder数据目录、工具查找、普通文件no-follow/链接处理、Job Object进程组及系统打开/文件剪贴板；保留macOS旧账号兼容和更新数据路径。
- 独立Windows NSIS配置使用currentUser安装、嵌入WebView2 bootstrapper。Workflow只接收已推送main SHA，构建x86/i686与x64/x86_64；不上传私钥或Windows签名凭据到CI。
- 原生发布校验器只用临时目录和虚构凭据，实际验证DPAPI/篡改拒绝、ACL、Unicode路径Git、选中文件提交与未选暂存内容保留、进程树取消和日志。生产快照移除诊断bin目录后再打包，校验NSIS内主程序架构/摘要/无诊断工具，并实际静默安装到临时目录核对后卸载。旧项目测试未新增或运行。
- 本地类型/Cargo检查先通过，再分段推送工作流以执行真实Windows构建；真实构建、后续修复与发布证据待追加。

## 资料与边界

- https://v2.tauri.app/distribute/windows-installer/：MSVC x86/x64目标、NSIS/原生构建边界。
- https://v2.tauri.app/plugin/updater/：windows-i686/windows-x86_64静态更新条目。
- https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata：用户范围、非交互加密与完整性。
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects：子进程继承Job及整体终止。
- https://raw.githubusercontent.com/openai/codex/main/codex-cli/bin/codex.js：官方Windows原生Codex包为x64/arm64，提供vendor目标/bin/codex.exe；兼容已存在的vendor/codex布局。纯32位Windows中找不到受支持Codex时给出真实错误，不模拟AI。

## 第一轮原生构建与联合发布接入

- main/b491264e3023500b3a77c6db84a2ad2dd436b6c0已正常推送。Windows原生运行38188189029的两种架构均到达Cargo检查，发现同一组4个Win32引用错误：两个ACE类型常量所在模块未导入、GlobalFree未从Foundation导入。完整日志保存在仓库外_builds/windows-38188189029.log。修复精确引用并为密码模块按平台裁剪导入，继续实际构建，不把Mac编译代替Windows通过。
- 联合发布入口增加同源码Windows工作流收集、临时安装/核心操作报告检查、本机版本绑定签名/验签、三个平台的latest.json，以及两种Windows完整资产与sig的公开回读；publish在公开草稿前强制要求Windows两包。更新错误按Windows系统码解释，保留Mac原有消息和公证流程。
- 原生校验路径规范化处理Windows临时目录可能存在的8.3别名；普通目录遍历/复制保留reparse点边界。Windows构建缓存按目标/依赖/源码分开保存，失败也保留已完成依赖以便修复后重建。ARCHITECTURE补充实际平台边界与联合流水线；需求仍等待完整构建/安装包通过。

## 第二轮：两种原生程序与操作检查通过

- 运行38189258573（c971a86）两种架构均通过Cargo检查与release构建，原生报告nativeValidationPassed=true，八项实际检查均完成：DPAPI往返、损坏拒绝、私有ACL、Unicode Git路径、选择范围提交、保留暂存、完整进程树取消及日志。两包已生成，但安装包摘要核验阻止后续交付，尚未标记通过。
- 依据Tauri官方bundler源码确认：NSIS打包时将唯一__TAURI_BUNDLE_TYPE_VAR_UNK标记改为NSS，打包后恢复构建输出的原标记；直接与原输出比较SHA会误报。验证器仅允许这次已知标记替换，其余完整字节仍做摘要核对；安装后也核对该NSIS版本摘要，不放宽为只看版本或架构。来源：https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-bundler/src/bundle.rs。
- 同步收紧未选暂存检查为精确清单且拒绝发布index警告，私有目录查询显式请求FILE_READ_ATTRIBUTES；补齐Codex官方bin布局与npm嵌套/提升依赖路径。tauri-build 2.7.2当前实际源码已静态链接VC runtime，无需另加CRT构建流程。下一轮继续安装和界面启动验证。

## 第三轮与同源码macOS核验

- 其他任务正常提交6fa089a（Presence头像）并将版本更新为0.24.0；本轮532da7a47c799c2bc6036b8a37799903460dd47b保留该提交，继续同一版本而不自行回退。新的干净源码检查目录为项目容器release-windows-0.23.0-9ajf2wrv，目录前缀是历史名称，实际package/Cargo/Info版本均为0.24.0；不包含主工作区其他任务尚未提交的provider、图标或远端控制修改。
- 一次人工填写的完整提交号有误，运行38191297351已取消；改为直接读取克隆HEAD，正确运行38191358623使用上述真实532da7a SHA。后续始终从工具读取完整SHA，不凭短号补写。
- 干净源码类型/Cargo检查、前端生产构建及macOS原生release/app构建通过。原始Tauri包含三个诊断工具，独立副本去掉它们后仅保留gittogether；Developer ID签名及deep/strict核验通过。Apple公证a064fa35-b502-41d3-bfe8-a095ee821bdd为Accepted，staple/validate通过；最终tar更新签名、绑定版本及结构校验通过。产物位于仓库外_builds/gittogether-windows-mac-0.24.0-532da7a，build-info明确publicUpdateVerified=false、windowsPending=true，不冒称正式发布。
- 最终Mac ZIP为4756067字节，SHA-256=9c6a8d688d4a09e608f4d1fa00068e958bdb6f36db58dca80164ad66dcfd9c95；tar为4754235字节，SHA-256=3bb66bd91170d5d546836b9c170be1add856fb0e5fb2d4d0a33fc25ca721fa39。
- GitHub当前账号的工作流查询返回core额度0/5000，具体接口头部reset为2026-10-12 01:51:07 UTC（09:51:07 UTC+8）；/rate_limit端点单独显示5000，不能替代实际工作流接口的限额。没有更换账号、代理或凭据绕过，等待该接口恢复后读取第三轮失败细节并继续校验。

## 双架构实际通过与联合发布验证

- 38191358623最终为success。x64完整构建/安装校验先通过；x86的第一次失败是static.crates.io DNS解析导致依赖下载失败，保留完整日志并仅重跑失败job，第二次于2026-10-12 02:04:11 UTC通过。两种架构的报告均为nativeValidationPassed/installerVerified/interfaceStarted=true，八项系统/Git检查全部通过，安装后的NSIS主程序完整字节摘要、实际WebView2窗口启动及静默卸载通过。构建机为Windows Server 2022 x64，x86程序通过WOW64运行；没有冒称独立纯32位操作系统设备验收。
- 实际调用已提交的buildWindowsPackages发布收集器，复用成功运行下载两个产物、核对源码/版本/PE架构/大小/摘要，在发布Mac用既有仓库外私钥进行版本绑定签名，再由原生发布验签工具验证NSIS结构与签名。x86为5246242字节、SHA-256=bf5988eeb0705e3684d8aec9ce65b031522efbe237fb5d90cb9ad5e169770e53；x64为5629374字节、SHA-256=77ccc057bfc623b0a21057262d655208a7ec3f602e7b4548e888a55af72d8754。
- 同源码0.24.0产物的latest.json实际包含darwin-aarch64/windows-i686/windows-x86_64三条，verifyTauriMetadata与旧版verifyUpdateMetadata通过。build-info已标记localJointReleaseVerified=true、windowsPending=false、publicUpdateVerified=false。该包用于隔离校验，没有发布旧于当前main的版本。
- 主工作区其他任务在本轮期间正常推进至48f19f0c18a9524f25ebaa27eb2313d86a8303e8/0.25.1；该提交的实际统一打包入口已持有共享发布锁，并启动Windows运行38197037620。继续只读跟进该轮同源码三平台包与公开源，不重复启动或移除其他任务发布锁，也不把尚未提交的0.27.0改动打包。
- 实际下一版本暴露缓存跨版本问题：x64的Cargo、八项原生操作与NSIS生成均成功，但target缓存保留0.24.0和新0.25.1两个安装器，安装包唯一性检查正确阻止交付。完整日志_builds/windows-114641911218.log确认错误为“Windows安装包数量不正确”。本轮修复为每次Tauri打包前清空已归本次目标管理的bundle/nsis输出目录，保留依赖/编译缓存和全部字节/架构/安装验收；继续按新源码实际构建，不挑旧包或跳过校验。
- 缓存修复e644c9ac5b8e0599c7b5ad550129c75291132ec9正常提交/推送，真实运行38198124067两目标最终success，完整安装/原生窗口/卸载校验通过。独立发布克隆调用正常npm run package:desktop，本机0.25.1类型/Cargo/生产构建、签名、公证、更新验签及收集两个Windows报告/签名均通过，产物位于_builds/gittogether-0.25.1-macos-arm64-ShfrZO。正式公开前assertMain发现主分支已正常推进到新的Presence头像位置/0.27.1，停止发布旧快照，没有创建不一致的正式Release，也没有削弱来源检查。
- 克隆保持main，以ff-only对齐2e9781dfb32cebe222091e540ab01be934bf7cbd/0.27.1，启动真实Windows运行38198911321和正常联合发布入口；共享发布锁不冲突。该轮日志位于_builds/windows-joint-release-0.27.1-2e9781d.log。保留原生Windows两轮成功证据，继续完成本次最终主分支版本及公共更新源。
- 联合CI期间main又追加仅发布脚本的瞬时错误重试a3fc3a1。原有“公开时必须仍为main尖端”把正常主分支推进误判为快照无效，导致已验证包反复重建；项目规则要求已推送main来源及同源码/版本/tag，并未要求暂停其他提交。修复发布来源检查为完整40位SHA且必须仍为远端main的真实祖先（compare status=ahead、base与merge-base均为源码SHA）；不更换已编译源码、版本、签名或tag，不接受force-push移出的历史。候选版本在准备、发布开始和公开前分别高于最新公共版本。实际只读compare核对2e9781d到a3fc3a1的祖先关系；正式包验收继续使用2e9781d同一快照，不冒称包含之后的源码变化。ARCHITECTURE补充该不可变发布快照约定。

## 最终交付

- 运行38198911321的x86/x64均success，0.27.1两个原生目标、八项系统/Git操作及真实安装、原生窗口/WebView2启动、卸载全部通过。首次收集x86产物时gh下载超过原120秒期限；没有重建或替换源码，下载期限改为10分钟，并对短暂网络错误/超时有限重试，每次清空本次架构的私有下载输出后完整重取，仍逐字节核验摘要。准备和消费者脚本专项TypeScript检查通过。
- Workflow增加实际source_commit的run-name，收集器以输入快照标题定位新任务，兼容旧任务的相同head SHA；后续main推进不再把工作流定义提交错误当成被checkout的源码，最终仍要求产物报告中sourceCommit/版本/架构和原生验收严格匹配。优先复用相同快照已成功的运行，不重复发送结果未知的dispatch。
- 已提交的发布模块在独立main克隆中从原0.27.1公证产物和成功的原生CI恢复；临时驱动位于仓库外_builds/resume-windows-joint-release.mts，持有正常共享发布锁，没有修改任何已编译程序或源码归属。Mac签名、staple、Info版本和tar更新验签重新核对，两个Windows报告/完整字节/本机版本绑定签名核对后生成三平台清单；正常prepare/publish完成真实GitHub草稿、九个完整资产上传、公开及回读。
- https://github.com/DDonlien/git-together/releases/tag/v0.27.1 于2026-10-12 03:31:53 UTC正式公开，stable/latest、非draft/prerelease；tag实际指向2e9781dfb32cebe222091e540ab01be934bf7cbd。latest.json有darwin-aarch64/windows-i686/windows-x86_64三项。公共latest、Atom、旧Mac清单、新Tauri清单、三平台完整下载和各签名文件回读通过，产物build-info.publicUpdateVerified=true。主分支之后的0.27.2及尚未提交内容没有冒称进入此包。
- 最终Mac ZIP6363472字节/SHA-256 c337b58d36c79a6cb21714b802cec96be48c4b2b532de584185a22860adc0483；tar6356867字节/SHA-256 dea4f884558df60f5cb2b9d382a06eba143fa6117b230390d81d6f4f095755ab。Apple公证49d99162-9cca-4303-9334-4f6f8e2ec164=Accepted、staple/validate及deep/strict签名通过；spctl返回Notarized Developer ID，输出同时注明本机既有security disabled，未更改该系统设置，也未冒称默认Gatekeeper设备验收。
- 最终Windows x865477214字节/SHA-256 ef3af610566dc0804f4fe773c8ac1f6afecce441fac6af5b51edd7f9f7f1de47，PE machine332；x645871880字节/SHA-256 d105ac30611809cb53b3c6220a3ef0834862278d2e31b6d2f1e0b737e06d395c，PE machine34404。Authenticode尚无证书配置，更新签名已通过；AI沿用官方本机Codex支持范围，纯32位OS暂不支持。真实x86程序通过WOW64，不将其称为纯32位OS实机验收。
- 交付产物与证据位于_builds/gittogether-0.27.1-macos-arm64-GdDABc；本次适配/打包需求标为完成，README更新平台和真实发布状态。仅提交本任务代码/段落及日志，其他任务的provider、性能、表头和规则等工作区修改保持各自归属。没有启动、替换、升级或操作用户已安装的GitTogether，也没有要求解锁Mac；没有新增或运行旧项目测试。
