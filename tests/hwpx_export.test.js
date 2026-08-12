const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'md_editor.html'), 'utf8');

test('HWPX export produces a real OWPML package, sharing the store-only ZIP writer', () => {
    assert.match(html, /application\/hwp\+zip/);
    assert.match(html, /buildHwpxFromPreview/);
    assert.match(html, /docxBuildZip\(files\)/); // ZIP 패키저 재사용
    assert.match(html, /name: 'mimetype'/);
    assert.match(html, /Contents\/header\.xml/);
    assert.match(html, /Contents\/section0\.xml/);
    assert.match(html, /Contents\/content\.hpf/);
    assert.match(html, /META-INF\/container\.xml/);
    assert.match(html, /version\.xml/);
    assert.match(html, /Preview\/PrvText\.txt/);
});

test('booklet theme matches the reference publication design', () => {
    // 팔레트: 주황 배지·머리행, 크림 표지, 청록 챕터 제목, 남색 섹션 제목, 연회색 선
    assert.match(html, /accent: '#F5A31C'/);
    assert.match(html, /cream: '#FCF3E3'/);
    assert.match(html, /title: '#2E5964'/);
    assert.match(html, /heading: '#1F3A4D'/);
    assert.match(html, /line: '#DCDCDC'/);
    // 서술식(맑은 고딕)·개조식(휴먼명조/HY헤드라인M) 글꼴 등록
    assert.match(html, /'맑은 고딕', '휴먼명조', 'HY헤드라인M'\]/);
    // 챕터 표지(번호 배지)와 가나다 섹션 배너
    assert.match(html, /hwpxChapterCover/);
    assert.match(html, /hwpxSectionBanner/);
    assert.match(html, /'가나다라마바사아자차카타파하'/);
    // 표: 주황 머리행 + 머리행 반복
    assert.match(html, /bfTableHead/);
    assert.match(html, /repeatHeader/);
    // A4 편집용지와 하단 중앙 쪽번호(autoNum PAGE)
    assert.match(html, /width: 59528, height: 84186/);
    assert.match(html, /hp:autoNum num="1" numType="PAGE"/);
    assert.match(html, /hp:footer/);
    assert.match(html, /hp:pagePr/);
});

test('HWPX converter covers the Markdown feature set', () => {
    // 표/목록(□○●·계층 번호)/코드/인용/이미지/줄바꿈
    assert.match(html, /hwpxTableToXml/);
    assert.match(html, /hwpxListToXml/);
    assert.match(html, /\['□', '○', '●'\]/);
    assert.match(html, /hwpxPreToXml/);
    assert.match(html, /hwpxCollectImages/);
    assert.match(html, /hwpxPicRun/);
    assert.match(html, /BinData\//);
    assert.match(html, /binaryItemIDRef/);
    assert.match(html, /hp:lineBreak/);
    // 발간물 규칙: <그림 N>/<표 N> 캡션과 출처 문단 자동 서식
    assert.match(html, /그림\|표/);
    assert.match(html, /출처\|자료/);
});

test('government(개조식) theme matches the agenda-style reference document', () => {
    // 제목 상하 0.5mm 남색 괘선 + 우측 부제
    assert.match(html, /width: '0\.5 mm', color: HWPX_GOV\.colors\.title/);
    assert.match(html, /hwpxGovTitle/);
    assert.match(html, /govAfterTitle/);
    // 걸어쓰기 계층: □(H2)·ㅇ(H3)·-·· 마커와 자동 매핑(ㅇ→-→·→◦)
    assert.match(html, /H2: \['□', 0/);
    assert.match(html, /H3: \['ㅇ', 1/);
    assert.match(html, /\[\['ㅇ', 1, HWPX_GOV\.wFull\], \['-', 2, HWPX_GOV\.wHalf\]/);
    // ※ 참조·* 각주·⇨ 청색 화살표·붙임 배너
    assert.match(html, /marker: '※'/);
    assert.match(html, /marker: '\*'/);
    assert.match(html, /arrowRe/);
    assert.match(html, /hwpxGovAttachBanner/);
    assert.match(html, /(붙임|참고|별첨|별지)/);
    // 표: 청회색(#D6E0F0) 머리행 + 검정 격자, 숫자·짧은 열 가운데
    assert.match(html, /thead: '#D6E0F0'/);
    assert.match(html, /hwpxGovTableToXml/);
    assert.match(html, /HWPX_NUMERIC_CELL_RE/);
    // 글꼴·크기: 휴먼명조 15pt 본문, HY헤드라인M 제목 22pt, 남색·청색 강조
    assert.match(html, /body: 1500/);
    assert.match(html, /title: 2200/);
    assert.match(html, /title: '#1F3864'/);
    assert.match(html, /emph: '#1F4E79'/);
    // 하단 중앙 "- 1 -" 쪽번호
    assert.match(html, /hwpxTextRun\('- ', cp\) \+ hwpxPageNumRun\(cp\) \+ hwpxTextRun\(' -', cp\)/);
});

test('HWPX buttons sit next to Word and are wired up', () => {
    assert.match(html, /id="exportWordBtn"[\s\S]*?id="exportHwpxBtn"[\s\S]*?id="exportHwpxGovBtn"/);
    assert.match(html, /exportHwpxBtn\.addEventListener\('click', exportToHwpx\)/);
    assert.match(html, /exportHwpxGovBtn\.addEventListener\('click', exportToHwpxGov\)/);
    assert.match(html, /서술식 발간물\(책자\) 서식/);
    assert.match(html, /개조식 정부 보고서 서식/);
});
