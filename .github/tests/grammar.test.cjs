const assert = require('node:assert/strict');
const {test} = require('node:test');

test('ending charts cover nine godan endings, both other groups and beginner exceptions', async () => {
  const {formationFor} = await import('../../assets/grammar/formation.js');
  const nine = ['う','く','ぐ','す','つ','ぬ','ぶ','む','る'];
  const expectForms = (id,key,expected) => {
    const [table] = formationFor(id,key).tables;
    assert.deepEqual(table.rows.slice(0,9).map(row => row.label[1]),nine);
    assert.deepEqual(table.rows.map(row => row.to.jp),expected);
  };
  expectForms('te','te',[
    '買って','書いて','泳いで','話して','待って','死んで','遊んで','飲んで','帰って',
    '食べて','借りて','して','来て','行って',
  ]);
  expectForms('ta','past',[
    '買った','書いた','泳いだ','話した','待った','死んだ','遊んだ','飲んだ','帰った',
    '食べた','借りた','した','来た','行った',
  ]);
  expectForms('nai','negative',[
    '買わない','書かない','泳がない','話さない','待たない','死なない','遊ばない','飲まない','帰らない',
    '食べない','借りない','しない','来ない','ない',
  ]);
  expectForms('masu','masu',[
    '買います','書きます','泳ぎます','話します','待ちます','死にます','遊びます','飲みます','帰ります',
    '食べます','借ります','します','来ます','くださいます',
  ]);
  const [obligation] = formationFor('obligation','duty').tables;
  assert.equal(obligation.rows.find(row => row.to.jp === '来ない')?.to.kana,'こない');
  assert.match(formationFor('obligation','duty').composition,/なければ.*ならない/);
  const [past] = formationFor('g9c_8','past').tables;
  assert(past.rows.some(({from,to}) => from.jp === '行きました' && to.jp === '行った'));
  const [negative] = formationFor('g9b_5','negative').tables;
  assert(negative.rows.some(({from,to}) => from.jp === 'ありません' && to.jp === 'ない'));
});

test('adjective charts distinguish vowel changes, adjective suffixes and uninflected examples', async () => {
  const {formationFor} = await import('../../assets/grammar/formation.js');
  const contents = id => formationFor(id,'adjPolite').tables[0].rows.flatMap(row => row.forms.map(form => form.jp));
  for (const form of ['高くない','高かった','高くなかった','高ければ','いいです','よくない','よかった','よければ']) {
    assert(contents('adj-i').includes(form),form);
  }
  for (const form of ['きれいだ','きれいな','きれいではない','静かだった','静かではなかった','静かで','静かなら']) {
    assert(contents('adj-na').includes(form),form);
  }
  assert.equal(formationFor('g3c_12').tables.length,2);
  assert.equal(formationFor('tara','tara').tables.length,3);
  assert.equal(formationFor('topic'),null);
});

test('grammar chapters and comparisons retain reading and link directly to practice tools', async () => {
  const [{COURSE},{EXTENSIONS},{GRAMMAR_GUIDES},{COMPARISONS},{createGrammarView},{japaneseKey}] = await Promise.all([
    import('../../assets/grammar/course.js'), import('../../assets/grammar/extensions.js'),
    import('../../assets/search/grammar-data.js'), import('../../assets/grammar/comparisons.js'),
    import('../../assets/grammar/grammar-ui.js'), import('../../assets/search/text.js'),
  ]);
  const esc = value => String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const button = (action,value,label,attributes = '') =>
    `<button data-lookup="${esc(action)}" data-value="${esc(value)}" ${attributes}>${label}</button>`;
  const view = createGrammarView({
    esc,button,detailButton:button,settings:{roman:true,furigana:true},app:{item:() => null},
  });
  const topics = [...COURSE,...EXTENSIONS].map(row => [row[0],row[8]]).concat(
    GRAMMAR_GUIDES.map(guide => [guide.id,guide.examples]),
    COMPARISONS.map(row => ['compare:' + row[0],row[5].map(side => side[2])]),
  );
  assert.equal(topics.length,184);
  const readings = new Map();
  let examples = 0;
  for (const [id,samples] of topics) {
    const html = view.render(id);
    assert(html.includes(`data-lookup="builder" data-value="${id}"`),id);
    const formation = html.indexOf('class="n5-formation-table"');
    if (formation !== -1) assert(formation < html.indexOf('data-section="examples"'),id);
    for (const [sentence,reading,meaning,notes] of samples) {
      assert(meaning && notes,id);
      assert(!/[\p{Script=Han}A-Za-z]/u.test(reading),sentence);
      const sentenceKey = japaneseKey(sentence);
      const readingKey = japaneseKey(reading);
      if (readings.has(sentenceKey)) assert.equal(readings.get(sentenceKey),readingKey,sentence);
      readings.set(sentenceKey,readingKey);
      assert(html.includes(`data-lookup="checker" data-value="${esc(sentence)}"`),id);
      examples++;
    }
  }
  assert.equal(examples,371);
});
