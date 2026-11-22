const assert = require('node:assert/strict');
const {before,test} = require('node:test');

const vocabulary = [
  ['勉強する','べんきょうする','Động từ する','học'],
  ['する','する','Động từ nhóm III','làm'],
  ['いる','いる','Động từ nhóm II','ở'],
  ['ある','ある','Động từ nhóm I','có'],
  ['行く','いく','Động từ nhóm I','đi'],
  ['帰る','かえる','Động từ nhóm I','về'],
  ['食べる','たべる','Động từ nhóm II','ăn'],
  ['飲む','のむ','Động từ nhóm I','uống'],
  ['読む','よむ','Động từ nhóm I','đọc'],
  ['寝る','ねる','Động từ nhóm II','ngủ'],
  ['書く','かく','Động từ nhóm I','viết'],
  ['買う','かう','Động từ nhóm I','mua'],
  ['着る','きる','Động từ nhóm II','mặc'],
  ['切る','きる','Động từ nhóm I','cắt'],
  ['分かる','わかる','Động từ nhóm I','hiểu'],
  ['高い','たかい','Tính từ い','cao'],
  ['良い','よい','Tính từ い','tốt'],
  ['静か','しずか','Tính từ な','yên tĩnh'],
  ['毎日','まいにち','Danh từ','mỗi ngày'],
  ['日本語','にほんご','Danh từ','tiếng Nhật'],
  ['学校','がっこう','Danh từ','trường'],
  ['本','ほん','Danh từ','sách'],
  ['お茶','おちゃ','Danh từ','trà'],
  ['車','くるま','Danh từ','ô tô'],
  ['私','わたし','Đại từ','tôi'],
  ['学生','がくせい','Danh từ','sinh viên'],
  ['昨日','きのう','Danh từ','hôm qua'],
];
let check;

before(async () => {
  const [{makeLemma,generateForms},{createSentenceAnalyzer},{checkJapanese}] = await Promise.all([
    import('../../assets/search/morphology.js'),
    import('../../assets/search/sentence-analyzer.js'),
    import('../../assets/learning/grammar-checker.js'),
  ]);
  const analyzer = createSentenceAnalyzer();
  const refs = vocabulary.map(([jp,kana,pos,vi],id) => {
    const lemma = makeLemma({id:String(id),jp,kana,pos,vi});
    const ref = {lemma,forms:generateForms(lemma)};
    analyzer.addWord(ref,6);
    return ref;
  });
  check = text => checkJapanese(text,{analyze:analyzer.analyze,refs});
});

test('checker applies the polite stem of a known する compound and preserves the original span', () => {
  const original = '毎日、日本語を勉強するます。';
  const report = check(original);
  const issue = report.issues[0];
  assert.equal(report.status,'error');
  assert.equal(report.original,original);
  assert.equal(report.corrected,'毎日、日本語を勉強します。');
  assert.equal(issue.start,original.indexOf('勉強'));
  assert.equal(original.slice(issue.start,issue.end),'勉強するます');
  assert.equal(issue.grammarId,'masu');
  assert.deepEqual(issue.steps.map(step => step.jp),['勉強する','勉強し','勉強します']);
});

test('checker covers group confusions, irregulars, adjectives, chains, conditional forms and missing て', () => {
  for (const [original,expected,grammarId] of [
    ['食べらなかった。','食べなかった。','nai'],
    ['帰ない。','帰らない。','nai'],
    ['昨日、本を書た。','昨日、本を書いた。','ta'],
    ['行いてください。','行ってください。','request'],
    ['本を読むてから、勉強します。','本を読んでから、勉強します。','te-kara'],
    ['高いくない。','高くない。','adj-i'],
    ['高いかったです。','高かったです。','adj-i'],
    ['静かくない。','静かではない。','adj-na'],
    ['きのうは静かくなかったです。','きのうは静かではなかったです。','adj-na'],
    ['高くないでした。','高くなかったです。','adj-i'],
    ['本を読みませんました。','本を読みませんでした。','masu'],
    ['本を読んだます。','本を読みました。','masu'],
    ['食べるたら、寝る。','食べたら、寝る。','tara'],
    ['勉強するば、読む。','勉強すれば、読む。','ba'],
    ['帰らないければなりません。','帰らなければなりません。','obligation'],
    ['本を読むください。','本を読んでください。','request'],
    ['飲まなくてください。','飲まないでください。','negative-request'],
  ]) {
    const result = check(original);
    assert.equal(result.status,'error',original);
    assert.equal(result.corrected,expected,original);
    assert.equal(result.issues[0].grammarId,grammarId,original);
  }
});

test('checker requires a negative predicate for restrictive しか and keeps place-particle suggestions tentative', () => {
  const shika = check('お茶しか飲みます。');
  assert.equal(shika.status,'error');
  assert.equal(shika.corrected,'お茶しか飲みません。');
  assert.equal(shika.issues[0].grammarId,'g14a_2');
  const location = check('学校で行きます。');
  assert.equal(location.status,'uncertain');
  assert.equal(location.issues[0].excerpt,'で');
  assert.equal(location.issues[0].replacement,'に');
  assert.equal(location.corrected,'');
  for (const sentence of ['お茶しか飲みません。','車で学校へ行きます。']) {
    assert.equal(check(sentence).status,'clean',sentence);
  }
  const conditional = check('帰ると、本を読んでください。');
  assert.equal(conditional.status,'uncertain');
  assert.equal(conditional.issues[0].grammarId,'compare:condition');
  assert.equal(conditional.issues[0].excerpt,'帰ると');
  assert.equal(conditional.issues[0].replacement,'帰ったら');
  assert.equal(check('帰ると、本を読みます。').issues.length,0);
});

test('checker preserves original width, offsets and unmodified text across multiple corrections', () => {
  const original = '  毎日、ﾍﾞﾝｷｮｳｽﾙﾏｽ。私わ学生です。  ';
  const report = check(original);
  assert.equal(report.status,'error');
  assert.deepEqual(report.issues.map(issue => original.slice(issue.start,issue.end)),['ﾍﾞﾝｷｮｳｽﾙﾏｽ','わ']);
  assert.equal(report.corrected,'  毎日、べんきょうします。私は学生です。  ');
  assert.equal(check('ありがとうごさいます。').corrected,'ありがとうございます。');
});

test('checker accepts valid constructions and withholds a single correction for ambiguous forms', () => {
  for (const sentence of ['毎日、日本語を勉強します。','本を読んでください。','勉強してます。','食べてた。','わたしわからない。','高いじゃない。',
    '学校に行くから、本を買う。','昨日買ったばかり。','「勉強するます」は例です。','食べられなかった。']) {
    assert.equal(check(sentence).issues.length,0,sentence);
  }
  const ambiguous = check('きるます。');
  assert.equal(ambiguous.status,'uncertain');
  assert.equal(ambiguous.corrected,'');
  assert.deepEqual(new Set([ambiguous.issues[0].replacement,...ambiguous.issues[0].alternatives.map(option => option.replacement)]),
    new Set(['きます','きります']));
  assert.equal(check('こんにちわ。').status,'uncertain');
});

test('checker distinguishes limited rule coverage from approval or errors', () => {
  assert.equal(check('毎日、日本語を勉強します。').status,'clean');
  for (const input of ['','benkyoushimasu','龘黻臾。','学校へ。','学'.repeat(241)]) {
    assert.equal(check(input).status,'insufficient',input);
  }
});
