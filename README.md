# AE AI Assistant

一个安装在 After Effects **窗口 → 扩展**中的 Windows CEP 面板，面向 AE 25/26。它通过 OpenAI-compatible API 生成受控的 AE 动作计划，也可以调用图片和异步视频接口生成素材并自动导入工程。

## 安装

要求：Windows 10/11、After Effects 25 或 26、Node.js 18+。

```powershell
npm install
npm run check
.\scripts\install-dev.ps1 -Build
```

重启 AE，打开 **窗口 → 扩展 → AE AI Assistant**。面板可以像其他 AE 面板一样停靠。

如果菜单里没有出现：

1. 确认目录 `%APPDATA%\Adobe\CEP\extensions\com.chenyu.aeaiassistant` 存在。
2. 关闭并重新启动 AE，而不是只关闭面板。
3. 安装脚本会自动为 CSXS 9–12 启用当前用户的 `PlayerDebugMode`。

## 首次配置

1. 打开 **API** 页，创建档案。
2. 填写 Base URL 和 API Key；密钥由 Windows DPAPI CurrentUser 加密，界面不会回显。
3. 勾选 chat、image、video 能力并填写对应模型。
4. 点击“保存档案”，再使用“测试连接”“获取模型”或余额查询。
5. 视频接口不是统一标准，需要在高级设置中填写提交端点、状态端点和 JSON 字段路径。

API 页面内置 OpenAI、DeepSeek、Kimi、通义千问、智谱 GLM、小米 MiMo、火山豆包和自定义兼容接口预设。选择供应商后基础地址会自动填写；保存密钥并点击“获取模型”即可缓存模型列表。保存后的档案可以再次点击、修改并重新保存。

聊天页、图片生成页和视频生成页都有独立的供应商与模型选择器，三类选择会分别记忆。

兼容接口的默认聊天路径为 `/chat/completions`，模型列表路径为 `/models`。Base URL 通常已包含 `/v1`。

## 安全模型

- AI 只能返回 `ae-actions/v1` 白名单 JSON，不能直接运行任意 JSX。
- 所有动作在面板中预览后才执行；删除图层或关键帧需要二次确认。
- 一次计划包含在单个 AE Undo Group 中，可用 Ctrl+Z 撤销。
- 不上传工程文件或素材，只发送工程、活动合成及选中图层的文字元数据。
- 本项目不使用 MySQL，也不把 API Key 写入源码、状态文件或日志。

## 数据位置

- 插件：`%APPDATA%\Adobe\CEP\extensions\com.chenyu.aeaiassistant`
- 状态：`%APPDATA%\AE AI Assistant\state.json`
- 加密密钥：`%APPDATA%\AE AI Assistant\secrets.json`
- 生成素材：当前 `.aep` 旁的 `AI Generated\YYYY-MM-DD\`
- 对话归档：在插件“历史”页面选择任意本地目录；完整对话以 UTF-8 Markdown 写入该目录。

归档成功后，系统盘状态文件只保留标题、交接摘要和外部文件路径，不再保留完整归档消息。未设置目录或目录不可写时，插件会阻止归档，不会静默保存到 C 盘。

## 开发

```powershell
npm run dev       # 浏览器布局预览，不连接真实 AE/API
npm test          # Vitest 单元与契约测试
npm run build     # 生成 dist CEP 包
npm run check     # 完整测试 + 构建
```

`public/jsx/host.jsx` 是 ExtendScript 宿主执行器；`src/node/cepRuntime.ts` 负责 API、DPAPI 和文件；`src/ui/App.tsx` 是面板界面。

## 已知边界

- 首版仅保证 Windows 与 AE 25/26。
- 不删除工程素材、合成、文件夹或磁盘文件。
- 各家视频和余额 API 结构不同，需要按供应商文档配置字段路径。
- AE 内的最终宿主行为仍需使用实际工程和真实 API 凭据进行人工冒烟测试。
