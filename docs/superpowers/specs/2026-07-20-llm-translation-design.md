# LLM 翻译功能设计文档

## 概述

为 TizuMark 增加 LLM 翻译功能：用户通过编辑器菜单触发，将全部 Markdown 内容发送至 OpenAI 兼容 API，翻译结果在新标签页中打开。

## 技术方案

**方案：前端直接调用（浏览器 fetch）**

- 浏览器原生 `fetch()` 直接从 JS 调用 LLM API
- API key 存储在 `localStorage`
- 不修改 Rust 后端

## 功能详情

### 设置配置

在现有设置对话框 (`#settings-dialog`) 中新增「翻译」区域：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| API 地址 | 文本输入框 | `https://api.openai.com/v1/chat/completions` | 可改为 DeepSeek/OpenRouter 等 |
| API Key | 密码输入框 | 空 | 存储在 localStorage（settings 对象） |
| 模型 | 文本输入框 | `gpt-4o-mini` | 用户自行填写模型名 |
| 目标语言 | 下拉选择 | `中文` | 选项：中文/English/日本語/自动检测。自动检测：检测原文语言，翻译为应用 UI 语言（settings.language） |
| 温度 | 滑块 0-2 | 0.3 | 翻译用低温度 |

### 触发翻译

1. 在菜单栏新增「工具」菜单，包含「翻译全文...」项
2. 触发后取当前编辑器全部内容
3. 验证 API Key 是否已配置，未配置则提示并打开设置
4. 检查内容非空
5. 显示进度对话框（不可取消，显示「正在翻译...」）
6. 调用 OpenAI 兼容 API（非流式，一次性返回）
7. 创建新标签页，标题为 `原文标题 - 译文`
8. 将翻译结果写入新标签页

### API 请求格式

```
POST {apiUrl}
Content-Type: application/json
Authorization: Bearer {apiKey}

{
  "model": "{modelName}",
  "messages": [
    {
      "role": "system",
      "content": "你是一个翻译助手。将以下 Markdown 内容翻译为 {targetLang}。保留所有 Markdown 格式标记、代码块、数学公式等。只返回翻译结果。如果检测到原文已经是 {targetLang}，返回原文。"
    },
    {
      "role": "user",
      "content": "{markdownContent}"
    }
  ],
  "temperature": 0.3
}
```

### 翻译约束

- 保留 Markdown 结构（标题层级、列表、表格、代码块、KaTeX 公式、Mermaid 等）
- 代码块中的内容不翻译
- URL 和图片路径不翻译
- 特殊语法（告警块 `> [!NOTE]`、定义列表等）保留结构

### 错误处理

| 场景 | 处理方式 |
|------|---------|
| API Key 未配置 | 弹出提示「请先在设置中配置 API Key」，打开设置对话框 |
| 网络错误 | 显示 toast 错误信息 |
| API 返回非 200 | 401→Key 无效，429→限流，其他→服务错误 |
| 返回内容异常 | 仍写入标签页，底部 toast 提示「翻译结果可能不完整」 |
| 文档为空 | 提示「没有可翻译的内容」 |
| 大文档（超过上下文限制） | 按段落/标题分块发送，逐块拼接，显示进度百分比 |

### 新增/修改文件

| 文件 | 变更 |
|------|------|
| `src/app.js` | 新增翻译设置 UI、`translateDocument()` 方法、工具菜单按钮、进度对话框 |
| `src/index.html` | 新增工具菜单项、翻译设置 UI、进度对话框 |
| `src/styles.css` | 翻译相关样式 |

### 不涉及变更

- Rust 后端 (`src-tauri/`) — 无需修改
- Markdown 渲染管道 — 无需修改
- 现有 i18n 系统 — UI 翻译静态字符串应添加翻译键
