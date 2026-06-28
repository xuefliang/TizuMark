const { unified } = require('unified');
const remarkParse = require('remark-parse').default || require('remark-parse');
const remarkGfm = require('remark-gfm').default || require('remark-gfm');
const remarkRehype = require('remark-rehype').default || require('remark-rehype');
const rehypeRaw = require('rehype-raw').default || require('rehype-raw');
const rehypeStringify = require('rehype-stringify').default || require('rehype-stringify');
const { visit } = require('unist-util-visit');

// ---- remark plugin: add data-source-line from AST position ----
function remarkSourceLine() {
  return (tree) => {
    visit(tree, (node) => {
      if (node.position && node.position.start && node.data === undefined) {
        node.data = {};
      }
      if (node.position && node.position.start) {
        node.data.hProperties = node.data.hProperties || {};
        node.data.hProperties['data-source-line'] = String(node.position.start.line);
      }
    });
  };
}

// ---- pre-processing ----

function countBacktickPrefix(s) {
  let count = 0;
  for (const c of s) {
    if (c === '`') count++;
    else break;
  }
  return count;
}

// Guard math blocks: $$...$$ → <!--MATHBLOCK_N--> and $...$ → <!--MATHBLOCK_N-->
function guardMathBlocks(content) {
  const placeholders = [];
  let result = '';
  let i = 0;
  const len = content.length;
  let inBacktick = false;
  let inDoubleBacktick = false;
  let inCodeBlock = false;
  let codeFenceCount = 0;
  let inCodeTag = false;

  while (i < len) {
    // Track fenced code blocks and double-backtick code spans
    if (content[i] === '`') {
      let btCount = 1;
      while (i + btCount < len && content[i + btCount] === '`') btCount++;
      if (btCount >= 3) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeFenceCount = btCount;
          result += content.substring(i, i + btCount);
          i += btCount;
          continue;
        } else if (btCount >= codeFenceCount) {
          inCodeBlock = false;
          result += content.substring(i, i + btCount);
          i += btCount;
          continue;
        }
      }
      // Double backtick code span: ``...`` — toggle as a unit, not per-backtick
      if (btCount === 2) {
        inDoubleBacktick = !inDoubleBacktick;
        result += '``';
        i += 2;
        continue;
      }
    }

    if (inCodeBlock) {
      result += content[i];
      i++;
      continue;
    }

    // Track <code> and </code> tags
    const inAnyCode = inBacktick || inDoubleBacktick;
    if (!inAnyCode) {
      if (content.substring(i, i + 6) === '<code>') {
        inCodeTag = true;
        result += '<code>';
        i += 6;
        continue;
      }
      if (content.substring(i, i + 7) === '</code>') {
        inCodeTag = false;
        result += '</code>';
        i += 7;
        continue;
      }
    }

    if (inCodeTag) {
      result += content[i];
      i++;
      continue;
    }

    // Inside double-backtick span: single backticks are content, not toggles
    if (inDoubleBacktick) {
      result += content[i];
      i++;
      continue;
    }

    // Track inline backticks (single `)
    if (content[i] === '`') {
      inBacktick = !inBacktick;
      result += content[i];
      i++;
      continue;
    }

    if (!inBacktick && content[i] === '$' && i + 1 < len && content[i + 1] === '$') {
      // Display math: $$...$$
      const start = i;
      i += 2;
      let foundEnd = false;
      while (i + 1 < len) {
        if (content[i] === '$' && content[i + 1] === '$') {
          i += 2;
          const mathBlock = content.substring(start, i);
          const idx = placeholders.length;
          placeholders.push(mathBlock);
          result += '<!--MATHBLOCK_' + idx + '-->';
          foundEnd = true;
          break;
        }
        i++;
      }
      if (!foundEnd) {
        result += content.substring(start, i);
      }
    } else if (!inBacktick && content[i] === '$' && i + 1 < len && content[i + 1] !== ' ' && content[i + 1] !== '\n' && content[i + 1] !== '$') {
      // Inline math: $...$
      const start = i;
      i += 1;
      let foundEnd = false;
      while (i < len) {
        if (content[i] === '$' && (i === start + 1 || content[i - 1] !== ' ')) {
          i += 1;
          const mathBlock = content.substring(start, i);
          const idx = placeholders.length;
          placeholders.push(mathBlock);
          result += '<!--MATHBLOCK_' + idx + '-->';
          foundEnd = true;
          break;
        }
        i++;
      }
      if (!foundEnd) {
        result += content.substring(start, i);
      }
    } else {
      result += content[i];
      i++;
    }
  }
  return { content: result, placeholders };
}

