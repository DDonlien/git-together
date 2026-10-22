# Presence 公开接入协议

基址允许子路径，HTTPS必需，loopback开发可用HTTP。账号、组织和设备身份来自服务器验证，不以邮箱、仓库名、文件夹或客户端userId作为证明。

## 账号协议1与自动登记

`v1/account/` 原生JSON使用 `X-Presence-Client: native`，后续用Bearer会话；同源Web使用HttpOnly/Secure Cookie及 `X-Presence-Client: web`，不将会话放在localStorage。

| 方法 | 请求 | 返回 |
| --- | --- | --- |
| GET status | 可带会话 | version1、automaticManagement、mode、issuer、组织管理/注册能力、account、repositories、organizations |
| POST register | email、password、displayName、可选setupKey | 状态；原生另返回token和expiresAt |
| POST login | email、password | 同注册返回格式 |
| POST catalogue | deviceId、repositories完整数组 | 合并各设备的实际仓库范围及组织信息 |
| POST logout | 空对象 | ok，当前会话失效 |
| POST password | currentPassword、password | 仅归属服务Web使用；会话及旧设备授权失效 |

profile为id、identityId、issuer、subject、email、displayName、emailVerified(false)。仓库ID使用平台公开网址host（含非默认端口）+完整pathname、转小写、去尾斜线，保留真实`.git`名称和URL转义。旧`repositories`增删端点只为旧客户端过渡；自动登记后的设备清单为准，当前客户端不提供手工勾选。

注册/改密码为8至128字符，不强制字符组合；登录只校验非空及最长128。一个实例只绑定一个账号，所有当前Git身份可访问的仓库自动登记；组织选择由Web所有者维护，客户端匹配成员和仓库后自动使用服务器返回的组织。

## 跨服务器身份协议1

`v1/identity/`：目标先用POST challenge({issuer})返回自身canonical audience和120秒nonce；归属服务用当前会话POST ticket({audience,nonce})返回Ed25519签名assertion及仅查询撤销状态的delegation；目标POST exchange({assertion,delegation})校验受信任签发者、公钥、audience、nonce、时效和实时有效性，再返回目标本地会话。

GET keys返回issuer和Ed25519公开JWK；POST validate({delegation})仅返回active。个人身份为issuer+subject的SHA256，不按邮箱合并。归属服务密码/登录Bearer不得发送给目标。delegation包含目标audience和授权epoch，不能用来登录、交换会话或登记设备。目标定期验证撤销，未知/离线不得授权控制；信任由服务器安装者明确配置。

网页 `identity/signin` → 归属服务 `identity/authorize` 确认 → 目标 `v1/identity/callback`，凭证只以表单传递，绑定浏览器一次性Cookie和Origin，禁止放入URL或第三方脚本。网页组织管理通过归属服务登录。

## 设备控制协议2

POST `v1/control/enroll` 以账号会话作Bearer与 `X-Presence-Account`，body为name，返回deviceId/deviceToken/userId。其他端点以设备凭证认证；已有设备会话过期仍可发布/接收，明确撤销、账号代次变化、组织范围变化会阻止操作。

| 方法 | 语义 |
| --- | --- |
| GET state | 当前授权设备、工作区、组织/角色、jobs、pending、automaticManagement、identityId；保留version1响应兼容 |
| POST catalogue | deviceId及仓库数组，用设备凭证更新自动清单 |
| POST announce | 本设备name与自动工作区列表；组织teamId和scopeVersion须与服务端当前范围一致 |
| POST requests | preview/generate/execute/retryPush/restore，action为commit/submit/abort/discard |
| POST claim / finish | 目标重新核验权限后认领并回传结果 |
| POST cancel / revoke | 取消未认领请求或撤销本人设备 |

工作区可携带`worktreeId`（本机工作目录的64位十六进制SHA256），与协议3的Presence项目标识相同；仅用于匹配对应操作目标，不发送真实目录或扩张权限。旧字段缺席继续接受；客户端对多个同分支目录无法判定时不选取目标。

请求UUID、server、organizationId、scopeVersion、deviceId、repositoryId、workspaceId及preview共同绑定。提交说明逐分支生成并可编辑。跨用户只能由同一纳管组织内严格更高角色操作；同一身份不同设备允许个人控制。目标仍验证保存的Git身份、真实工作目录及文件变化，只有固定有限行为，不接受任意shell、文件正文或Git凭证。Commit后Push失败只重试Push。


### 大清单分页与选中范围（控制协议2的可选扩展）

支持此扩展的服务器在控制state返回`filePages: true`，多服务器客户端按对应serverId协商。首次`preview`携带`cursor: 0`；目标缓存同一份真实文件顺序和HEAD/内容摘要，返回`previewId`、`files`及`filePage: {offset,total,nextCursor?}`。每页最多100项且文件JSON不超过48KiB；结束页省略nextCursor，总文件数可以超过1000。后续页用相同previewId与nextCursor再次请求preview，不新建快照，不混合不同读取时刻的清单。

`generate`和`execute`可以携带`selection: {all,ranges}`代替paths。ranges是按预览索引排序、互不重叠的闭区间；all为true时区间表示排除，为false时表示包含。全选未加载文件用`{all:true,ranges:[]}`，不会上传全部长路径。目标核对预览、请求者、设备、工作目录、动作、组织修订以及HEAD/内容摘要，再将索引还原为真实文件，交给既有Git执行链；AI只接收该选中范围。后续分页和说明生成也核对原预览的发起者归属，不能借同账号的另一设备或另一动作复用。

原128KiB请求/结果边界、旧paths与旧非分页结果继续接受；1000项限制只保留在旧单次paths/files数组，不能解释为整个工作区的文件上限。新客户端仍可读取旧端的小清单；超过旧端限制时明确提示更新客户端/服务器后在本弹窗重试，不要求到目标设备缩减文件。服务器、发起端与目标端均需支持分页，编辑器及Presence状态协议版本保持不变。

## 远端状态协议3

`v1/ws`支持账号会话或独立设备Bearer，设备握手deviceId须为服务端登记UUID。版本3支持bridge/observer、welcome/heartbeat/world/snapshot；完整快照含仓库/worktree/branch/HEAD、独立git/editor事实和unpublishedCommits。world的session包含identityId，project包含服务器确定的organizationId；world.organizations包含id/name/role/projects/revision。App不能通过上报organizationId选择自己的权限，服务器重新计算。

同仓库多组织、不同服务器的会话和命令分别隔离；未匹配的仓库只对同一个人身份可见。离线快照保留原范围但标为未知；不能因为另一个服务器在线而将此范围误标在线。版本1/2继续按旧字段回复，编辑器本机协议1及Bridge版本2不变。版本3最多4096个上报工作区、单快照16MiB、单项目10000文件；超限明确失败，不静默截断。

支持此字段的服务器在控制state返回`worktreeIdentity: true`；客户端只向已声明支持的服务器公布worktreeId，连接旧严格Schema服务器时仍使用原announce字段，避免新客户端使旧服务器拒绝登记。
