# 导出 DOCX 功能设计文档

## 概述

在 TizuMark 中增加导出 DOCX（Word 文档）功能：将渲染后的 Markdown 预览内容转换为标准的 .docx 格式文件。

## 技术方案

**方案：docx JS 库 + 前端 DOM→DOCX 映射**

- 使用 `docx` npm 包（MIT 协议，7.4M 周下载量）在浏览器端生成 OOXML 文档
- 新建 `src/export-docx.js` 独立文件承载 DOM→DOCX 映射逻辑
- 复用已有 `write_binary_file` Tauri 命令和 `dialogSave` 保存对话框
- 无需后端 Rust 改动

## 依赖

安装：`npm install docx`

## 新增文件

| 文件 | 用途 |
|------|------|
| `src/export-docx.js` | DOM→DOCX 映射函数 `domToDocx(containerEl)` |
| `lib/export-docx-bundle.js` | esbuild 打包产物（`src/export-docx.js` + `docx`） |

### 打包方式

在 `package.json` 的 `scripts` 中新增一条 build 命令：

```json
"build:docx": "esbuild src/export-docx.js --bundle --global-name=DocxExport --outfile=lib/export-docx-bundle.js --format=iife"
```

这会将 `docx` 库和映射逻辑打包为 IIFE，通过全局变量 `DocxExport` 暴露：
- `DocxExport.domToDocx(containerEl)` → `Paragraph[]`
- `DocxExport.Document`, `DocxExport.Packer` 等（从 `docx` 转发）

### 加载方式

在 `index.html` 中通过 `<script>` 标签加载：

```html
<script src="lib/export-docx-bundle.js"></script>
```

## 修改文件

| 文件 | 变更 |
|------|------|
| `src/app.js` | 新增 `exportDOCX()` 方法、File 菜单事件、i18n 键 |
| `src/index.html` | 新增 `<script>` 标签加载打包文件、新增「导出 DOCX」菜单项 |
| `package.json` | 添加 `docx` 依赖 + `build:docx` 脚本 |

## 整体流程

1. 用户点击「文件 → 导出 DOCX」
2. 克隆 `#preview` DOM（同 `exportHTML`）
3. 移除 UI 辅助元素（`.copy-btn` 等）
4. 解析内联图片为 Base64
5. `DocxExport.domToDocx(clone)` → 返回 `Paragraph[]` 数组
6. `new DocxExport.Document({ sections: [{ children }] })` → `DocxExport.Packer.toBuffer(doc)` → `Uint8Array`
7. 二进制转为普通数组
8. `dialogSave({ filters: ['docx'] })` → `invoke('write_binary_file', { path, contents: arr })`

## DOM→DOCX 映射

| HTML 元素 | DOCX 类 |
|-----------|---------|
| `h1`–`h6` | `Paragraph({ heading: 'Heading1'–'Heading6' })` |
| `p` | `Paragraph({ spacing: { after: 120 } })` |
| `strong`, `b` | `TextRun({ bold: true })` |
| `em`, `i` | `TextRun({ italics: true })` |
| `code` (inline) | `TextRun({ font: 'Consolas' })` |
| `pre > code` | `Paragraph({ children: [TextRun({ font: 'Consolas', size: 18 })] })` |
| `ul > li` | `Paragraph({ bullet: { level: 0 } })` |
| `ol > li` | `Paragraph({ numbering: { ... } })` |
| `a` | `TextRun({ hyperlink: { url } })` |
| `img` | `ImageRun({ data, transformation })` |
| `blockquote` | `Paragraph({ indent: { left: 720 } })` |
| `table` | `Table({ rows: [TableRow({ children: [TableCell] })] })` |
| `hr` | `Paragraph({ thematicBreak: true })` |
| Callout/Alert | `Paragraph({ indent: { left: 360 }, shading: { fill: 'F0F0F0' } })` |

## UI 集成

### File 菜单项

在「导出 PDF」之后插入分隔线 + 导出 DOCX 项。

### 事件

```javascript
document.getElementById('btn-export-docx').addEventListener('click', () => {
  document.getElementById('file-menu').classList.add('hidden');
  this.exportDOCX();
});
```

### `exportDOCX()` 方法示意

```javascript
async exportDOCX() {
  const clone = this.preview.cloneNode(true);
  clone.querySelectorAll('.copy-btn, #abbr-data').forEach(el => el.remove());
  await this.resolveExportImages(clone);

  const children = DocxExport.domToDocx(clone.body || clone);
  const doc = new DocxExport.Document({
    title: this.activeTab.name,
    sections: [{ children }],
  });
  const buffer = await DocxExport.Packer.toBuffer(doc);

  const path = await dialogSave({
    defaultPath: this.activeTab.name.replace(/\.md$/, '') + '.docx',
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
  });
  if (!path) return;

  const arr = Array.from(new Uint8Array(buffer));
  await invoke('write_binary_file', { path, contents: arr });
  this.setStatus(this.t('exportedDocx') + ': ' + path);
}
```

### I18N

| Key | zh | en |
|-----|----|----|
| `exportDOCX` | 导出 DOCX | Export DOCX |
| `exportedDocx` | 已导出 DOCX | Exported DOCX |

## 不涉及变更

- Rust 后端（`src-tauri/`）— 无需修改
- Markdown 渲染管道 — 无需修改
- Tauri 权限 — 已有 `write_binary_file` + `dialog:allow-save`
