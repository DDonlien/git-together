# 本地 Git 认证与账号仓库权限

- 用户请求：「按这个方案改，已有本地仓库默认沿用系统 Git/SSH，应用账号认证作为可选项，同时修复设置页不显示仓库授权和写权限问题。」
- 模型：gpt-6，开始于2026-10-15；此记录创建于2026-10-15T01:39:26+08:00。
- 需求：IMPORT-02-repository-authentication / IMPORT-02-repository-access。
- 基准：原容器目录没有.git，主工作区为main/；开始时main ab2aaaa37fe88ba38d726880b811a10fa9476ed2领先origin/main6项、落后16项，另有无关AGENTS改动及执行日志。已告知并在repository-auth/的codex/repository-auth分支实现，保留原主目录/index/提交，不自动合并或变基分叉main。
- 官方模板只读核对版本v1.9.1-260916-010202一致；权威文档维护在根目录。当前只改React/Tauri/Rust，不运行旧Node后台测试，不操作已安装GitTogether。
- 成功标准：旧本地关联缺省使用系统Git/SSH；本地远端/推送地址/SSH与helper保持；应用账号可按仓库显式选择并持久化，旧读取与操作计划不能跨认证方式；设置区分应用安装范围、Contents写权限和用户仓库角色，未知及失败可见，不把登录/公开读取当可写。

## 实现

- 有限LocalLink认证字段与三个RPC：检查仓库权限、打开固定授权设置、保存仓库认证；诊断白名单同步。
- Network系统模式沿用匹配远端及真实push URL；SSH alias只解析身份，Git执行保留原URL，凭据助手/SSH环境不被清空。应用模式独立HTTPS helper，不自动回退。
- Fetch跟踪匹配的远端，Push引用预检查/实际写入/后检查使用同一推送连接；Git LFS沿用相同模式。快照继承当前worktree认证配置，保留remote/branch，Git配置摘要参与预览失效检查。
- GitHub App安装及仓库分页检查，Contents与用户push权限交集；未授权/只读/角色拒绝/未知分别显示。传统token读取scopes，细粒度token不根据用户角色猜测令牌写权限。设置每账号自动/手动检查，默认折叠详情保留明确问题汇总，各关联仓库可切换认证方式。

## 验证与交付状态

- 第一轮 npm run check、cargo check --locked、npm run build、git diff --check通过；Rust首次完整编译53.52秒，生产构建保留已有大chunk提示。
- 复查多目录/快照和后台Git Fetch后，0.34.0最终 npm run check、cargo check --locked、npm run build、git diff --check均通过；产品版本和Rust/lock镜像同步，保留既有大chunk提示。
- 权限错误依据实际认证方式显示系统Git凭据/SSH检查或应用账号仓库授权/写权限检查；识别SSH公钥拒绝。系统模式在应用API已知不可访问时继续独立Fetch，本地刷新键包含认证方式。
- 版本更新与一次检查曾使用错误的相对目录，均明确报错且未声称通过；改用仓库根编辑、macos入口检查后完成最终0.34.0验证。
- 最后复查补齐认证切换时的旧响应丢弃及原目录/API缓存保留；最终类型/Rust/构建再次全部通过。
- 未新增或运行测试；未代替用户授权、读取系统凭据内容或操作已安装App，未声称真实用户SSH/钥匙串/写权限已验收。
- 再次fetch后main仍领先6/落后16；只读merge-tree确认两边已有冲突，涉及根文档、版本镜像、file tree/graph相关UI和Rust服务。没有实际合并或修改主目录。按AGENTS同步预检需用户决定主分支整合方式；正式main推送及三平台签名/公证发布尚未执行。
