const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType, ShadingType } = require('docx');

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
        items.forEach(li => {
          const runs = [];
          collectTextRuns(li, runs);
          result.push(new Paragraph({ bullet: { level: listLevel }, children: runs.length ? runs : [new TextRun(li.textContent.trim())] }));
          const nested = li.querySelector('ul, ol');
          if (nested) walkNodes([nested], result, listLevel + 1);
        });
        break;
      }
      case 'ol': {
        const items = node.querySelectorAll(':scope > li');
        items.forEach((li) => {
          const runs = [];
          collectTextRuns(li, runs);
          result.push(new Paragraph({ numbering: { reference: 1, level: listLevel }, children: runs.length ? runs : [new TextRun(li.textContent.trim())] }));
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
            cells.push(new TableCell({ children: [new Paragraph({ children: cellRuns.length ? cellRuns : [new TextRun(tdEl.textContent.trim())] })] }));
          });
          rows.push(new TableRow({ children: cells }));
        });
        if (rows.length) result.push(new Table({ rows }));
        break;
      }
      case 'img': {
        const src = node.getAttribute('src') || '';
        if (src.startsWith('data:')) {
          const base64Data = src.split(',')[1];
          const imgEl = node;
          const naturalW = imgEl.naturalWidth || imgEl.width || 400;
          const naturalH = imgEl.naturalHeight || imgEl.height || 300;
          const maxW = 500;
          let w = naturalW > maxW ? maxW : naturalW;
          let h = naturalW > 0 ? Math.round((w / naturalW) * naturalH) : naturalH;
          result.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ data: base64Data, transformation: { width: w, height: h } })]
          }));
        }
        break;
      }
      case 'div': {
        const cls = node.className || '';
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
        walkNodes(node.childNodes, result, listLevel);
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
      switch (t) {
        case 'strong': case 'b':
          runs.push(new TextRun({ text, bold: true })); break;
        case 'em': case 'i':
          runs.push(new TextRun({ text, italics: true })); break;
        case 'code':
          runs.push(new TextRun({ text, font: 'Consolas' })); break;
        case 'a':
          runs.push(new TextRun({ text, hyperlink: { url: child.getAttribute('href') || '' } })); break;
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
  });
}

module.exports = { domToDocx, Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType };
