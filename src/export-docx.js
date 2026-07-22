const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType, ShadingType, LevelFormat, ExternalHyperlink, ImportedXmlComponent } = require('docx');

const ORDERED_LIST_REF = 'ordered-list';

let mml2omml;
// Prefer the vendored CommonJS build to avoid Node's ESM-in-require warning.
try {
  ({ mml2omml } = require('./lib/vendor/mathml2omml.cjs'));
} catch (e) {
  try {
    ({ mml2omml } = require('mathml2omml'));
  } catch (e2) {
    mml2omml = null;
  }
}

function getKatexSource(node) {
  const annotation = node.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
  if (annotation && annotation.textContent) return annotation.textContent.trim();
  const data = node.getAttribute('data-latex');
  if (data) return data.trim();
  return '';
}

function latexToOMML(latex, displayMode = false) {
  if (!mml2omml || typeof katex === 'undefined') throw new Error('math converter not available');
  const mathml = katex.renderToString(latex, { output: 'mathml', displayMode, throwOnError: false });
  return mml2omml(mathml);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms))
  ]);
}

async function katexNodeToPngDataUrl(node) {
  if (typeof html2canvas === 'undefined') throw new Error('html2canvas not available');
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.background = '#ffffff';
  wrapper.style.padding = '8px';
  const cloned = node.cloneNode(true);
  wrapper.appendChild(cloned);
  document.body.appendChild(wrapper);
  try {
    const canvas = await withTimeout(
      html2canvas(wrapper, { scale: 2, backgroundColor: '#ffffff', logging: false }),
      10000,
      'html2canvas formula render'
    );
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  } finally {
    wrapper.remove();
  }
}

function isDisplayKatex(node) {
  const cls = node.className || '';
  if (cls.includes('katex-display')) return true;
  const parent = node.parentElement;
  if (parent && (parent.className || '').includes('katex-display')) return true;
  return node.closest('.math-display') !== null;
}

function toBase64(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str).toString('base64');
  return btoa(str);
}

function fromBase64(b64) {
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
  return atob(b64);
}

async function preprocessMath(containerEl) {
  const katexNodes = Array.from(containerEl.querySelectorAll('.katex'));
  for (const node of katexNodes) {
    try {
      const latex = getKatexSource(node);
      if (!latex) throw new Error('no latex source');
      const displayMode = isDisplayKatex(node);
      const omml = latexToOMML(latex, displayMode);
      const placeholder = document.createElement(displayMode ? 'div' : 'span');
      placeholder.className = displayMode ? 'docx-math-display' : 'docx-math-inline';
      placeholder.setAttribute('data-omml', toBase64(omml));
      node.parentNode.replaceChild(placeholder, node);
    } catch (e) {
      console.warn('[docx] formula OMML failed, falling back to image:', e);
      try {
        const { dataUrl, width, height } = await katexNodeToPngDataUrl(node);
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = getKatexSource(node) || 'formula';
        img.width = Math.max(20, Math.round(width / 2));
        img.height = Math.max(20, Math.round(height / 2));
        node.parentNode.replaceChild(img, node);
      } catch (imgErr) {
        console.warn('[docx] formula image fallback failed:', imgErr);
        const text = getKatexSource(node);
        if (text) {
          const span = document.createElement('span');
          span.textContent = ' ' + text + ' ';
          node.parentNode.replaceChild(span, node);
        } else {
          node.remove();
        }
      }
    }
  }
}

async function domToDocx(containerEl) {
  const children = [];
  await walkNodes(containerEl.childNodes, children, 0);
  return children;
}

function buildNumberingConfig() {
  return {
    config: [{
      reference: ORDERED_LIST_REF,
      levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: 'start' },
        { level: 1, format: LevelFormat.DECIMAL, text: '%1.%2.', alignment: 'start' },
        { level: 2, format: LevelFormat.DECIMAL, text: '%1.%2.%3.', alignment: 'start' },
      ],
    }],
  };
}

async function buildDocument(containerEl, title) {
  await preprocessMath(containerEl);
  const children = await domToDocx(containerEl);
  return new Document({
    title: title || 'Untitled',
    numbering: buildNumberingConfig(),
    sections: [{ children }],
  });
}

