const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {before,test} = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const dataset = name => JSON.parse(html.match(new RegExp('const ' + name + ' = (.+);'))[1]);
const data = {
  vocab:[...dataset('VOCAB_DATA'),...dataset('N5_SUPPLEMENT_VOCAB_DATA')],
  kanji:[...dataset('KANJI_DATA'),...dataset('N5_SUPPLEMENT_KANJI_DATA')],
  grammar:dataset('GRAMMAR_DATA'),
  pack:[{jp:'天文台',kana:'てんもんだい',vi:'đài thiên văn',pos:'Danh từ',source:'Tệp kiểm thử'}],
};
let engine;

before(async () => {
  const {createSearchEngine} = await import('../../assets/search/search-engine.js');
  const {builtInRows} = await import('../../assets/search/lexicon.js');
  const rows = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/search/builtin-dictionary.json'),'utf8'));
  engine = await createSearchEngine({...data, pack:[...builtInRows(rows), ...data.pack]});
});

test('key normalization preserves kana voicing and folds Vietnamese independently', async () => {
  const {fold,hiragana,oneEdit,romanize,romanKey,suggestKana} = await import('../../assets/search/text.js');
  assert.equal(fold('  KHÔNG ĐƯỢC LÀM '),'khong duoc lam');
  assert.equal(hiragana('ﾃﾚﾋﾞ'),'てれび');
  assert.equal(hiragana('パーティー'),'ぱーてぃー');
  assert.equal(romanize('パーティー'),'paatii');
  assert.equal(romanize('まっちゃ'),'matcha');
  assert.equal(romanKey('Tōkyō'),'toukyou');
  assert.equal(suggestKana('matcha'),'まっちゃ');
  assert.equal(suggestKana('nonsense42'),'');
  for (const variant of ['nihongoo','nihogo','nihonho','nihonog']) assert(oneEdit('nihongo',variant),variant);
  assert(!oneEdit('nihongo','nihog'));
  assert(!oneEdit('nihongo','nihongo'));
});

test('Japanese, Romaji, Vietnamese, prefixes, typos, Kanji and curriculum are searchable', async () => {
  async function first(query,type) {
    return (await engine.search(query)).results.find(item => item.type === type);
  }
  for (const query of ['テレビ','てれび','ﾃﾚﾋﾞ','terebi','tivi']) {
    assert.equal((await first(query,'vocab')).title,'テレビ',query);
  }
  for (const query of ['日本語','nihongo','nihongoo','nihonog','ｎｉｈｏｎｇｏ']) {
    assert.equal((await first(query,'vocab')).title,'日本語',query);
  }
  for (const query of ['na','な','ナ']) {
    const matches = (await engine.search(query)).results.filter(item => item.type === 'vocab');
    assert(matches.length >= 5,query);
    assert(matches.slice(0,5).every(item => item.reading.startsWith('な')),query);
  }
  assert.equal((await first('飲','kanji')).title,'飲');
  assert.equal((await first('bài 6c','lesson')).title,'Bài 6C');
  for (const query of ['đài thiên văn','てんもんだい','tenmondai']) {
    assert.equal((await first(query,'vocab')).title,'天文台',query);
  }
  for (const query of ['không được làm','khong duoc lam','てはいけない','tewaikenai']) {
    assert.equal((await first(query,'grammar')).id,'prohibition',query);
  }
  assert.equal((await first('muốn làm','grammar')).id,'desire');
});

