/**
 * 브라우저 없이 md_editor.html을 실제로 구동하는 테스트 하네스.
 * - jsdom에 페이지를 올리고 CDN 스크립트를 node_modules의 같은 버전 파일로 대체한다.
 * - 에디터 입력 → 미리보기 → Word/한글 변환을 그대로 실행하고, 결과 ZIP을 풀어 XML을 검사한다.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'md_editor.html'), 'utf8');
const mod = (...p) => path.join(root, 'node_modules', ...p);

const CDN_MAP = [
    [/marked@[\d.]+\/marked\.min\.js/, mod('marked', 'marked.min.js')],
    [/dompurify@[\d.]+\/dist\/purify\.min\.js/, mod('dompurify', 'dist', 'purify.min.js')],
    [/katex@[\d.]+\/dist\/katex\.min\.js/, mod('katex', 'dist', 'katex.min.js')]
];

class CdnLoader extends ResourceLoader {
    fetch(url, options) {
        for (const [re, file] of CDN_MAP) {
            if (re.test(url)) return Promise.resolve(fs.readFileSync(file));
        }
        if (/html2pdf/.test(url)) return Promise.resolve(Buffer.from('window.html2pdf = function () {};'));
        // Tailwind·아이콘·CSS 등 나머지 외부 자원은 빈 응답
        return Promise.resolve(Buffer.from(''));
    }
}

let shared = null;

/** 페이지를 한 번 띄워 재사용한다 (초기화 완료까지 대기) */
async function loadEditor() {
    if (shared) return shared;
    const virtualConsole = new VirtualConsole();
    const errors = [];
    virtualConsole.on('jsdomError', e => errors.push(e));
    virtualConsole.on('error', (...a) => errors.push(a.join(' ')));
    const dom = new JSDOM(html, {
        url: 'https://editor.test/md_editor.html',
        runScripts: 'dangerously',
        resources: new CdnLoader(),
        pretendToBeVisual: true,
        virtualConsole,
        beforeParse(window) {
            window.alert = msg => errors.push('alert: ' + msg);
            window.scrollTo = () => {};
            window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
            window.HTMLElement.prototype.scrollIntoView = function () {};
            window.TextEncoder = TextEncoder;
            window.fetch = (url, opts) => fetch(url, opts);
            window.TextDecoder = TextDecoder;
            // 브라우저 스트림 API를 Node 구현으로 공급 (ZIP 압축·해제용)
            if (typeof CompressionStream !== 'undefined') {
                window.CompressionStream = CompressionStream;
                window.DecompressionStream = DecompressionStream;
                window.Blob = Blob;
                window.Response = Response;
            }
        }
    });
    const { window } = dom;
    await new Promise((resolve, reject) => {
        const started = Date.now();
        (function poll() {
            if (window.katex && window.marked && window.document.getElementById('preview').children.length) return resolve();
            if (Date.now() - started > 20000) return reject(new Error('editor did not initialize: ' + errors.join('\n')));
            setTimeout(poll, 20);
        })();
    });
    shared = { dom, window, errors };
    return shared;
}

/** 에디터에 마크다운을 넣고 미리보기를 갱신한다 */
async function render(markdown) {
    const { window } = await loadEditor();
    const editor = window.document.getElementById('editor');
    editor.value = markdown;
    window.eval('updatePreview()');
    return window.document.getElementById('preview');
}

/** ZIP 바이트 → [{name, method, data(Buffer)}] (STORE·DEFLATE 지원) */
function unzip(bytes) {
    const buf = Buffer.from(bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes);
    let eocd = buf.length - 22;
    while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('EOCD not found');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const entries = [];
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central header');
        const method = buf.readUInt16LE(p + 10);
        const crc = buf.readUInt32LE(p + 16);
        const csize = buf.readUInt32LE(p + 20);
        const usize = buf.readUInt32LE(p + 24);
        const nlen = buf.readUInt16LE(p + 28);
        const elen = buf.readUInt16LE(p + 30);
        const clen = buf.readUInt16LE(p + 32);
        const off = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
        const lnlen = buf.readUInt16LE(off + 26);
        const lelen = buf.readUInt16LE(off + 28);
        const raw = buf.slice(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + csize);
        const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
        if (data.length !== usize) throw new Error('size mismatch: ' + name);
        if ((zlib.crc32 ? zlib.crc32(data) : crc) >>> 0 !== crc) throw new Error('crc mismatch: ' + name);
        entries.push({ name, method, data, text: () => data.toString('utf8') });
        p += 46 + nlen + elen + clen;
    }
    return entries;
}

/** XML 웰폼드 검사 — 오류 메시지 또는 null */
function xmlError(text, window) {
    const doc = new window.DOMParser().parseFromString(text, 'application/xml');
    const err = doc.getElementsByTagName('parsererror')[0];
    return err ? err.textContent.split('\n')[0] : null;
}

async function exportHwpx(markdown, theme) {
    const { window } = await loadEditor();
    const preview = await render(markdown);
    const bytes = await window.eval('buildHwpxFromPreview')(preview, 'test', theme || 'book');
    return pack(unzip(bytes), window);
}

async function exportDocx(markdown) {
    const { window } = await loadEditor();
    const preview = await render(markdown);
    const bytes = await window.eval('buildDocxFromPreview')(preview, 'test');
    return pack(unzip(bytes), window);
}

function pack(entries, window) {
    const map = new Map(entries.map(e => [e.name, e]));
    return {
        entries,
        names: entries.map(e => e.name),
        text: name => map.get(name) && map.get(name).text(),
        has: name => map.has(name),
        xmlErrors() {
            return entries.filter(e => /\.(xml|hpf|rdf|rels)$/.test(e.name))
                .map(e => [e.name, xmlError(e.text(), window)]).filter(x => x[1]);
        },
        doc: name => new window.DOMParser().parseFromString(map.get(name).text(), 'application/xml')
    };
}

/** 공유 창 닫기 (테스트 종료 시) */
function close() {
    if (shared) shared.window.close();
    shared = null;
}

module.exports = { close, loadEditor, render, exportHwpx, exportDocx, unzip, xmlError, html, root };
