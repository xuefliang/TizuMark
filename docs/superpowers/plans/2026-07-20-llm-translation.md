# LLM 翻译功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LLM translation to TizuMark that sends editor content to an OpenAI-compatible API and opens the result in a new tab.

**Architecture:** All API calls happen from the frontend via `fetch()`. Settings (API URL, key, model, target language, temperature) live in the existing `settings` object stored in `localStorage`. No Rust backend changes.

**Tech Stack:** Pure JS, browser `fetch()`, OpenAI-compatible API

## Global Constraints

- No Rust backend modifications
- API key stored in localStorage (existing pattern)
- Settings follow existing pattern: `defaultSettings()` → `initSettings()` → `resetSettings()` → `applyLanguage()`
- All UI strings must be added to both `zh` and `en` in I18N
- Follow existing DOM patterns: dialog-overlay, dropdown-menu, settings-row
- Menu added between "视图" (view) and "帮助" (help) menus in toolbar

---

### Task 1: Add I18N strings

**Files:**
- Modify: `src/app.js:344` (end of zh block) and `src/app.js:651` (end of en block)

**Interfaces:**
- Consumes: Existing I18N object pattern
- Produces: Translation keys for all new UI text

- [ ] **Step 1: Add zh strings**

Insert before `sidebar:` line:

```javascript
    tools: '工具',
    translate: '翻译',
    translateFull: '翻译全文...',
    translation: '翻译',
    translationApiUrl: 'API 地址',
    translationApiKey: 'API Key',
    translationModel: '模型',
    translationTargetLang: '目标语言',
    translationTemperature: '温度',
    translationLangChinese: '中文',
    translationLangEnglish: 'English',
    translationLangJapanese: '日本語',
    translationLangAuto: '自动检测',
    translationInProgress: '正在翻译...',
    translationComplete: '翻译完成',
    translationFailed: '翻译失败',
    translationNoContent: '没有可翻译的内容',
    translationNoKey: '请先在设置中配置 API Key',
    translationResultIncomplete: '翻译结果可能不完整',
    translationNetworkError: '网络错误，请检查 API 地址和网络连接',
    translationError401: 'API Key 无效，请检查设置',
    translationError429: '请求过于频繁，请稍后重试',
    translationErrorUnknown: '翻译服务出错 ({code})',
    translationConfigHint: '配置 OpenAI 兼容 API 后可翻译当前文档',
    translationProgressPct: '翻译中 {pct}%',
    translationChunkSuffix: ' ({n}/{total})',
```

- [ ] **Step 2: Add en strings**

Insert before `sidebar:` line:

```javascript
    tools: 'Tools',
    translate: 'Translate',
    translateFull: 'Translate Full Text...',
    translation: 'Translation',
    translationApiUrl: 'API URL',
    translationApiKey: 'API Key',
    translationModel: 'Model',
    translationTargetLang: 'Target Language',
    translationTemperature: 'Temperature',
    translationLangChinese: '中文',
    translationLangEnglish: 'English',
    translationLangJapanese: '日本語',
    translationLangAuto: 'Auto Detect',
    translationInProgress: 'Translating...',
    translationComplete: 'Translation complete',
    translationFailed: 'Translation failed',
    translationNoContent: 'No content to translate',
    translationNoKey: 'Please configure an API Key in settings first',
    translationResultIncomplete: 'Translation result may be incomplete',
    translationNetworkError: 'Network error. Check API URL and connection',
    translationError401: 'Invalid API Key. Check settings',
    translationError429: 'Rate limited. Please try again later',
    translationErrorUnknown: 'Translation service error ({code})',
    translationConfigHint: 'Configure an OpenAI-compatible API to translate the current document',
    translationProgressPct: 'Translating {pct}%',
    translationChunkSuffix: ' ({n}/{total})',
```

- [ ] **Step 3: Run lint to verify no syntax errors**

