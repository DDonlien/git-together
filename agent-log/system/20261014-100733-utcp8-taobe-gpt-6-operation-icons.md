# 弹窗收起与关闭图标对齐

- 用户原始prompt：「图标没对齐」。本聊天前次截图为新收起按钮和原关闭按钮。
- 模型：gpt-6，环境暴露的最具体标识。
- 开始：2026-10-14 09:12:18 UTC+8；结束：2026-10-14 10:07:33 UTC+8；已提交推送，发布与公开校验完成。
- 基准：main 7ab4687c0fc7ca206e814c4a45ff9c2b0c841c79，0.31.1，复用本聊天独立main发布副本；共享codex-standalone-ts为main/0.32.2，保留其当前状态。
- 已读适用根/macOS协作规则、当前需求/设计/架构、前次收起日志及之后两个维护/远程操作日志；官方模板v1.9.1未更新。不修改规则或调用已安装App。
- 实测Submit的收起中心76.859375，关闭中心80.2578125，相差3.3984375px。原因是收起绝对top20，而header按24px标题的34.8px行高居中关闭按钮。
- 成功标准：两个28px按钮中心差为0、相邻间隔4px、换行仍对齐；原标题/内容留白、亮暗色、窄视口与操作交互保留。仅处理现有收起弹窗布局，不添加业务逻辑或测试套件。

- 修复仅修改styles.css：限定带收起按钮的弹窗，让原header/body参与同一grid标题行，保留公共DOM与原body padding，关闭/收起各28px，间隔4px。移除绝对top/right偏移；原标题栏不改变字高或留白。普通无收起弹窗不受影响。
- 生产React隔离预览测量：原偏差3.3984375px修为0；亮色Submit、暗色Get Latest均中心差0与间隔4px；320px窄视口Get Latest标题确实两行，title总高101.59375px，按钮仍同高。Submit收起/原按钮恢复/取消正常，未执行真实Git。
- 样式修复按patch从0.31.1递增0.31.2，四份权威/镜像清单一致。本任务未修改共享版本，后续另一任务改至0.33.0。未添加或运行测试套件。

- 最终0.31.2生产构建复核：两个按钮均28×28，中心差0px、间隔4px；截图operation-icons-aligned.png。npm run check、npm run check:rust和npm run build实际通过，未运行旧套件。隔离预览和浏览器已结束。
- 已提交并普通推送main 2426dc7b58ad20287b2736604cff2c33658edc7e，公开main读回一致。共享只同步样式、需求和设计；另一任务将共享版本改至0.33.0，本任务没有改其版本/索引或其他WIP。
- 官方package:desktop的既有公证profile已恢复读取，无需修改凭据或解锁；当前macOS App完成Developer ID deep/strict校验，Apple公证ba6f806d-c356-42a1-a2be-1fd32bf30b3a为Accepted，staple/validate及Tauri签名、版本、结构校验通过。Windows x86/x64在同源CI 38495079988构建验证；正式发布/公共回读待实际完成后记录。

- Windows同源CI已success，但官方发布入口的三次只读状态查询因EOF网络中断退出；macOSAccepted包保留。尝试用既有prepareDesktopRelease/buildWindowsPackages/验证器恢复，不跳过签名、公证、安装验收或公共校验；恢复入口在取得锁前被RUN-01-notary-reuse-recovery的0.31.3发布锁拦住，没有删除/抢占他人的锁。
- 后续main 1052f9b099427f3a3025488f78599f391b26d149为0.31.3；确认其包含本次2426dc7b祖先与完全相同的对齐CSS。等待并核验这份更高版本的正式包，避免另行发布过时0.31.2。

## 最终交付

- 0.31.3已正式发布，发布源码1052f9b099427f3a3025488f78599f391b26d149包含本需求commit 2426dc7b58ad20287b2736604cff2c33658edc7e；对齐CSS逐字一致。本任务0.31.2候选不另行发布，避免较旧版本抢占更新源。
- 0.31.3 macOS公证b961eb33-792b-438b-8365-da896cdcbb1f为Accepted，Windows x86/x64同源CI 38496188196均success、安装与界面启动验证通过；既有更新签名校验通过。发布任务build-info.json已实际publicUpdateVerified=true，包括完整下载包、Atom及公开更新清单回读。
- 本任务另外读回公开latest发布及v0.31.3源码、匿名latest.json；3个平台字段正确，公开9项资产的字节数与SHA256逐项匹配最终本地产物。Node直连读取曾ETIMEDOUT，改用已配置gh读取公开版本元数据及HTTPS/http1.1 curl下载公开清单，验证实际通过，没有关闭TLS或修改凭据。
- 发布地址：https://github.com/DDonlien/git-together/releases/tag/v0.31.3 。用户自行检查、下载和重启安装；未操作已安装的GitTogether。
- 最终预览：/Users/taobe/.codex/visualizations/2026/10/09/01a1214e-32cb-7e51-866b-953305f8e8f3/operation-icons-aligned.png 。这是生产React隔离预览，未当作安装版UI验收。
- 完成需求IMPORT-14-operation-collapse-icons；设计记录在DESIGN.md，README更新正式发布版本。临时浏览器、隔离服务和恢复入口已清理；不删除其他任务的发布锁，不改共享暂存区或其他WIP。
