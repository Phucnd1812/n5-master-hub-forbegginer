import {catalogRows} from './lexicon.js';
import {bucket,queryKeys,wordMatch} from './catalog-keys.js';

const ROOT = new URL('../dictionary/v1/',import.meta.url);
const HOT_CACHE_SIZE = 32;

export function createDictionaryCatalog(fetcher = fetch) {
  const active = new Map();
  let core, index;

  function read(path) {
    const pending = active.get(path);
    if (pending) {
      active.delete(path);
      active.set(path,pending);
      return pending;
    }
    const request = Promise.resolve().then(() => fetcher(new URL(path,ROOT))).then(response => {
      if (!response.ok) throw Error('Không tải được gói từ điển');
      return response.json();
    }).catch(error => {
      if (active.get(path) === request) active.delete(path);
      throw error;
    });
    active.set(path,request);
    if (active.size>HOT_CACHE_SIZE) active.delete(active.keys().next().value);
    return request;
  }

  const optional = path => read(path).catch(() => null);
  const manifest = () => index ??= read('index.json').catch(() => { index = undefined; return null; });

  function decodeKanji(row, version) {
    const [kanji,on,kun,strokes,radical,jlpt,referenceMeanings,[meaning='',hanviet='',links=[]]=[]] = row;
    return {id:'kanjidic:'+kanji.codePointAt(0).toString(16),kanji,strokes,
      radical:radical>=1 && radical<=214 ? String.fromCodePoint(0x2eff+radical).normalize('NFKC') : '',
      radicalNumber:radical,onyomi:on.join('、'),kunyomi:kun.join('、'),referenceJLPT:jlpt || null,
      meaning,hanviet,referenceMeanings,links,edition:version,source:'KANJIDIC2 / EDRDG'};
  }

  const loadCore = () => core ??= Promise.all([optional('vocab-n5.json'),optional('kanji-core.json'),manifest()])
    .then(([words,kanji,reference]) => {
      if (!words || !kanji || !reference) core = undefined;
      return {words:catalogRows(words || []), kanji:(kanji || []).map(row => decodeKanji(row,reference?.kanjidicVersion))};
    });

  async function kanji(character) {
    const built = (await loadCore()).kanji.find(item=>item.kanji===character);
    if (built || !character) return built;
    const reference = await manifest();
    const key = bucket(character);
    if (!reference?.kanji.includes(key)) return null;
    const row = (await optional('kanji/'+key+'.json'))?.find(item=>item[0]===character);
    return row ? decodeKanji(row,reference.kanjidicVersion) : null;
  }

  async function strokes(character) {
    if (!character || [...character].length!==1) return null;
    const reference = await manifest();
    const key = bucket(character);
    if (!reference?.strokes.includes(key)) return null;
    const row = (await optional('strokes/'+key+'.json'))?.find(item=>item[0]===character);
    return row?.[1] || null;
  }

  async function lookup(text,analysis) {
    const query = queryKeys(text);
    const longSentence = query.runs.join('').length>7 || /[。！？]/u.test(text);
    // For a sentence the original index already knows the ordinary tokens.
    // Fetch only around gaps, while direct dictionary lookups search every matching shard.
    const unknown = longSentence && analysis?.parts
      .filter(part=>part.kind==='unknown').map(part=>part.text).join(' ');
    const keys = longSentence && analysis ? queryKeys(unknown || '').keys : query.keys;
    if (!keys.size && !query.singleKanji) return {words:[],kanji:[]};
    const reference = await manifest();
    if (!reference) return {words:[],kanji:[]};
    const requests = [...keys].filter(key=>reference.words.includes(key)).slice(0,12);
    const [shards,profile] = await Promise.all([
      Promise.all(requests.map(key=>optional('words/'+key+'.json'))),
      query.singleKanji ? kanji(query.singleKanji) : null,
    ]);
    const seen = new Set();
    const matched = [];
    for (const shard of shards) for (const row of shard || []) {
      const identity = [row[0], row[1], row[2]].join('\0');
      if (seen.has(identity)) continue;
      seen.add(identity);
      const match = wordMatch(row,query);
      if (match) matched.push([row,match==='analyze']);
    }
    return {words:catalogRows(matched.map(([row])=>row)).map((row,index)=>({...row, analyze:matched[index][1]})),
      kanji: profile ? [profile] : []};
  }

  return {loadCore,lookup,kanji,strokes};
}

let browserCatalog;
export function getDictionaryCatalog() {
  return browserCatalog ??= createDictionaryCatalog();
}
