# Word 合同审核插件

基于 Office Add-in + Vite 的 Word 合同审核工具。  
在 Word 中读取段落，调用 OpenAI 接口生成风险审查结果，并自动写入 `[AI审核]` 批注。

## 1. 环境要求

- Node.js 20+（建议 20 LTS）
- npm 10+
- Microsoft 365 Word（桌面版或 Web 版）
- 可访问 OpenAI 接口的网络环境

## 2. 安装依赖

在项目根目录执行：

```bash
npm install
```

## 3. 启动开发服务

```bash
npm run dev
```

启动后本地地址为：

- `https://localhost:3000`

说明：

- 终端保持运行状态，不要关闭。
- 首次使用请先在浏览器打开 `https://localhost:3000/src/taskpane/taskpane.html`，并信任本地 HTTPS 证书，否则 Word 可能无法加载任务窗格。

## 4. 在 Word 中加载插件（Sideload）

使用项目根目录的 `manifest.xml`。

### Word Web（推荐）

1. 打开 Word Online（任意文档）。
2. 进入 `插入 -> 加载项 -> 我的加载项`。
3. 选择 `上传我的加载项`。
4. 上传项目里的 `manifest.xml`。
5. 插件加载后，点击“打开审核面板”。

### Word 桌面版

1. 打开 Word 桌面版（Microsoft 365）。
2. 进入 `插入 -> 我的加载项`（或 `加载项`）。
3. 选择上传自定义加载项（如入口可见），上传 `manifest.xml`。
4. 成功后在功能区看到“合同审核”分组，点击“打开审核面板”。

> 如果桌面版没有“上传我的加载项”入口，可先用 Word Web 进行开发联调。

## 5. 首次使用配置

打开任务窗格后，在配置区填写并保存：

- API 地址：默认 `https://api.openai.com/v1/chat/completions`
- API Key：你的密钥
- 模型名称：默认 `gpt-5-mini`
- 批注作者：默认 `AI合同审核助手`
- 审核 Prompt：可按业务调整

说明：

- API Key 仅保存在当前浏览器会话（`sessionStorage`），关闭页面后需要重新输入。

然后可选择：

- `审核全文`
- `审核选中段落`
- 开启 `测试模式`（Mock，不调用真实 API）

## 6. 常用命令

```bash
npm run dev      # 开发模式
npm run build    # 生产构建（输出到 dist/）
npm run lint     # 代码检查
npm test         # 单元测试
```

构建生产清单时可指定加载项域名（PowerShell）：

```powershell
$env:ADDIN_BASE_URL="https://addins.example.com"; npm run build
```

未指定时默认使用 `https://localhost:3000`。

## 7. 修改代码后如何重启生效

开发联调时按下面规则处理：

1. 修改 `src/taskpane/**`、`src/commands/**`、`src/assets/**`  
   保持 `npm run dev` 运行，保存代码后在 Word 里刷新任务窗格即可：
   
   - Word Web：浏览器直接刷新页面（`F5`）。
   - Word 桌面版：先关闭任务窗格，再从“打开审核面板”重新打开。

2. 修改 `manifest.xml`（例如图标、命令、资源 URL）  
   需要重新加载加载项，推荐步骤：
   
   - 保持或重启本地服务：`npm run dev`
   - 在 Word 中移除当前加载项
   - 重新上传项目根目录 `manifest.xml`
   - Word 桌面版如仍未生效，完全退出 Word 后再打开

3. 仍未生效时（常见于缓存）  
   
   - 确认终端无报错且 `https://localhost:3000` 可访问
   - 先移除加载项再重新上传 `manifest.xml`
   - 最后重启 Word

## 8. 停止服务

在运行 `npm run dev` 的终端按 `Ctrl + C`。

## 9. 常见问题

1. 无法加载任务窗格  
   通常是本地 HTTPS 证书未信任。先在浏览器访问 `https://localhost:3000/src/taskpane/taskpane.html` 并完成信任。

2. API 调用失败  
   检查 API Key、API URL、模型名是否正确，确认网络可访问对应接口。

3. 3000 端口被占用  
   结束占用进程后重新执行 `npm run dev`。
