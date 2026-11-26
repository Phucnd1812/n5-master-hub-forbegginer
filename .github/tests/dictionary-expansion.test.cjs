const assert = require('node:assert/strict');
const fs = require('node:fs');
const {before,test} = require('node:test');
const path = require('node:path');

const root = path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const json = name => JSON.parse(fs.readFileSync(path.join(root,'assets',name),'utf8'));
const data = name => JSON.parse(html.match(new RegExp('const '+name+' = (.+);'))[1]);
let engine, catalog;
const requested = [];
const load = async url => {
  requested.push(url.pathname);
  return {ok:true,json:async()=>JSON.parse(fs.readFileSync(url,'utf8'))};
};

before(async () => {
  const {createSearchEngine}=await import('../../assets/search/search-engine.js');
  const {createDictionaryCatalog}=await import('../../assets/search/dictionary-catalog.js');
  const {builtInRows,jmdictRows}=await import('../../assets/search/lexicon.js');
  catalog=createDictionaryCatalog(load);
  engine=await createSearchEngine({
    vocab:[...data('VOCAB_DATA'),...data('N5_SUPPLEMENT_VOCAB_DATA')],
    kanji:[...data('KANJI_DATA'),...data('N5_SUPPLEMENT_KANJI_DATA')],grammar:data('GRAMMAR_DATA'),
    pack:[...jmdictRows(json('search/jmdict-essentials.json')),...builtInRows(json('search/builtin-dictionary.json')),
      ...jmdictRows(json('search/jmdict-context.json')),...jmdictRows(json('search/jmdict-hotfix.json'))],catalog,
  });
});

test('reference data is split and a single lookup reads only its requested shards', async () => {
  assert.equal(requested.length,3);
  assert(!requested.some(file=>file.includes('/words/')));
  assert.equal((await catalog.loadCore()).words.length,674);
  requested.length=0;
  const found=await engine.search('genkan');
  assert.equal(found.results.find(entry=>entry.type==='vocab').title,'玄関');
  assert(requested.length>0 && requested.length<=3);
  assert(requested.every(path=>path.includes('/words/')));
});

test('the new headwords, contextual homophones and state forms are grounded in the full catalog', async () => {
  const wanted={
    kami:['紙','神','髪'],hashi:['橋','箸','端'],ame:['雨','飴'],hana:['花','鼻'],
    kiru:['着る','切る'],naku:['泣く','鳴く'],naoru:['直る','治る'],shuukan:['習慣','週間','週刊'],
  };
  for (const [query,words] of Object.entries(wanted)) {
    const result=await engine.search(query,{limit:4});
    for (const word of words) {
      assert(result.homophones.some(entry=>entry.title===word && entry.description && entry.reading),query+' → '+word);
    }
  }
  for (const query of ['玄関','genkan','げんかん','lối vào nhà','loi vao nha','gen']) {
    const {results}=await engine.search(query,{limit:30});
    assert(results.some(entry=>entry.title==='玄関' && entry.reading==='げんかん' && /lối vào nhà/.test(entry.description)),query);
  }
  const {results:weekend}=await engine.search('shuumatsu');
  assert(weekend.some(entry=>entry.title==='週末' && entry.description==='cuối tuần'));
  assert(!weekend.some(entry=>entry.title==='週刊' && entry.match==='exact'));
  for (const [query,head,reading] of [['shitteimasu','知る','しっている'],['知らない','知る','しらない']]) {
    const {analysis}=await engine.search(query);
    const predicate=analysis.parts.find(part=>part.form);
    assert.equal(predicate.lemma.jp,head);
    assert.equal(predicate.form.kana,reading==='しっている'?'しっています':reading);
    assert(predicate.form.meaning.includes('biết'));
  }
  const {forms}=await engine.search('kite');
  assert.deepEqual(new Set(forms.slice(0,2).map(x=>x.form.jp)),new Set(['着て','来て']));
  assert((await engine.search('naitei')).forms.some(({form})=>form.jp==='泣いていい'));
  const {localTranslation}=await import('../../assets/translation/rules.js');
  for (const [jp,word,meaning] of [
    ['紙に書きます。','紙','Viết trên giấy.'],['神を信じます。','神','Tin vào thần linh.'],
    ['髪を切ります。','髪','Cắt tóc.'],
  ]) {
    const {analysis}=await engine.search(jp);
    assert.equal(analysis.parts.find(part=>part.kind==='word')?.lemma.jp,word);
    assert.equal(localTranslation(jp,'ja-vi',analysis)?.translatedText,meaning);
  }
});

