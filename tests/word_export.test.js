const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'md_editor.html'), 'utf8');

test('Word export produces a real .docx package, not HTML disguised as .doc', () => {
    assert.doesNotMatch(html, /application\/msword/);
    assert.match(html, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
    assert.match(html, /\.docx/);
    assert.match(html, /buildDocxFromPreview/);
    assert.match(html, /docxBuildZip/);
    assert.match(html, /\[Content_Types\]\.xml/);
    assert.match(html, /word\/document\.xml/);
});

test('embedded styles match the reference document formatting', () => {
    // 본문: 맑은 고딕 12pt(sz 24 half-points)
    assert.match(html, /w:ascii="맑은 고딕"/);
    // 제목: accent1 파랑, 제목1 16pt/제목2 14pt
    assert.match(html, /w:val="4F81BD" w:themeColor="accent1"/);
    assert.match(html, /heading 1[\s\S]*?w:sz w:val="32"/);
    assert.match(html, /heading 2[\s\S]*?w:sz w:val="28"/);
    // 표: 회색(808080) 격자 + 머리행 음영(D9E2F3) + 머리행 글자색(1F4E79)
    assert.match(html, /w:color="808080"/);
    assert.match(html, /w:fill="D9E2F3"/);
    assert.match(html, /w:val="1F4E79"/);
    // 코드: Consolas 11pt
    assert.match(html, /Consolas/);
    // 테마(제목 글꼴·강조 색상 정의) 포함
    assert.match(html, /DOCX_THEME_XML/);
    assert.match(html, /a:theme/);
});

test('page setup and footer follow the reference document', () => {
    // A4, 위/아래 1440·좌/우 1080 twips 여백
    assert.match(html, /w:pgSz w:w="11906" w:h="16838"/);
    assert.match(html, /w:top="1440" w:right="1080" w:bottom="1440" w:left="1080"/);
    // "페이지 X / Y" 바닥글 (PAGE/NUMPAGES 필드)
    assert.match(html, /페이지 <\/w:t>/);
    assert.match(html, / PAGE /);
    assert.match(html, / NUMPAGES /);
    assert.match(html, /footerReference/);
});

test('converter covers the Markdown feature set', () => {
    // 목록(글머리·번호), 표, 코드, 인용, 수식, 이미지, 하이퍼링크, 책갈피
    assert.match(html, /w:numPr/);
    assert.match(html, /startOverride/);
    assert.match(html, /docxTableToXml/);
    assert.match(html, /tblHeader/);
    assert.match(html, /docxPreToXml/);
    assert.match(html, /SourceCode/);
    assert.match(html, /Cambria Math/);
    assert.match(html, /docxCollectImages/);
    assert.match(html, /w:hyperlink/);
    assert.match(html, /bookmarkStart/);
    // 견본과 동일한 인용문/본문 스타일 매핑
    assert.match(html, /Block Text/);
    assert.match(html, /FirstParagraph/);
});
