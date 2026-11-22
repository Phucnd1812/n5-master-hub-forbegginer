import {FUNCTION_WORDS, CURATED_SENTENCES} from './lexicon.js';
import {SEARCH_TOPICS,SEARCH_LESSONS} from '../grammar/search-data.js';
import {describeForm,formRomaji} from './morphology.js';
import {collectPhrases} from './syntax.js';
import {HAS_HAN, HAS_JAPANESE, IS_ROMAN, hiragana, japaneseKey, romanize, romanAliases, romanKey} from './text.js';

const SEPARATOR = /([\s、。，．,.！？!?「」『』（）();；:：…]+)/u;
const JAPANESE_LIMIT = 240;
const KATAKANA_RUN = /[ァ-ヺー]+/g;
const HAS_KATAKANA = /[ァ-ヺ]/;
const PREVIEW_ALTERNATIVES = 4;
const ALTERNATIVE_CAP = 10;
const CASE_MARKERS = new Set(['は','が','を','に','へ','で','と','の','も','までに']);
const PERSONAL_CONTEXT = /^(?:Danh từ|Đại từ|Phó từ|Số|Từ \/ cụm từ)/i;
const PARTICLE_NOTES = {
  は:'Nêu chủ đề của vế. Đọc wa.',
  が:'Gắn thành phần đứng trước với vị ngữ. Có thể là chủ thể hoặc đối tượng của một số vị ngữ.',
  を:'Đánh dấu đối tượng của hành động. Đọc o.',
  に:'Nêu một điểm liên quan đến hành động: đích, thời gian, vị trí hoặc đối tượng.',
  へ:'Chỉ hướng chuyển động. Đọc e.',
  で:'Nêu nơi thực hiện, phương tiện hoặc bối cảnh.',
  と:'Có thể là “cùng với”, từ nối danh từ hoặc dấu trích dẫn. Xem vị ngữ để xác định.',
  の:'Nối với danh từ đứng sau để bổ nghĩa.',
  も:'Thêm ý “cũng” hoặc “cả”, tùy vị ngữ.',
};

function grammarForPart(part, parts, index) {
  const prior = parts[index - 1];
  const predicate = parts.slice(index + 1).find(token => token.kind === 'unknown' ||
    token.kind === 'punct' && /[、,。.!?！？]/.test(token.text) ||
    token.ref?.lemma.group && !['attributive','adverb'].includes(token.form?.key));
  const lemma = predicate?.ref?.lemma.jp || '';
  if (part.jp === 'を' && /^(?:歩く|通る|渡る|出る|降りる|跨ぐ)$/.test(lemma)) {
    return 'Có thể đánh dấu nơi đi qua hoặc rời khỏi với ' + lemma + '. Đọc o.';
  }
  if (part.jp === 'が' && prior?.form) return 'Có thể nối hai vế với ý đối chiếu.';
  if (part.jp === 'が' && (/^(?:好き|嫌い|できる|苦手|得意)$/.test(lemma) ||
      predicate?.form?.grammar === 'potential' && !predicate.candidates.some(candidate => candidate.form?.grammar === 'passive'))) {
    return 'Có thể đánh dấu đối tượng của sở thích hoặc khả năng.';
  }
  if (part.jp === 'に') {
    if (/(?:時|分|月|日)$/.test(prior?.jp || '')) return 'Có thể đánh dấu mốc thời gian đứng trước.';
    if (/(?:行く|来る|帰る|着く)$/.test(lemma)) return 'Đánh dấu đích của ' + lemma + '.';
    if (/^(?:ある|いる|有る|居る)$/.test(lemma)) return 'Có thể đánh dấu vị trí tồn tại.';
  }
  if (part.jp === 'で') {
    if (/^(?:電車|バス|車|自転車|飛行機|タクシー|船|地下鉄)$/.test(prior?.jp || '')) return 'Chỉ phương tiện được dùng để thực hiện hành động.';
    if (/^(?:学校|店|図書館|駅|家|教室|公園|ここ|そこ|あそこ)$/.test(prior?.jp || '')) return 'Chỉ nơi hành động diễn ra.';
    if (/^(?:前|後ろ|近く|隣|中|外)$/.test(prior?.jp || '') && parts[index - 2]?.jp === 'の') {
      return 'Có thể chỉ nơi hành động diễn ra, xác định bằng danh từ trước の.';
    }
  }
  if (part.jp === 'と') {
    if (/^(?:言う|思う|書く)$/.test(lemma)) return 'Có thể đánh dấu nội dung được nói, nghĩ hoặc viết.';
    if (/(?:人|友達|家族|母|父|先生|兄|姉|弟|妹|彼|私)$/.test(prior?.jp || '') &&
        /(?:行く|来る|帰る|見る|食べる|遊ぶ|出かける)$/.test(lemma)) return 'Chỉ người cùng thực hiện hành động.';
  }
  if (part.jp === 'から' && prior?.form?.key === 'te') return 'Nối sau thể て để đặt mốc trước hành động tiếp theo.';
  if (part.jp === 'から' && prior?.ref?.lemma.group) return 'Có thể nối lý do với kết quả trong vế sau.';
  if (part.jp === 'までに') return 'Đặt hạn hoàn tất hoặc thời điểm muộn nhất để hành động xảy ra.';
  return PARTICLE_NOTES[part.jp] || part.vi;
}

