const assert = require('node:assert/strict');
const {test} = require('node:test');
const moduleURL = '../../assets/search/result-ui.js';

test('sentence reading prefers a matched reference and a complete local reading over conflicting Gemini', async () => {
  const {sentenceReading}=await import(moduleURL);
  const text='図書館へ行きます。';
  const analysis={coverage:1,japanese:text,readings:'としょかんへいきます。',romaji:'toshokan e ikimasu',
    parts:[{kind:'word',kana:'としょかん'}],referenceReading:{kana:'としょかんへいきます。'}};
  const ai={source:'ai',japaneseText:text,kanaReading:'としょかんにいきます。',romaji:'toshokan ni ikimasu'};
  const output=sentenceReading(text,analysis,ai);
  assert.deepEqual(output.readings.map(item=>item.source),['Câu đối chiếu','Phân tích ngoại tuyến']);
  assert.equal(output.differences.length,2);
  assert.equal(output.partial,false);
});

test('sentence reading replaces incomplete readings only with aligned, readable Gemini fields', async () => {
  const {sentenceReading}=await import(moduleURL);
  const text='天体物理学ではブラックホールを研究します。';
  const analysis={coverage:.7,japanese:text,readings:'[…]では[…]をけんきゅうします。',romaji:'[…] de wa',
    parts:[{kind:'unknown',text:'天体'}]};
  const ai={source:'ai',japaneseText:text,kanaReading:'てんたいぶつりがくではブラックホールをけんきゅうします。',
    romaji:'tentai butsurigaku de wa burakku hooru o kenkyuu shimasu'};
  const output=sentenceReading(text,analysis,ai);
  assert.deepEqual(output.readings.map(item=>item.source),['Gemini','Gemini']);
  assert(output.differences.every(item=>item.partial));
  const unaligned=sentenceReading(text,analysis,{...ai,japaneseText:'研究します。'});
  assert.equal(unaligned.text,text);
  assert.deepEqual(unaligned.readings,[]);
  assert.equal(unaligned.unaligned,'研究します。');
  const ambiguous={...analysis,coverage:1,parts:[{kind:'word',kana:'はし',lemma:{kana:'はし'},
    form:{kana:'はしった'},alternatives:[{lemma:{kana:'はし'},form:{kana:'わたった'}}]}]};
  assert.deepEqual(sentenceReading(text,ambiguous).readings,[]);
});

test('reverse translation keeps the input and offers Japanese pronunciation only once', async () => {
  const {sentenceReading,sentenceHeader,readingLines}=await import(moduleURL);
  const result={source:'verified',direction:'vi-ja',japaneseText:'日本へ行きたいです。',
    kanaReading:'にほんへいきたいです。',romaji:'nihon e ikitai desu'};
  const output=sentenceReading('Tôi muốn đi Nhật Bản.',null,result);
  assert.equal(output.text,'Tôi muốn đi Nhật Bản.');
  assert.equal(output.japaneseText,result.japaneseText);
  assert(!sentenceHeader(output,{}, {reverse:true}).includes('nihon'));
  assert(readingLines(output).includes('nihon'));
});
