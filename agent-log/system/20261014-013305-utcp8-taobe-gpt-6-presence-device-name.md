# Presence协作人员括号设备名称

- 用户原始prompt：「显示设备在括号里，形如：Taobe (Macbook Pro)」。
- 开始：2026-10-14T01:33:05+08:00；结束：2026-10-14T01:58:23+08:00。
- 模型：gpt-6，当前环境提供的最具体标识。
- 需求：PRESENCE-05-device-name。
- 基准：main，edbdbb408d8cf09817cdbef0610335f41295cf6b，0.30.10。复用本对话干净独立main副本并正常快进；共享codex-standalone-ts的大量WIP及索引保留。

根/macOS规则、模板通用前缀、当前Presence model/AvatarGroup/managed3/Rust读取和原NAS部署已核对。设备已有服务器登记名称，但world当前只下发deviceId，UI聚合时丢弃设备信息。因此在GitPresence中仅为managed3增加服务端验证的deviceName，并在Rust/前端保留；旧1/2帧明确剔除此字段，不把任意Hello设备ID当名称。

同账号多台操作设备保持单人/单头像，匹配目标仓库及分支后去重名称，在姓名后用英文括号、顿号分隔；缺少数据时显示设备未知，不展示内部UUID。保留姓名作为头像缩写来源，设备字段纳入弹窗布局roster键。按patch从0.30.10递增0.30.11并同步权威版本镜像。

成功标准：实际登记名称沿服务器→managed3→Rust→人员聚合→弹窗传递，源码类型/Cargo/生产构建和NAS/发布校验分别通过。按本轮指令不新增或运行测试套件，不操作用户已安装应用或要求解锁；沿持续授权提交、推送并复用现有发布配置。

实现后的类型检查和生产构建实际通过，客户端locked Cargo检查也通过；仅保留既有前端500kB分包提示。NAS原gitpresence:0.6.0容器实际healthy，普通Docker入口可用；sudo -n要求密码但无需使用，未改变权限或请求密码。当前配置/数据挂载分别为只读配置和/data，后续沿原Compose更新精确源码。

## 0.30.11正式发布完成

客户端源码1206747522e625e76accbc2824709d5ab6f75a5c已推送main，v0.30.11同指该提交。标准package:desktop实际exit0，直接复用已有gittogether-notary默认读取、Developer ID及仓库外Tauri更新签名；未重新配置公证、索取秘密或要求解锁。Apple 32edac0b-9537-4aa8-a927-a294b1ba4531为Accepted；deep/strict、staple/validate及更新签名通过，spctl同时报告原有security disabled，不把它当成默认设备Gatekeeper验收。Windows工作流38440478831同源x86/x64实际安装、启动、有限平台诊断、PE架构和最终更新签名通过；未配置Authenticode，不能混同更新签名。

正式版本https://github.com/DDonlien/git-together/releases/tag/v0.30.11，非draft非prerelease，九项资产。匿名公开latest/Atom、旧版清单、Tauri三平台清单和所有完整下载包/签名均已回读，build-info.json publicUpdateVerified=true。公开说明已通过文件更新为本次括号设备名和此前已合入的Gitea参与判断修复，API确认保存。

| 最终资产 | 字节 | SHA-256 |
| --- | ---: | --- |
| macOS ZIP | 6537354 | 891409852e788d13531ef2266c83cdf8d93d2a6dbb65a5cb5f1af83cecd75875 |
| macOS Tauri tar | 6535342 | 8c7eb14cd686c67fa48d35766da2d3873511539118b2a6f3aa36c753e07c05da |
| Windows x86 | 5619477 | 72de501735446945443c3af22e4448df948c965a1ec8deed51672e376b001776 |
| Windows x64 | 6024089 | edc929e9d40a5e8ec43256b7c9560a031f1d6058bed8361401beca59b9339ee2 |

服务端0d7055179287b455aab06b19e6f43212b37160a1已推送并从精确归档部署NAS 0.6.1，镜像sha256:5eff26262af3186cad81e4a8aae1a6f49cd214bf930983adefd5f737f40e4fbb。实际healthy、配置/数据挂载不变，正常TLS健康端点及相邻Gitea/Ink均200；world与managed协议的deviceName已在运行镜像回读。旧source/镜像和部署记录保留，新候选源码目录source-device-name-0d7055179287，详情见GitPresence NAS文档及deployment-info.json。

最终包记录：_builds/_builds/gittogether-0.30.11-macos-arm64-sqPFpe/build-info.json，sourceSha256 ef2b7b875dbc914f8ce5111e7f62405dcc1233012e66787024f22e798797880d。未新增或运行测试套件、未创建账号/改密码/改设备名称或执行用户Git写操作，不把源码或包验收当作用户安装版UI已验收。只移除本任务所有的发布锁，保留最终包和报告；共享工作区全部WIP保留。
