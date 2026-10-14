# GitHub令牌自动续期与授权诊断日志

- 用户原始prompt：「那就补上 GitHub 令牌自动续期和相关日志，修好后推送打包发布，让我能更新到。」
- 模型：gpt-6，运行环境提供的最具体标识。
- 开始时间：2026-10-13T15:47:32+08:00。
- 结束时间：2026-10-13T18:26:25+08:00。
- 启动分支与版本：main，aaa9962f0cd464e4251804cc8e55a7996b5d5c57，0.30.1；共享工作目录含其他0.32.1未提交功能，从已推送main普通隔离克隆实施本需求。
- 需求：IMPORT-11-token-refresh。
- 初次源码提交：0f0185b498d292f7614ed5214abd3b726375ba19已推送main；发布收尾修正进行中。

## 上下文与成功标准

已读根/macOS规则、OAuth设备与网页交换、账号加密存储、Provider/API/Git网络调用、上下文身份与诊断白名单，以及既有三平台发布流程。原工作区fetch/prune后落后origin/main四项已提交修复；以最新已推送main隔离普通克隆继续，保留共享WIP。模板通用前缀一致。

GitHub官方文档https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens确认访问令牌8小时、续期令牌6个月、续期时同时轮换两者；网页流程续期需要已保存client secret，设备流程无需secret。旧版本未保存refresh_token，用户可能需升级后再授权一次。

成功标准：续期元数据只进入加密账号项，Renderer仅得到原公共账号有效期；到期前2分钟续期，同账号并发合并，401仅一次恢复读取；自动轮换保持仓库/任务上下文，重新授权/手工换令牌仍隔离旧上下文；取消不丢掉服务器已轮换的凭据，持久化失败先重试保存；安全日志区分过期、缺少/失效续期凭据、网络、配置、保存与身份变化。

按当前指令不新增或运行测试套件，分别执行类型/Cargo检查、生产构建和原生包/公共更新源验证。复用gittogether-notary及既有签名配置，遵守安装版不操作约定。

## 实现与源码检查

新增有限github_token模型与官方HTTPS续期交换，网页/设备授权同时保存续期凭据和原流程；参数、有效期及响应大小校验，不调整权限或TLS。Service按账号合并续期，API与Git网络请求取当前令牌；401只读API最多恢复一次。自动轮换保留明确授权代次；手工换令牌/重新授权生成新代次，目录刷新和上下文校验分别保持正确。

续期请求独立完成并在系统加密保存后才启用新令牌，取消不丢弃已开始的轮换；保存失败留存待保存凭据并退避15秒，不用旧refresh_token重复交换。安装预约检查有效待保存项，移除账号和换授权后不保留旧结果。临时网络错误按账号退避60秒，缺少/到期续期凭据退避5分钟。401/403/限流、到期与即将到期、续期完成/失败、存储读取失败的安全日志明确；渲染层不能伪造后台授权元数据。

版本从隔离main的0.30.1递增patch至0.30.2，修复现有授权而非新增权限，npm根锁和Rust版本镜像同步。npm run check、Cargo locked检查和前端生产构建已通过；前端保留既有500kB分包警告。Rust unused-variable警告已修正；未运行测试套件，未操作用户安装版，也不把编译等同实际用户续期成功。

公证预检：默认profile与显式login.keychain-db均报No Keychain password item found for profile: gittogether-notary。安全地检查Keychain元信息、常见保存目录、私钥文件名及环境配置，没有找到备用公证配置；没有读取或输出密码、没有请求解锁。Developer ID签名证书仍有效。打包脚本固定使用登录钥匙串并支持GITTOGETHER_NOTARY_KEYCHAIN覆盖，避免未来复用依赖临时默认搜索列表；公证未通过前不能正式发布。继续推送和准备候选包，已异步询问现有配置的其他保存位置。

## 公证读取复核与最终来源

0.30.2候选完成Developer ID签名（bundle身份与团队一致，deep/strict通过），实际公证提交仍exit69；只记录notarized=false/publicUpdateVerified=false，不作为正式更新。Windows 38378554453的x86/x64原生构建、安装、启动及有限平台诊断通过，下载的完整候选包大小/摘要和Tauri版本绑定更新签名已验证，仍未公开发布。

