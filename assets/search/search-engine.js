import {SEARCH_TOPICS,SEARCH_LESSONS} from '../grammar/search-data.js';
import {EXTRA_WORDS} from './lexicon.js';
import {makeLemma, generateForms} from './morphology.js';
import {createSentenceAnalyzer} from './sentence-analyzer.js';
import {HAS_HAN, HAS_JAPANESE, IS_KANA, IS_ROMAN, fold, hiragana, japaneseKey, oneEdit, plain,
  romanize, romanAliases, romanKey, suggestKana, wordPieces} from './text.js';

const COURSES = new Map(SEARCH_LESSONS.map(item => [item.id,item]));
const LIMIT_PER_TYPE = 300;
const ORDER = ['vocab','kanji','grammar','lesson'];
const SEARCH_LIMIT = 320;
const ORDER_RANK = new Map(ORDER.map((type,index) => [type,index]));
const COMPARE_BY_TOPIC = new Map();
for (const {id,related} of SEARCH_TOPICS) {
  for (const topic of related || []) {
    if (!COMPARE_BY_TOPIC.has(topic)) COMPARE_BY_TOPIC.set(topic, []);
    COMPARE_BY_TOPIC.get(topic).push(id);
  }
}

// These describe a communicative goal, not a translation of the input.
const INTENT_RULES = [
  [/^(?:khong (?:can|nhat thiet)|mien la khong can)\b/, 'optional'],
  [/^khong duoc\b|^cam (?:lam|hut|uong|an|di|vao|do|dung|mang)\b/, 'prohibition'],
  [/^(?:xin dung|dung lam|yeu cau khong)\b/, 'negative-request'],
  [/^phai \S|^(?:bat buoc|co nghia vu|can phai)\b/, 'obligation'],
  [/^vua .+ vua .+|^(?:hai viec )?dong thoi\b/, 'simultaneous'],
  [/^(?:sau khi|lam xong roi moi)\b/, 'te-kara'],
  [/^(?:truoc khi)\b/, 'g10a_2'],
  [/^(?:xin phep|co duoc phep|duoc phep)\b/, 'permission'],
  [/^(?:cham nhat|han cuoi)\b/, 'compare:deadline'],
  [/^(?:da tung|hoi kinh nghiem)\b/, 'experience'],
  [/^muon (?:co|so huu)\b/, 'g7c_6'],
  [/^(?:muon lam|muon thu lam)\b/, 'desire'],
];

const MATCH = {exact:'exact', prefix:'prefix', partial:'partial', fuzzy:'fuzzy', inferred:'inferred'};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function indexEntry(entry, japanese, readings, vietnamese, roman = [], secondary = []) {
  const forms = unique(japanese.filter(value => HAS_JAPANESE.test(value)).map(japaneseKey));
  const sound = unique(readings.map(hiragana).filter(value => IS_KANA.test(value)));
  const pronunciation = unique([...sound.map(romanize), ...roman].flatMap(romanAliases));
  const meanings = unique(vietnamese.map(fold));
  const words = new Set(meanings.flatMap(value => value.split(/[^a-z0-9]+/g).filter(Boolean)));
  const context = unique(secondary.map(value => HAS_JAPANESE.test(value) ? japaneseKey(value) : fold(value)));
  return {entry, forms:unique([...forms, ...sound]), pronunciation, meanings, words, context,
    primaryWritten:entry.type === 'vocab' ? japaneseKey(entry.title) : '',
    primaryReading:entry.type === 'vocab' ? japaneseKey(entry.reading) : '', primaryRoman:romanKey(entry.romaji),
    priority:entry.card ? 3 : entry.sourceId ? 2 : entry.source ? 0 : 1,
    proper:/^Tên riêng/i.test(entry.pos || ''),
    fuzzy:!/(?:Tên riêng|Ký tự|Romanization)/i.test(entry.pos || '')};
}

