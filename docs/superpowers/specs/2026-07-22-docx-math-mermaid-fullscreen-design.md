# DOCX 公式/Mermaid 导出修复与启动全屏设计

## 目标

修复 TizuMark 导出 DOCX 时的两个问题，并让应用启动时默认最大化：

1. 启动时窗口默认最大化（双击 exe 或双击 md 文件均生效）。
2. 导出 DOCX 时数学公式渲染为 Word 原生可编辑公式（OMML），不再出现乱码、重复文本。
3. 导出 DOCX 时 Mermaid 图表渲染为 PNG 图片插入。

## 背景与现状

- 应用基于 Tauri v2，前端为纯 HTML/JS，DOCX 导出由 `src/export-docx.js` 将预览 DOM 转换为 `docx` 库对象后生成。
- 当前 `export-docx.js` 对所有元素统一走文本提取，遇到 KaTeX 渲染后的公式 HTML 时会同时提取 `.katex-html`、隐藏 MathML 与 annotation 文本，导致重复、乱码。
- Mermaid 在预览中已渲染为 SVG，但导出 DOCX 时未做特殊处理，最终落入默认分支变成文本或空白。
- PDF 导出已实现 Mermaid 重新渲染为 SVG 的逻辑，可直接复用其思路。
- 窗口当前在 `src-tauri/tauri.conf.json` 中固定为 1200x800，未配置最大化。

## 设计决策

### 1. 启动最大化

在 `src-tauri/tauri.conf.json` 的 `app.windows[0]` 中增加 `"maximized": true`。Tauri v2 窗口配置原生支持该字段，启动时自动最大化，无需 Rust 或前端代码介入。

### 2. DOCX 数学公式 → OMML

采用「KaTeX MathML 输出 → mathml2omml → docx ImportedXmlComponent」的纯前端链路：

- **提取 LaTeX 源**：KaTeX 渲染后的 `.katex-mathml` 内包含 `<annotation encoding="application/x-tex">{原始 LaTeX}</annotation>`，优先从中读取；读取失败则回退到 `.katex` 元素的 `data-latex` 属性（如需要可在渲染时注入）。
- **生成 MathML**：调用 `katex.renderToString(latex, { output: 'mathml', throwOnError: false })`。
- **转为 OMML**：调用 `mathml2omml` 的 `mml2omml(mathml)` 得到 `<m:oMath>...</m:oMath>` 字符串。
- **插入 DOCX**：使用 `docx.ImportedXmlComponent.fromXmlString(omml)` 生成组件，放入对应 `Paragraph` 的 `children` 中。块级公式额外用 `AlignmentType.CENTER` 居中。
- **降级策略**：若任一环节失败，将该公式节点用 html2canvas 截图为 PNG，以 `ImageRun` 插入，避免导出失败。

### 3. DOCX Mermaid 图表 → PNG

在 `app.js exportDOCX()` 中、调用 `DocxExport.buildDocument` 之前处理预览克隆：

1. 找到所有 `.mermaid-container`。
2. 读取 `data-code` 属性（或容器文本）获取 Mermaid 源码。
3. 调用 `mermaid.render('docx-mermaid-' + i, code)` 得到 SVG 字符串。
4. 将 SVG 通过 `html2canvas` 或临时 `<img>` + canvas 转为 PNG base64。
5. 用 `<img src="data:image/png;base64,...">` 替换原容器，让 `export-docx.js` 现有的 `img` 处理逻辑直接生成 `ImageRun`。

### 4. 依赖

- 新增 `mathml2omml`（纯 JS，无 Node 依赖，可随 esbuild 打包）。
- 复用现有 `katex`、`mermaid`、`html2canvas`、`docx`。

### 5. 文件改动范围

- `src-tauri/tauri.conf.json`：增加 `maximized: true`。
- `src/export-docx.js`：
  - 新增 `.katex` 处理分支（OMML 或图片降级）。
  - 确保 `.mermaid-container` 被替换为 `<img>` 后能被 `img` 分支识别。
  - 导出 `ImportedXmlComponent` 等必要类型供 `app.js` 使用。
- `src/app.js`：
  - `exportDOCX()` 中新增 Mermaid → PNG 的预处理步骤。
  - 确保公式源码可被 `export-docx.js` 读取（必要时在渲染时保留 `data-latex`）。
- `package.json`：新增 `mathml2omml` 依赖；`build:docx` 脚本自动将其打包进 bundle。
- 测试：补充 `test/export-docx.test.cjs` 中关于公式和 mermaid 的单元测试。

## 错误处理

- 公式 OMML 转换失败时降级为 PNG，不阻塞导出。
- Mermaid 渲染失败时保留原始文本或占位图，不阻塞导出。
- 图片转换失败时记录日志并跳过该元素。

## 测试计划

1. 启动应用验证窗口默认最大化。
2. 使用包含行内公式、块级公式、Mermaid 图的 Markdown 导出 DOCX，用 Word/WPS 打开检查：
   - 公式可编辑且显示正确。
   - Mermaid 图显示为图片。
3. 运行 `npm test` 确保现有测试通过，新增测试覆盖公式/Mermaid 分支。
