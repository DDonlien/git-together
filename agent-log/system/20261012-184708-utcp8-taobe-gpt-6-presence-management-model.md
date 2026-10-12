# Presence个人自动管理与组织Web配置

- 用户prompt（保留八点语义及关键术语）：
1. 不需要在这里处理密码修改。
2. 一个Presence账号首先有一个个人身份；针对个人身份，所有仓库一旦接入GitTogether都纳入Presence管理。
3. 仓库选择只存在于组织选择，由组织管理员在Presence管理端Web配置特定Git仓库地址。
4. 同一个账号归属于组织且在GitTogether可访问匹配仓库时，无感地从个人范围切换为组织范围；可见协作用户及远端操作根据组织权限变化。
5. Dashboard新增托管组织列和筛选；Dashboard及详情文件夹提示组织，详情展示托管组织及登录用户同级信息，不另建列表。
6. 添加仓库要求个人身份拥有Presence组织，并且对应Git鉴权身份拥有Git仓库ownership。
7. 同仓库可被多个组织独立绑定，Presence不限制、不合并，组织彼此隔离，Git权限仍由Git维护。
8. 关闭Presence后没有下级信息；开启只有一个Presence账号及可不断添加的多选服务器地址，使用当前账号验证服务器权限，同电脑可运行不同账号实例。
- 身份方案问题与用户答复：账号有归属登录服务，其他服务器验证同一身份（推荐）。
- 模型：gpt-6；环境仅提供家族标识，无法获得更精确版本。
- 启动main：e78db339；初始版本0.28.2；并行main已到0.29.1，本功能版本0.30.0，新增向后兼容的组织管理和多服务器身份，递增minor。
- 首次日志登记：2026-10-12T15:08:17.144254+08:00；开始处理时未记录秒级时钟，不反推开始时间。
- 源码/部署阶段完成：2026-10-12T18:47:08.429896+08:00；结束记录不反推初始时钟。
- 已读：适用根/子AGENTS、账号/权限/公开协议、Rust Presence和Control、现有网页/设置和目录、相关最新日志；模板通用内容一致。
- 判断：本轮以用户纠正取代个人勾选、客户端团队选择及单仓库只能属于一个组织的旧说明。身份以issuer和subject为准，密码仅给归属服务；Git仓库ownership和Presence组织owner分别由服务端核验。
- 验证计划：不新增或运行测试；类型、Cargo、构建、Docker及有限公开部署回读分别记录，真实Git平台授权/账号或写操作由用户完成。

## 源码阶段进度（2026-10-12T18:30:07.173670+08:00）

- 身份：Ed25519、目标限定、短时一次性证明；独立目标会话/设备，单用途委托验证归属服务的撤销代次，未按邮箱合并。Web跨服务登录有明确确认及浏览器nonce/Origin绑定。
- 自动管理：每设备仓库目录、已关联工作区、按服务器/组织独立状态和事务；移除手工个人绑定、团队选择及客户端改密码。后台Git状态读取与心跳分开，读失败撤去可执行目标并显示未知，保留正常连接。
- 组织Web：独立创建、成员角色、一次性邀请；Git平台鉴权和所有权重新验证后方可绑定，Presence组织owner也重新确认。允许同仓库多个组织，不合并；Role和scope revision由服务端决定。
- 客户端：开关/唯一账号/多选服务器；托管组织列、筛选、图标及详情；独立实例使用独立锁和数据目录，保持默认目录和更新参数。两类abort和现有分支AI/提交/推送/备份流程复用。
- 编译证据：服务端类型与生产构建、网页脚本语法检查通过；GitTogether仅本任务37文件的隔离树在08adcb73bb之上合成，TypeScript、Cargo --locked（macOS宿主）和Vite生产构建均通过。打包大块警告沿用现有构建，不改变拆包范围。
- 隔离：保留并行作者的Provider、性能、表头等未提交改动；Dashboard两处重叠仅组合本功能托管列和8列跨度，不纳入其状态/性能实现。采用私有Git index及原工作版本与HEAD三方组合，不切分支/删除工作区。
- 未新增或执行测试；未触发真实账号注册、Git授权/提交/丢弃、已安装应用操作。NAS更新将在精确源提交之后记录；本任务尚未发桌面安装包。

## 完成记录

- GitTogether源码提交：cbc454a0a1d4b99d76693ee81bf147396b022ee7，版本0.30.0，已推送main。实际任务树3a33afbcdbbfe65be9b7acb2219c631d2fd4f732，在后来main d482887edb之上合成；TypeScript、macOS宿主Cargo --locked和生产构建通过，未执行测试。
- GitPresence源码提交：0d9c35d24be141cd6fd1758c1e38f52c67ca08a5，版本0.6.0，已推送main。类型/生产构建、两个网页脚本语法检查通过。
- NAS从该服务源提交git archive构建，归档SHA256 efceb80434c9235e50fe4c4453e4cce1e57ea8bf8391341d4ffd4203c1b6b282。hosted镜像 sha256:b6864b33013b21498c00865af0b3b6223ee896002961c4c92af09370ea698ff2；personal镜像 sha256:79b7646b643575c5601cc3ca68fc2522a1584ecaf13e1006928b6eb821117459。
- Compose实际更新后healthy，用户1001:1001、只读根文件系统；现有数据卷/config保留。生成的身份私钥权限600、所有者1001:1001，未读取或输出内容。deployment-info.json已保留既有字段并更新源提交/镜像/归档来源。
- HTTPS回读：health 200，protocolVersion2/managedProtocolVersion3/controlProtocolVersion2/accountProtocolVersion1/identityProtocolVersion1；保留旧握手兼容。匿名account/status 200、automaticManagement=true，account=null；manage/status匿名401。account、account.js、manage、manage.js、identity/keys全部200；页面CSP/self和no-store实际回读。配置没有添加新的trustedIssuer，当前NAS继续作为已配置的账号归属服务；其他服务器需由其安装者明确配置信任后接入。
- 个人镜像以network none检查实际文件：组织/管理/所有权模块为空，无Bridge或server源映射。正常证书验证的相邻Gitea和Ink均200。
- React源码复核：保留稳定身份和作用域key，状态读取失败撤去在线有效性；筛选/托管信息来自服务端，调节UI不执行Git；密码字段不会回传或写诊断，后台状态不生成虚假成功。
- 边界：没有注册或改动真实用户账号，没有进行实际Git平台授权、跨服务器登录或双设备Git写/丢弃验收；没有发布0.30.0三平台安装包或操作用户安装版，也没有发布官网个人Docker分发/计费服务。上述源码/公开页面/容器证据不能替代这些验收。
