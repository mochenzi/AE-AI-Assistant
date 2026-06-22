# AE AI Assistant 安装指南

本插件会出现在 After Effects 的 **窗口 → 扩展 → AE AI Assistant** 中，并可像其他 AE 面板一样停靠。

## 环境要求

- Windows 10 或 Windows 11
- After Effects 25/26
- Node.js 18 或更高版本
- PowerShell

## 从 GitHub 安装

1. 在 GitHub 仓库页面点击 **Code → Download ZIP**，解压到任意目录。
2. 在解压目录打开 PowerShell。
3. 执行：

```powershell
npm install
npm run install:ae
```

4. 完全退出并重新启动 After Effects。
5. 打开 **窗口 → 扩展 → AE AI Assistant**。

安装目录为：

```text
%APPDATA%\Adobe\CEP\extensions\com.chenyu.aeaiassistant
```

安装脚本会为当前 Windows 用户启用 CEP 调试模式，不会修改 AE 工程。

## 首次配置 API

1. 打开插件的 **API** 页面。
2. 新建 API 档案，填写名称、Base URL 和 API Key。
3. 勾选接口支持的能力：chat、image、video。
4. 填写对应模型名称，然后点击 **保存档案**。
5. 使用 **测试连接** 和 **获取模型** 验证配置。

插件内置 OpenAI、DeepSeek、Kimi、通义千问、智谱 GLM、小米 MiMo、火山豆包和自定义接口预设。选择供应商后基础地址会自动填写，保存后仍可随时重新编辑。聊天、图片和视频页面可以分别切换供应商与模型。

API Key 使用 Windows DPAPI 加密，只能由当前 Windows 用户解密，不会写进 Git 仓库。

## OpenAI-compatible 示例

```text
Base URL: https://api.example.com/v1
聊天端点: /chat/completions
模型端点: /models
模型 ID Path: data[*].id
```

图片、视频和余额接口在不同供应商之间并不统一，请按照供应商文档配置高级端点和 JSON Path。

## 常见问题

### AE 菜单里没有插件

- 确认已完全重启 AE。
- 检查插件安装目录是否存在。
- 重新运行 `npm run install:ae`。
- AE 2025/2026 中菜单可能显示为“扩展”或“扩展（旧版）”。

### 发送按钮不可用

- 先在 API 页面保存支持 chat 的档案。
- 填写聊天模型和上下文长度。
- 点击测试连接检查 API Key、Base URL 和网络。

### 素材无法自动导入

- 先保存 `.aep` 工程，插件需要根据工程位置创建 `AI Generated` 目录。
- 检查生成任务是否已成功下载。
- 确认接口返回的是有效图片或 MP4 文件。

### 删除操作为什么需要确认两次

删除图层和关键帧属于危险动作。插件会先显示动作计划，再要求二次确认；执行后仍可通过一次 Ctrl+Z 撤销整个任务。

### 对话归档保存在哪里

打开插件的 **历史** 页面，点击 **选择目录**，可以把完整对话保存到 D 盘或其他本地目录。归档文件为可直接阅读的 UTF-8 Markdown。系统盘只保留会话标题、摘要和外部文件路径；API Key 仍由 Windows DPAPI 加密保存。

## 开发与验证

```powershell
npm run dev
npm test
npm run check
npm run install:ae
```

更完整的功能说明与安全模型请查看 [README.md](README.md)。
