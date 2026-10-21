# Desktop正式发布与0.33.0升级

- 用户原始prompt：那就把正式发布和自动更新补齐，签名、公证后发布，让现在的 0.33.0 能检查到并升级到最新版本，以后推送打包都要完成这一整套。
- 模型：GPT-6；运行环境仅公开家族标识，无法可靠取得更具体版本。
- 启动分支/提交/产品版本：main / f229f9296e981c225228ec9ee47d6c11a62908c2 / 0.36.5。
- 开始时间：2026-10-21 17:08 Asia/Shanghai。
- 结束时间：执行中。
- 是否提交：尚未。
- 需求：DESKTOP-01-updates、DESKTOP-01-updates-pipeline。

## 已阅读上下文与成功标准

已读根与macos的AGENTS、README、DESIGN、REQUIREMENTS和上一轮main-package日志；模板本地source版本与当前相同。fetch后main与origin一致，工作树干净。公开latest.json仍为0.33.0；此前0.36.5仅开发包，未发布。检查固定GitHub Desktop代码、旧0.33.0更新信任/归档验证及已有仓库外签名、公证配置入口。

完整交付为同源三平台成品、macOS Developer ID及Accepted公证/staple、旧版可验证的签名更新、原版Desktop更新器接入产品更新源、正式Release与完整公共回读。安装升级只在独立临时副本验证，用户安装版及真实账号/仓库不操作。保留原版Git、授权、凭据和后台语义；不恢复旧服务。

## 对话与行动

- 17:08—17:13：确认0.33.0的Mac归档校验要求GitTogether.app/Contents/MacOS/gittogether，Windows要求NSIS；新运行时需兼容两者，不能直接上传开发ZIP作为更新。新版本后续更新继续使用原版Squirrel执行器，产品更新源由编译配置指定。
- 17:13—17:35：实现0.37.0正式构建、签名公证、同源Windows双架构工作流及旧tar/NSIS兼容；新UI调用原版UpdateStore，更新说明换为产品源且独立失败不会破坏更新检查。新增稳定数据目录启动器、只读解密旧配置并经原版账号Store/Dispatcher导入；旧加密文件不覆盖。Developer ID、公证profile及仓库外更新私钥均可读取，公证history预检通过。类型/Cargo及30项回归通过；独立0.33.0更新器夹具编译通过，源自旧版的归档接受规则逐字节保留，不编译旧Git或授权后台。实际签名包、隔离升级和公开发布仍待执行。

## 验证与剩余工作

执行中：实现有效正式构建/发布入口、升级兼容与隔离验证，完成前不声明正式发布。