function tokenize(source, isRoman, lexicon, lengths, original) {
  const katakanaRuns = isRoman || source.length !== original.length ? [] :
    [...original.matchAll(KATAKANA_RUN)].map(match => [match.index, match.index + match[0].length]);
  const romanOnlyReading = katakanaRuns.some(([start,end]) => start === 0 && end === source.length);
  const best = Array(source.length + 1).fill(null);
  best[0] = {cost:0};
  function consider(from, to, part, cost, key, candidates) {
    const total = best[from].cost + cost;
    if (!best[to] || total < best[to].cost) best[to] = {cost:total, from, part, key, candidates};
  }
  for (let i = 0; i < source.length; i++) {
    if (!best[i]) continue;
    const run = katakanaRuns.find(([start,end]) => start <= i && i < end);
    for (const length of lengths) {
      const end = i + length;
      if (end > source.length) break;
      const key = source.slice(i, end);
      const matches = lexicon.get(key);
      if (!matches) continue;
      for (let rank = 0; rank < matches.length && rank < PREVIEW_ALTERNATIVES; rank++) {
        const token = matches[rank];
        if (run && (token.kind === 'function' || !HAS_KATAKANA.test(token.jp) &&
            !(romanOnlyReading && i === 0 && end === run[1]))) continue;
        const previous = best[i].part;
        const anchoredMarker = CASE_MARKERS.has(token.jp) && previous?.kind === 'word' &&
          !previous.form && PERSONAL_CONTEXT.test(previous.pos);
        const contextualGreeting = !isRoman && end < source.length && /^(?:今日は|今晩は)$/.test(key) && token.jp === key;
        const cost = token.kind === 'function'
          ? (anchoredMarker ? .25 : i > 0 ? .79 : 2.25)
          : Math.max(.30, 1.80 - token.weight / 5) - Math.min(10, length) * 0.025 -
            (!isRoman && token.written === key && HAS_HAN.test(key) ? .18 : 0) +
            (token.form?.key.endsWith('Te') && token.form.key !== 'negativeTe' ? .30 : 0) +
            (contextualGreeting ? 1.25 : 0);
        consider(i, end, token, cost, key, matches);
      }
    }
    const width = run ? run[1] - i : source.codePointAt(i) > 0xffff ? 2 : 1;
    consider(i, i + width, {kind:'unknown'}, (isRoman ? 3.2 : 5) * width, source.slice(i, i + width), []);
  }
  const segments = [];
  for (let end = source.length; end > 0;) {
    const hit = best[end];
    segments.push({...hit.part, text:hit.key, candidates:hit.candidates});
    end = hit.from;
  }
  return segments.reverse();
}

function phraseKey(value) {
  return hiragana(value).replace(/[\s、，,]/g, '').replace(/[。.]$/, '');
}

