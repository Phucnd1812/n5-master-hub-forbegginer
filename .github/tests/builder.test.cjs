const assert = require('node:assert/strict');
const {test} = require('node:test');

const builder = import('../../assets/learning/builder.js');
const source = import('../../assets/learning/builder-data.js');

test('Sentence Builder covers the activity types and every linked course topic', async () => {
  const [{builderExercises,gradeBuilderAnswer},{BUILDER_KINDS,BUILDER_LEVELS},{COURSE},{COMPARISONS},{EXTENSIONS},{GRAMMAR_GUIDES}] = await Promise.all([
    builder,source,import('../../assets/grammar/course.js'),import('../../assets/grammar/comparisons.js'),
    import('../../assets/grammar/extensions.js'),import('../../assets/search/grammar-data.js'),
  ]);
  const bank = builderExercises();
  const topicIds = [...COURSE,...EXTENSIONS].map(item => item[0]).concat(
    GRAMMAR_GUIDES.map(item => item.id),COMPARISONS.map(item => 'compare:' + item[0]));
  const ids = new Set(topicIds);
  assert.equal(new Set(bank.map(exercise => exercise.id)).size,bank.length);
  assert.deepEqual(new Set(bank.map(exercise => exercise.kind)),new Set(Object.keys(BUILDER_KINDS)));
  assert.deepEqual(new Set(bank.map(exercise => exercise.level)),new Set(Object.keys(BUILDER_LEVELS)));
  for (const exercise of bank) {
    assert(exercise.grammarIds.length > 0);
    assert(exercise.grammarIds.every(id => ids.has(id)),exercise.id);
    assert(exercise.prompt && exercise.hint && exercise.parts && exercise.rule && exercise.common,exercise.id);
    assert.equal(gradeBuilderAnswer(exercise,exercise.answers[0]),'match',exercise.id);
    if (exercise.options) assert(exercise.answers.every(answer => exercise.options.includes(answer)));
  }
  for (const id of topicIds) {
    assert(bank.some(exercise => exercise.grammarIds.includes(id)),id);
  }
  assert(bank.find(item => item.id === 'translate-student').lessons.includes('Bài 1A'));
  assert(bank.find(item => item.id === 'combined-pill').lessons.includes('Bài 11B'));
  assert(bank.find(item => item.id === 'combined-pill').lessons.includes('Bài 12A'));
});

test('Sentence Builder accepts alternatives and leaves unmatched free writing to self-review', async () => {
  const {builderExercises,gradeBuilderAnswer} = await builder;
  const byId = new Map(builderExercises().map(item => [item.id,item]));
  const grade = (id,value) => gradeBuilderAnswer(byId.get(id),value);
  assert.equal(grade('translate-student','私は　学生です。'),'match');
  assert.equal(grade('translate-student','学生です。'),'alternate');
  assert.equal(grade('translate-student','自分は大学生です。'),'review');
  assert.equal(grade('translate-student','学生です？'),'review');
  assert.equal(grade('free-seat','隣に座らせていただいてもいいですか。'),'review');
  assert.equal(grade('combined-pill','薬を飲んだ後で寝なければなりません。'),'review');
  assert.equal(grade('particle-station','に'),'match');
  assert.equal(grade('particle-station','へ'),'alternate');
  assert.equal(grade('particle-station','で'),'mismatch');
  assert.equal(grade('particle-existence','　'),'empty');
  assert.equal(grade('pattern-photo','とって'),'match');
  assert.equal(grade('order-run','明日公園で一緒に走ります'),'match');
  assert.equal(grade('order-run','明日一緒に公園で走ります'),'alternate');
  assert.equal(grade('order-run','公園で一緒に走ります明日'),'mismatch');
});

test('word drills reuse inflection rules for verified verbs, adjectives and exceptions', async () => {
  const {buildWordDrills,gradeBuilderAnswer} = await builder;
  const cases = [
    [{jp:'行く',kana:'いく',group:'I'},'te','行って','いって'],
    [{jp:'泳ぐ',kana:'およぐ',group:'I'},'te','泳いで','およいで'],
    [{jp:'来る',kana:'くる',group:'III'},'past','来た','きた'],
    [{jp:'切る',kana:'きる',group:'I'},'te','切って','きって'],
    [{jp:'着る',kana:'きる',group:'II'},'te','着て','きて'],
    [{jp:'いい',kana:'いい',group:'i'},'adjNegPast','よくなかった','よくなかった'],
    [{jp:'便利',kana:'べんり',group:'na'},'adjNegFormal','便利ではありません','べんりではありません'],
  ];
  for (const [lemma,key,jp,kana] of cases) {
    const [drill] = buildWordDrills(lemma,key);
    assert.equal(drill.form,key);
    assert.equal(drill.answers[0],jp);
    assert.equal(drill.steps[0],lemma.jp);
    assert.equal(drill.steps.at(-1),jp);
    assert.equal(gradeBuilderAnswer(drill,kana),'match');
    assert(drill.rule);
  }
  assert.deepEqual(buildWordDrills({jp:'きる',kana:'きる'},'te'),[]);
  assert.deepEqual(buildWordDrills({jp:'無',group:'II'},'te'),[]);
});