// Convert > [!TYPE] alerts to placeholders, let unified handle markdown inside
function getAlertType(line) {
  const lower = line.toLowerCase();
  if (lower.startsWith('> [!info]') || lower.startsWith('> [!note]')) return 'note';
  if (lower.startsWith('> [!tip]')) return 'tip';
  if (lower.startsWith('> [!important]')) return 'important';
  if (lower.startsWith('> [!warning]')) return 'warning';
  if (lower.startsWith('> [!caution]')) return 'caution';
  return null;
}

function getAlertTitleHTML(type) {
  const icons = {
    note: '<svg class="alert-icon" viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="7" x2="8" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="5" r="0.8" fill="currentColor"/></svg>',
    tip: '<svg class="alert-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.5c-2.5 0-4.5 2-4.5 4.5 0 1.8 1 3 2.2 3.8.3.2.3.5.3.8v1.4h4v-1.4c0-.3.1-.6.3-.8 1.2-.8 2.2-2 2.2-3.8 0-2.5-2-4.5-4.5-4.5z" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="6" y1="14" x2="10" y2="14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    important: '<svg class="alert-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.5L1.5 13.5h13L8 1.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="8" y1="6.5" x2="8" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.2" r="0.7" fill="currentColor"/></svg>',
    warning: '<svg class="alert-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.5L1.5 13.5h13L8 1.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="8" y1="6" x2="8" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.2" r="0.7" fill="currentColor"/></svg>',
    caution: '<svg class="alert-icon" viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="8" y1="4.5" x2="8" y2="8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="10.5" r="0.8" fill="currentColor"/></svg>'
  };
  const titles = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
  return '<div class="alert-title">' + (icons[type] || '') + (titles[type] || type) + '</div>';
}

function convertAlerts(content) {
  const lines = content.split('\n');
  const result = [];
  const alertBlocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const alertType = getAlertType(line);
    if (alertType) {
      const contentLines = [];
      i++;
      while (i < lines.length && lines[i].startsWith('>')) {
        let stripped = lines[i];
        if (stripped.startsWith('> ')) stripped = stripped.substring(2);
        else if (stripped.startsWith('>')) stripped = stripped.substring(1);
        contentLines.push(stripped);
        i++;
      }
      const idx = alertBlocks.length;
      alertBlocks.push({ type: alertType, content: contentLines.join('\n') });
      result.push('<!--ALERTBLOCK_' + idx + '-->');
      result.push(contentLines.join('\n'));
      result.push('<!--ALERTBLOCK_' + idx + '_END-->');
      result.push('');
    } else {
      result.push(line);
      i++;
    }
  }
  return { content: result.join('\n'), alertBlocks };
}

function restoreAlerts(html, alertBlocks) {
  if (alertBlocks.length === 0) return html;
  let result = html;
  for (let idx = alertBlocks.length - 1; idx >= 0; idx--) {
    const block = alertBlocks[idx];
    const startMarker = '<!--ALERTBLOCK_' + idx + '-->';
    const endMarker = '<!--ALERTBLOCK_' + idx + '_END-->';
    const startPos = result.indexOf(startMarker);
    const endPos = result.indexOf(endMarker);
    if (startPos !== -1 && endPos !== -1) {
      const before = result.substring(0, startPos);
      const inner = result.substring(startPos + startMarker.length, endPos);
      const after = result.substring(endPos + endMarker.length);
      const titleHTML = getAlertTitleHTML(block.type);
      result = before + '<div class="alert alert-' + block.type + '">' + titleHTML + '<div class="alert-content">' + inner + '</div></div>' + after;
    }
  }
  return result;
}

