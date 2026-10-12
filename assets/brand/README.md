# GitTogether 品牌图标原图

2026-10-12用户选定的第三版：三个Git节点、连续分支与中央旋绕，黑色波点和银灰光照底板。

- `gittogether-app.png`：选定的圆角透明外缘原图，供macOS及应用内品牌使用。
- `gittogether-square.png`：直角正方形原图，供Windows及网页favicon使用。
- `gittogether-symbol-transparent.png`：只有中间白色图形的透明PNG，可独立使用。

这三张是内置imagegen生成原图的逐字节副本。设计阶段的生成提示词与验收记录见CONTENT-01相关内容日志。

在`macos/`执行`npm run icons`，使用项目安装的官方Tauri图标工具重新生成ICNS、ICO、PNG尺寸以及网页资源。生成文件是这组原图的派生输出；不要单独重绘它们。
