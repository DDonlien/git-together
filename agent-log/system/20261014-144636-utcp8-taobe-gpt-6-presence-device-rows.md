# Presence同账号设备记录拆分

- 用户原始prompt：「同一个人的两个设备应该拆成两条记录」。截图显示同一行合并了TAOBEPC与TaobedeMacBook-Pro.local。
- 模型：gpt-6；运行上下文仅提供该最具体标识，未推测其他型号。
- 开始检查的具体时刻未单独采集；变更基线保存于2026-10-14T14:41:21.604368+08:00；完成：2026-10-14T14:46:36.243934+08:00。
- 基准：main，7220f0d5a3abb8afedaed3c34b60a93c2bd851b3，源码0.33.0；当前功能及其他任务的既有未提交内容保留。
- 成功标准：同账号不同设备各占一条记录，并各自聚合该设备的分支、状态及远程操作；标题按设备数统计。

## 已阅读上下文和预检

根/macOS AGENTS、相关README/REQUIREMENTS/DESIGN、Presence模型/头像/远程目标匹配、此前设备名称日志已阅读。模板source实际回读与本对话先前缓存相同，版本v1.9.1-260916-010202。fetch --prune完成；main仍ahead5/behind4，既有分叉和未提交功能内容没有被本次窄修复覆盖、stash或再次合并。上一次用户选择合并origin/main的初始合并已经完成；之后新增远端同步仍保持待处理，本次没有新的Git提交、推送或打包。

## 行动和结果

原presencePeople仅按服务器/组织/身份聚合，把多设备名称放入deviceNames数组。改为以服务器、组织范围、账号身份及deviceId组成稳定元组键；单条记录只持有一个deviceName。设备名称相同、未知或一个账号多设备时均按实际deviceId区分；同一设备多个会话/分支/工作目录仍在该记录内聚合。状态优先级仅在该设备内部计算，各分支sources仅含该设备，既有presenceRemoteTargets因此只匹配对应远程设备。仓库及分支所有入口复用同一模型，头像堆叠和标题同步按设备记录显示。

标题与可访问名称改为“台设备”，保留姓名(设备名)、个人/组织信息、原字号布局及状态图例。更新PRESENCE-05-avatars/PRESENCE-05-device-name、README协作段落和DESIGN设备名称章节；没有新增API、修改服务器协议或部署GitPresence。

按修复递增patch至0.33.1，同步唯一权威macos/package.json及npm锁/Cargo版本镜像。完成类型检查后为保持页面/API版本一致更新本项目已确认的独立后台预览进程；停止前核对父进程cwd、进程组和原Rust实例ID。重启前后浏览器Git账号、仓库及关联均为0，没有取消用户授权或重放凭据。

## 验证和边界

- npm run check通过，git diff --check通过；未添加、修改或运行测试套件。
- 正常npm run dev启动完成，Rust debug服务编译成功并沿原签名入口执行；独立进程父PID为1，保留运行。
- 127.0.0.1:4173页面HTTP 200；账号API为0.33.1/backend rust，实例c1b2e7ae-7161-43c3-ad1c-05d0c54b2674；授权配置configured=true、版本一致。新PresenceAvatars及presence-model源码模块HTTP 200，已包含单设备名称字段。
- Presence接口connected，但本地预览没有Presence账号及会话；没有以此声称截图中真实双设备弹窗已在运行界面验收。当前源码/开发预览完成，不是已安装应用或正式安装包更新。
- 本次源文件基线：/var/folders/x1/nj8gw6sj3tz36zt026sy8h2m0000gn/T/presence-device-rows-eczprn60；运行日志：/var/folders/x1/nj8gw6sj3tz36zt026sy8h2m0000gn/T/gittogether-preview-mnxacq90/dev.log。