// Convert definition lists
function convertDefLists(content) {
  const lines = content.split('\n');
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    // Check if next line starts with ": " (definition)
    if (i + 1 < lines.length) {
      const next = lines[i + 1];
      if ((next.startsWith(': ') || next === ':') &&
          trimmed !== '' &&
          !trimmed.startsWith('#') &&
          !trimmed.startsWith('-') &&
          !trimmed.startsWith('*') &&
          !trimmed.startsWith('>') &&
          !trimmed.startsWith('|') &&
          !trimmed.startsWith('`') &&
          !trimmed.startsWith('[') &&
          !trimmed.startsWith('<') &&
          !trimmed.startsWith('!')) {
        result.push('<dl>');
        while (i < lines.length && !lines[i].trim().startsWith('#') && !lines[i].trim().startsWith('>') &&
               lines[i].trim() !== '' && !lines[i].trim().startsWith('|') &&
               !lines[i].trim().startsWith('`')) {
          const term = lines[i];
          result.push('<dt>' + term + '</dt>');
          i++;
          while (i < lines.length && (lines[i].startsWith(': ') || lines[i] === ':')) {
            let def = lines[i];
            if (def.startsWith(': ')) def = def.substring(2);
            else if (def === ':') def = '';
            result.push('<dd>' + def + '</dd>');
            i++;
          }
        }
        result.push('</dl>');
        result.push('');
        continue;
      }
    }
    result.push(line);
    i++;
  }
  return result.join('\n');
}

// Extract abbreviations and hide from output
function extractAbbreviations(content) {
  const abbrs = [];
  const lines = content.split('\n');
  const result = [];
  for (const line of lines) {
    if (line.startsWith('*[')) {
      const bracketEnd = line.indexOf(']: ');
      if (bracketEnd !== -1) {
        const term = line.substring(2, bracketEnd);
        const def = line.substring(bracketEnd + 3);
        if (term.trim() !== '') {
          abbrs.push([term, def]);
        }
        result.push(''); // hide abbreviation definition
        continue;
      }
    }
    result.push(line);
  }
  return { content: result.join('\n'), abbreviations: abbrs };
}

// ---- post-processing ----

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function restoreMathBlocks(html, placeholders) {
  let result = html;
  for (let idx = 0; idx < placeholders.length; idx++) {
    const marker = '<!--MATHBLOCK_' + idx + '-->';
    const escaped = escapeHTML(placeholders[idx]);
    // 使用 split/join 而非 replace()，避免 replace 将 $$ 解释为特殊替换模式
    result = result.split(marker).join(escaped);
  }
  return result;
}

function sanitizeHTML(html) {
  const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'textarea', 'select', 'button', 'link', 'meta', 'base'];
  let result = '';
  let i = 0;
  const len = html.length;

  while (i < len) {
    if (html[i] === '<' && i + 1 < len) {
      if (html[i + 1] === '/') {
        // Closing tag
        let end = html.indexOf('>', i);
        if (end === -1) { result += html[i]; i++; continue; }
        let inner = html.substring(i + 2, end);
        let tagName = inner.split(/\s/)[0].toLowerCase();
        if (dangerousTags.includes(tagName)) {
          i = end + 1;
          continue;
        }
        result += html.substring(i, end + 1);
        i = end + 1;
      } else if (html[i + 1] === '!') {
        // Comment or DOCTYPE
        if (html.substring(i, i + 4) === '<!--' && html.indexOf('-->', i) !== -1) {
          let end = html.indexOf('-->', i) + 3;
          result += html.substring(i, end);
          i = end;
        } else {
          let end = html.indexOf('>', i);
          if (end === -1) { result += html[i]; i++; continue; }
          result += html.substring(i, end + 1);
          i = end + 1;
        }
      } else {
        // Opening or self-closing tag
        let end = html.indexOf('>', i);
        if (end === -1) { result += html[i]; i++; continue; }
        let inner = html.substring(i + 1, end);
        let tagName = inner.split(/\s/)[0].toLowerCase();
        if (dangerousTags.includes(tagName)) {
          i = end + 1;
          continue;
        }
        // Sanitize attributes
        let sanitizedTag = sanitizeTagAttributes(tagName, inner);
        result += '<' + sanitizedTag + '>';
        i = end + 1;
      }
    } else {
      result += html[i];
      i++;
    }
  }
  return result;
}