test('inflected lookups find real lemmas and explain the required compound forms', async () => {
  for (const [query,lemma,key,grammar] of [
    ['owaranai','終わる','negative','nai'],
    ['tabesasenai','食べる','causativeNegative','causative'],
    ['ikanakerebanaranai','行く','duty','obligation'],
    ['nondekara','飲む','afterTe','te-kara'],
    ['tabetakotogaaru','食べる','experience','experience'],
    ['kaerimashita','帰る','mashita','masu'],
    ['行け','行く','imperative','imperative'],
    ['読もう','読む','volitional','volitional'],
    ['食べれば','食べる','ba','ba'],
    ['書かせられました','書く','causativePassivePolitePast','causative-passive'],
    ['来させない','来る','causativeNegative','causative'],
    ['高くなかった','高い','adjNegPast','adj-i'],
    ['静かじゃなかった','静か','adjNegPastAlt','adj-na'],
    ['yokunakatta','いい','adjNegPast','adj-i'],
    ['食べませんでした','食べる','masenPast','masu'],
  ]) {
    const {analysis,results} = await engine.search(query);
    assert.equal(analysis?.parts.find(part => part.form)?.lemma.jp,lemma,query);
    assert.equal(analysis.parts.find(part => part.form).form.key,key,query);
    assert(analysis.grammar.includes(grammar),query);
    assert.equal(results.find(item => item.type === 'vocab').title,lemma,query);
  }
  const {analysis} = await engine.search('飲まなければならない');
  const form = analysis.parts[0].form;
  assert.deepEqual(form.steps.map(step => step.jp),['飲む','飲まない','飲まなければ','飲まなければならない']);
  assert.equal(form.meaning,'phải uống');
  assert.equal(form.kana,'のまなければならない');
  assert.equal(form.lemma.group,'I');
});

test('sentence analysis preserves the clause, particle roles and evidence for a translation', async () => {
  const original = '昨日、友達と映画を見てから、ご飯を食べました。';
  const {analysis,results} = await engine.search(original);
  assert.equal(analysis.original,original);
  assert.equal(analysis.readings,'きのう、ともだちとえいがをみてから、ごはんをたべました。');
  assert.equal(analysis.coverage,1);
  assert.deepEqual(analysis.parts.filter(part => part.kind === 'word').map(part => part.lemma.jp),
    ['昨日','友達','映画','見る','ご飯','食べる']);
  assert.match(analysis.parts.find(part => part.jp === 'と').role,/cùng thực hiện/);
  assert(analysis.grammar.includes('te-kara') && analysis.grammar.includes('masu'));
  assert.match(analysis.translation,/sau khi xem phim với bạn/);
  assert(results.some(item => item.type === 'lesson'));
  const additional = (await engine.search('本を読んでから、映画を見たいです。')).analysis;
  assert(additional.grammar.includes('te-kara') && additional.grammar.includes('desire'));
  assert.equal(additional.translation,'');
  const unrecognized = (await engine.search('スカイツリーで量子もつれを測定した。')).analysis;
  assert(unrecognized.parts.some(part => part.kind === 'unknown' && part.text === 'スカイツリー'));
  assert(unrecognized.grammar.includes('particle-de'));
  assert.equal(unrecognized.translation,'');
  assert.match(unrecognized.notes.join(' '),/ngoài kho dữ liệu/);
});

test('homophones and ambiguous inflections preserve alternative analyses', async () => {
  const ambiguous = (await engine.search('食べられる')).analysis;
  assert.equal(ambiguous.parts[0].form.key,'potential');
  assert(ambiguous.parts[0].alternatives.some(option => option.form.key === 'passive'));
  assert(ambiguous.grammar.includes('passive'));
  const homophones = (await engine.search('かえる')).results.filter(item => item.type === 'vocab').map(item => item.title);
  assert(homophones.includes('帰る'));
  assert(homophones.includes('変える'));
});

test('grammar guides have verified references, examples and keyed exercises', async () => {
  const {GRAMMAR_GUIDES,GRAMMAR_BY_ID} = await import('../../assets/search/grammar-data.js');
  const {generateForms,makeLemma,describeForm} = await import('../../assets/search/morphology.js');
  const {EXTENSIONS} = await import('../../assets/grammar/extensions.js');
  const known = new Set([...data.grammar.map(item => item.id),...GRAMMAR_BY_ID.keys(), ...EXTENSIONS.map(row => row[0])]);
  assert.equal(GRAMMAR_BY_ID.size,GRAMMAR_GUIDES.length);
  for (const guide of GRAMMAR_GUIDES) {
    for (const field of ['title','meaning','formula','conditions','principle','contexts','avoid','mistakes','compare']) assert(guide[field],guide.id);
    assert(guide.formation.length && guide.aliases.length && guide.examples.length >= 2,guide.id);
    for (const id of [...guide.prerequisites,...guide.course]) assert(known.has(id),id);
    for (const example of guide.examples) assert(example.length === 4 && example.every(Boolean),guide.id);
    assert(guide.exercise[1][guide.exercise[2]] && guide.exercise[3],guide.id);
  }
  for (const item of data.vocab) {
    const lemma = makeLemma(item);
    const forms = generateForms(lemma);
    for (const form of forms.values()) {
      if (form.key === 'dictionary') continue;
      assert(form.jp && form.kana && form.rule,item.id + ' ' + form.key);
      if (form.grammar) assert(known.has(form.grammar),form.grammar);
      assert(describeForm(lemma,forms,form.key).label,form.key);
    }
  }
});

