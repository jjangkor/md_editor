const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'md_editor.html'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const inlineScript = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)?.[1];

test('inline JavaScript is syntactically valid', () => {
  assert.ok(inlineScript, 'inline application script must exist');
  assert.doesNotThrow(() => new Function(inlineScript));
});

test('rendered Markdown and sidebar TOC use the sanitized paths', () => {
  assert.match(html, /DOMPurify\.sanitize\(marked\.parse\(text\)/);
  assert.doesNotMatch(html, /sanitize:\s*false/);
  assert.match(html, /link\.textContent = text/);
  assert.doesNotMatch(html, /tocContent\.innerHTML = tocHTML/);
});

test('TOC links and preview headings share deterministic IDs', () => {
  assert.ok(html.includes('const id = `heading-${headings.length}`;'));
  assert.ok(html.includes('const id = `heading-${index}`;'));
});

test('math parsing preserves currency and protects code segments', () => {
  assert.equal(html.includes('markdownText.replace(/\\$([^$]+?)\\$/g'), false);
  assert.ok(html.includes('markdownText.replace(/\\\\\\(([^\\n]+?)\\\\\\)/g'));
  assert.match(html, /CODE_SEGMENT_/);
  assert.match(readme, /\| 가격 \| \$100 \|/);
  assert.match(readme, /\| 할인율 \| 25% \|/);
  assert.match(readme, /25\\% = 25/);
});

test('small screens and non-mouse input have resizing support', () => {
  assert.match(html, /@media \(max-width: 767px\)/);
  assert.match(html, /flex-direction:\s*column/);
  assert.match(html, /addEventListener\('pointerdown'/);
  assert.match(html, /addEventListener\('pointermove'/);
  assert.match(html, /role="separator"/);
  assert.match(html, /addEventListener\('keydown'/);
});

test('editor and preview start evenly and TOC has its own resizer', () => {
  assert.match(html, /editorPanel\.style\.flex = narrow \? '1 1 50%' : '1 1 0%'/);
  assert.match(html, /previewPanel\.style\.flex = narrow \? '1 1 50%' : '1 1 0%'/);
  assert.match(html, /id="tocResizer"/);
  assert.match(html, /function resizeToc\(clientX, clientY\)/);
  assert.match(html, /tocResizer\.addEventListener\('pointerdown'/);
  assert.match(html, /tocResizer\.addEventListener\('keydown'/);
});

test('repository includes a real MIT license file', () => {
  assert.ok(fs.existsSync(path.join(root, 'LICENSE')));
});
