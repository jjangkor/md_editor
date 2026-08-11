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
    // 맑은 고딕 글꼴 등록
    assert.match(html, /'맑은 고딕'\]/);
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

test('HWPX button sits next to Word and is wired up', () => {
    assert.match(html, /id="exportWordBtn"[\s\S]*?id="exportHwpxBtn"/);
    assert.match(html, /exportHwpxBtn\.addEventListener\('click', exportToHwpx\)/);
    assert.match(html, /한글\(\.hwpx\)로 내보내기/);
});