test('KANJIDIC metadata, reviewed word links and exact KanjiVG paths stay separate', async () => {
  for (const [glyph,count] of [['知',8],['折',7],['着',12],['玄',5],['関',14],['食',9],
    ['見',7],['聞',14],['書',10],['語',14]]) {
    const item=await catalog.kanji(glyph);
    assert.equal(item.strokes,count,glyph);
    assert(item.onyomi && item.radical && item.edition);
    assert.equal((await catalog.strokes(glyph)).length,count);
  }
  assert((await catalog.kanji('折')).links.some(link=>link[0]==='骨折'));
  assert((await catalog.kanji('知')).links.some(link=>link[3]?.includes('知っています')));
  const {results}=await engine.search('origami');
  assert(results.some(item=>item.title==='折り紙' && item.description.includes('gấp giấy')));
});

test('normalized reading groups sampled across downloaded shards retain distinct headwords', async () => {
  const {japaneseKey}=await import('../../assets/search/text.js');
  const index=json('dictionary/v1/index.json');
  const keys=index.words.filter(name=>name.startsWith('r-'));
  const groups=new Map();
  for(const key of keys) for(const row of json('dictionary/v1/words/'+key+'.json')) {
    const [id,jp,kana]=row;
    if(!id || !kana) continue;
    if(!groups.has(kana)) groups.set(kana,new Set());
    groups.get(kana).add(japaneseKey(jp));
  }
  const rows=[...groups].filter(([kana,words])=>kana.length>1 && words.size>1).sort(([a],[b])=>a.localeCompare(b,'ja'));
  assert(rows.length>=500);
  const sample=Array.from({length:35},(_,i)=>rows[Math.floor((i+.5)*rows.length/35)]);
  for (const [kana,words] of sample) {
    const {homophones,results}=await engine.search(kana);
    const observed = new Set([...homophones,...results].filter(item=>item.reading===kana)
      .flatMap(item=>[item.title,...(item.aliases || [])]).map(japaneseKey));
    assert([...words].every(word=>observed.has(word)),kana+' → '+[...words]);
  }
});

test('furigana suggestions keep annotation and okurigana separate using the live dictionary', async () => {
  const {normalizeFlatFurigana,readingsFromLookup}=await import('../../assets/search/furigana-normalizer.js');
  const readings=async word=>readingsFromLookup(await engine.search(word),word);
  for (const [source,expected] of [
    ['日に本ほん語ご','日本語'],['漢かん字じ','漢字'],['勉べん強きょう','勉強'],
    ['日に本ほん語ごを勉べん強きょうします。','日本語を勉強します。'],
    ['Học 漢かん字じ và 日本語にほんご。','Học 漢字 và 日本語。'],
    ['玄げん関かんで待つ。','玄関で待つ。'],['紙かみ',''],
  ]) {
    const result=await normalizeFlatFurigana(source,readings);
    assert.equal(result?.text || '',expected,source);
    if (result) assert.equal(result.original,source);
  }
  for (const legitimate of ['食べる','見に行く','知っています','お茶を飲む','東京に行く','学校で勉強する',
    '日本語を勉強します','玄関で待ちます。','nihongo','tiếng Nhật']) {
    assert.equal(await normalizeFlatFurigana(legitimate,readings),null,legitimate);
  }
});

test('grammar Q&A keeps stable topic IDs, complete answers, and open-question alternatives', async () => {
  const {COURSE}=await import('../../assets/grammar/course.js');
  const {GRAMMAR_GUIDES}=await import('../../assets/search/grammar-data.js');
  const {QUESTION_SETS,QUESTIONS_BY_TOPIC}=await import('../../assets/grammar/questions.js');
  const {renderQuestionPanel}=await import('../../assets/grammar/question-view.js');
  const ids = new Set([...COURSE.map(row=>row[0]),...GRAMMAR_GUIDES.map(row=>row.id)]);
  for (const [keys,title,mode,[jp,kana,vi],notes,answers] of QUESTION_SETS) {
    assert(keys.every(id=>ids.has(id)),title);
    assert(/[?？]$|か。$/.test(jp) && kana && vi && notes,title);
    assert(answers.length && answers.every(answer=>answer.length===4 && answer.every(Boolean)),title);
    if(mode==='đóng') assert(answers.length>=2,title);
    if(mode==='mở') assert(!answers.some(answer=>/^(はい|いいえ)/.test(answer[1])),title);
  }
  assert(QUESTIONS_BY_TOPIC.size>=35);
  assert.match(renderQuestionPanel('g1a_2'),/学生ではありません/);
  assert.match(renderQuestionPanel('g6c_10'),/data-qa-practice/);
});
