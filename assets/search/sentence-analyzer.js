import {FUNCTION_WORDS, CURATED_SENTENCES} from './lexicon.js';
import {SEARCH_TOPICS,SEARCH_LESSONS} from '../grammar/search-data.js';
import {describeForm,formRomaji} from './morphology.js';
import {HAS_JAPANESE, IS_ROMAN, hiragana, japaneseKey, romanize, romanAliases, romanKey} from './text.js';

const SEPARATOR = /([\s、。，．,.！？!?「」『』（）();；:：…]+)/u;
const JAPANESE_LIMIT = 240;
const KATAKANA_RUN = /[ァ-ヺー]+/g;
const HAS_KATAKANA = /[ァ-ヺ]/;
const PREVIEW_ALTERNATIVES = 4;
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
  const predicate = parts.slice(index + 1).find(token => token.kind === 'punct' || token.form);
  const lemma = predicate?.ref?.lemma.jp || '';
  const next = parts[index + 1];
  if (part.jp === 'を' && /(?:歩く|通る|渡る|出る|降りる)$/.test(lemma)) {
    return 'Có thể đánh dấu nơi đi qua hoặc rời khỏi với ' + lemma + '. Đọc o.';
  }
  if (part.jp === 'が' && /(?:好き|嫌い|できる)$/.test(next?.jp || lemma)) return 'Đánh dấu đối tượng của sở thích hoặc khả năng.';
  if (part.jp === 'が' && prior?.form) return 'Có thể nối hai vế với ý đối chiếu.';
  if (part.jp === 'に') {
    if (/(?:時|分|月|日)$/.test(prior?.jp || '')) return 'Có thể đánh dấu mốc thời gian đứng trước.';
    if (/(?:行く|来る|帰る|着く)$/.test(lemma)) return 'Đánh dấu đích của ' + lemma + '.';
    if (/(?:ある|いる)$/.test(lemma)) return 'Có thể đánh dấu vị trí tồn tại.';
  }
  if (part.jp === 'で') {
    if (/^(?:電車|バス|車|自転車|飛行機|タクシー|船|地下鉄)$/.test(prior?.jp || '')) return 'Chỉ phương tiện được dùng để thực hiện hành động.';
    if (/^(?:学校|店|図書館|駅|家|教室|公園|ここ|そこ|あそこ)$/.test(prior?.jp || '')) return 'Chỉ nơi hành động diễn ra.';
  }
  if (part.jp === 'と') {
    if (/^(?:言う|思う|書く)$/.test(lemma)) return 'Có thể đánh dấu nội dung được nói, nghĩ hoặc viết.';
    if (/(?:人|友達|家族|母|父|先生|兄|姉|弟|妹|彼|私)$/.test(prior?.jp || '') &&
        /(?:行く|来る|帰る|見る|食べる|遊ぶ|出かける)$/.test(lemma)) return 'Chỉ người cùng thực hiện hành động.';
  }
  if (part.jp === 'から' && prior?.form?.key === 'te') return 'Nối sau thể て để đặt mốc trước hành động tiếp theo.';
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
      for (const token of matches.slice(0, 4)) {
        if (run && (token.kind === 'function' || !HAS_KATAKANA.test(token.jp) &&
            !(romanOnlyReading && i === 0 && end === run[1]))) continue;
        const cost = token.kind === 'function'
          ? (i > 0 ? .79 : 2.25)
          : Math.max(.30, 1.80 - token.weight / 5) - Math.min(10, length) * 0.025;
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

export function createSentenceAnalyzer() {
  const japanese = new Map();
  const roman = new Map();
  const maximum = 64;
  let lengthsJP;
  let lengthsRoman;
  function put(map, key, token) {
    if (!key || key.length > maximum) return;
    const matches = map.get(key);
    if (!matches) { map.set(key, [token]); return; }
    if (matches.some(current => current.signature === token.signature)) return;
    if (matches.length === 10 && matches.at(-1).weight >= token.weight) return;
    matches.push(token);
    matches.sort((a, b) => b.weight - a.weight);
    if (matches.length > 10) matches.length = 10;
  }
  function add(token, spellings = [], extraRoman = []) {
    for (const spelling of [token.jp, token.kana, ...spellings]) {
      put(japanese, japaneseKey(spelling), token);
    }
    for (const spelling of [...romanAliases(token.romaji), ...extraRoman]) {
      put(roman, spelling, token);
    }
  }
  for (const [jp, spelling, grammar, vi, aliases] of FUNCTION_WORDS) {
    add({kind:'function', jp, kana:jp, romaji:spelling, grammar, vi, weight:3, signature:'function:' + jp}, [], aliases);
  }

  const curatedJP = new Map();
  const curatedKana = new Map();
  const curatedRoman = new Map();
  function addReading(readings, key, example) {
    if (!readings.has(key)) readings.set(key,example);
    else if (phraseKey(readings.get(key)?.jp) !== phraseKey(example.jp)) readings.set(key,null);
  }
  for (const [jp, kana, vi] of [...CURATED_SENTENCES, ...[...SEARCH_TOPICS,...SEARCH_LESSONS].flatMap(guide => guide.examples)]) {
    const key = phraseKey(jp);
    const example = {jp,kana,vi};
    if (!curatedJP.has(key)) curatedJP.set(key,example);
    addReading(curatedKana,phraseKey(kana),example);
    for (const spelling of romanAliases(romanize(kana))) addReading(curatedRoman,spelling,example);
  }

  function addWord(ref, weight, spellings = [], extraRoman = []) {
    const {lemma} = ref;
    if (!lemma.jp || lemma.jp.length > 36 || /Tên riêng|Romanization|Ký tự|Phụ tố|Tiền tố|Hậu tố/i.test(lemma.pos)) return;
    add({kind:'word', jp:lemma.jp, kana:lemma.kana, romaji:lemma.romaji, id:lemma.id, pos:lemma.pos, vi:lemma.vi,
      signature:lemma.jp + ':' + lemma.kana, ref, weight}, spellings, extraRoman);
    for (const form of ref.forms.values()) {
      if (form.key === 'dictionary' || form.key === 'stem') continue;
      const romaji = formRomaji(form);
      const aliases = form.key.startsWith('prohibition') ? romanAliases(romanize(form.kana)) : [];
      add({kind:'word', jp:form.jp, kana:form.kana, romaji, id:lemma.id, pos:lemma.pos, vi:lemma.vi,
        form, grammar:form.grammar, signature:lemma.jp + ':' + form.key, ref, weight:weight + 0.35},
      [], aliases);
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
    lengthsJP ??= [...new Set([...japanese.keys()].map(key => key.length))].sort((a, b) => a - b);
    lengthsRoman ??= [...new Set([...roman.keys()].map(key => key.length))].sort((a, b) => a - b);
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
        if (token.kind === 'unknown') {
          unknownUnits += token.text.length;
          if (parts.at(-1)?.kind === 'unknown') {
            parts.at(-1).text += text;
            continue;
          }
        }
        parts.push({...token, text});
      }
    }
    const coverage = totalUnits ? 1 - unknownUnits / totalUnits : 0;
    const wordCount = parts.filter(part => part.kind === 'word').length;
    if (isRoman && (coverage < .65 || !wordCount)) return null;

    const detections = new Set();
    const notes = [];
    const publicParts = parts.map((part, i) => {
      if (part.kind === 'punct' || part.kind === 'unknown') return {kind:part.kind, text:part.text};
      const grammar = part.jp === 'から' && parts[i - 1]?.form?.key === 'te' ? 'te-kara' : part.grammar;
      if (grammar && (part.jp !== 'しか' || parts.some(token => /ない|ません/.test(token.jp || ''))) &&
          (!isRoman || part.kind !== 'function' || parts.some(token => token.form || token.ref?.lemma.group))) detections.add(grammar);
      const options = (part.candidates || []).filter(candidate => candidate.signature !== part.signature &&
        candidate.kind === part.kind && candidate.ref && candidate.weight >= part.weight - 1 &&
        (candidate.form || !part.form)).slice(0, PREVIEW_ALTERNATIVES);
      for (const option of options) if (option.form?.grammar) detections.add(option.form.grammar);
      return {
        kind:part.kind, text:part.text, jp:part.jp, kana:part.kana, romaji:part.romaji, vi:part.vi,
        pos:part.pos, id:part.id, grammar, ending:part.form?.ending,
        role:part.kind === 'function' ? grammarForPart(part, parts, i) : '',
        lemma:part.ref?.lemma,
        form:part.form ? describeForm(part.ref.lemma, part.ref.forms, part.form.key) : null,
        alternatives:options.map(candidate => ({
          lemma:candidate.ref.lemma,
          form:candidate.form ? describeForm(candidate.ref.lemma, candidate.ref.forms, candidate.form.key) : null
        })),
      };
    });
    const wordForms = publicParts.filter(part => part.form);
    if (detections.has('te-kara') && wordCount > 1) notes.push('Vế có ～てから nêu hành động trước. Vị ngữ ở vế sau nêu hành động tiếp theo.');
    if (detections.has('tara') || detections.has('ba')) notes.push('Vế điều kiện đặt mốc cho kết quả hoặc hành động ở vế còn lại.');
    const lastWord = publicParts.filter(part => part.kind !== 'punct').at(-1);
    if (!unknownUnits && wordForms.length && lastWord?.form && !lastWord.ending && (wordCount > 1 || parts.some(part => part.jp === 'を'))) {
      notes.push('Vị ngữ chính nằm ở cuối: ' + lastWord.jp + '. Các cụm có trợ từ đứng trước bổ nghĩa cho vị ngữ.');
    }
    if (parts.some(part => part.jp === 'を') && !parts.some(part => part.jp === 'は' || part.jp === 'が') && wordForms.length) {
      notes.push('Câu không nêu rõ chủ thể bằng は hoặc が. Có thể cần ngữ cảnh để biết ai thực hiện.');
    }
    const example = isJapanese ? curatedJP.get(phraseKey(source)) || curatedKana.get(phraseKey(source)) :
      (/[?？]$/.test(source) ? undefined : curatedRoman.get(romanKey(source)));
    if (unknownUnits || publicParts.some(part => part.kind === 'word' && !part.kana)) {
      notes.push('Một số đoạn nằm ngoài kho dữ liệu hoặc chưa có cách đọc. Phần nhận diện được chỉ mang tính tham khảo.');
    }
    if (publicParts.some(part => part.alternatives?.length)) notes.push('Có từ hoặc dạng chia đồng âm. Xem các cách hiểu khác và dùng ngữ cảnh để chọn.');
    const reading = name => publicParts.map(part => part.kind === 'punct' ? part.text : part[name] || '[…]');
    return {original, japanese:isRoman ? example?.jp || publicParts.map(part => part.jp || part.text).join('') : original,
      readings:reading('kana').join(''), romaji:reading('romaji').join(' ').replace(/\s+([。、,.!?])/g,'$1').trim(),
      coverage, parts:publicParts, grammar:[...detections], notes, translation:example?.vi || ''};
  }
  return {addWord, analyze};
}
