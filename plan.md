# Word合同审核助手 - 详细实现计划

## 一、需求总结

基于深入讨论，这是一个Word文档插件，主要功能包括：

### 核心功能
- 使用OpenAI API（Chat Completions）审核合同文档
- 以Word原生批注形式展示审核结果
- 支持手动按钮触发和选中文本审核两种方式
- 按段落分块处理文档内容
- 批注包含：问题指出、修改建议、风险等级（严重/高/中/低）、法律依据
- 使用四色方案标记风险等级（红/橙/黄/蓝）

### 技术栈
- Office Add-in (Web技术)
- 原生JavaScript + HTML/CSS
- Vite构建工具
- Office.js API

### 配置管理
- 用户自备API Key、API地址、模型名称（默认gpt-5-mini）
- 可编辑的prompt（提供默认通用合同审核prompt）
- 配置存储在插件目录的本地文件
- 明文存储但提供安全提示

### 用户体验
- 侧边栏面板界面
- 进度条、当前处理项、取消按钮
- 批注列表、筛选功能、导出Word报告、清除AI批注
- 测试模式（预设mock数据）

### 技术细节
- 文档字符数限制：30000字
- API超时：30秒
- 失败重试：1次
- 断点续传支持
- JSON格式响应解析
- 批注前缀标识：[AI审核]
- 用户自定义批注作者名称

## 二、项目结构

```
word-contract-reviewer/
├── manifest.xml              # Office插件清单文件
├── package.json              # 项目依赖配置
├── vite.config.js            # Vite构建配置
├── src/
│   ├── taskpane/
│   │   ├── taskpane.html     # 侧边栏主界面
│   │   ├── taskpane.js       # 主逻辑
│   │   ├── taskpane.css      # 样式
│   │   ├── config.js         # 配置管理
│   │   ├── api.js            # OpenAI API调用
│   │   ├── reviewer.js       # 审核核心逻辑
│   │   ├── comment.js        # 批注管理
│   │   ├── export.js         # 导出报告
│   │   ├── mock.js           # 测试模式mock数据
│   │   └── utils.js          # 工具函数
│   ├── commands/
│   │   └── commands.js       # Ribbon按钮命令
│   └── assets/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-64.png
│       └── icon-128.png
├── config/
│   └── settings.json         # 用户配置文件
└── logs/
    └── error.log             # 错误日志
```

## 三、核心模块设计

### 3.1 配置管理模块 (config.js)

**功能：**
- 读取/保存配置文件（API地址、API Key、模型、prompt、批注作者）
- 提供默认配置
- 配置验证

**默认Prompt：**
```
你是一位专业的合同审核专家。请仔细审核以下合同段落，识别潜在的法律风险、不合理条款和需要改进的地方。

对于每个发现的问题，请按以下JSON格式返回：
{
  "reviews": [
    {
      "paragraphIndex": 段落索引号（从0开始）,
      "issue": "问题描述",
      "suggestion": "修改建议",
      "riskLevel": "风险等级（critical/high/medium/low）",
      "legalBasis": "相关法律依据或合同标准"
    }
  ]
}

请重点关注：
1. 权利义务不对等
2. 违约责任不明确
3. 争议解决条款缺失或不合理
4. 知识产权归属不清
5. 保密条款不完善
6. 付款条件不明确
7. 合同期限和终止条件
8. 不可抗力条款

如果某个段落没有问题，可以不返回该段落的审核结果。
```

### 3.2 API调用模块 (api.js)

**功能：**
- 封装OpenAI API调用
- 支持自定义API地址
- 超时控制（30秒）
- 重试机制（1次）
- 错误处理和日志记录

**关键方法：**
```javascript
async function callOpenAI(paragraphs, config) {
  // 构建请求
  // 发送到OpenAI
  // 解析JSON响应
  // 错误处理和重试
}
```

### 3.3 审核核心模块 (reviewer.js)

**功能：**
- 获取文档内容（全文或选中部分）
- 按段落分块
- 字符数限制检查（30000字）
- 调用API进行审核
- 进度跟踪
- 断点续传支持

**审核流程：**
1. 获取文档段落
2. 检查字符数限制
3. 构建段落数组（包含索引和内容）
4. 调用API
5. 解析响应
6. 生成批注

