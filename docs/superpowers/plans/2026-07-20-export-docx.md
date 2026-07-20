# Export DOCX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add export DOCX (Word document) feature that converts rendered Markdown preview into a standard .docx file.

**Architecture:** Use `docx` npm library (browser-compatible) bundled via esbuild as IIFE. DOM→DOCX mapping logic in `src/export-docx.js`, built to `lib/export-docx-bundle.js`. Save via existing `write_binary_file` Tauri command.

**Tech Stack:** `docx` npm package, esbuild, Tauri `write_binary_file`

## Global Constraints

- No Rust backend modifications
- Follow existing export patterns (clone preview, resolve images, dialogSave, write_binary_file)
- All UI strings must be added to both `zh` and `en` in I18N
- esbuild bundle uses `--global-name=DocxExport --format=iife`

---

### Task 1: Install dependency, add build script, and build initial bundle

**Files:**
- Modify: `package.json`
- Create: `src/export-docx.js` (stub)

- [ ] **Step 1: Install docx**

Run: `npm install docx`

- [ ] **Step 2: Add build:docx script to package.json**

Edit `package.json`, add `"build:docx"` entry in the `"scripts"` object:

```json
    "build:docx": "esbuild src/export-docx.js --bundle --global-name=DocxExport --outfile=lib/export-docx-bundle.js --format=iife",
```

- [ ] **Step 3: Create stub export-docx.js**

Create `src/export-docx.js`:

```javascript
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, ImageRun, AlignmentType, ShadingType, Numbering } = require('docx');

function domToDocx(containerEl) {
  const children = [];
  walkNodes(containerEl.childNodes, children, 0);
  return children;
}

function walkNodes(nodes, result, listLevel) {
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        result.push(new Paragraph({ children: [new TextRun(text)] }));
      }
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = node.tagName.toLowerCase();
    const opts = { children: [] };
    collectTextRuns(node, opts.children);

    switch (tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const level = parseInt(tag[1]);
        const headingMap = { 1: 'Heading1', 2: 'Heading2', 3: 'Heading3', 4: 'Heading4', 5: 'Heading5', 6: 'Heading6' };
        result.push(new Paragraph({ heading: headingMap[level], children: opts.children }));
        break;
      }
      case 'p':
        result.push(new Paragraph({ spacing: { after: 120 }, children: opts.children }));
        break;
      case 'blockquote':
        result.push(new Paragraph({ indent: { left: 720 }, spacing: { before: 200, after: 200 }, children: opts.children }));
        break;
      case 'pre': {
        const codeEl = node.querySelector('code');
        const codeText = codeEl ? codeEl.textContent : node.textContent;
        result.push(new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun({ text: codeText.trim(), font: 'Consolas', size: 18 })] }));
        break;
      }
      case 'hr':
        result.push(new Paragraph({ thematicBreak: true }));
        break;
      case 'ul': {
        const items = node.querySelectorAll(':scope > li');
        items.forEach(li => {
          const run = new TextRun(li.textContent.trim());
          result.push(new Paragraph({ bullet: { level: listLevel }, children: [run] }));
          const nested = li.querySelector('ul, ol');
          if (nested) walkNodes([nested], result, listLevel + 1);
        });
        break;
      }
      case 'ol': {
        const items = node.querySelectorAll(':scope > li');
        items.forEach((li, idx) => {
          const run = new TextRun(li.textContent.trim());
          result.push(new Paragraph({ numbering: { reference: 1, level: listLevel }, children: [run] }));
          const nested = li.querySelector('ul, ol');
          if (nested) walkNodes([nested], result, listLevel + 1);
        });
        break;
      }
      case 'table': {
        const rows = [];
        node.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr').forEach(trEl => {
          const cells = [];
          trEl.querySelectorAll(':scope > th, :scope > td').forEach(tdEl => {
            const cellRuns = [];
            collectTextRuns(tdEl, cellRuns);
            cells.push(new TableCell({ children: [new Paragraph({ children: cellRuns })] }));
          });
          rows.push(new TableRow({ children: cells }));
        });
        result.push(new Table({ rows }));
        break;
      }
      case 'img': {
        const src = node.getAttribute('src') || '';
        if (src.startsWith('data:')) {
          const base64Data = src.split(',')[1];
          result.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ data: base64Data, transformation: { width: 400, height: 300 } })]
          }));
        }
        break;
      }
      default:
        if (opts.children.length) result.push(new Paragraph({ children: opts.children }));
        break;
    }
  }
}

function collectTextRuns(el, runs) {
  el.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent;
      if (text) runs.push(new TextRun(text));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const t = child.tagName.toLowerCase();
      const text = child.textContent || '';
      if (!text) return;
      if (t === 'strong' || t === 'b') {
        runs.push(new TextRun({ text, bold: true }));
      } else if (t === 'em' || t === 'i') {
        runs.push(new TextRun({ text, italics: true }));
      } else if (t === 'code') {
        runs.push(new TextRun({ text, font: 'Consolas' }));
      } else if (t === 'a') {
        runs.push(new TextRun({ text, hyperlink: { url: child.getAttribute('href') || '' } }));
      } else if (t === 'br') {
        runs.push(new TextRun({ break: 1 }));
      } else if (t === 'del') {
        runs.push(new TextRun({ text, strike: true }));
      } else if (t === 'mark') {
        runs.push(new TextRun({ text, shading: { type: ShadingType.CLEAR, fill: 'FBBF24' } }));
      } else {
        runs.push(new TextRun(text));
      }
    }
  });
}

module.exports = { domToDocx, Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType };
```