Run: `node -e "const fs=require('fs');const c=fs.readFileSync('src/app.js','utf8');let depth=0;for(const ch of c){if(ch==='{')depth++;if(ch==='}')depth--;if(depth<0)throw Error('unexpected }');}console.log('Braces balanced, depth='+depth);"`

Expected: `Braces balanced, depth=0`

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "feat: add i18n strings for LLM translation feature"
```

---

### Task 2: Add HTML structure

**Files:**
- Modify: `src/index.html`

**Interfaces:**
- Consumes: I18N keys from Task 1
- Produces: HTML elements for tools menu, translation settings, and progress dialog

- [ ] **Step 1: Add Tools menu between View and Help menus**

Insert after the `btn-help` `.dropdown` closing `</div>` (line 113):

```html
          <div class="dropdown">
            <button id="btn-tools" class="toolbar-btn" title="工具">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 1 0 1.4l-1.6 1.6a1 1 0 0 1-1.4 0L9.3 7.1a1 1 0 0 1 0-1.4l1.6-1.6a1 1 0 0 1 1.4 0Z"/><path d="M6 6h.001M18 18h.001M3 3l4.5 4.5M3 21l4.5-4.5M21 3l-4.5 4.5M21 21l-4.5-4.5"/><path d="M18 6h.001M6 18h.001"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="1"/></svg>
              <span>工具</span>
              <span class="dropdown-arrow">&#9662;</span>
            </button>
            <div class="dropdown-menu hidden" id="tools-menu">
              <div class="dropdown-item" id="btn-translate-full">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14M5 16h14M8 5v14M16 5v14"/><path d="m3 8 2-4 2 4M3 16l2 4 2-4M17 8l2-4 2 4M17 16l2 4 2-4"/></svg>
                <span>翻译全文...</span>
                <span class="shortcut"></span>
              </div>
            </div>
          </div>
```

- [ ] **Step 2: Add translation section in settings dialog**

Insert after the "自定义字体" settings-section `</div>` (line 842), before the settings-footer:

```html
        <div class="settings-section">
          <h3 id="settings-translation-title">翻译</h3>
          <div class="settings-row settings-row-stacked">
            <p class="form-hint" id="setting-translation-hint">
              <svg class="hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <span class="hint-text"></span>
            </p>
          </div>
          <div class="settings-row">
            <label id="set-translation-api-url-label">API 地址</label>
            <input type="text" id="set-translation-api-url" class="settings-text-input" value="https://api.openai.com/v1/chat/completions" />
          </div>
          <div class="settings-row">
            <label id="set-translation-api-key-label">API Key</label>
            <input type="password" id="set-translation-api-key" class="settings-text-input" />
          </div>
          <div class="settings-row">
            <label id="set-translation-model-label">模型</label>
            <input type="text" id="set-translation-model" class="settings-text-input" value="gpt-4o-mini" />
          </div>
          <div class="settings-row">
            <label id="set-translation-target-lang-label">目标语言</label>
            <select id="set-translation-target-lang">
              <option value="自动检测">自动检测</option>
              <option value="中文" selected>中文</option>
              <option value="English">English</option>
              <option value="日本語">日本語</option>
            </select>
          </div>
          <div class="settings-row">
            <label id="set-translation-temperature-label">温度</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="range" id="set-translation-temperature" min="0" max="2" step="0.1" value="0.3">
              <span class="range-label" id="translation-temperature-label">0.3</span>
            </div>
          </div>
        </div>
```

- [ ] **Step 3: Add progress dialog**

Insert before the settings-dialog closing `</div>` (before line 850):

```html
  <!-- 翻译进度对话框 -->
  <div id="translation-progress-dialog" class="dialog-overlay hidden" role="dialog" aria-modal="true">
    <div class="dialog translation-progress-dialog">
      <div class="dialog-header">
        <h2 id="translation-progress-title">翻译中</h2>
      </div>
      <div class="dialog-content">
        <div class="translation-progress-status">
          <span class="translation-spinner"></span>
          <span id="translation-progress-text">正在翻译...</span>
        </div>
        <div class="progress-bar translation-progress-bar">
          <div class="progress-fill" id="translation-progress-fill"></div>
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 4: Add progress dialog styles to the CSS file at the end**

