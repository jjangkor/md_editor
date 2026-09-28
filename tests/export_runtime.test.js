/**
 * 실제 구동 회귀 테스트 — jsdom에서 편집기를 띄워 미리보기·Word·한글 변환을 실행하고
 * 결과 패키지(ZIP·XML)를 풀어 구조를 확인한다 (tests/support/harness.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./support/harness');

const count = (text, re) => (text.match(re) || []).length;

test.after(() => h.close());

test('editor boots in a browser-like DOM without script errors', async () => {
    const { errors } = await h.loadEditor();
    assert.deepEqual(errors, []);
});

test('both HWPX themes produce well-formed, self-validated packages', async () => {
    const md = '# 제목\n\n## 개요\n\n본문 **굵게** *기울임*\n\n- 항목\n  - 하위\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    for (const theme of ['book', 'gov']) {
        const pkg = await h.exportHwpx(md, theme);
        assert.deepEqual(pkg.xmlErrors(), [], theme);
        assert.equal(pkg.names[0], 'mimetype');
        assert.equal(pkg.entries[0].method, 0, 'mimetype must be stored');
        assert.equal(pkg.text('mimetype'), 'application/hwp+zip');
        // XML 항목은 DEFLATE 압축
        assert.equal(pkg.entries.find(e => e.name === 'Contents/section0.xml').method, 8);
        const sec = pkg.text('Contents/section0.xml');
        // 꼬리말(쪽번호)은 첫 문단 ctrl에 한 번만 — secPr 안에 두지 않는다
        assert.equal(count(sec, /<hp:footer /g), 1, theme);
        const secPr = sec.slice(sec.indexOf('<hp:secPr'), sec.indexOf('</hp:secPr>'));
        assert.doesNotMatch(secPr, /hp:footer/);
    }
});

test('multi-row tables float so Hangul can split them across pages', async () => {
    const pkg = await h.exportHwpx('## 배너\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n', 'book');
    const sec = pkg.text('Contents/section0.xml');
    const tables = sec.match(/<hp:tbl [\s\S]*?<hp:pos treatAsChar="\d"/g);
    assert.equal(tables.length, 2);
    assert.match(tables[0], /rowCnt="1"[\s\S]*treatAsChar="1"/, '1-row banner stays inline');
    assert.match(tables[1], /rowCnt="3"[\s\S]*treatAsChar="0"/, 'data table floats');
});

test('merged cells (colspan/rowspan) survive in HWPX and DOCX', async () => {
    const md = '<table><tr><th colspan="2">머리</th><th>C</th></tr><tr><td rowspan="2">세로</td><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>\n';
    const hw = await h.exportHwpx(md, 'gov');
    const sec = hw.text('Contents/section0.xml');
    assert.match(sec, /<hp:cellAddr colAddr="0" rowAddr="0"\/><hp:cellSpan colSpan="2" rowSpan="1"\/>/);
    assert.match(sec, /<hp:cellAddr colAddr="0" rowAddr="1"\/><hp:cellSpan colSpan="1" rowSpan="2"\/>/);
    assert.match(sec, /rowCnt="3" colCnt="3"/);
    assert.equal(count(sec, /<hp:tc /g), 7);
    const dx = await h.exportDocx(md);
    const doc = dx.text('word/document.xml');
    assert.match(doc, /<w:gridSpan w:val="2"\/>/);
    assert.match(doc, /<w:vMerge w:val="restart"\/>/);
    assert.match(doc, /<w:vMerge\/>/);
});

test('개조식·서술식 markers are followed by a tab at the hanging-indent tab stop', async () => {
    for (const [theme, md] of [['gov', '# 보고\n\n```\nㅁ 과제\n  ㅇ (라벨) 본문\n    - 세부\n※ 참고\n```\n'], ['book', '- 항목\n  - 하위\n\n1. 번호\n']]) {
        const pkg = await h.exportHwpx(md, theme);
        const sec = pkg.text('Contents/section0.xml');
        const header = pkg.text('Contents/header.xml');
        // 탭은 <hp:t> 안에 둔다
        assert.doesNotMatch(sec, /<\/hp:t><hp:tab/);
        const tabbed = sec.match(/<hp:p [^>]*paraPrIDRef="\d+"[^>]*>(?:(?!<\/hp:p>)[\s\S])*?<hp:tab /g) || [];
        assert.ok(tabbed.length >= 3, theme + ' ' + tabbed.length);
        tabbed.forEach(p => {
            const ppId = /paraPrIDRef="(\d+)"/.exec(p)[1];
            const pp = new RegExp('<hh:paraPr id="' + ppId + '" tabPrIDRef="(\\d+)"[\\s\\S]*?<hc:left value="(\\d+)"').exec(header);
            const tabItem = new RegExp('<hh:tabPr id="' + pp[1] + '"[^>]*><hh:tabItem pos="(\\d+)"').exec(header);
            assert.ok(tabItem, theme + ' tabPr ' + pp[1]);
            assert.equal(tabItem[1], pp[2], theme + ': tab stop = hanging indent');
        });
    }
});

test('dates, amounts and ranges are bound with non-breaking spaces', async () => {
    const pkg = await h.exportHwpx("```\nㅁ 일정 2026. 1. 22. 착수, 3억 원, '24~'26\n```\n", 'gov');
    const sec = pkg.text('Contents/section0.xml');
    assert.match(sec, /2026\.<hp:nbSpace\/>1\.<hp:nbSpace\/>22\./);
    assert.match(sec, /3억<hp:nbSpace\/>원/);
    // 사용자 관행 유지: 범위 물결은 앞뒤를 띄운 ∼ (띄움은 묶음 빈칸)
    assert.match(sec, /'24<hp:nbSpace\/>∼<hp:nbSpace\/>'26/);
});

test('headings become outline paragraphs without visible outline numbers', async () => {
    const pkg = await h.exportHwpx('# 장\n\n## 절\n\n### 항\n', 'book');
    const header = pkg.text('Contents/header.xml');
    assert.match(header, /<hh:heading type="OUTLINE" idRef="0" level="0"\/>/);
    assert.match(header, /<hh:heading type="OUTLINE" idRef="0" level="1"\/>/);
    assert.match(header, /<hh:heading type="OUTLINE" idRef="0" level="2"\/>/);
    // 개요 번호 서식은 비어 있어야 "1." 같은 번호가 붙지 않는다
    assert.doesNotMatch(header, /<hh:paraHead[^>]*>[^<]+<\/hh:paraHead>/);
});

test('LaTeX converts to Hangul equation script', async () => {
    const { window } = await h.loadEditor();
    const eq = window.eval('hwpxLatexToEqEdit');
    assert.equal(eq('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'), 'x = {-b +- sqrt{b ^{2} - 4ac}} over {2a}');
    assert.equal(eq('\\sqrt[3]{x}'), 'root {3} of {x}');
    assert.equal(eq('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'), '{pmatrix{a & b # c & d}}');
    assert.equal(eq('T_{int} \\approx 10'), 'T _{"int"} APPROX 10');
    assert.equal(eq('\\lim_{x \\to 0} \\sin x'), 'lim _{x -> 0} sin x');
});

test('math exports as native equations (HWPX hp:equation, DOCX OMML)', async () => {
    const md = '인라인 \\(E=mc^2\\)\n\n$$\n\\frac{a}{b}\n$$\n';
    const hw = await h.exportHwpx(md, 'book');
    const sec = hw.text('Contents/section0.xml');
    assert.match(sec, /<hp:equation [^>]*font="HYhwpEQ"[\s\S]*?<hp:script>E=mc \^\{2\}<\/hp:script>/);
    assert.match(sec, /<hp:script>\{a\} over \{b\}<\/hp:script>/);
    const dx = await h.exportDocx(md);
    const doc = dx.text('word/document.xml');
    assert.match(doc, /<m:oMath><m:r>/);
    assert.match(doc, /<m:sSup><m:e>/);
    assert.match(doc, /<m:oMathPara><m:oMath><m:f><m:num>/);
    // 블록 수식이 남긴 빈 문단은 만들지 않는다
    assert.doesNotMatch(doc, /<w:p><w:pPr><w:pStyle w:val="a0"\/><\/w:pPr><\/w:p>/);
});

test('footnotes render in preview and export as real notes', async () => {
    const md = '본문[^a] 두 번째[^b]\n\n[^a]: 첫 각주 **굵게**\n[^b]: 둘째 각주\n';
    const preview = await h.render(md);
    assert.equal(preview.querySelectorAll('sup.footnote-ref').length, 2);
    assert.equal(preview.querySelectorAll('section.footnotes li').length, 2);
    assert.equal(preview.querySelector('section.footnotes li[data-fn="1"]').textContent.trim().startsWith('첫 각주'), true);
    const hw = await h.exportHwpx(md, 'gov');
    const sec = hw.text('Contents/section0.xml');
    assert.equal(count(sec, /<hp:footNote number="\d"/g), 2);
    assert.match(sec, /<hp:autoNum num="1" numType="FOOTNOTE">/);
    const dx = await h.exportDocx(md);
    assert.ok(dx.has('word/footnotes.xml'));
    assert.match(dx.text('word/document.xml'), /<w:footnoteReference w:id="1"\/>[\s\S]*<w:footnoteReference w:id="2"\/>/);
    assert.match(dx.text('word/footnotes.xml'), /<w:footnote w:id="1">[\s\S]*첫 각주/);
    assert.match(dx.text('[Content_Types].xml'), /footnotes\+xml/);
});

test('a footnote cited twice gets one Word note per reference (Word crashes on shared ids)', async () => {
    const dx = await h.exportDocx('앞[^a] 뒤[^a]\n\n[^a]: 같은 출처\n');
    const doc = dx.text('word/document.xml');
    const ids = [...doc.matchAll(/<w:footnoteReference w:id="(\d+)"\/>/g)].map(m => m[1]);
    assert.deepEqual(ids, ['1', '2']);
    const notes = dx.text('word/footnotes.xml');
    assert.equal(count(notes, /<w:footnote w:id="[12]">[\s\S]*?같은 출처/g), 2);
    assert.match(dx.text('word/settings.xml'), /<w:footnotePr><w:footnote w:id="-1"\/><w:footnote w:id="0"\/><\/w:footnotePr><w:compat>/);
    assert.deepEqual(dx.xmlErrors(), []);
});

test('external links become Hangul hyperlink fields', async () => {
    const pkg = await h.exportHwpx('[가이드](https://example.com/a?b=1&c=2)\n', 'book');
    const sec = pkg.text('Contents/section0.xml');
    assert.match(sec, /<hp:fieldBegin id="(\d+)" type="HYPERLINK"[\s\S]*?<hp:stringParam name="Path">https:\/\/example\.com\/a\?b=1&amp;c=2<\/hp:stringParam>[\s\S]*?가이드[\s\S]*?<hp:fieldEnd beginIDRef="\1"/);
});

test('chart fences render as SVG and export as native charts', async () => {
    const md = '```chart\ntype: column\ncat: 1분기, 2분기\n예산: 10, 20\n집행: 5, 15\n```\n\n```chart\ntype: pie\ncat: 가, 나\n비율: 60, 40\n```\n';
    const preview = await h.render(md);
    assert.equal(preview.querySelectorAll('figure.md-chart svg').length, 2);
    assert.equal(preview.querySelector('figure.md-chart').dataset.chart.includes('예산'), true);
    for (const theme of ['book', 'gov']) {
        const hw = await h.exportHwpx(md, theme);
        assert.ok(hw.has('Chart/chart1.xml') && hw.has('Chart/chart2.xml'));
        assert.match(hw.text('Contents/content.hpf'), /<opf:item id="chart1" href="Chart\/chart1\.xml"/);
        assert.match(hw.text('Contents/section0.xml'), /<hp:chart [^>]*chartIDRef="Chart\/chart1\.xml"/);
        assert.match(hw.text('Chart/chart1.xml'), /<c:barChart><c:barDir val="col"\/>[\s\S]*<c:v>예산<\/c:v>/);
        assert.match(hw.text('Chart/chart2.xml'), /<c:pieChart>/);
    }
    const dx = await h.exportDocx(md);
    assert.ok(dx.has('word/charts/chart1.xml'));
    assert.match(dx.text('word/document.xml'), /<c:chart xmlns:c="[^"]+" r:id="rId\d+"\/>/);
    assert.match(dx.text('[Content_Types].xml'), /drawingml\.chart\+xml/);
    // 숫자가 아닌 값이 있으면 코드블록 그대로
    const bad = await h.render('```chart\n예산: 10, 많음\n```\n');
    assert.equal(bad.querySelectorAll('figure.md-chart').length, 0);
});

test('package self-check catches dangling references before download', async () => {
    const { window } = await h.loadEditor();
    const validate = (files, kind) => Array.from(window.eval('validatePackage')(files, kind));
    const pkg = await h.exportHwpx('# 제목\n\n본문\n', 'book');
    const files = pkg.entries.map(e => ({ name: e.name, data: e.text() }));
    assert.deepEqual(validate(files, 'hwpx'), []);
    const broken = files.map(f => f.name === 'Contents/section0.xml'
        ? { name: f.name, data: f.data.replace(/charPrIDRef="\d+"/, 'charPrIDRef="9999"') }
        : f);
    assert.match(validate(broken, 'hwpx').join('\n'), /charPrIDRef=9999/);
    const bad = files.filter(f => f.name !== 'Contents/header.xml');
    assert.match(validate(bad, 'hwpx').join('\n'), /필수 파일 누락: Contents\/header\.xml/);
});

test('invalid XML characters never reach the package', async () => {
    const pkg = await h.exportHwpx('깨진 \uD800 문자와 ￿ 비문자\n', 'book');
    assert.deepEqual(pkg.xmlErrors(), []);
    const dx = await h.exportDocx('깨진 \uDC00 문자\n');
    assert.deepEqual(dx.xmlErrors(), []);
});

test('images keep their original bytes (JPEG stays JPEG)', async () => {
    const { window } = await h.loadEditor();
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U';
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const preview = await h.render('![사진](' + jpeg + ')\n\n![도표](' + png + ')\n');
    preview.querySelectorAll('img').forEach(img => {
        Object.defineProperty(img, 'complete', { value: true });
        Object.defineProperty(img, 'naturalWidth', { value: 400 });
        Object.defineProperty(img, 'naturalHeight', { value: 300 });
    });
    const unzipHwpx = h.unzip(await window.eval('buildHwpxFromPreview')(preview, 't', 'book'));
    const names = unzipHwpx.map(e => e.name);
    assert.ok(names.includes('BinData/BIN0001.jpg'), names.join());
    assert.ok(names.includes('BinData/BIN0002.png'));
    assert.equal(unzipHwpx.find(e => e.name === 'BinData/BIN0001.jpg').data[0], 0xFF);
    const sec = unzipHwpx.find(e => e.name === 'Contents/section0.xml').text();
    assert.equal(count(sec, /<hc:img binaryItemIDRef="BIN\d{4}"/g), 2);
    // 그림 개체 instid는 다른 개체 id와 겹치지 않는다
    const ids = (sec.match(/ id="(\d{7,})"/g) || []).map(x => x.replace(/\D/g, ''));
    const instids = (sec.match(/instid="(\d+)"/g) || []).map(x => x.replace(/\D/g, ''));
    instids.forEach(i => assert.ok(!ids.includes(i)));
    const unzipDocx = h.unzip(await window.eval('buildDocxFromPreview')(preview, 't'));
    assert.ok(unzipDocx.some(e => e.name === 'word/media/image1.jpeg'));
});

test('TOC ids follow the same headings as the preview (fences, setext)', async () => {
    const md = '<!-- TOC -->\n<!-- /TOC -->\n\n# 하나\n\n~~~\n# 코드 속 제목\n~~~\n\n둘\n===\n\n> ## 인용 속 제목\n';
    const preview = await h.render(md);
    const links = Array.from(preview.querySelectorAll('a[href^="#heading-"]')).map(a => [a.textContent, a.getAttribute('href')]);
    assert.deepEqual(links, [['하나', '#heading-0'], ['둘', '#heading-1'], ['인용 속 제목', '#heading-2']]);
    const headings = Array.from(preview.querySelectorAll('h1, h2, h3')).map(el => [el.textContent, el.id]);
    assert.deepEqual(headings, [['하나', 'heading-0'], ['둘', 'heading-1'], ['인용 속 제목', 'heading-2']]);
});

test('notation and 개조식 style lint follows the editor conventions', async () => {
    const { window } = await h.loadEditor();
    const lint = (md, opts) => Array.from(window.eval('lintMarkdown')(md, opts || {}), f => f.rule);
    const rules = lint('회의는 2025.01.06 오후 3시에 열린다.\n\n```\nㅁ 과제\n  ㅇ 확보해야 한다\n```\n\n```js\nconst d = "2025.01.06";\n```\n컨텐츠');
    ['DATE_NO_SPACE', 'DATE_ZERO_PAD', 'TIME_AMPM', 'DA_ENDING', 'DEONTIC', 'LOANWORD_ERROR'].forEach(rule => assert.ok(rules.includes(rule), rule));
    // 언어 지정 코드블록 안은 검사하지 않는다 (DATE_NO_SPACE는 본문 1건만)
    assert.equal(rules.filter(r => r === 'DATE_NO_SPACE').length, 1);
    // 사용자 관행(’24 ∼ ’26 띄움)은 문제 삼지 않고, 연도 두 자리는 엄격 모드에서만
    assert.deepEqual(lint('ㅇ 기간 ’24. 1. ∼ ’26. 12.').filter(r => /TILDE|DATE_2DIGIT/.test(r)), []);
    assert.ok(lint('ㅇ 기간 ’24. 1. ∼ ’26. 12.', { strict: true }).includes('DATE_2DIGIT_YR'));
    assert.equal(window.eval('hangulAmount')('113560'), '일십일만삼천오백육십');
});

test('HWPX and DOCX files open back as Markdown', async () => {
    const { window } = await h.loadEditor();
    const md = '# 사업 개요\n\n## 추진 배경\n\n본문 **굵게** 문단[^a], [링크](https://example.com).\n\n- 항목\n- 둘\n\n| 구분 | 값 |\n|---|---|\n| A | 1 |\n\n<table><tr><th colspan="2">병합</th></tr><tr><td>x</td><td>y</td></tr></table>\n\n수식 \\(x = \\frac{a}{b}\\)\n\n[^a]: 각주 내용\n';
    const back = async (kind) => {
        const pkg = kind === 'docx' ? await h.exportDocx(md) : await h.exportHwpx(md, kind);
        const files = new Map(pkg.entries.map(e => [e.name, new window.Uint8Array(e.data)]));
        return kind === 'docx' ? window.eval('docxToMarkdown')(files) : window.eval('hwpxToMarkdown')(files);
    };
    for (const kind of ['book', 'gov', 'docx']) {
        const out = await back(kind);
        assert.match(out, /^# (1\. )?사업 개요$/m, kind);
        assert.match(out, /^## 추진 배경$/m, kind);
        assert.match(out, /본문 \*\*굵게\*\* 문단\[\^1\], \[링크\]\(https:\/\/example\.com\)\./, kind);
        assert.match(out, /^\| 구분 \| 값 \|$/m, kind);
        assert.match(out, /<th colspan="2">병합<\/th>/, kind);
        assert.match(out, /\\\(x ?= ?\\frac\{a\}\{b\}\\\)/, kind);
        assert.match(out, /^\[\^1\]: 각주 내용$/m, kind);
    }
    // ZIP 읽기(DEFLATE 해제)까지 포함한 경로
    const pkg = await h.exportDocx('# 제목\n\n본문\n');
    const bytes = await window.eval('docxBuildZip')(pkg.entries.map(e => ({ name: e.name, data: new window.Uint8Array(e.data) })));
    const files = await window.eval('readZipEntries')(bytes.buffer);
    assert.match(window.eval('docxToMarkdown')(files), /^# 제목\n\n본문\n$/);
});