function vocabularyProfile(item) {
  const lemma = makeLemma(item);
  const forms = generateForms(lemma);
  const profile = indexEntry({
    type:'vocab', id:item.id, title:lemma.jp, reading:lemma.kana, romaji:lemma.romaji, description:lemma.vi,
    pos:lemma.pos, location:item.lesson || '', source:item.source || '', card:lemma.card, group:lemma.group,
    sourceId:item.sourceId, aliases:item.aliases, readings:item.readings, examples:item.examples,
    original:plain(item.kanji || item.jp || item.kana), builtin:Boolean(item.builtin),
  }, [lemma.jp, ...wordPieces(plain(item.kanji || item.jp)), ...(item.aliases || [])],
  [lemma.kana, ...wordPieces(item.kana), ...(item.readings || [])],
  [item.vi], [item.roman, ...(item.romans || [])]);
  return {profile, lemma, forms};
}

function packProfile(item, index) {
  const reading = hiragana(item.kana);
  return indexEntry({
    type:'vocab', id:'pack:' + index, title:item.jp, reading, romaji:IS_KANA.test(reading) ? romanize(reading) : '',
    description:item.vi, pos:item.pos, source:item.source, card:false, builtin:Boolean(item.builtin),
    aliases:item.aliases, readings:item.readings,
  }, [item.jp, ...(item.aliases || [])], item.readings || [reading], [item.vi], [item.roman, ...(item.romans || [])]);
}

function grammarProfile(item, guide = false) {
  const title = plain(item.title || item.formula);
  const titleReading = plain(item.title || item.formula, true);
  const formula = plain(item.formula);
  const formulaReading = plain(item.formula, true);
  const lesson = COURSES.get(item.id);
  const aliases = item.aliases || lesson?.aliases || [];
  const headings = [title, formula].flatMap(value => value.split(/[／/]/).map(part => part.trim()));
  const japanese = [...headings, lesson?.formula || '', ...aliases.filter(value => HAS_JAPANESE.test(value))];
  const kana = [titleReading, formulaReading, ...japanese].map(japaneseKey).filter(value => IS_KANA.test(value));
  const vietnamese = [item.meaning, lesson?.meaning, lesson?.title, item.brief, ...aliases.filter(value => !HAS_JAPANESE.test(value))];
  const roman = aliases.filter(value => IS_ROMAN.test(value));
  const examples = guide || item.id.startsWith('compare:') ? [] : (item.examples || []).flatMap(example => {
    const jp = plain(example.jp || example.audio);
    const reading = plain(example.jp || example.audio, true);
    return [jp, reading, IS_KANA.test(japaneseKey(reading)) ? romanKey(romanize(reading)) : '', plain(example.vi)];
  });
  return indexEntry({type:'grammar', id:item.id, title:lesson?.title || title, reading:'',
    description:plain(lesson?.meaning || item.meaning || item.brief),
    location:item.lesson || '', guide}, japanese, kana, vietnamese, roman, examples);
}

function kanjiProfile(item) {
  const compounds = item.compounds || [];
  const readings = unique([item.onyomi, item.kunyomi].flatMap(value => String(value || '').split(/[、,\s/]+/))
    .map(value => value.replace(/[.・-]/g, '')).filter(Boolean));
  return indexEntry({type:'kanji', id:item.id, title:item.kanji, reading:readings.join(' · '),
    description:[item.hanviet, item.meaning].filter(Boolean).join(' · '), location:item.group || ''},
  [item.kanji], readings, [item.hanviet, item.meaning], [],
  compounds.flatMap(compound => [compound.jp, compound.kana, romanKey(romanize(compound.kana)), compound.vi]));
}

function scoreKeys(keys, query, exact, prefix, substring) {
  let score = 0;
  for (const key of keys) {
    if (key === query) return exact;
    if (key.startsWith(query)) score = prefix;
    else if (!score && query.length >= 2 && key.includes(query)) score = substring;
  }
  return score;
}

function rank(profile, query) {
  const {entry, forms, pronunciation, meanings, words, context} = profile;
  if (query.jp) {
    const direct = scoreKeys(forms, query.jp, 230, 190, query.jp.length >= 2 ? 120 : 0);
    if (direct) {
      if (direct === 230 && profile.primaryWritten === query.jp) return 245;
      return direct + (direct >= 190 && profile.primaryReading.startsWith(query.jp) ? 10 : 0);
    }
    if (query.jp.length >= 2 && context.some(value => value.includes(query.jp))) return 53;
    return 0;
  }
  let score = query.roman ? scoreKeys(pronunciation, query.roman, 225, 185, query.roman.length >= 3 ? 108 : 0) : 0;
  if (score >= 185 && profile.primaryRoman.startsWith(query.roman)) score += 10;
  if (query.latin.length >= 3 || !query.roman || entry.type === 'lesson') {
    const translationScore = scoreKeys(meanings, query.latin, 223, 166, 133);
    score = Math.max(score, translationScore, words.has(query.latin) ? 145 : 0);
  }
  if (!score && query.latin.length >= 4 && context.some(value => value.includes(query.latin))) score = 50;
  return score;
}

