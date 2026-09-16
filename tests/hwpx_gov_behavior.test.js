const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { exportDocument } = require('./helpers/hwpx');

const first = (el, tag) => el.getElementsByTagName(tag)[0];
const attr = (el, name) => el.getAttribute(name);

test('government report has a blue title banner, numbered ruled sections and selective blue emphasis', async () => {
    const doc = await exportDocument('# 청정에너지 추진계획\n\n## ***SMR*** : 기술개발 **추진**\n\n## ***핵융합*** : ***단계별*** 실증');
    const [title, smr, fusion] = doc.paragraphs;
    assert.equal(title.textContent, '◈ 청정에너지 추진계획');
    assert.equal(smr.textContent, '1SMR : 기술개발 추진');
    assert.equal(fusion.textContent, '2핵융합 : 단계별 실증');
    for (const p of [title, smr, fusion]) {
        const pp = doc.paraStyle(p);
        assert.equal(attr(first(pp, 'hh:breakSetting'), 'keepWithNext'), '1');
        const border = doc.byId('hh:borderFill', attr(first(pp, 'hh:border'), 'borderFillIDRef'));
        assert.equal(attr(first(border, 'hh:topBorder'), 'type'), 'SOLID');
        assert.equal(attr(first(border, 'hh:bottomBorder'), 'type'), 'SOLID');
        assert.ok(first(border, 'hc:winBrush'));
    }
    assert.equal(attr(doc.runs(smr).find(r => r.text === 'SMR').style, 'textColor'), '#0000FF');
    assert.equal(attr(doc.runs(smr).find(r => r.text.includes('기술개발')).style, 'textColor'), '#000000');
    const number = doc.runs(smr)[0];
    const box = doc.byId('hh:borderFill', attr(number.style, 'borderFillIDRef'));
    assert.equal(attr(first(box, 'hh:leftBorder'), 'type'), 'SOLID');
});

test('plain outline lines become separate paragraphs while rich labels and body emphasis survive', async () => {
    const doc = await exportDocument('○ (**설계**) 원자로 **상세 설계** 추진\n○ (사업화) ***민간 참여*** 확대\n※ (실증로) 단계별 검증\n후속 일정 안내\n\\* 첫 번째 각주\n\\*\\* 두 번째 각주');
    assert.equal(doc.paragraphs.length, 5);
    assert.equal(doc.paragraphs[0].textContent, '○(설계) 원자로 상세 설계 추진');
    assert.equal(doc.paragraphs[1].textContent, '○(사업화) 민간 참여 확대');
    assert.ok(doc.paragraphs[2].textContent.includes('후속 일정 안내'));
    assert.equal(first(doc.paragraphs[2], 'hp:lineBreak').parentElement.tagName, 'hp:t');
    assert.equal(doc.paragraphs[3].textContent, '*첫 번째 각주');
    assert.equal(doc.paragraphs[4].textContent, '**두 번째 각주');
    const label = doc.runs(doc.paragraphs[0]).find(r => r.text.startsWith('(설계)'));
    assert.equal(attr(label.style, 'textColor'), '#0000FF');
    assert.ok(first(label.style, 'hh:bold'));
    assert.ok(first(doc.runs(doc.paragraphs[0]).find(r => r.text === '상세 설계').style, 'hh:bold'));
    assert.equal(attr(doc.runs(doc.paragraphs[3]).find(r => r.text.includes('첫 번째')).style, 'height'), '1200');
});

