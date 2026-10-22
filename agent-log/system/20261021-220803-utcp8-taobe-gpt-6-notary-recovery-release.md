# 既有公证配置恢复与正式发布

- 用户原始prompt：之前公证不是一直能用吗？把现有配置读取失败的问题查清楚并修好，继续完成正式发布，让 0.33.0 能检查到并升级。
- 模型：GPT-6；环境仅公开家族标识。
- 开始时间：2026-10-21 20:45:53 Asia/Shanghai。
- 结束时间：2026-10-21 22:08:03 Asia/Shanghai。
- 起始分支/main提交：main / 58d63b856f57e9cd430d84fedd8cff3730c29341。
- 产品版本：沿用尚未公开的0.37.0，应用来源8d9a13f243，当前只修复发布工具/公证定位，不改应用或递增未发布候选版本。
- 需求：DESKTOP-01-updates、DESKTOP-01-updates-pipeline。
- 边界：复用已有公证配置和签名，保留凭据，不泄露秘密、不更改系统安全策略、不操作用户安装版。

## 对话、诊断与行动

- 20:45：main干净且与前次结束一致；现有notary.json仍为10月15日的version1/profile=gittogether-notary，未被改写。再次使用同一profile读取history已成功，返回36条记录。说明凭据未被本次任务删除或重建；此前NoItem属于读取/可见性问题，下一步精确检查保存的存储类别和保护属性，避免把login钥匙串unlocked等同于所有存储均可读取。
- 保留前次三平台同源8d候选和Windows39587719512成功产物；公证最终候选自身，不复用dc38预演的Accepted报告。
- 已查明底层错误：18:22系统secd日志记录数据保护钥匙串变为locked，并对notarytool进程34398返回-25308/Access to item attempted while keychain is locked；工具将其映射成69/No Keychain password item found。现有配置未指定文件型keychain，默认使用数据保护钥匙串；login.keychain-db的解锁状态不能证明该存储可读。无Apple私有访问组的普通SecItem探测同样不能证明凭据不存在。没有证据确定触发锁定的具体第三方组件，不归咎于插件。
- 发布工具改用Apple自带有权限的notarytool验证，区分锁定/暂不可见、认证拒绝、网络上传错误；非Aqua执行器进入当前用户GUI上下文，不请求解锁、不导出或重建凭据。加入原子任务记录，绑定输入ZIP与应用签名摘要，恢复已上传任务或已Accepted候选，不重复签名/提交。回归3项通过，涵盖真实错误分类、配置保持/覆盖边界、任务创建与上传/公证阶段。
- 21:08：首次最终候选任务49e0fa67-f363-4ee7-94ab-d6f631b6c223在S3加速上传阶段连接超时；未取得上传完成/Accepted，原始诊断仅保留在权限600的本地产物目录。21:10使用Apple普通S3线路提交相同签名ZIP，任务2a764857-7295-4b45-8569-34f7a8e99ae3继续上传。
- Windows完整产物读取改为有界分段、断点记录与重试；完成后仍强制整文件SHA-256及每项包体摘要，不以分段记录代替真实性校验。两份CI ZIP均已完整下载并验证：x86 526780297字节/bc9736e8397cca7b7608c607f429c8c6bb13a9f6547d46fe48f0220a7ad2b9e0；x64 710722679字节/29123fffe24fdc52a74eb2e89468c4b85140772dce0aa2e8b68450131554f15d。来源均8d9a13f243；应用来源摘要仍为67a84afd805c25f83045f49d4774a92ee704b8bf0f74c88ec74f093345b32a79。
- 21:27：普通S3线路任务2a764857-7295-4b45-8569-34f7a8e99ae3获得Accepted，随后完整staple/validate和deep/strict签名通过。复用既有已签名8d候选，不重新读取当前已锁定的profile；系统锁定保护未修改。最终ZIP为480961497字节/SHA256 685941954821a8edf96855687c29439bb727a815ae348bb87eebcf5636b20994，最终tar为478564478字节/f05839af70a3710f2b9bde17dbbf351605f347ba1d03a266ca0fae5302d2becb。
- 21:32：最终三平台旧更新签名及独立验证通过；实际0.33.0更新器完成检查、下载、验证旧归档规则并安装到0.37.0，最终签名/公证有效；Squirrel隔离签名副本完成替换/重启，production更新桥与合成配置/本地文件保留通过。native-upgrade-validation.json已生成，未操作用户安装版。
- 创建v0.37.0草稿，target固定应用来源8d9a13f243。GitHub当前代理上传五连接合计约0.5MB/s，尚无完整资产；停止本任务的上传连接后测试本进程直接连接，不改变系统代理。草稿恢复只跳过GitHub服务端标记uploaded且大小与完整SHA-256均匹配的资产，仍要求全部公共完整下载验证；不放宽公开版本不可覆盖的限制。
- 直连已完成236835807字节Windows x64 nupkg上传，GitHub状态uploaded、服务端SHA256 cfbc3dd32565dfe46c62688d2d80ecb958eba939a6dc5d637908a7390e2ca140与本地产物一致。继续以该方式完成剩余相同正式资产，再由标准流程恢复；公共验收仍使用正常网络环境。
- 21:48：18项资产中仅x86 Squirrel安装器的旧连接持续约0.2MB/s，停止该任务连接并仅重传175954432字节载荷；新连接随后完成。标准流程按服务端完整SHA-256跳过其余已上传文件，重新执行最终隔离升级、三平台签名及来源核对，通过后于21:51:16公开v0.37.0/stable/latest。main的085743277a发布两份架构独立Windows清单。
- 21:54：16项公开载荷/更新元数据全部完整下载，大小及SHA-256与本地一致，旧更新签名/版本/归档规则三平台均通过。另完整回读release-integrity.json及SHA256SUMS，分别2962字节/5a71d0129b8934017113ece40ff0498ec9b6af56d17f646b133d8cd8ebf34a7d、1566字节/41425112759602e8fd7fbe6719b8587dcd97a95d005c4366f22b6be244ff0d47；后续标准入口也将这两项纳入完整下载循环。
- 21:55：实际0.33.0更新器通过公共latest.json检查、下载、签名及旧版归档验证，安装到隔离副本0.37.0，启动后production更新桥正常；原合成配置与本地文件保留。public-upgrade-validation.json通过；未操作用户安装版。
- Electron官方更新服务原始DDonlien路径仍缓存0.33.0；等价小写owner的未缓存请求已返回正确0.37.0 ZIP，确认资产命名和新更新格式有效。官方服务实现按owner/repo缓存、默认15分钟；保持应用原始地址，等待该地址刷新，不用变更URL绕过正式验收。
- 22:06:05：原始https://update.electronjs.org/DDonlien/git-together/darwin-arm64/0.33.0已返回0.37.0正式ZIP，标准流程退出0并写入public-validation.json，随后相同无查询参数URL再次回读成功。官方缓存已自然刷新，未修改应用更新地址。
- 18项服务器状态/完整摘要再次与本地逐一核对通过，补充public-all-assets-validation.json。原notary.json仍为权限600、修改时间2026-10-15 00:01:46，未重写配置或重建凭据。发布后仅补齐公共元数据下载检查与文档，应用摘要保持67a84afd805c25f83045f49d4774a92ee704b8bf0f74c88ec74f093345b32a79，不更改已经公开的0.37.0包或版本。