function typoScore(profile, query) {
  const hasSingleWord = !/\s/.test(query.latin);
  if (query.roman?.length >= 4 && query.roman.length <= 20 && profile.pronunciation.some(key => oneEdit(query.roman, key))) return 69;
  if (query.jp?.length >= 3 && query.jp.length <= 12 && profile.forms.some(key => oneEdit(query.jp, key))) return 64;
  if (!query.jp && hasSingleWord && query.latin.length >= 4 && query.latin.length <= 20 &&
      [...profile.words].some(key => oneEdit(query.latin, key))) return 60;
  return 0;
}

function projectResults(model, limit) {
  if (!Number.isFinite(limit) || limit >= LIMIT_PER_TYPE) return model;
  const counts = {};
  const cap = Math.max(1,Math.floor(limit));
  return {...model,results:model.results.filter(({type}) => {
    counts[type] = (counts[type] || 0) + 1;
    return counts[type] <= cap;
  })};
}

export async function createSearchEngine(data, yieldWork) {
  const analyzer = createSentenceAnalyzer(data.pack.flatMap(row => row.sourceId ? row.examples || [] : []));
  const exactExamples = new Map();
  for (const {id,examples} of [...SEARCH_TOPICS,...SEARCH_LESSONS]) {
    for (const [jp,kana,vi] of examples) {
      for (const key of [japaneseKey(jp),japaneseKey(kana),...romanAliases(romanize(kana)),fold(vi)]) {
        if (!exactExamples.has(key)) exactExamples.set(key,new Set());
        exactExamples.get(key).add(id);
      }
    }
  }
  const profiles = [];
  const lessons = new Map();
  const knownWords = new Set();
  const checkerRefs = [];
  let lastLookup;

  function addRecognizedWord(ref, weight, spellings, pronunciation) {
    analyzer.addWord(ref,weight,spellings,pronunciation);
    if (ref.lemma.group && (ref.lemma.card || ref.lemma.sourceId)) checkerRefs.push(ref);
  }

  function addWord(item, weight) {
    const ref = vocabularyProfile(item);
    profiles.push(ref.profile);
    knownWords.add(ref.lemma.jp + '\0' + ref.lemma.kana);
    const spellings = wordPieces(plain(item.kanji || item.jp));
    const readings = wordPieces(plain(item.kana,true));
    if (!item.sourceId && spellings.length > 1 && spellings.length === readings.length) {
      // Some curriculum rows list two synonymous words with different
      // readings. A search may use either, but furigana belongs to each pair.
      spellings.forEach((jp,index) => {
        const lemma = index === 0 ? ref.lemma : makeLemma({...item,kanji:jp,kana:readings[index]});
        addRecognizedWord({lemma,forms:index === 0 ? ref.forms : generateForms(lemma)},weight,[jp]);
        knownWords.add(lemma.jp + '\0' + lemma.kana);
      });
    } else {
      const {lemma,forms} = ref;
      addRecognizedWord({lemma,forms},weight,ref.profile.forms,ref.profile.pronunciation);
    }
    return ref.lemma;
  }
  for (const [index, item] of data.vocab.entries()) {
    if (yieldWork && index % 24 === 0) await yieldWork();
    const lemma = addWord(item, item._n5Supplement ? 4.5 : 6);
    if (/^Bài /.test(lemma.lesson || '')) {
      if (!lessons.has(lemma.lesson)) lessons.set(lemma.lesson, {vocab:0, grammar:0});
      lessons.get(lemma.lesson).vocab++;
    }
  }
  for (const [index, item] of data.kanji.entries()) {
    if (yieldWork && index % 40 === 0) await yieldWork();
    profiles.push(kanjiProfile(item));
  }
  for (const item of data.grammar) {
    profiles.push(grammarProfile(item));
    if (!lessons.has(item.lesson)) lessons.set(item.lesson, {vocab:0, grammar:0});
    lessons.get(item.lesson).grammar++;
  }
  for (const guide of SEARCH_TOPICS) {
    profiles.push(grammarProfile(guide,!guide.id.startsWith('compare:')));
  }
  for (const [title, counts] of lessons) {
    const description = [counts.vocab && counts.vocab + ' từ vựng', counts.grammar && counts.grammar + ' mẫu ngữ pháp'].filter(Boolean).join(' · ');
    profiles.push(indexEntry({type:'lesson', id:title, title, description}, [], [], [title]));
  }
  for (const [index, [jp,kana,vi,pos]] of EXTRA_WORDS.entries()) {
    if (!knownWords.has(jp + '\0' + kana)) addWord({id:'extra:' + index, jp, kana, vi, pos, card:false}, 5);
  }
  for (const [index, item] of data.pack.entries()) {
    if (yieldWork && index % 200 === 0) await yieldWork();
    if (item.sourceId) {
      addWord(item, 4.8);
      continue;
    }
    const profile = packProfile(item,index);
    profiles.push(profile);
    const {id,title:jp,reading:kana,romaji,description:vi,pos,source} = profile.entry;
    if (!knownWords.has(jp + '\0' + kana)) {
      // Imported entries participate in segmentation without guessed inflections.
      analyzer.addWord({lemma:{id,jp,kana,romaji,vi,pos,source,card:false,aliases:item.aliases,readings:item.readings}, forms:new Map()},
        3, profile.forms, profile.pronunciation);
    }
  }
  analyzer.finish();

  async function search(value, {signal,limit} = {}) {
    if (signal?.aborted) return null;
    const text = String(value ?? '').trim().slice(0, SEARCH_LIMIT);
    if (lastLookup?.text === text) return projectResults(lastLookup.model,limit);
    const normalized = text.normalize('NFKC');
    if (!text) return {results:[], counts:{}, analysis:null};
    const query = {jp:HAS_JAPANESE.test(text) ? japaneseKey(text) : '', latin:fold(text),
      roman:IS_ROMAN.test(normalized) ? romanKey(normalized) : ''};
    if (!query.jp && !/[a-z0-9]/.test(query.latin)) return {results:[], counts:{}, analysis:null};
    const intent = !query.jp && INTENT_RULES.find(([pattern]) => pattern.test(query.latin))?.[1];
    const analysis = intent ? null : analyzer.analyze(text);
    const exactLessons = exactExamples.get(query.jp || query.roman);
    const vietnameseExamples = exactExamples.get(query.latin);
    const lexicalBoosts = new Map();
    const grammarBoosts = new Set(analysis?.grammar || []);
    const comparisons = new Set([...grammarBoosts].flatMap(id => COMPARE_BY_TOPIC.get(id) || []));
    const kanjiBoosts = new Set();
    const courseBoosts = new Map();
    const tokens = (analysis?.parts || []).filter(part => part.kind !== 'punct');
    for (const part of tokens) {
      if (!part.lemma) continue;
      const partialRomaji = query.roman && analysis.coverage < 1;
      const score = tokens.length === 1 ? 276 : partialRomaji ? 52 : part.form ? 213 : 157;
      lexicalBoosts.set(part.lemma.id, score);
      if (part.lemma.lesson) courseBoosts.set(part.lemma.lesson, (courseBoosts.get(part.lemma.lesson) || 0) + 1);
      for (const char of part.lemma.jp) if (HAS_HAN.test(char)) kanjiBoosts.add(char);
      for (const option of part.alternatives || []) {
        if (!lexicalBoosts.has(option.lemma.id)) lexicalBoosts.set(option.lemma.id, score - 17);
      }
    }

    const found = [];
    const fuzzy = [];
    let strong = false;
    const mayCorrect = query.jp.length >= 3 && query.jp.length <= 12 ||
      !query.jp && (query.roman.length >= 4 && query.roman.length <= 20 ||
        !/\s/.test(query.latin) && query.latin.length >= 4 && query.latin.length <= 20);
    for (const [index, profile] of profiles.entries()) {
      if (yieldWork && index % 512 === 0) {
        await yieldWork();
        if (signal?.aborted) return null;
      }
      const {entry} = profile;
      let score = rank(profile, query);
      let match = score >= 220 ? MATCH.exact : score >= 165 ? MATCH.prefix : MATCH.partial;
      let inferred = 0;
      if (entry.type === 'vocab') inferred = lexicalBoosts.get(entry.id) || 0;
      if (entry.type === 'grammar') {
        if (intent === entry.id) inferred = 300;
        else if (grammarBoosts.has(entry.id)) inferred = 270;
        else if (comparisons.has(entry.id)) inferred = 155;
        if (exactLessons?.has(entry.id) || vietnameseExamples?.has(entry.id)) {
          score = Math.max(score,295);
          match = MATCH.exact;
        }
        if (entry.guide && (query.jp && profile.forms.includes(query.jp) ||
            query.roman && profile.pronunciation.includes(query.roman) || profile.meanings.includes(query.latin))) {
          score = Math.max(score,285);
          match = MATCH.exact;
        }
      }
      if (entry.type === 'kanji' && kanjiBoosts.has(entry.title)) inferred = 109;
      if (entry.type === 'lesson' && courseBoosts.has(entry.id)) inferred = 110 + Math.min(8, courseBoosts.get(entry.id));
      if (inferred > score) {
        score = inferred;
        if (match !== MATCH.exact) match = MATCH.inferred;
      }
      // A name remains an exact match when deliberately looked up. In
      // prefix or mixed results keep study vocabulary above proper names.
      if (score && profile.proper) {
        const explicit = profile.primaryWritten === query.jp ||
          match === MATCH.exact && (query.jp.length >= 3 || query.roman.length >= 3);
        score = Math.max(1,score - (explicit ? 22 : 112));
      }
      if (score >= 180) strong = true;
      if (score > 0) found.push({entry, score, match, priority:profile.priority, gloss:profile.meanings[0] || ''});
      else if (mayCorrect && !strong && profile.fuzzy && entry.type !== 'lesson') fuzzy.push(profile);
    }
    if (!strong) {
      for (const [index, profile] of fuzzy.entries()) {
        if (yieldWork && index % 512 === 0) {
          await yieldWork();
          if (signal?.aborted) return null;
        }
        const score = typoScore(profile, query);
        if (score) found.push({entry:profile.entry, score, match:MATCH.fuzzy,
          priority:profile.priority, gloss:profile.meanings[0] || ''});
      }
    }

    found.sort((a, b) => b.score - a.score || b.priority - a.priority ||
      ORDER_RANK.get(a.entry.type) - ORDER_RANK.get(b.entry.type) || a.entry.title.length - b.entry.title.length);
    const counts = {vocab:0, kanji:0, grammar:0, lesson:0};
    const seen = new Set();
    const results = [];
    const termKey = entry => entry.title.replace(/[。．!?！？]+$/g,'') + '\0' + entry.reading;
    const definedWords = new Set(found.filter(({entry,gloss}) => entry.type === 'vocab' && gloss)
      .map(({entry}) => termKey(entry)));
    for (const {entry, match, gloss} of found) {
      const spelling = termKey(entry);
      if (entry.builtin && !gloss && definedWords.has(spelling)) continue;
      const key = [entry.type,spelling,gloss.replace(/[.!?。]+$/g,'')].join('\0');
      if (seen.has(key)) continue;
      seen.add(key);
      counts[entry.type]++;
      if (counts[entry.type] <= LIMIT_PER_TYPE) results.push({...entry, match, approximate:match === MATCH.fuzzy});
    }
    const kanaSuggestion = !analysis && !intent && query.roman.length >= 3 ? suggestKana(query.roman) : '';
    const model = {results, counts, analysis, kanaSuggestion};
    lastLookup = {text,model};
    return projectResults(model,limit);
  }

  async function check(value, {signal} = {}) {
    if (signal?.aborted) return null;
    const {checkJapanese} = await import('../learning/grammar-checker.js');
    return signal?.aborted ? null : checkJapanese(value,{analyze:analyzer.analyze,refs:checkerRefs});
  }

  return {search,check};
}