function sanitizeTagAttributes(tagName, inner) {
  // Remove dangerous event handlers and javascript: URLs
  let attrs = inner.substring(tagName.length);
  let cleaned = '';
  let j = 0;
  while (j < attrs.length) {
    // Skip whitespace
    while (j < attrs.length && /\s/.test(attrs[j])) { cleaned += attrs[j]; j++; }
    if (j >= attrs.length) break;

    // Read attribute name
    let nameStart = j;
    while (j < attrs.length && attrs[j] !== '=' && !/\s/.test(attrs[j])) j++;
    let attrName = attrs.substring(nameStart, j).toLowerCase();

    if (j < attrs.length && attrs[j] === '=') {
      j++; // skip =
      let valueStart = j;
      if (j < attrs.length && (attrs[j] === '"' || attrs[j] === "'")) {
        let quote = attrs[j]; j++;
        while (j < attrs.length && attrs[j] !== quote) j++;
        j++; // skip closing quote
      } else {
        while (j < attrs.length && !/\s/.test(attrs[j])) j++;
      }
      let raw = attrs.substring(nameStart, j);
      if (attrName.startsWith('on') || /javascript:/i.test(raw)) {
        continue; // skip dangerous attribute
      }
      cleaned += raw;
    } else {
      let raw = attrs.substring(nameStart, j);
      if (attrName.startsWith('on') || /javascript:/i.test(raw)) {
        continue;
      }
      cleaned += raw;
    }
  }
  return tagName + cleaned;
}

function embedAbbrData(html, abbreviations) {
  if (abbreviations.length === 0) return html;
  const json = JSON.stringify(abbreviations).replace(/'/g, '&#x27;');
  return html + '<div id="abbr-data" style="display:none" data-abbrs=\'' + json + '\'></div>';
}

// ---- main pipeline ----

function renderMarkdown(content) {
  // 1. Extract abbreviations
  const abbrResult = extractAbbreviations(content);
  const abbreviations = abbrResult.abbreviations;

  // 2. Guard math blocks
  const mathResult = guardMathBlocks(abbrResult.content);
  const placeholders = mathResult.placeholders;

  // 3. Convert alerts to placeholders
  const alertResult = convertAlerts(mathResult.content);
  const alertBlocks = alertResult.alertBlocks;

  // 4. Convert definition lists
  let processed = convertDefLists(alertResult.content);

  // 5. Unified pipeline
  let html;
  try {
    html = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkSourceLine)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(processed)
      .toString();
  } catch (e) {
    // Fallback: return raw content wrapped in <pre>
    console.error('Unified rendering error:', e);
    return '<pre>' + escapeHTML(content) + '</pre>';
  }

  // 6. Restore math blocks
  html = restoreMathBlocks(html, placeholders);

  // 7. Restore alert blocks
  html = restoreAlerts(html, alertBlocks);

  // 8. Sanitize
  html = sanitizeHTML(html);

  // 9. Embed abbreviation data
  html = embedAbbrData(html, abbreviations);

  return html;
}

// Export for Node.js bundling; also expose as global for browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderMarkdown };
}
return { renderMarkdown };