test('deep grammar covers every old ID, authored answers, examples and learning links', async () => {
  const [{COURSE},{COMPARISONS},{EXTENSIONS},{APPLY,GUIDE_DISTRACTORS,checkPractice},{GRAMMAR_GUIDES}] = await Promise.all([
    import('../../assets/grammar/course.js'), import('../../assets/grammar/comparisons.js'),
    import('../../assets/grammar/extensions.js'), import('../../assets/grammar/practice.js'),
    import('../../assets/search/grammar-data.js'),
  ]);
  assert.deepEqual(COURSE.map(row => row[0]).sort(),data.grammar.map(item => item.id).sort());
  assert.equal(GRAMMAR_GUIDES.length,34);
  for (const guide of GRAMMAR_GUIDES) {
    assert.equal(GUIDE_DISTRACTORS[guide.id]?.length,guide.exercise[1].length - 1,guide.id);
  }
  assert.equal(COMPARISONS.length,14);
  const known = new Set([...COURSE,...EXTENSIONS].map(row => row[0]).concat(GRAMMAR_GUIDES.map(guide => guide.id)));
  function exercise([prompt,...choices]) {
    assert(prompt);
    assert(choices.length > 1 && choices.every(pair => pair.length === 2 && pair.every(Boolean)));
    assert.equal(new Set(choices.map(pair => pair[0])).size,choices.length);
  }
  for (const [id,title,formula,meaning,prerequisites,principle,usage,avoid,examples,quiz] of [...COURSE,...EXTENSIONS]) {
    assert([title,formula,meaning,principle,usage,avoid].every(Boolean),id);
    assert(prerequisites.length > 0 && prerequisites.every(key => key !== id && known.has(key)),id);
    assert(examples.length >= 2 && examples.every(row => row.length === 4 && row.every(Boolean)),id);
    exercise(quiz);
  }
  for (const [id,,,,common,sides,detail,quiz] of COMPARISONS) {
    assert(common && detail && sides.length > 1 && sides.every(side => side[2].length === 4 && side[2].every(Boolean)),id);
    exercise(quiz);
  }
  for (const [id,drill] of Object.entries(APPLY)) {
    assert(known.has(id) && drill.prompt && drill.why && drill.answers.length);
    if (drill.kind === 'input') for (const answer of drill.answers) assert(checkPractice(drill,answer));
  }
  assert.equal(checkPractice(APPLY.obligation,'のまなければならない。'),true);
  assert.equal(checkPractice(APPLY.obligation,'飲まないでください'),false);
  assert.equal(checkPractice(APPLY.obligation,'　'),null);
  assert.equal(checkPractice({answers:[APPLY['te-kara'].answers.join('')]},'手を 洗ってから ご飯を 食べます。'),true);
});

test('deep grammar is searchable by Japanese, intent, Romaji and exact examples', async () => {
  for (const [query,expected] of [
    ['phải làm','obligation'], ['không cần làm','optional'], ['vừa làm vừa làm','simultaneous'],
    ['ながら','simultaneous'], ['nagara','simultaneous'], ['はとが','compare:topic-subject'],
    ['音楽を聞きながら勉強します。','simultaneous'],['おんがくをききながらべんきょうします','simultaneous'],['授業の後で、先生に会います。','g10a_3'],
    ['hỏi giá','g1c_6'], ['nomanaidekudasai','negative-request'],
  ]) {
    const {results} = await engine.search(query);
    assert(results.some(item => item.type === 'grammar' && item.id === expected),query);
  }
  const {analysis} = await engine.search('nomanaidekudasai');
  assert.equal(analysis.parts[0].lemma.jp,'飲む');
  assert(analysis.grammar.includes('negative-request'));
  const example = (await engine.search('明日でもいいですか。')).analysis;
  assert.equal(example.translation,'Ngày mai có được không?');
});