async function walkNodes(nodes, result, listLevel) {
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
    const cls = node.className || '';

    if (cls.includes('docx-math-display')) {
      try {
        const omml = fromBase64(node.getAttribute('data-omml') || '');
        const mathComponent = ImportedXmlComponent.fromXmlString(omml);
        result.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [mathComponent] }));
      } catch (e) {
        console.warn('[docx] display math placeholder failed:', e);
      }
      continue;
    }

    const opts = { children: [] };
    await collectTextRuns(node, opts.children);

    switch (tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const level = parseInt(tag[1]);
        const headingMap = { 1: 'Heading1', 2: 'Heading2', 3: 'Heading3', 4: 'Heading4', 5: 'Heading5', 6: 'Heading6' };
        result.push(new Paragraph({ heading: headingMap[level], children: opts.children }));
        break;
      }
      case 'p':
        if (opts.children.length) result.push(new Paragraph({ spacing: { after: 120 }, children: opts.children }));
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
        for (const li of items) {
          const runs = [];
          await collectTextRuns(li, runs);
          result.push(new Paragraph({ bullet: { level: listLevel }, children: runs.length ? runs : [new TextRun(li.textContent.trim())] }));
          const nested = li.querySelector('ul, ol');
          if (nested) await walkNodes([nested], result, listLevel + 1);
        }
        break;
      }
      case 'ol': {
        const items = node.querySelectorAll(':scope > li');
        for (const li of items) {
          const runs = [];
          await collectTextRuns(li, runs);
          result.push(new Paragraph({ numbering: { reference: ORDERED_LIST_REF, level: listLevel }, children: runs.length ? runs : [new TextRun(li.textContent.trim())] }));
          const nested = li.querySelector('ul, ol');
          if (nested) await walkNodes([nested], result, listLevel + 1);
        }
        break;
      }
      case 'table': {
        const rows = [];
        for (const trEl of node.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')) {
          const cells = [];
          for (const tdEl of trEl.querySelectorAll(':scope > th, :scope > td')) {
            const cellRuns = [];
            await collectTextRuns(tdEl, cellRuns);
            cells.push(new TableCell({ children: [new Paragraph({ children: cellRuns.length ? cellRuns : [new TextRun(tdEl.textContent.trim())] })] }));
          }
          rows.push(new TableRow({ children: cells }));
        }
        if (rows.length) result.push(new Table({ rows }));
        break;
      }
      case 'img': {
        const src = node.getAttribute('src') || '';
        if (src.startsWith('data:')) {
          const parts = src.split(',');
          const header = parts[0];
          const base64Data = parts[1];
          let imgType = 'png';
          const mimeMatch = header.match(/^data:image\/(\w+)/);
          if (mimeMatch) imgType = mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1];
          const imgEl = node;
          const naturalW = imgEl.naturalWidth || imgEl.width || 400;
          const naturalH = imgEl.naturalHeight || imgEl.height || 300;
          const maxW = 500;
          let w = naturalW > maxW ? maxW : naturalW;
          let h = naturalW > 0 ? Math.round((w / naturalW) * naturalH) : naturalH;
          result.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ data: base64Data, type: imgType, transformation: { width: w, height: h } })]
          }));
        }
        break;
      }
      case 'div': {
        if (cls.includes('alert')) {
          const firstChild = node.querySelector('.alert-title, :scope > :first-child');
          const titleText = firstChild ? firstChild.textContent.trim() : '';
          const contentEl = node.querySelector('.alert-content');
          const contentText = contentEl ? contentEl.textContent.trim() : node.textContent.trim();
          let fillColor = 'E8F0FE';
          if (cls.includes('alert-tip')) fillColor = 'E6F7EE';
          else if (cls.includes('alert-important')) fillColor = 'EDE7F6';
          else if (cls.includes('alert-warning')) fillColor = 'FFF3E0';
          else if (cls.includes('alert-caution')) fillColor = 'FFEBEE';
          const text = (titleText ? '[' + titleText + '] ' : '') + contentText;
          result.push(new Paragraph({ indent: { left: 360 }, shading: { type: ShadingType.CLEAR, fill: fillColor }, spacing: { before: 200, after: 200 }, children: [new TextRun(text)] }));
          break;
        }
        await walkNodes(node.childNodes, result, listLevel);
        break;
      }
      default:
        if (opts.children.length) result.push(new Paragraph({ children: opts.children }));
        break;
    }
  }
}

async function collectTextRuns(el, runs) {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent;
      if (text) runs.push(new TextRun(text));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const t = child.tagName.toLowerCase();
      const childCls = child.className || '';

      if (childCls.includes('docx-math-inline')) {
        try {
          const omml = fromBase64(child.getAttribute('data-omml') || '');
          runs.push(ImportedXmlComponent.fromXmlString(omml));
        } catch (e) {
          console.warn('[docx] inline math placeholder failed:', e);
        }
        continue;
      }

      if (childCls.includes('docx-math-display')) {
        continue;
      }

      const text = child.textContent || '';
      if (!text) continue;
      switch (t) {
        case 'strong': case 'b':
          runs.push(new TextRun({ text, bold: true })); break;
        case 'em': case 'i':
          runs.push(new TextRun({ text, italics: true })); break;
        case 'code':
          runs.push(new TextRun({ text, font: 'Consolas' })); break;
        case 'a': {
          const href = child.getAttribute('href') || '';
          if (href) {
            runs.push(new ExternalHyperlink({ children: [new TextRun(text)], link: href }));
          } else {
            runs.push(new TextRun(text));
          }
          break;
        }
        case 'br':
          runs.push(new TextRun({ break: 1 })); break;
        case 'del':
          runs.push(new TextRun({ text, strike: true })); break;
        case 'mark':
          runs.push(new TextRun({ text, shading: { type: ShadingType.CLEAR, fill: 'FBBF24' } })); break;
        case 'kbd':
          runs.push(new TextRun({ text, font: 'Consolas', shading: { type: ShadingType.CLEAR, fill: 'F0EFEE' } })); break;
        default:
          runs.push(new TextRun(text)); break;
      }
    }
  }
}

module.exports = { domToDocx, buildDocument, buildNumberingConfig, Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType, ExternalHyperlink, LevelFormat, ImportedXmlComponent };