function inflectedSpellings(lemma, form) {
  if (!lemma.aliases?.length) return [];
  let prefix = 0;
  while (prefix < lemma.jp.length && lemma.jp[prefix] === form.jp[prefix]) prefix++;
  if (!prefix) return [];
  const tail = lemma.jp.slice(prefix);
  return lemma.aliases.filter(alias => alias.endsWith(tail)).map(alias =>
    alias.slice(0,alias.length - tail.length) + form.jp.slice(prefix));
}

export function createSentenceAnalyzer(wordExamples = []) {
  const japanese = new Map();
  const roman = new Map();
  const jpLengths = new Set();
  const romanLengths = new Set();
  const romanForms = new Map();
  const maximum = 64;
  let lengthsJP;
  let lengthsRoman;

  function put(map,lengths,key,token) {
    if (!key || key.length > maximum) return;
    const matches = map.get(key);
    if (!matches) { map.set(key,[token]); lengths.add(key.length); return; }
    if (matches.length === ALTERNATIVE_CAP && matches.at(-1).weight >= token.weight) return;
    let position = matches.length;
    for (let index = 0; index < matches.length; index++) {
      const current = matches[index];
      if (current.signature === token.signature) return;
      if (position === matches.length && current.weight < token.weight) position = index;
    }
    if (position === matches.length) matches.push(token);
    else matches.splice(position,0,token);
    if (matches.length > ALTERNATIVE_CAP) matches.pop();
  }

  function add(token,spellings,readings) {
    token.written = japaneseKey(token.jp);
    put(japanese,jpLengths,token.written,token);
    const reading = japaneseKey(token.kana);
    if (reading !== token.written) put(japanese,jpLengths,reading,token);
    for (const spelling of spellings) {
      const key = japaneseKey(spelling);
      if (key !== token.written && key !== reading) put(japanese,jpLengths,key,token);
    }
    for (const spelling of readings) put(roman,romanLengths,spelling,token);
  }

  for (const [jp, spelling, grammar, vi, aliases] of FUNCTION_WORDS) {
    add({kind:'function',jp,kana:jp,romaji:spelling,grammar,vi,weight:3,signature:'function:' + jp},
      [],[...romanAliases(spelling),...(aliases || [])]);
  }

  const curatedJP = new Map();
  const curatedKana = new Map();
  const curatedRoman = new Map();
  function addReading(readings, key, example) {
    if (!readings.has(key)) readings.set(key,example);
    else if (phraseKey(readings.get(key)?.jp) !== phraseKey(example.jp)) readings.set(key,null);
  }
  for (const [jp, kana, vi] of [...CURATED_SENTENCES, ...[...SEARCH_TOPICS,...SEARCH_LESSONS].flatMap(guide => guide.examples),...wordExamples]) {
    const key = phraseKey(jp);
    const example = {jp,kana,vi};
    if (!curatedJP.has(key)) curatedJP.set(key,example);
    addReading(curatedKana,phraseKey(kana),example);
    for (const spelling of romanAliases(romanize(kana))) addReading(curatedRoman,spelling,example);
  }

  function addWord(ref,weight,spellings = [],extraRoman = []) {
    const {lemma} = ref;
    if (!lemma.jp || lemma.jp.length > 36 || /Tên riêng|Romanization|Ký tự|Phụ tố|Tiền tố|Hậu tố/i.test(lemma.pos)) return;
    const signature = lemma.jp + ':' + lemma.kana;
    const token = {kind:'word',jp:lemma.jp,kana:lemma.kana,romaji:lemma.romaji,id:lemma.id,pos:lemma.pos,vi:lemma.vi,
      signature,ref,weight};
    const readings = extraRoman.length ? extraRoman : romanAliases(lemma.romaji);
    add(token,spellings,readings);
    for (const form of ref.forms.values()) {
      if (form.key === 'dictionary' || form.key === 'stem') continue;
      const hasParticle = /^(?:prohibition|dutyNakute)/.test(form.key);
      // Homophones and alternate analyses share pronunciation keys during build.
      const readingKey = hasParticle ? form.kana + '!' : form.kana;
      let pronunciation = romanForms.get(readingKey);
      if (!pronunciation) {
        const romaji = formRomaji(form);
        const keys = romanAliases(romaji);
        if (hasParticle) for (const alternate of romanAliases(romanize(form.kana))) {
          if (!keys.includes(alternate)) keys.push(alternate);
        }
        pronunciation = {romaji,keys};
        romanForms.set(readingKey,pronunciation);
      }
      add({kind:'word',jp:form.jp,kana:form.kana,romaji:pronunciation.romaji,
        id:lemma.id,pos:lemma.pos,vi:lemma.vi,signature:signature + ':' + form.key,ref,weight:weight + .35,
        form,grammar:form.grammar},
      inflectedSpellings(lemma,form),pronunciation.keys);
    }
  }

  function analyze(value) {
    const original = String(value ?? '').trim();
    if (!original) return null;
    const source = original.normalize('NFKC');
    const isJapanese = HAS_JAPANESE.test(source);
    const isRoman = !isJapanese && IS_ROMAN.test(source);
    if (!isJapanese && !isRoman || isRoman && romanKey(original).length < 3) return null;
    if (original.length > JAPANESE_LIMIT) {
      return isJapanese ? {original, parts:[], grammar:[], readings:'', romaji:'', translation:'',
        notes:['Hãy chia văn bản thành từng câu tối đa ' + JAPANESE_LIMIT + ' ký tự để phân tích.']} : null;
    }
    lengthsJP ??= [...jpLengths].sort((a,b) => a - b);
    lengthsRoman ??= [...romanLengths].sort((a,b) => a - b);
    const parts = [];
    let unknownUnits = 0;
    let totalUnits = 0;
    // Romaji spaces are optional. Japanese punctuation and Romaji punctuation
    // are real boundaries and cannot be crossed by a dictionary match.
    for (const chunk of (isRoman ? source.replace(/\s+/g, '') : source).split(SEPARATOR).filter(Boolean)) {
      if (SEPARATOR.test(chunk)) {
        parts.push({text:chunk, kind:'punct'});
        continue;
      }
      const normalized = isRoman ? romanKey(chunk) : hiragana(chunk);
      if (!normalized) continue;
      const tokens = tokenize(normalized, isRoman, isRoman ? roman : japanese, isRoman ? lengthsRoman : lengthsJP, chunk);
      let offset = 0;
      for (const token of tokens) {
        const text = isRoman || normalized.length !== chunk.length ? token.text : chunk.slice(offset, offset + token.text.length);
        offset += token.text.length;
        totalUnits += token.text.length;
        const previous = parts.at(-1);
        const uncertainSuffix = !isRoman && previous?.kind === 'unknown' && HAS_HAN.test(previous.text) &&
          token.kind === 'word' && token.text !== token.written && !HAS_HAN.test(token.text);
        if (token.kind === 'unknown' || uncertainSuffix) {
          unknownUnits += token.text.length;
          if (previous?.kind === 'unknown') previous.text += text;
          else parts.push({kind:'unknown',text});
          continue;
        }
        parts.push({...token, text});
      }
    }
    const coverage = totalUnits ? 1 - unknownUnits / totalUnits : 0;
    const wordCount = parts.filter(part => part.kind === 'word').length;
    if (isRoman) {
      const terms = parts.filter(part => part.kind !== 'punct');
      const wholeWord = terms.length === 1 && wordCount === 1;
      const predicate = parts.some(part => part.form && part.text.length >= 4 ||
        part.kind === 'function' && /^(?:です|でした|だ|じゃない)$/.test(part.jp));
      const nounPhrase = wordCount > 1 && (/\s/.test(source) || parts.some(part => part.jp === 'の'));
      if (coverage < .65 || !wordCount || !wholeWord && !predicate && !nounPhrase) return null;
    }

    const detections = new Set();
    const notes = [];
    const publicParts = parts.map((part, i) => {
      if (part.kind === 'punct' || part.kind === 'unknown') return {kind:part.kind, text:part.text};
      let grammar = part.grammar;
      if (part.jp === 'から' && parts[i - 1]?.form?.key === 'te') grammar = 'te-kara';
      else if (part.jp === 'から' && parts[i - 1]?.ref?.lemma.group) grammar = 'compare:reasons';
      else if (part.jp === 'が' && parts[i - 1]?.form) grammar = '';
      else if (part.ref?.lemma.kana === 'ある' && parts[i - 1]?.form?.key === 'te') grammar = 'compare:state';
      if (grammar && (part.jp !== 'しか' || parts.some(token => /ない|ません/.test(token.jp || ''))) &&
          (!isRoman || part.kind !== 'function' || parts.some(token => token.form || token.ref?.lemma.group))) detections.add(grammar);
      const options = (part.candidates || []).filter(candidate => candidate.signature !== part.signature &&
        candidate.kind === part.kind && candidate.ref && candidate.weight >= part.weight - 2 &&
        (!HAS_HAN.test(part.text) || candidate.written === part.written ||
          candidate.ref.lemma.jp === part.ref.lemma.jp)).slice(0, PREVIEW_ALTERNATIVES);
      for (const option of options) if (option.form?.grammar) detections.add(option.form.grammar);
      const form = part.form ? describeForm(part.ref.lemma,part.ref.forms,part.form.key) : null;
      return {
        kind:part.kind, text:part.text, jp:part.jp, kana:part.kana, romaji:part.romaji ?? form?.romaji, vi:part.vi,
        pos:part.pos, id:part.id, grammar, ending:part.form?.ending,
        role:part.kind === 'function' ? grammarForPart(part, parts, i) : '',
        lemma:part.ref?.lemma,
        form,
        alternatives:options.map(candidate => ({
          lemma:candidate.ref.lemma,
          form:candidate.form ? describeForm(candidate.ref.lemma, candidate.ref.forms, candidate.form.key) : null
        })),
      };
    });
    if (detections.has('te-kara') && wordCount > 1) notes.push('Vế có ～てから nêu hành động trước. Vị ngữ ở vế sau nêu hành động tiếp theo.');
    if (detections.has('tara') || detections.has('ba')) notes.push('Vế điều kiện đặt mốc cho kết quả hoặc hành động ở vế còn lại.');
    if (detections.has('compare:state')) notes.push('Vて theo sau bởi ある có thể mô tả kết quả của việc đã làm có chủ ý. Cần xem động từ và hoàn cảnh để xác nhận.');
    const phrases = wordCount > 1 || parts.some(part => part.kind === 'function') ? collectPhrases(publicParts) : [];
    if (phrases.some(phrase => phrase.label === 'Vị ngữ') && !parts.some(part => part.kind === 'function' && ['は','が'].includes(part.jp))) {
      notes.push('Chủ thể có thể được lược bỏ. Cần ngữ cảnh để biết ai thực hiện.');
    }
    const ambiguousReading = publicParts.some(part =>
      part.alternatives?.some(option => option.lemma.jp !== part.lemma?.jp || option.lemma.kana !== part.lemma?.kana));
    const candidate = !unknownUnits && !ambiguousReading ?
      (isRoman ? curatedRoman.get(romanKey(source)) : !HAS_HAN.test(source) ? curatedKana.get(phraseKey(source)) : null) : null;
    const example = isJapanese && curatedJP.get(phraseKey(source)) ||
      (isRoman && /[?？!]$/.test(source) ? null : candidate);
    if (unknownUnits || publicParts.some(part => part.kind === 'word' && !part.kana)) {
      notes.push('Một số đoạn nằm ngoài kho dữ liệu hoặc chưa có cách đọc. Phần nhận diện được chỉ mang tính tham khảo.');
    }
    if (publicParts.some(part => part.alternatives?.length)) notes.push('Có từ hoặc dạng chia đồng âm. Xem các cách hiểu khác và dùng ngữ cảnh để chọn.');
    const reading = name => publicParts.map(part => part.kind === 'punct' ? part.text : part[name] || '[…]');
    return {original, japanese:isRoman ? example?.jp || publicParts.map(part => part.jp || part.text).join('') : original,
      readings:reading('kana').join(''), romaji:reading('romaji').join(' ').replace(/\s+([。、,.!?])/g,'$1').trim(),
      coverage, parts:publicParts, phrases, grammar:[...detections], notes, translation:example?.vi || '',
      ...(example?.kana ? {referenceReading:{kana:example.kana}} : {})};
  }
  return {addWord, analyze, finish() { romanForms.clear(); }};
}