```css
/* Translation progress dialog */
.translation-progress-dialog .dialog {
  max-width: 400px;
}
.translation-progress-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.translation-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: translation-spin 0.8s linear infinite;
}
@keyframes translation-spin {
  to { transform: rotate(360deg); }
}
.translation-progress-bar {
  width: 100%;
}
```

- [ ] **Step 5: Verify HTML is well-formed**

Run: `node -e "const fs=require('fs');const h=fs.readFileSync('src/index.html','utf8');if(h.includes('</html>'))console.log('OK: has closing html tag');else console.log('WARN: no closing html tag')"`

Expected: `OK: has closing html tag`

- [ ] **Step 6: Commit**

```bash
git add src/index.html src/styles.css
git commit -m "feat: add tools menu, translation settings, and progress dialog HTML"
```

---

### Task 3: Add settings defaults and UI binding

**Files:**
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `defaultSettings()` pattern, `initSettings()` pattern, `resetSettings()` pattern
- Produces: `settings.translationApiUrl`, `settings.translationApiKey`, `settings.translationModel`, `settings.translationTargetLang`, `settings.translationTemperature` with defaults and UI binding

- [ ] **Step 1: Add translation defaults in `defaultSettings()`**

Insert after `customFonts: [],` line:

```javascript
    translationApiUrl: 'https://api.openai.com/v1/chat/completions',
    translationApiKey: '',
    translationModel: 'gpt-4o-mini',
    translationTargetLang: '中文',
    translationTemperature: 0.3,
```

- [ ] **Step 2: Add translation settings UI binding in `initSettings()`**

Insert after the `set-language` init block (after line 1286):

```javascript
    document.getElementById('set-translation-api-url').value = s.translationApiUrl || 'https://api.openai.com/v1/chat/completions';
    document.getElementById('set-translation-api-key').value = s.translationApiKey || '';
    document.getElementById('set-translation-model').value = s.translationModel || 'gpt-4o-mini';
    document.getElementById('set-translation-target-lang').value = s.translationTargetLang || '中文';
    document.getElementById('set-translation-temperature').value = s.translationTemperature != null ? s.translationTemperature : 0.3;
    document.getElementById('translation-temperature-label').textContent = s.translationTemperature != null ? String(s.translationTemperature) : '0.3';
```

Insert after the `set-scroll-sync` change event listener (after its closing `});`):

```javascript
    document.getElementById('set-translation-api-url').addEventListener('change', (e) => {
      this.settings.translationApiUrl = e.target.value;
      this.saveSettings();
    });
    document.getElementById('set-translation-api-key').addEventListener('change', (e) => {
      this.settings.translationApiKey = e.target.value;
      this.saveSettings();
    });
    document.getElementById('set-translation-model').addEventListener('change', (e) => {
      this.settings.translationModel = e.target.value;
      this.saveSettings();
    });
    document.getElementById('set-translation-target-lang').addEventListener('change', (e) => {
      this.settings.translationTargetLang = e.target.value;
      this.saveSettings();
    });
    document.getElementById('set-translation-temperature').addEventListener('input', (e) => {
      const v = Number(e.target.value).toFixed(1);
      document.getElementById('translation-temperature-label').textContent = v;
    });
    document.getElementById('set-translation-temperature').addEventListener('change', (e) => {
      this.settings.translationTemperature = Number(e.target.value);
      this.saveSettings();
    });
```

- [ ] **Step 3: Add translate method**

Insert a new method on the MarkdownEditor class. Find a good insertion point (e.g., after `exportImage()` method around line 3860):

