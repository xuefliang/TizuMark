// DOCX 导出单元测试：验证有序列表 numbering 合法、超链接生成等
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const JSZip = require('jszip');
const { buildDocument, Packer } = require('../src/export-docx.js');

function makeDom(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="preview">${html}</div></body></html>`);
  global.Node = dom.window.Node;
  global.Element = dom.window.Element;
  return dom.window.document.getElementById('preview');
}

async function getDocumentXml(container, title = 'Test') {
  const doc = buildDocument(container, title);
  const buffer = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

test('有序列表生成合法的 w:numId，不含 {1-0} 占位符', async () => {
  const container = makeDom(`
    <ol>
      <li>第一项</li>
      <li>第二项
        <ol><li>嵌套项</li></ol>
      </li>
    </ol>
  `);
  const xml = await getDocumentXml(container);
  assert.doesNotMatch(xml, /w:numId w:val="\{[^"]+\}"/, '不应包含非法 numbering 占位符');
  const numIds = [...xml.matchAll(/w:numId w:val="(\d+)"/g)].map(m => m[1]);
  assert.ok(numIds.length >= 2, '应至少有两个合法 numbering 引用（不同层级共享同一 numId）');
  assert.ok(numIds.every(id => /^\d+$/.test(id)), '所有 numId 必须是正整数');
  const ilvls = [...xml.matchAll(/w:ilvl w:val="(\d+)"/g)].map(m => m[1]);
  assert.ok(ilvls.includes('1'), '应包含嵌套层级 ilvl=1');
});

test('超链接生成 w:hyperlink 标签', async () => {
  const container = makeDom(`<p>访问 <a href="https://example.com">示例</a>。</p>`);
  const xml = await getDocumentXml(container);
  assert.match(xml, /<w:hyperlink[^>]*>/, '应生成 hyperlink 标签');
});

test('空 href 链接回退为普通文本', async () => {
  const container = makeDom(`<p>访问 <a>无链接</a>。</p>`);
  const xml = await getDocumentXml(container);
  assert.doesNotMatch(xml, /<w:hyperlink[^>]*>/, '空 href 不应生成 hyperlink 标签');
  assert.match(xml, /无链接/, '文本应保留');
});

test('无序列表与有序列表共存时 numbering 均合法', async () => {
  const container = makeDom(`
    <ul><li>无序项</li></ul>
    <ol><li>有序项</li></ol>
  `);
  const xml = await getDocumentXml(container);
  assert.doesNotMatch(xml, /w:numId w:val="\{[^"]+\}"/, '不应包含非法 numbering 占位符');
});