- [ ] **Step 4: Build the bundle**

Run: `npm run build:docx`

Expected: `lib/export-docx-bundle.js` is created (approx 400-600KB).

- [ ] **Step 5: Commit**

```bash
git add package.json src/export-docx.js lib/export-docx-bundle.js
git commit -m "feat: add docx dependency and DOM→DOCX mapping module"
```

---

### Task 2: Add HTML (script tag + menu item) and i18n strings

**Files:**
- Modify: `src/index.html`
- Modify: `src/app.js`

- [ ] **Step 1: Add script tag to index.html**

Find the other `<script>` tags near the end of `<body>`, add before `app.js`:

```html
  <script src="lib/export-docx-bundle.js"></script>
```

- [ ] **Step 2: Add menu item for Export DOCX in File menu**

Find the "导出 PDF" menu item and its separator. Insert after the `btn-export-pdf` dropdown-item (the `</div>` closing it):

```html
              <div class="dropdown-separator"></div>
              <div class="dropdown-item" id="btn-export-docx">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                <span>导出 DOCX</span>
                <span class="shortcut"></span>
              </div>
```

- [ ] **Step 3: Add i18n strings**

In `src/app.js`, add to zh block (near other export keys):

```javascript
    exportDOCX: '导出 DOCX',
    exportedDocx: '已导出 DOCX',
```

Add to en block:

```javascript
    exportDOCX: 'Export DOCX',
    exportedDocx: 'DOCX exported',
```

- [ ] **Step 4: Add applyLanguage() binding**

In `applyLanguage()`, find where `updateMenuText('btn-export-pdf', t('exportPDF'));` is and add after it:

```javascript
    updateMenuText('btn-export-docx', t('exportDOCX'));
```

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/app.js
git commit -m "feat: add export DOCX menu item, script tag, and i18n strings"
```

---

### Task 3: Add exportDOCX() method and event handler

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Add click handler in initEventListeners()**

Find `btn-export-pdf` click handler and add after it:

```javascript
    document.getElementById('btn-export-docx').addEventListener('click', () => {
      document.getElementById('file-menu').classList.add('hidden');
      this.exportDOCX();
    });
```

- [ ] **Step 2: Add exportDOCX() method**

Find `exportPDF()` method opening (around line 4864). Insert the new method between `exportImage()` and `exportPDF()`:

```javascript
  async exportDOCX() {
    try {
      const path = await dialogSave({
        defaultPath: this.activeTab.name
          ? this.activeTab.name.replace(/\.[^.]+$/, '') + '.docx'
          : 'export.docx',
        filters: [{ name: 'Word Document', extensions: ['docx'] }]
      });
      if (!path) return;

      const clone = this.preview.cloneNode(true);
      clone.style.position = '';
      clone.style.left = '';
      clone.style.top = '';
      clone.style.width = '';
      clone.style.padding = '';
      clone.style.overflow = '';
      clone.style.height = '';

      clone.querySelectorAll('.copy-btn').forEach(el => el.remove());
      const abbrData = clone.querySelector('#abbr-data');
      if (abbrData) abbrData.remove();

      const filePath = this.activeTab.filePath;
      if (filePath) {
        const dir = filePath.replace(/[/\\][^/\\]*$/, '');
        const imgPromises = Array.from(clone.querySelectorAll('img')).map(async (img) => {
          let src = img.getAttribute('src');
          if (!src || src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file://') || src.startsWith('blob:')) return;
          if (src.startsWith('/')) src = src.slice(1);
          try {
            const base64 = await invoke('fetch_image_as_base64', { url: dir + '/' + src });
            const ext = src.split('.').pop().toLowerCase();
            let mime = 'image/png';
            if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
            else if (ext === 'gif') mime = 'image/gif';
            else if (ext === 'svg') mime = 'image/svg+xml';
            else if (ext === 'webp') mime = 'image/webp';
            img.src = 'data:' + mime + ';base64,' + base64;
          } catch (e) { /* skip */ }
        });
        await Promise.allSettled(imgPromises);
      }

      const children = DocxExport.domToDocx(clone);
      const doc = new DocxExport.Document({
        title: this.activeTab.name || 'Untitled',
        sections: [{ children }],
      });
      const buffer = await DocxExport.Packer.toBuffer(doc);
      const arr = Array.from(new Uint8Array(buffer));
      await invoke('write_binary_file', { path, contents: arr });
      this.setStatus(this.t('exportedDocx') + ': ' + path);
    } catch (error) {
      this.setStatus(this.t('exportFailed') + ': ' + error);
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: add exportDOCX method and event handler"
```

---

## Self-Review

1. **Spec coverage:**
   - ✅ DOM→DOCX mapping (Task 1: export-docx.js)
   - ✅ esbuild bundle + script tag (Task 1, Task 2)
   - ✅ Menu item in File menu (Task 2)
   - ✅ exportDOCX() method (Task 3)
   - ✅ Image resolution (reuses exportHTML pattern in Task 3)
   - ✅ Save via dialogSave + write_binary_file (Task 3)
   - ✅ I18N strings (Task 2)

2. **Placeholder scan:** No TBD, TODO, or placeholders.

3. **Type consistency:** `DocxExport` global used consistently; method names (`exportDOCX`), i18n keys match.