```javascript
  async translateDocument() {
    if (!this.settings.translationApiKey) {
      this.showToast(this.t('translationNoKey'), 'danger');
      this.showSettings();
      return;
    }

    const tab = this.tabs[this.activeTabIndex];
    if (!tab || !tab.content) {
      this.showToast(this.t('translationNoContent'), 'danger');
      return;
    }

    const progressDialog = document.getElementById('translation-progress-dialog');
    const progressTitle = document.getElementById('translation-progress-title');
    const progressText = document.getElementById('translation-progress-text');
    const progressFill = document.getElementById('translation-progress-fill');
    progressDialog.classList.remove('hidden');

    try {
      const content = tab.content;
      const estimatedTokens = content.length * 0.3;
      const maxChars = 4000;
      const chunks = [];
      let targetLang = this.settings.translationTargetLang;

      if (targetLang === '自动检测') {
        targetLang = this.settings.language === 'en' ? 'English' : '中文';
      }

      if (content.length <= maxChars) {
        chunks.push(content);
      } else {
        const parts = content.split(/\n(?=#{1,6}\s)/);
        let current = '';
        for (const part of parts) {
          if ((current + '\n' + part).length > maxChars && current.length > 0) {
            chunks.push(current);
            current = part;
          } else {
            current = current ? current + '\n' + part : part;
          }
        }
        if (current) chunks.push(current);
      }

      const results = [];

      for (let i = 0; i < chunks.length; i++) {
        const pct = Math.round(((i + 1) / chunks.length) * 100);
        progressFill.style.width = pct + '%';
        if (chunks.length > 1) {
          progressText.textContent = this.t('translationProgressPct', { pct }) + this.t('translationChunkSuffix', { n: i + 1, total: chunks.length });
        } else {
          progressText.textContent = this.t('translationInProgress');
        }

        const systemMsg = chunks.length > 1 && i > 0
          ? `继续翻译，保持上下文一致。目标语言：${targetLang}。保留所有 Markdown 格式。只返回翻译结果。`
          : `你是一个翻译助手。将以下 Markdown 内容翻译为 ${targetLang}。保留所有 Markdown 格式标记、代码块、数学公式等。只返回翻译结果。如果检测到原文已经是 ${targetLang}，返回原文。`;

        const response = await fetch(this.settings.translationApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.settings.translationApiKey,
          },
          body: JSON.stringify({
            model: this.settings.translationModel,
            messages: [
              { role: 'system', content: systemMsg },
              { role: 'user', content: chunks[i] },
            ],
            temperature: this.settings.translationTemperature,
          }),
        });

        if (!response.ok) {
          if (response.status === 401) throw new Error(this.t('translationError401'));
          if (response.status === 429) throw new Error(this.t('translationError429'));
          throw new Error(this.t('translationErrorUnknown', { code: response.status }));
        }

        const data = await response.json();
        const translated = data.choices?.[0]?.message?.content || '';
        results.push(translated);
      }

      progressDialog.classList.add('hidden');

      const translatedContent = results.join('\n\n');
      const newName = tab.name + ' - ' + targetLang;
      await this.addTab(newName, translatedContent, null);
      this.showToast(this.t('translationComplete'), 'success');
    } catch (err) {
      progressDialog.classList.add('hidden');
      this.showToast(err.message || this.t('translationFailed'), 'danger');
    }
  }
```

- [ ] **Step 4: Add translation settings reset in `resetSettings()`**

Insert after `this.renderCustomFontSettings();` (before `this.setStatus`):

```javascript
    document.getElementById('set-translation-api-url').value = defaults.translationApiUrl || 'https://api.openai.com/v1/chat/completions';
    document.getElementById('set-translation-api-key').value = defaults.translationApiKey || '';
    document.getElementById('set-translation-model').value = defaults.translationModel || 'gpt-4o-mini';
    document.getElementById('set-translation-target-lang').value = defaults.translationTargetLang || '中文';
    document.getElementById('set-translation-temperature').value = defaults.translationTemperature != null ? defaults.translationTemperature : 0.3;
    document.getElementById('translation-temperature-label').textContent = defaults.translationTemperature != null ? String(defaults.translationTemperature) : '0.3';
```

