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
  const {builtInRows,jmdictRows} = await import('../../assets/search/lexicon.js');
  const rows = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/search/builtin-dictionary.json'),'utf8'));
  const verified = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/search/jmdict-essentials.json'),'utf8'));
  const hotfix = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/search/jmdict-hotfix.json'),'utf8'));
  engine = await createSearchEngine({...data, pack:[...jmdictRows(verified),...jmdictRows(hotfix),...builtInRows(rows), ...data.pack]});
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
  const {COMPARISONS} = await import('../../assets/grammar/comparisons.js');
  const known = new Set([...data.grammar.map(item => item.id),...GRAMMAR_BY_ID.keys(),
    ...EXTENSIONS.map(row => row[0]),...COMPARISONS.map(([id]) => 'compare:' + id)]);
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
  assert.equal(COMPARISONS.length,19);
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
  for (const [id,,,requires,common,sides,detail,quiz] of COMPARISONS) {
    assert(requires.length > 0 && requires.every(key => known.has(key)),id);
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

test('Search 2.0 distinguishes exact, prefix, typo, and contextual matches', async () => {
  const firstVocab = result => result.results.find(entry => entry.type === 'vocab');
  for (const query of ['薬局','やっきょく','ヤッキョク','yakkyoku','yak kyo ku','hiệu thuốc','hieu thuoc']) {
    const result = await engine.search(query);
    assert.equal(firstVocab(result).title,'薬局',query);
    assert.equal(firstVocab(result).match,'exact',query);
  }
  for (const [query,head] of [['na','な'],['owa','おわ']]) {
    const result = await engine.search(query);
    assert(firstVocab(result).reading.startsWith(head),query);
    assert.equal(firstVocab(result).match,'prefix',query);
    assert.equal(result.analysis,null,query);
  }
  for (const query of ['nihonog','nihongoo','ni hon go o']) {
    const result = await engine.search(query);
    assert.equal(firstVocab(result).title,'日本語',query);
    assert.equal(firstVocab(result).match,'fuzzy',query);
  }
  for (const [query,id] of [
    ['không cần phải','optional'],['khong can phai di','optional'],['vừa nghe nhạc vừa học','simultaneous'],
    ['chậm nhất vào thứ tư','compare:deadline'],['làm xong rồi mới ăn','te-kara'],
  ]) {
    const {results,analysis} = await engine.search(query);
    assert.equal(results[0].id,id,query);
    assert.equal(results[0].match,'grammar',query);
    assert.equal(analysis,null,query);
  }
});

test('verified external inflections recognize aliases, combinations and different readings', async () => {
  for (const [query,base,key] of [
    ['owaranai','終わる','negative'],['taberarenakatta','食べる','potentialNegativePast'],
    ['nondekara','飲む','afterTe'],['ikanakerebanarimasen','行く','dutyPolite'],
    ['ben kyou shite imasu','勉強する','progressivePolite'],
    ['跨がせられませんでした','跨ぐ','causativePassivePoliteNegativePast'],
    ['またがされました','跨ぐ','causativePassiveShortPolitePast'],
    ['申込みました','申し込む','mashita'],['提出しなきゃ','提出する','negativeNakya'],
    ['提出しなければなりません','提出する','dutyPolite'],
    ['うるさくなかった','うるさい','adjNegPast'],
  ]) {
    const {analysis,results} = await engine.search(query);
    const {form,lemma} = analysis.parts.find(part => part.form);
    assert.equal(lemma.jp,base,query);
    assert.equal(form.key,key,query);
    assert(form.steps.every(step => step.meaning && (step.key === 'dictionary' || step.rule && step.changed)),query);
    assert.equal(results.find(entry => entry.type === 'vocab').title,base,query);
    if (['跨ぐ','申し込む','提出する'].includes(base)) assert(lemma.sourceId && !lemma.card,query);
  }
  const read = (await engine.search('開く')).analysis.parts[0];
  assert.deepEqual(new Set([read.lemma,...read.alternatives.map(option => option.lemma)].map(lemma => lemma.kana)),
    new Set(['あく','ひらく']));
  const verb = (await engine.search('taberarenakatta')).analysis.parts[0];
  assert(verb.alternatives.some(option => option.form.key === 'passiveNegativePast'));
  const duty = (await engine.search('寝なければなりません')).analysis.parts[0].form;
  assert.deepEqual(duty.steps.map(step => step.jp),['寝る','寝ない','寝なければ','寝なければなりません']);
  assert.equal(duty.meaning,'phải ngủ');
});

test('the selected dictionary keeps provenance, readings, parts of speech and unique entry IDs', async () => {
  const {builtInRows,jmdictRows} = await import('../../assets/search/lexicon.js');
  const {makeLemma,generateForms} = await import('../../assets/search/morphology.js');
  const {IS_KANA} = await import('../../assets/search/text.js');
  const source = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/search/jmdict-essentials.json'),'utf8'));
  const rows = jmdictRows(source);
  assert.equal(rows.length,74);
  assert.equal(new Set(rows.map(item => item.id)).size,rows.length);
  for (const row of rows) {
    assert(Number.isInteger(row.sourceId) && row.jp && IS_KANA.test(row.kana) && row.vi && row.pos && !row.card);
    assert.equal(makeLemma(row).jp,row.jp);
    assert.equal(makeLemma(row).group,row.verifiedGroup);
    assert.equal(generateForms(makeLemma(row)).size === 1,!row.verifiedGroup);
    if (row.examples) assert(row.examples.every(example => example.length === 4 && example.every(Boolean)));
  }
  const legacy = builtInRows([['呁',[],'{{rfdef}}','Ký tự',[], []]])[0];
  assert.equal(legacy.vi,'');
  assert.equal(legacy.jp,'呁');
});

test('unseen sentences mark clause roles, unfamiliar words and translation evidence', async () => {
  async function check(query, labels) {
    const {analysis} = await engine.search(query);
    assert.equal(analysis.original,query);
    assert.equal(analysis.translation,'',query);
    assert(analysis.phrases.length > 0,query);
    for (const label of labels) assert(analysis.phrases.some(phrase => phrase.label === label),label + ': ' + query);
    return analysis;
  }
  const duty = await check('薬を飲んでから寝なければなりません。',['Tân ngữ','Hành động trước','Vị ngữ']);
  assert(duty.grammar.includes('obligation') && duty.grammar.includes('te-kara'));
  assert(duty.notes.some(note => note.includes('Chủ thể có thể được lược bỏ')));
  const place = await check('今朝、図書館の前で友達が車を止めました。',
    ['Mốc thời gian','Bổ nghĩa cho danh từ sau の','Nơi thực hiện','Chủ thể có thể có','Tân ngữ','Vị ngữ']);
  assert.equal(place.coverage,1);
  assert.equal(place.parts.at(-2).lemma.jp,'止める');
  const unknown = await check('曜肬坯を見てから帰りました。',['Chưa nhận diện','Hành động trước','Vị ngữ']);
  assert(unknown.coverage < 1);
  assert.equal((await engine.search('日本語が隙です。')).analysis.translation,'');
  assert.equal((await engine.search('日本語が好きです。')).analysis.translation,'Tôi thích tiếng Nhật.');
  assert((await engine.search('金曜日までに宿題を提出します。')).analysis.grammar.includes('compare:deadline'));
  const state = (await engine.search('ドアが少し開けてありました。')).analysis;
  assert(state.grammar.includes('compare:state'));
  assert.equal(state.parts.find(part => part.text === '少し').kana,'すこし');
  assert.equal(state.parts.find(part => part.text === '開けて').lemma.jp,'開ける');
});

test('verified suffixes link learner spellings and only extend attested person nouns', async () => {
  for (const query of ['kodomo','こども','子ども','子供']) {
    const {results} = await engine.search(query);
    assert(results.some(entry => entry.type==='vocab' && ['子供','子ども'].includes(entry.title)),query);
  }
  for (const query of ['Kodomotach','kodomo tachi','kodomotachi','こどもたち','子どもたち','子供たち','子供達']) {
    const result = await engine.search(query);
    const candidate = result.forms.find(({form}) => form.jp==='子どもたち');
    assert(candidate,query);
    assert.equal(candidate.match,query==='Kodomotach'?'completion':'inflection',query);
    assert.equal(candidate.form.lemma.jp,'子ども');
    assert.equal(candidate.form.kana,'こどもたち');
    assert.equal(candidate.form.meaning,'những đứa trẻ');
    assert(candidate.form.spellings.includes('子供達'));
  }
  for (const [query,root,key] of [
    ['消防士達','消防士','person-plural'],['外国人たち','外国人','person-plural'],
    ['弟くん','弟','person-kun'],['妹ちゃん','妹','person-chan'],
    ['運転手さん','運転手','person-san'],['先生方','先生','person-respective'],
  ]) {
    const {forms} = await engine.search(query);
    assert(forms.some(({form,match})=>match==='inflection' && form.lemma.jp===root && form.key===key && form.meaning),query);
  }
  assert(!(await engine.search('本たち')).forms.some(({form})=>form.lemma.jp==='本'));
});

test('ambiguous incomplete verbs offer grounded forms and preserve exact independent words', async () => {
  const {results,forms,analysis} = await engine.search('naitei');
  assert.equal(results[0].title,'内定');
  assert.equal(results[0].match,'exact');
  assert.equal(analysis,null);
  const meanings = new Map([
    ['泣いている','đang khóc'],['泣いています','đang khóc'],
    ['泣いていい','được phép khóc'],['泣いていた','lúc đó đang khóc'],
  ]);
  for (const query of ['naitei','泣いてい']) {
    const result = query==='naitei'?{forms,analysis}:await engine.search(query);
    assert.equal(result.analysis,null,query);
    for (const [jp,meaning] of meanings) {
      assert(result.forms.some(({form,match})=>match==='completion' && form.jp===jp &&
        form.lemma.jp==='泣く' && form.meaning===meaning),jp);
    }
  }
  for (const [query,root] of [
    ['泣く','泣く'],['泣いて','泣く'],['泣いていい','泣く'],['泣いている','泣く'],['泣いています','泣く'],
    ['吹く','吹く'],['吹いて','吹く'],['吹いています','吹く'],['benkyoushiteimasu','勉強する'],
  ]) {
    const {analysis} = await engine.search(query);
    const token = analysis.parts.find(part=>part.kind==='word');
    assert.equal(token.lemma.jp,root,query);
    if (query!==root) assert(token.form?.meaning,query);
    if (query==='泣いていい') assert.deepEqual(token.form.steps.map(step=>step.jp),['泣く','泣いて','泣いていい']);
  }
});

test('weather and everyday sentences use complete offline predicate evidence', async () => {
  const {localTranslation} = await import('../../assets/translation/rules.js');
  for (const [jp,root,form,expected] of [
    ['風が吹いています。','吹く','progressivePolite','Gió đang thổi.'],
    ['雨が降っています。','降る','progressivePolite','Trời đang mưa.'],
    ['雪が降っています。','降る','progressivePolite','Tuyết đang rơi.'],
    ['テレビを見ています。','見る','progressivePolite','Đang xem TV.'],
    ['日本語を勉強しています。','勉強する','progressivePolite','Đang học tiếng Nhật.'],
    ['毎日学校へ行きます。','行く','masu','Mỗi ngày đến trường.'],
    ['薬を飲んでから寝ます。','寝る','masu','Sau khi uống thuốc, đi ngủ.'],
    ['音楽を聞きながら勉強します。','勉強する','masu','Tôi vừa nghe nhạc vừa học.'],
  ]) {
    const {analysis} = await engine.search(jp);
    const predicate = analysis.parts.findLast(part=>part.form);
    assert.equal(predicate.lemma.jp,root,jp);
    assert.equal(predicate.form.key,form,jp);
    assert.equal(analysis.coverage,1,jp);
    const translation = localTranslation(jp,'ja-vi',analysis);
    assert.equal(translation?.translatedText,expected,jp);
    if (root==='吹く') {
      assert.equal(translation.source,'rule');
      assert.deepEqual(predicate.form.steps.map(step=>step.jp),['吹く','吹いて','吹いている','吹いています']);
      assert(analysis.parts.some(part=>part.jp==='風' && part.kana==='かぜ'));
      assert.deepEqual(analysis.parts.filter(part=>part.kind==='function').map(part=>part.grammar),['subject']);
    }
  }
  const {analysis} = await engine.search('気象観測システムが風洞で試験運用されています。');
  assert(!localTranslation(analysis.original,'ja-vi',analysis));
});

test('curriculum samples exercise short and long Romaji prefixes and verified combinations', async () => {
  const {makeLemma,generateForms} = await import('../../assets/search/morphology.js');
  const {romanize} = await import('../../assets/search/text.js');
  const roots = [...new Map(data.vocab.map(makeLemma)
    .filter(lemma=>lemma && /^[IV]+$/.test(lemma.group || '') && /^[a-z]{5,}$/.test(lemma.romaji) && lemma.vi)
    .map(lemma=>[lemma.jp,lemma])).values()];
  assert(roots.length>=30);
  const sample=Array.from({length:12},(_,i)=>roots[Math.floor(i*roots.length/12)]);
  for (const [index,lemma] of sample.entries()) {
    const query=lemma.romaji.slice(0,-(index%2+1));
    const {results} = await engine.search(query,{limit:96});
    assert(results.some(entry=>entry.type==='vocab' && entry.title===lemma.jp &&
      ['prefix','exact','alternate'].includes(entry.match)),query+' → '+lemma.jp);
    const generated=generateForms(lemma);
    const key=['mashita','progressivePolite','afterTe'][index%3];
    const expected=generated.get(key);
    assert(expected,lemma.jp);
    const {analysis} = await engine.search(romanize(expected.kana));
    assert(analysis?.parts.some(part=>[part,...part.alternatives].some(interpretation=>
      interpretation.lemma?.jp===lemma.jp && interpretation.form?.key===key && interpretation.form.meaning)),expected.jp);
  }
  for (const query of ['kaze','fuu']) {
    const {results} = await engine.search(query);
    assert(results.some(entry=>entry.title==='風' && entry.reading===(query==='kaze'?'かぜ':'ふう') &&
      entry.description.includes(query==='kaze'?'gió':'phong cách')),query);
  }
});