2026-10-13 18:03后直接notarytool及xcrun默认查询均正常返回同名gittogether-notary的27条历史；没有重建profile、索取秘密、改变钥匙串或请求解锁。相同工具显式指定login.keychain-db仍exit69。由此撤回本任务强制登录钥匙串的默认路径，只在显式GITTOGETHER_NOTARY_KEYCHAIN设置时追加路径；保留既有默认profile读取。此前默认读取偶发失败的原因尚未证实，不能把未读到判断为凭据已被删除。

隔离main再次fetch并正常快进到f8a6b11306044461d3ea2730cd5126c673562c13，保留已经合入的IMPORT-12唯一分支创建参与修复；共享工作区未提交内容仍未纳入。此次公证入口修正及精确区分新手工令牌与旧版缺失续期凭据的文案，按patch从已合入0.30.3递增0.30.4，所有版本镜像同步；正式三平台必须重新绑定同一最终提交，不把旧0.30.2候选报告改作新源码报告。

0.30.4最终候选的npm类型检查、cargo check --locked及生产前端构建分别实际通过；保留既有500kB分包提示。未新增或运行测试套件。

## 正式发布完成

最终源码abc8c13574b78681439f6efe74a0ca689c55f071已推送main，v0.30.4标签与其一致。原正式入口的history读取后来再次出现间歇性exit69，因此仅为准备候选复用了相同脚本副本并跳过history预检；保留固定main快照、更新密钥匹配、实际notarytool submit、Accepted、staple/validate、签名、三平台收集和所有公开回读门槛。最终实际提交成功，没有重新配置公证profile、索取秘密或要求解锁；间歇性失败的原因仍未确认，不判断profile删除。

macOS Apple公证46cc12eb-7471-4e2f-bb6a-de925abf3bc3为Accepted；Developer ID深度严格签名、staple/validate及Tauri版本绑定更新签名通过，bundle仍com.gittogether.standalone、团队86J7X3KZ5Z。spctl报告Notarized Developer ID并同时显示环境原有security disabled，未改变系统设置，也不冒称默认设备Gatekeeper验收。Windows同源工作流38381376424两架构原生构建、有限平台诊断、实际安装/启动和卸载成功；完整候选下载的摘要/大小、PE架构和Tauri更新签名分别验证。Windows未配置Authenticode，不能与更新签名混同。

正式发布https://github.com/DDonlien/git-together/releases/tag/v0.30.4，非draft、非prerelease，九个资产齐备。最终build-info.json的publicUpdateVerified=true；匿名latest、Atom、旧版latest-mac.yml、Tauri三平台latest.json及全部签名/完整安装包下载已回读验证。公开说明通过结构化文件更新为本次GitHub续期/安全日志和已合入的唯一分支创建参与修复，API确认保存。

最终包：

| 平台/资产 | 字节 | SHA-256 |
| --- | ---: | --- |
| macOS ZIP | 6535959 | bcdde40526c0d89a1f2498e196961dbf7297731bc07b56085071e0f15073f352 |
| macOS Tauri tar | 6528146 | 28d0cbcb76eef6983975ef5b32ce0e6380831678dcafb3d6941ec03aa32fc770 |
| Windows x86 | 5613150 | 5f0aad4f0704b00849fa79909606734b0f9258e7745770b10e7af654d6b1091f |
| Windows x64 | 6020521 | 57603d59acf8ce5509771af0c89660b0666da572d9fa747d929da01af7fdd400 |

产物记录：_builds/_builds/gittogether-0.30.4-macos-arm64-7e9hAc/build-info.json，源码摘要edf10d282d84e87b0c7f0c5c377aa6af731270a6210f6f8500203be05af6a207。只清理本任务所有的发布锁和临时准备入口，保留最终包/报告与共享工作区全部WIP。不操作、替换或重启用户已安装GitTogether；真实账号长时续期与用户自行安装后的使用没有被包或源码检查替代。
