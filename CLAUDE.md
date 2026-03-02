# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Word 文档插件（Office Add-in），用于使用 OpenAI API 审核合同文档，并以 Word 原生批注形式展示审核结果。

## 技术栈

- **框架**: Office Add-in (Web 技术)
- **语言**: 原生 JavaScript (无框架)
- **构建工具**: Vite
- **核心 API**: Office.js
- **AI 服务**: OpenAI Chat Completions API

## 项目结构

```
word-contract-reviewer/
├── manifest.xml              # Office 插件清单文件
├── package.json
├── vite.config.js
├── src/
│   ├── taskpane/            # 侧边栏主界面
│   │   ├── taskpane.html
│   │   ├── taskpane.js      # 主逻辑
│   │   ├── taskpane.css
│   │   ├── config.js        # 配置管理（API Key、模型、prompt）
│   │   ├── api.js           # OpenAI API 调用封装
│   │   ├── reviewer.js      # 审核核心逻辑（段落分块、字符限制）
│   │   ├── comment.js       # Word 批注管理（创建、颜色、筛选）
│   │   ├── export.js        # 导出 Word 报告
│   │   ├── mock.js          # 测试模式 mock 数据
│   │   └── utils.js
│   ├── commands/
│   │   └── commands.js      # Ribbon 按钮命令
│   └── assets/              # 图标资源
├── config/
│   └── settings.json        # 用户配置文件（本地存储）
└── logs/
    └── error.log
```

## 核心功能设计

### 审核流程
1. 用户触发审核（全文或选中内容）
2. 按段落分块，检查字符数限制（30000 字）
3. 调用 OpenAI API，传入段落数组和审核 prompt
4. 解析 JSON 响应（包含 paragraphIndex、issue、suggestion、riskLevel、legalBasis）
5. 在对应段落创建 Word 批注，按风险等级设置颜色

### 批注格式
- 前缀：`[AI审核]`
- 风险等级颜色：critical(红) / high(橙) / medium(黄) / low(蓝)
- 内容：问题描述、修改建议、风险等级、法律依据

### 配置管理
- 用户自备：API 地址、API Key、模型名称（默认 gpt-5-mini）
- 可编辑的审核 prompt（提供默认合同审核 prompt）
- 配置存储在本地文件（明文，需提供安全提示）
- 支持自定义批注作者名称

### 技术限制
- 文档字符数限制：30000 字
- API 超时：30 秒
- 失败重试：1 次
- 支持断点续传

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 本地安装插件
# 1. 构建后将 manifest.xml 添加到 Office 信任目录
# 2. Windows 路径: C:\Users\<用户名>\AppData\Local\Microsoft\Office\16.0\Wef\
```

## Office.js 关键 API 使用

### 获取段落
```javascript
await Word.run(async (context) => {
  const paragraphs = context.document.body.paragraphs;
  paragraphs.load("text");
  await context.sync();
  return paragraphs.items.map((p, i) => ({
    index: i,
    text: p.text
  }));
});
```

### 创建批注
```javascript
await Word.run(async (context) => {
  const paragraph = context.document.body.paragraphs.getByIndex(index);
  const range = paragraph.getRange();
  const comment = range.insertComment(commentText);
  await context.sync();
});
```

## OpenAI API 调用规范

### 请求格式
```javascript
{
  model: modelName,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ],
  response_format: { type: 'json_object' }
}
```

### 响应格式（JSON）
```json
{
  "reviews": [
    {
      "paragraphIndex": 0,
      "issue": "问题描述",
      "suggestion": "修改建议",
      "riskLevel": "critical|high|medium|low",
      "legalBasis": "法律依据"
    }
  ]
}
```

## 错误处理策略

- **网络超时**：30 秒后超时，自动重试 1 次
- **API 错误**：记录错误码和消息，显示给用户
- **JSON 解析错误**：提示响应格式异常，记录原始响应
- **段落索引越界**：跳过该批注，记录警告
- **配置缺失**：使用默认配置或提示用户配置

## 开发注意事项

1. **所有文档操作必须在 `Word.run()` 上下文中执行**
2. **批注创建后需要 `context.sync()` 才能生效**
3. **API Key 存储需明确安全提示（明文存储风险）**
4. **大文档处理时使用异步操作，避免 UI 阻塞**
5. **测试模式（mock 数据）用于无 API Key 时的功能验证**
6. **批注前缀 `[AI审核]` 用于区分 AI 批注和用户批注**
7. **导出报告包含：统计汇总、批注详情、原文对照**

## 用户界面设计

### 侧边栏区域
1. **配置区域**（可折叠）：API 地址、Key、模型、prompt、批注作者
2. **操作区域**：审核全文/选中内容、测试模式开关、进度条、取消按钮
3. **批注管理区域**：风险等级筛选、批注列表、导出报告、清除 AI 批注
4. **状态区域**：当前状态、错误信息

### Ribbon 按钮
- 自定义选项卡"合同审核"
- 按钮：打开审核面板、快速审核、清除批注

## 默认审核 Prompt

系统 prompt 重点关注：
1. 权利义务不对等
2. 违约责任不明确
3. 争议解决条款缺失或不合理
4. 知识产权归属不清
5. 保密条款不完善
6. 付款条件不明确
7. 合同期限和终止条件
8. 不可抗力条款

详细 prompt 见 `plan.md` 第 84-111 行。

## 性能优化

- 配置信息缓存在内存中，减少文件读取
- 配置保存操作添加防抖，避免频繁写入
- 实时更新进度条，提供用户反馈
- 预留分批处理接口（当前设计为全文一次发送）