### 3.4 批注管理模块 (comment.js)

**功能：**
- 创建Word批注
- 设置批注颜色（根据风险等级）
- 批注前缀：[AI审核]
- 批注作者设置
- 批注列表展示
- 按风险等级筛选
- 清除AI批注

**风险等级颜色映射：**
- critical（严重）→ 红色 (#FF0000)
- high（高）→ 橙色 (#FF8C00)
- medium（中）→ 黄色 (#FFD700)
- low（低）→ 蓝色 (#1E90FF)

**批注格式：**
```
[AI审核]
问题：{issue}
建议：{suggestion}
风险等级：{riskLevel}
法律依据：{legalBasis}
```

### 3.5 导出模块 (export.js)

**功能：**
- 导出Word格式报告
- 包含：批注详情、内容对照、统计汇总、元信息

**报告结构：**
1. 封面（标题、审核时间、使用模型）
2. 统计汇总（各风险等级数量、总批注数）
3. 批注详情列表（按风险等级排序）
4. 原文对照（段落内容+对应批注）

### 3.6 测试模式模块 (mock.js)

**功能：**
- 提供预设的mock响应数据
- 模拟API调用延迟
- 用于无API Key时的功能测试

## 四、用户界面设计

### 4.1 侧边栏主界面

**区域划分：**

#### 1. 配置区域（可折叠）
- API地址输入框
- API Key输入框（密码类型）
- 模型名称输入框
- 批注作者输入框
- Prompt编辑区（多行文本框）
- 保存配置按钮
- 安全提示文本

#### 2. 操作区域
- 审核全文按钮
- 审核选中内容按钮
- 测试模式开关
- 进度条（审核时显示）
- 当前处理项文本
- 取消按钮

#### 3. 批注管理区域
- 风险等级筛选下拉框（全部/严重/高/中/低）
- 批注列表（显示风险等级、问题摘要）
- 点击批注定位到文档位置
- 导出报告按钮
- 清除AI批注按钮

#### 4. 状态区域
- 显示当前状态（就绪/审核中/完成/错误）
- 错误信息显示

### 4.2 Ribbon按钮

- 添加自定义选项卡"合同审核"
- 按钮：打开审核面板、快速审核、清除批注

## 五、开发步骤

### 阶段1：项目初始化
1. 创建Office Add-in项目结构
2. 配置manifest.xml
3. 配置Vite构建
4. 创建基础HTML/CSS界面

### 阶段2：配置管理
1. 实现config.js模块
2. 实现配置文件读写
3. 实现默认配置和验证

### 阶段3：核心审核功能
1. 实现文档内容获取
2. 实现段落分块逻辑
3. 实现API调用模块
4. 实现JSON响应解析
5. 实现批注创建和颜色设置

### 阶段4：用户界面
1. 完善侧边栏界面
2. 实现进度显示
3. 实现批注列表
4. 实现筛选功能

### 阶段5：高级功能
1. 实现断点续传
2. 实现错误处理和重试
3. 实现测试模式
4. 实现导出报告

### 阶段6：优化和测试
1. 性能优化
2. 错误处理完善
3. 用户体验优化
4. 本地安装测试

## 六、关键技术点

### 6.1 Office.js API使用

**获取段落：**
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

**创建批注：**
```javascript
await Word.run(async (context) => {
  const paragraph = context.document.body.paragraphs.getByIndex(index);
  const range = paragraph.getRange();
  const comment = range.insertComment(commentText);
  // 设置颜色需要通过高亮或其他方式
  await context.sync();
});
```

### 6.2 OpenAI API调用

```javascript
const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    response_format: { type: 'json_object' }
  }),
  signal: AbortSignal.timeout(30000)
});
```

### 6.3 配置文件存储

使用localStorage（Office Add-in支持）或通过服务器端存储。

## 七、注意事项

1. **字符数限制**：在发送前检查，超过30000字提示用户
2. **API配额**：提醒用户注意API使用成本
3. **网络错误**：提供清晰的错误提示和重试选项
4. **批注冲突**：避免重复创建批注
5. **性能优化**：大文档处理时避免UI阻塞
6. **安全提示**：明确告知用户API Key存储方式

## 八、后续扩展方向

1. 支持自定义风险等级和颜色
2. 支持批注编辑和回复
3. 支持历史审核记录
4. 支持多语言界面
5. 支持更多导出格式（PDF、Excel）
6. 支持批量审核多个文档

## 九、JSON响应格式详细说明

### OpenAI返回的JSON结构
```json
{
  "reviews": [
    {
      "paragraphIndex": 0,
      "issue": "该条款中甲方的违约责任不明确，仅规定了乙方的违约责任",
      "suggestion": "建议增加甲方违约责任条款，明确甲方未按时付款或提供必要资料时应承担的违约金比例和赔偿范围",
      "riskLevel": "high",
      "legalBasis": "《民法典》第577条规定，当事人一方不履行合同义务或者履行合同义务不符合约定的，应当承担继续履行、采取补救措施或者赔偿损失等违约责任"
    },
    {
      "paragraphIndex": 2,
      "issue": "知识产权归属条款表述模糊",
      "suggestion": "建议明确约定项目开发过程中产生的知识产权归属，包括源代码、文档、设计图等具体权利归属",
      "riskLevel": "critical",
      "legalBasis": "《民法典》第841条规定，技术开发合同应当约定技术成果的归属和分享方式"
    }
  ]
}
```

### 段落匹配机制
- 通过`paragraphIndex`字段（从0开始）直接定位到对应段落
- 在发送给OpenAI时，会在prompt中包含段落索引信息
- 返回时根据索引号精确匹配到Word文档中的段落

## 十、错误处理策略

### API调用错误
- **网络超时**：30秒后超时，重试1次
- **API错误**：记录错误码和消息，显示给用户
- **JSON解析错误**：提示响应格式异常，记录原始响应
- **配额超限**：提示用户检查API配额

### 文档操作错误
- **段落索引越界**：跳过该批注，记录警告
- **批注创建失败**：记录错误，继续处理其他批注
- **权限不足**：提示用户检查文档权限

### 配置错误
- **API Key缺失**：提示用户配置
- **配置文件损坏**：使用默认配置
- **Prompt为空**：使用默认prompt

## 十一、性能优化策略

1. **分批处理**：虽然当前设计是全文一次发送，但预留分批处理接口
2. **进度反馈**：实时更新进度条，避免用户等待焦虑
3. **异步操作**：所有API调用和文档操作都使用异步方式
4. **缓存机制**：配置信息缓存在内存中，减少文件读取
5. **防抖处理**：配置保存操作添加防抖，避免频繁写入

## 十二、测试模式Mock数据

```javascript
const mockResponse = {
  reviews: [
    {
      paragraphIndex: 0,
      issue: "合同标的物描述不够具体，可能导致交付时产生争议",
      suggestion: "建议详细描述标的物的规格、型号、数量、质量标准等具体信息",
      riskLevel: "medium",
      legalBasis: "《民法典》第470条规定，合同的内容由当事人约定，一般包括标的、数量、质量等条款"
    },
    {
      paragraphIndex: 1,
      issue: "付款条款中未明确付款时间节点",
      suggestion: "建议明确约定各阶段付款的具体时间、条件和付款方式",
      riskLevel: "high",
      legalBasis: "《民法典》第509条规定，当事人应当按照约定全面履行自己的义务"
    },
    {
      paragraphIndex: 3,
      issue: "缺少争议解决条款",
      suggestion: "建议增加争议解决方式条款，明确约定仲裁或诉讼管辖地",
      riskLevel: "critical",
      legalBasis: "《民法典》第577条及《仲裁法》相关规定"
    }
  ]
};
```

## 十三、部署和安装说明

### 本地安装步骤
1. 构建项目：`npm run build`
2. 生成manifest.xml文件
3. 将manifest.xml添加到Office信任目录
4. 在Word中加载插件

### 信任目录配置（Windows）
```
C:\Users\<用户名>\AppData\Local\Microsoft\Office\16.0\Wef\
```

### 开发调试
1. 启动开发服务器：`npm run dev`
2. 使用Office开发者工具调试
3. 查看浏览器控制台日志

---

**计划制定时间**：2026-03-03
**预计开发周期**：2-3周（核心功能优先）
**技术难度**：中等
**主要挑战**：Office.js API学习、批注颜色设置、JSON响应解析