## 验证与交付

- 完成：既有凭据读取失败的根因诊断、错误分类和候选/任务续办；3项公证及6项更新/迁移回归通过，修改脚本语法及差异检查通过。
- 完成：三平台同源0.37.0正式Release、Mac Developer ID/Accepted公证/staple、Windows x86/x64原生安装和Git验收、三平台旧更新签名及独立结构/版本验证。
- 完成：16项载荷/更新元数据及额外2项完整性元数据全部公开完整下载和大小/摘要核对；latest/Atom、Windows独立清单及Electron原始公共地址正确。
- 完成：最终0.33.0更新器通过公共源检查、下载、验签和安装至0.37.0；启动后production更新桥、合成配置和本地文件保留。新版Squirrel下载替换与重启在独立签名副本验证。没有操作用户已安装应用，没有替用户选择安装与重启。
- 范围边界：Windows凭据和Git验证使用原生CI及合成数据；Mac公共0.33.0升级为隔离副本，不能据此声称用户真实账号已在安装版登录。Windows未配置Authenticode，旧升级资产使用既有更新签名；未降低安全保护或改写已发布资产。
- 证据：artifacts/releases/0.37.0/中的notarization.json、package-*.json、mac-native-validation.json、windows-smoke-*.json、native-upgrade-validation.json、public-upgrade-validation.json、public-validation.json、public-all-assets-validation.json、public-metadata/validation.json和release-publish.log。
- 正式地址：https://github.com/DDonlien/git-together/releases/tag/v0.37.0；tag远端实查指向8d9a13f243b3912d06cdc0ae28aabacd5b1cef46。DESKTOP-01-updates及DESKTOP-01-updates-pipeline已按实际证据完成。
