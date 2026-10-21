# main 0.36.4 推送与macOS打包

- 用户原始 prompt：`推送打包`
- 模型：GPT-6；运行环境仅公开此家族标识，无法可靠取得更具体版本。
- 启动分支/提交：main / 1e2aa333cfe83aad4c8d15f22134689ec47e6f7f。
- 启动产品版本：0.36.4，根package.json为权威来源；初期构建引导改动不递增，后续Windows源码兼容修补按patch递增为0.36.5，原因见15:15—15:17时间线。
- 开始时间：2026-10-21 14:46:53 Asia/Shanghai。
- 结束时间：执行中，交付前补充并按完成时间重命名。
- 是否提交：执行中，计划提交本次交付记录，并推送origin/main。
- 需求：DESKTOP-01-main-package-0364。

## 成功标准

main在origin可回读，包含刚批准的Desktop合并历史；从已推送且干净的来源构建与根产品版本一致的独立macOS Apple Silicon.app，校验版本、源码摘要、资源、arm64架构、内置Git/LFS/Presence和严格开发签名；对成品运行现有隔离Git/Presence、模型生成及多层目录发现检查。报告实际开发签名及未公证状态，区分源码推送、本地成品和正式更新发布。

## 已阅读上下文与决策

- 根与macos/AGENTS.md、REQUIREMENTS.md的DESKTOP-01、docs/github-desktop-based.md及有效根脚本；上轮main合并日志。
- 已认可版本已由普通merge成为main；旧main仍在双亲历史和归档引用中。
- 当前Desktop有效入口package:mac生成独立开发.app。保留原版执行边界，不恢复旧Tauri/server打包链，不替换用户安装版或接触真实凭据。
- 检索既有0.36.3打包记录，只参考验收方式；所有本次来源/包体/运行结果重新验证。

## 对话与行动

- 14:46：回应将核对、推送main，再使用同一源码打包。工作树干净，main领先origin/main四个提交。
- 14:47：fetch origin后确认远端main仍为dfe04f0525cf178284c4bfeb26238fe5f1b656c7，可正常快进推送，不需要重写历史。
- 14:47：说明当前有效打包入口提供macOS Apple Silicon开发版；登记本次交付目标。复用安装的Node22.23.2及现有依赖。
- 14:48：提交交付范围131d2c4e8493d36e0c820b0034b01c3b1aacd7e8，并正常推送origin/main；远端回读一致，未重写历史。
- 14:49：根package:mac同源完整构建及开发签名通过；包内版本0.36.4、源码摘要e631bf1929680f42c2c5bd9ad97969702ee347b9b590bb170280a58d4cca6c70、sourceDirty=false，来源为已推送131d2c4e84。
- 14:50—14:51：成品12项Git/Presence、8项模型生成（含注入EPERM取消）和11项目录发现全部通过，没有应用或扩展异常。ZIP为481608683字节；解压后严格深度签名及来源验证通过，SHA256为508473e09525bea00c64f238e1464af7ebc53ccd7e65c27e1d88b670899d2062。
- 14:52—14:54：发现首次main云端macOS类型检查缺少desktop-notifications生成声明，本机已有依赖掩盖了该首次安装缺口。确认固定原版post-install本就使用app install --force；根setup之前先ignore-scripts再普通install被Yarn判为已完成，没有执行该原生依赖的构建。仅在根setup补齐原版--force行为，不修改原版执行代码、产品UI或包内源码；因此保持0.36.4。另行读取Windows任务失败日志并继续验收。
- 14:54：Windows同一次干净安装在Node直接启动npm.cmd时抛出EINVAL；改用当前npm的JS入口交给Node执行，保留原有npm ci参数，避免shell包装。构建引导改动不进入应用包，产品源码摘要不变。
- 14:55：本机重新setup、类型/Rust及25项测试通过。检查Windows验收夹具时发现其仅提供POSIX shebang；仅在单元测试进程边界把虚构codex.exe映射为Node夹具，保留产品原生CLI发现/调用不变。共同传输、取消和超时仍在Windows运行，三个POSIX进程组故障注入仅由macOS验收；不把这三项标成Windows已通过。
- 14:56—14:59：为使交付来源包含构建引导修正，再从干净且已推送的96f41a7516c2ab9b61e78c552dd5e9de18f9f62a重新package:mac，完整构建/开发签名通过；重新运行31项成品检查全部通过，没有应用或扩展异常。最终ZIP为481608573字节，SHA256为b056a36bbc7918af42a022f8166e7f1db19944c9c3c8b0e2a2cc36ad8e6a7625；解压后严格深度验签及来源验证通过。该记录取代14:51阶段产物作为最终本地交付。
- 14:59：最新main云端验证为39558552749；macOS已通过修正后的首次setup并进入检查，Windows仍在首次setup。取消本任务中两个已被后续修正取代的旧CI运行以释放资源，没有取消其他用户任务。
- 15:01：Windows首次setup已完成依赖构建，随后来源校验发现大量上游文本字节不一致；日志表明Git检出自动转换了换行。仅给checkout步骤设置core.autocrlf=false，保留来源文件的原始字节和既有SHA256锁，不放宽来源校验或改写原版文件。macOS此前已进入最终构建，本地包及产品源码不受此CI配置改动影响。
- 15:07—15:08：macOS云端完整验证已通过。Windows复跑后一般源码校验恢复，仅剩自带text=auto属性的choosealicense资源受core.eol=native影响；补齐checkout的core.eol=lf，并将无依赖的来源检查提前到安装依赖前。本地隔离Git夹具真实复现CRLF默认加text=auto的转换，验证两项checkout配置能恢复逐字节LF；不修改任何来源锁。此次仍仅CI配置改动，已验证macOS包及产品源码摘要不变。
- 15:15—15:17：Windows首次setup及两层TypeScript检查通过，Rust检查暴露Presence的Windows配置保护仍调用未移植的super::is_link。对照既有平台保护实现，直接使用Windows MetadataExt的FILE_ATTRIBUTE_REPARSE_POINT属性判断，保留拒绝链接/junction的保护，不改原版执行代码。该项已涉及平台源码兼容修复，按版本纪律将有效产品patch从0.36.4递增到0.36.5；同步根/UI/Desktop/Presence及其锁文件，来源锁仅更新允许的产品package.json元数据摘要。已验证的0.36.4包保留，计划交付重新验收后的0.36.5最终包。

## 验证与交付

执行中。前一任务来源/类型/Rust、25项回归和完整构建已通过；本次将重新构建实际成品并验收，不把先前源码检查当作包体通过。

## 文档与备注

- 更新REQUIREMENTS.md的DESKTOP-01-main-package-0364及本日志；完成后补充运行说明中的实际交付状态。
- 未要求新增运行功能；正式自动更新及旧失效分支关联接口仍按已有Desktop迁移任务保留。