test('markers split across inline nodes are removed once, including labels in list items', async () => {
    const doc = await exportDocument('- **○** (**설계**) 설계 **추진**\n- ○ **(사업화)** 참여 확대');
    assert.deepEqual(doc.paragraphs.map(p => p.textContent), ['○(설계) 설계 추진', '○(사업화) 참여 확대']);
    for (const p of doc.paragraphs) {
        const label = doc.runs(p).find(r => /^\(/.test(r.text));
        assert.equal(attr(label.style, 'textColor'), '#0000FF');
    }
});

test('nested list siblings stay at their parent level and wrapping aligns at an explicit tab stop', async () => {
    const doc = await exportDocument('## 추진 과제\n\n- (설계) 본문\n  - 하위 과제\n    - 세부 과제\n  - 두 번째 하위 과제\n- (사업화) 다음 본문');
    assert.deepEqual(doc.paragraphs.map(p => p.textContent), [
        '1추진 과제', '○(설계) 본문', '-하위 과제', '·세부 과제', '-두 번째 하위 과제', '○(사업화) 다음 본문'
    ]);
    for (const p of doc.paragraphs) {
        const pp = doc.paraStyle(p);
        const left = Number(attr(first(pp, 'hc:left'), 'value'));
        assert.ok(Number(attr(first(pp, 'hc:intent'), 'value')) < 0);
        const tabs = doc.byId('hh:tabPr', attr(pp, 'tabPrIDRef'));
        assert.equal(Number(attr(first(tabs, 'hh:tabItem'), 'pos')), left);
        const tab = first(p, 'hp:tab');
        assert.equal(tab.parentElement.tagName, 'hp:t');
    }
    assert.equal(doc.paragraphs[2].getAttribute('paraPrIDRef'), doc.paragraphs[4].getAttribute('paraPrIDRef'));
});

test('code-block outline, notes and ranges use the report formatting; program code remains literal', async () => {
    const doc = await exportDocument('```text\nㅁ 과제 제목\nㅇ (설계) **설계** 추진\n※ 일정 (~2030)\n※ 후속 단계\n* 첫 각주\n** 둘째 각주\n```\n\n```python\nprint("ㅇ (설계) **코드**")\n```');
    assert.equal(doc.paragraphs[0].textContent, '1과제 제목');
    assert.equal(doc.paragraphs[1].textContent, 'ㅇ(설계) 설계 추진');
    assert.equal(doc.paragraphs[2].textContent, '※일정 (∼2030)');
    assert.equal(doc.paragraphs[3].textContent, '후속 단계');
    assert.equal(doc.paragraphs[5].textContent, '**둘째 각주');
    assert.equal(doc.paragraphs[6].textContent, 'print("ㅇ (설계) **코드**")');
});

test('reference-style example exports valid XML with resolvable style references in both themes', async () => {
    const sample = fs.readFileSync(path.resolve(__dirname, '../examples/government-report.md'), 'utf8');
    for (const theme of ['gov', 'book']) {
        const doc = await exportDocument(sample, theme);
        for (const p of Array.from(doc.section.getElementsByTagName('hp:p'))) assert.ok(doc.paraStyle(p));
        for (const p of doc.paragraphs) for (const run of doc.runs(p)) assert.ok(run.style);
        for (const pp of Array.from(doc.header.getElementsByTagName('hh:paraPr'))) {
            assert.ok(doc.byId('hh:tabPr', attr(pp, 'tabPrIDRef')));
        }
        for (const [name, data] of doc.files) {
            if (!/\.(xml|hpf)$/.test(name)) continue;
            assert.doesNotThrow(() => new (require('jsdom').JSDOM)(data, { contentType: 'text/xml' }), name);
        }
    }
});

test('a new section resets the consecutive-note state and preserves ordinary hard breaks', async () => {
    const doc = await exportDocument('※ 첫 과제 참고\n\n## 두 번째 과제\n\n※ 새 과제 참고\n\n일반 문장\n다음 줄');
    assert.equal(doc.paragraphs[2].textContent, '※새 과제 참고');
    assert.equal(first(doc.paragraphs[3], 'hp:lineBreak').parentElement.tagName, 'hp:t');
});

test('outline normalization preserves loaded images and measured table column widths', async () => {
    const markdown = '○ (설계) ![도면](drawing.png)\n○ (실증) 후속 과제\n\n- (자료) ![목록 도면](drawing2.png)\n\n| 항목 | 설명 |\n| --- | --- |\n| 설계 | 긴 설명 |';
    const doc = await exportDocument(markdown, 'gov', (root, window) => {
        // Simulate images already decoded by the browser and a table with a 1:3 column ratio.
        for (const img of root.querySelectorAll('img')) {
            Object.defineProperties(img, { complete: { value: true }, naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
        }
        window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
        window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
        root.querySelectorAll('th').forEach((cell, i) => { cell.getBoundingClientRect = () => ({ width: i ? 300 : 100 }); });
    });
    assert.equal(doc.section.getElementsByTagName('hp:pic').length, 2);
    assert.ok(doc.files.has('BinData/BIN0001.png'));
    assert.ok(doc.files.has('BinData/BIN0002.png'));
    const widths = Array.from(doc.section.getElementsByTagName('hp:cellSz')).slice(0, 2).map(cell => Number(attr(cell, 'width')));
    assert.ok(Math.abs(widths[1] / widths[0] - 3) < 0.001);
});
