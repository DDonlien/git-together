# Presence公开接入协议

此文档是公开客户端的接入契约，不依赖读取私有GitPresence源码。服务基址可以含路径；HTTPS是必需的，本机loopback开发允许HTTP。客户端不得将Git平台令牌作为Presence凭证。

## 独立账号协议1

原生客户端向`v1/account/`发送JSON，标头`X-Presence-Client: native`；后续接口使用`Authorization: Bearer <会话凭证>`。浏览器在同源`account`页面登录，使用HttpOnly Cookie，不把凭证放在localStorage。

| 方法 | 请求 | 返回 |
| --- | --- | --- |
| GET status | 无；已登录可带会话 | version、mode(personal/hosted)、organizationManagement、registrationAvailable、setupRequired、account或null、repositories |
| POST register | email、password、displayName、可选setupKey | 账号状态；原生另有token、expiresAt，浏览器仅写Cookie |
| POST login | email、password | 与注册成功格式相同 |
| POST logout | 空对象 | ok；当前会话失效 |
| POST repositories | add与remove的仓库ID数组 | 更新后的账号状态 |
| POST password | currentPassword、password | ok、signedOut；所有会话与旧设备授权失效 |

账号profile为服务端id、email、displayName、emailVerified；初版emailVerified为false。仓库ID是Git平台公开仓库网址的host加完整pathname、转小写并去尾部斜线，保留合法`.git`仓库名和URL转义。绑定不授予其他账号或组织权限。

## 设备控制协议1

原生端在`POST v1/control/enroll`发送name，以账号会话作Bearer与`X-Presence-Account`证明，获得独立deviceId、deviceToken、userId；其他控制端点使用设备凭证。旧手工访问/登记密钥仍可用于兼容。

设备`GET state`、`POST announce`更新自己明确开放的工作区、branch/HEAD、组织范围和动作。请求依次使用`POST requests`、目标`POST claim`和`POST finish`；可取消排队请求或撤销本人设备。action只允许commit、submit、abort、discard；kind为preview、generate、execute、retryPush、restore。每个请求有UUID、deviceId、repositoryId、workspaceId；执行绑定目标预览，生成说明和提交按该分支进行。组织范围由服务端从目标开放范围确定，不能由请求方任意赋值。

没有任意shell、任意本机目录或文件正文接口。命令与结果持久化，过期/撤销/目标变化时拒绝执行；已有Commit而Push失败时只能重试Push，不再次提交。

## 状态协议2

`v1/ws`使用原生Bearer鉴权，支持bridge发布与observer读取；心跳、完整快照、离线有效性沿用现有Presence字段。账号范围、组织成员与明确纳管项目同时限制可见快照，离线记录也保持账号隔离。新客户端不能把用户提供的仓库名、邮箱、显示名称或userId当作授权证明。
