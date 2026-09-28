const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { marked } = require('marked');

const html = fs.readFileSync(path.resolve(__dirname, '../../md_editor.html'), 'utf8');
// Exercise the standalone application's real exporters without starting its editor UI.
const exporters = html.slice(html.indexOf('const DOCX_THEME_XML'), html.indexOf('async function exportHwpxWithTheme'));

async function exportDocument(markdown, theme = 'gov', prepare) {
    const dom = new JSDOM('<!doctype html><main></main>');
    const root = dom.window.document.querySelector('main');
    root.innerHTML = marked.parse(markdown, { breaks: true, gfm: true });
    if (prepare) prepare(root, dom.window);
    const original = root.innerHTML;
    const context = vm.createContext({
        Node: dom.window.Node, document: dom.window.document,
        atob: dom.window.atob.bind(dom.window), TextEncoder, console
    });
    vm.runInContext(exporters, context);
    const bytes = Buffer.from(await context.buildHwpxFromPreview(root, '서식 검증', theme));
    assert.equal(root.innerHTML, original, 'export must not modify the editor preview');
    dom.window.close();
    const files = new Map();
    let offset = 0;
    while (bytes.readUInt32LE(offset) === 0x04034b50) {
        assert.equal(bytes.readUInt16LE(offset + 8), 0, 'HWPX entries are stored without compression');
        const size = bytes.readUInt32LE(offset + 18);
        const nameLength = bytes.readUInt16LE(offset + 26);
        const extraLength = bytes.readUInt16LE(offset + 28);
        const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
        const start = offset + 30 + nameLength + extraLength;
        const data = bytes.subarray(start, start + size);
        assert.equal(context.docxCrc32(data), bytes.readUInt32LE(offset + 14), name + ' CRC');
        files.set(name, data.toString());
        offset = start + size;
    }
    assert.equal([...files.keys()][0], 'mimetype');
    assert.equal(files.get('mimetype'), 'application/hwp+zip');
    const xml = name => new JSDOM(files.get(name), { contentType: 'text/xml' }).window.document;
    const header = xml('Contents/header.xml');
    const section = xml('Contents/section0.xml');
    const byId = (tag, id) => Array.from(header.getElementsByTagName(tag)).find(el => el.getAttribute('id') === id);
    const paragraphs = Array.from(section.documentElement.children).filter(el => el.tagName === 'hp:p' && el.getAttribute('id') !== '0');
    const runs = p => Array.from(p.getElementsByTagName('hp:run')).map(run => ({
        text: run.textContent,
        element: run,
        style: byId('hh:charPr', run.getAttribute('charPrIDRef'))
    }));
    return { bytes, files, header, section, paragraphs, runs, byId,
        paraStyle: p => byId('hh:paraPr', p.getAttribute('paraPrIDRef')) };
}

module.exports = { exportDocument };