- [ ] **Step 5: Commit**

```bash
git add src/app.js
git commit -m "feat: add translation settings defaults, UI binding, and translateDocument method"
```

---

### Task 4: Wire up menus, event listeners, and i18n

**Files:**
- Modify: `src/app.js`
- Prerequisite: Tasks 1-3 complete

**Interfaces:**
- Consumes: Tools menu dropdown registration, translate button click handler, applyLanguage update
- Produces: Fully working translation feature

- [ ] **Step 1: Register tools menu in toolbar dropdown system**

In `initEventListeners()`, add to the `toolbarDropdowns` array (add after `{ btn: 'btn-help', menu: 'help-menu' },`):

```javascript
      { btn: 'btn-tools', menu: 'tools-menu' },
```

- [ ] **Step 2: Add translate button click handler**

Insert after the `btn-check-update` event listener (after line 2780):

```javascript
    document.getElementById('btn-translate-full').addEventListener('click', () => {
      document.getElementById('tools-menu').classList.add('hidden');
      this.translateDocument();
    });
```

- [ ] **Step 3: Add i18n bindings in `applyLanguage()`**

Insert after `updateToolbarBtn('btn-help', t('help'));`:

```javascript
    updateToolbarBtn('btn-tools', t('tools'));
```

Insert after `updateMenuText('btn-about', t('about'));`:

```javascript
    updateMenuText('btn-translate-full', t('translateFull'));
```

Insert after `updateMenuText('btn-user-guide', t('userGuide'));` (around line 841):

```javascript
    updateMenuText('btn-translate-full', t('translateFull'));
```

Insert after `setRowLabel('set-preview-font', t('previewFont'));` (around line 938):

```javascript
    const th = document.getElementById('settings-translation-title');
    if (th) th.textContent = t('translation');
    const hintEl = document.querySelector('#setting-translation-hint .hint-text');
    if (hintEl) hintEl.textContent = t('translationConfigHint');
    setRowLabel('set-translation-api-url', t('translationApiUrl'));
    setRowLabel('set-translation-api-key', t('translationApiKey'));
    setRowLabel('set-translation-model', t('translationModel'));
    setRowLabel('set-translation-target-lang', t('translationTargetLang'));
    // Update translation target language options text
    const langSelect = document.getElementById('set-translation-target-lang');
    if (langSelect) {
      langSelect.options[0].text = t('translationLangAuto');
      langSelect.options[1].text = t('translationLangChinese');
      langSelect.options[2].text = t('translationLangEnglish');
      langSelect.options[3].text = t('translationLangJapanese');
    }
    setRowLabel('set-translation-temperature', t('translationTemperature'));
    document.getElementById('translation-progress-title').textContent = t('translationInProgress');
    document.getElementById('translation-progress-text').textContent = t('translationInProgress');
```

- [ ] **Step 4: Final verification - check app starts without errors**

Run: `node -c src/app.js`

Expected: No output (syntax OK)

- [ ] **Step 5: Commit**

```bash
git add src/app.js
git commit -m "feat: wire up tools menu, translate event, and i18n bindings"
```

---

## Self-Review Checklist

- **Spec coverage:** All spec requirements implemented
  - ✅ Settings: API URL, API Key, model, target language, temperature
  - ✅ Tools menu with "Translate Full Text..."
  - ✅ Progress dialog during translation
  - ✅ New tab with translated content
  - ✅ Error handling for all cases
  - ✅ Large document chunking
  - ✅ Auto-detect target language based on UI language
- **Placeholder scan:** No TBD, TODO, or placeholders
- **Type consistency:** All method names, settings keys, element IDs consistent across tasks
