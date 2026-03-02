# Word 合同审核插件代码审查报告

## 背景

用户请求对整个 Word 合同审核插件代码库进行全面审查。该插件使用 Office.js 和 OpenAI API 实现合同文档的自动审核，并以 Word 批注形式展示结果。经过对核心功能模块、辅助工具和配置文件的深入分析，发现了多个安全、功能和性能问题。

## 发现的问题分类

### 🔴 严重问题（P0 - 立即修复）

#### 1. **API Key 明文存储和泄露风险**

- **位置**: `src/taskpane/config.js:41`, `scripts/copy-static.mjs:6`
- **问题**:
  - API Key 以明文存储在 localStorage
  - `copy-static.mjs` 会将 `config/settings.json`（包含 API Key）复制到 dist 目录
  - `.gitignore` 未忽略 `config/settings.json` 和 `logs/` 目录
- **风险**: API Key 可能被提交到版本控制、打包到分发包、或从浏览器存储中提取
- **影响**: 严重的安全漏洞，可能导致 API 滥用和费用损失

#### 2. **XSS 注入风险**

- **位置**: `src/taskpane/taskpane.js:292`
- **代码**: `head.innerHTML = \`<span>段落 #${review.paragraphIndex + 1}</span><span>${getRiskLabel(review.riskLevel)}</span>\``
- **问题**: 使用 `innerHTML` 直接注入数据，虽然当前数据来自 API 响应，但如果响应被篡改可能执行恶意脚本
- **建议**: 使用 `textContent` 或 `createElement` 替代

#### 3. **生产环境 URL 硬编码**

- **位置**: `manifest.xml` 所有 URL 字段
- **问题**: 所有 URL 硬编码为 `https://localhost:3000`，生产环境无法使用
- **影响**: 插件无法在生产环境部署

### 🟠 高优先级问题（P1）

#### 4. **数据流不一致导致功能缺陷**

- **位置**: `src/taskpane/export.js:48-50`
- **问题**: 导出功能依赖 `review.paragraphText` 字段，但该字段仅在 `comment.js:49` 的 `applyReviewComments()` 中添加，不在 API 响应中
- **影响**: 如果用户刷新页面后从 localStorage 恢复 reviews，导出报告时"原文片段"部分将为空
- **建议**: 在 `reviewer.js` 的 `reviewContract()` 中就附加段落文本

#### 5. **Word API 同步效率低下**

- **位置**: `src/taskpane/comment.js:59`
- **问题**: 在循环内每插入一条批注就调用 `context.sync()`
- **影响**: 对于多条审核意见，性能极差，且如果中途失败会丢失所有后续批注
- **建议**: 批量插入后统一 sync，或实现检查点机制

#### 6. **竞态条件**

- **位置**: `src/taskpane/taskpane.js:163-164`
- **问题**: 用户快速点击审核按钮时，`state.abortController` 可能被覆盖，导致无法取消前一个请求
- **建议**: 在启动新审核前检查并取消现有请求

#### 7. **重试逻辑不足**

- **位置**: `src/taskpane/api.js:3,31`
- **问题**:
  - 只重试 1 次（`RETRY_TIMES = 1`）
  - 固定 400ms 延迟，未使用指数退避
  - 30 秒超时对大文档可能不够
- **建议**: 增加重试次数，实现指数退避，允许配置超时时间

### 🟡 中优先级问题（P2）

#### 8. **内存泄漏风险**

- **位置**: `src/taskpane/taskpane.js:50-58`, `src/taskpane/api.js:93-94`
- **问题**:
  - 事件监听器在 `bindEvents()` 中绑定但从未移除
  - AbortController 的事件监听器可能在异常情况下未清理
  - localStorage 中的 review 缓存无限增长
- **建议**: 实现清理机制，限制缓存大小

#### 9. **错误处理不完善**

- **位置**: 多处
- **问题**:
  - `config.js:87-89,99-101` 静默失败，不通知用户
  - `comment.js:38` 段落索引越界时静默跳过
  - `utils.js:149` localStorage 写入失败被忽略
- **建议**: 添加用户可见的错误提示和详细日志

#### 10. **代码重复**

- **位置**: `src/taskpane/mock.js:52-75`, `src/taskpane/api.js:115-138`
- **问题**: `wait()` 和 `sleep()` 函数功能完全相同
- **建议**: 统一到 `utils.js`

#### 11. **未使用的代码**

- **位置**: `src/taskpane/utils.js:36-47`
- **问题**: `debounce()` 函数未在项目中使用
- **建议**: 如果不需要则移除，或在配置保存时使用

### 🔵 低优先级问题（P3）

#### 12. **性能优化空间**

- **位置**: `src/taskpane/comment.js:113-119`
- **问题**: 每次筛选都对整个数组排序，应先筛选再排序
- **建议**: 优化筛选和排序顺序

#### 13. **导出文件格式不匹配**

- **位置**: `src/taskpane/export.js:55`
- **问题**: 使用 `application/msword` MIME 类型和 `.doc` 扩展名，但内容是纯文本
- **影响**: Word 打开时可能显示格式警告
- **建议**: 使用 `text/plain` 或生成真正的 .docx 格式

#### 14. **配置文件缺失**

- 缺少 `.nvmrc` 指定 Node.js 版本
- 缺少 `jsconfig.json` 改善 IDE 体验
- 缺少 `vitest.config.js` 测试配置
- 缺少 `.env.example` 环境变量示例

#### 15. **依赖版本过时**

- **位置**: `package.json`
- **问题**: ESLint 版本为 9.39.3，最新为 10.x
- **建议**: 升级依赖并测试兼容性

## 关键文件清单

需要修改的文件：

- `scripts/copy-static.mjs` - 移除敏感文件复制
- `.gitignore` - 添加敏感文件忽略
- `src/taskpane/taskpane.js` - 修复 XSS 和竞态条件
- `src/taskpane/comment.js` - 优化批量 sync
- `src/taskpane/api.js` - 改进重试逻辑
- `src/taskpane/config.js` - 添加错误提示
- `src/taskpane/reviewer.js` - 修复数据流问题
- `src/taskpane/export.js` - 修复文件格式
- `manifest.xml` - 添加环境变量支持

## 验证方法

修复后需要验证：

1. 确认 `config/settings.json` 和 `logs/` 未被 git 追踪
2. 构建后检查 dist 目录不包含敏感文件
3. 测试多条审核意见的批注创建性能
4. 测试快速点击审核按钮的取消功能
5. 测试刷新页面后导出报告的完整性
6. 测试 API 失败时的重试和错误提示
