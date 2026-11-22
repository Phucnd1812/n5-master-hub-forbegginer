import {hiragana, IS_KANA, plain, romanize, wordPieces} from './text.js';

const ROWS = {
  'う':['わ','い','え','お','って','った'], 'く':['か','き','け','こ','いて','いた'],
  'ぐ':['が','ぎ','げ','ご','いで','いだ'], 'す':['さ','し','せ','そ','して','した'],
  'つ':['た','ち','て','と','って','った'], 'ぬ':['な','に','ね','の','んで','んだ'],
  'ぶ':['ば','び','べ','ぼ','んで','んだ'], 'む':['ま','み','め','も','んで','んだ'],
  'る':['ら','り','れ','ろ','って','った']
};
const MASU_TO_DICTIONARY = new Map(Object.entries(ROWS).map(([end, row]) => [row[1], end]));
const HONORIFICS = new Set(['いらっしゃる','おっしゃる','くださる','なさる','ござる']);
const VERIFIED_RU = new Map([
  ...['終わる','入る','走る','要る','帰る','切る','知る','減る','決まる','余る'].map(word => [word, 'I']),
  ...['食べる','見る','着る','起きる','寝る','教える','あげる','借りる','できる','答える','迎える',
    '変える','伝える','聞こえる','見える','慣れる','決める','比べる','続ける','遅れる','届ける','見つける',
    '間違える','覚える','忘れる','確かめる','増える','増やせる','足りる','過ぎる','似る','受ける',
    '褒める','考える','調べる','片付ける','こたえる','たべる','みる','ねる','もらえる'].map(word => [word, 'II']),
]);

function verbGroup(pos, jp, kana) {
  const group = pos.match(/Động từ nhóm (III|II|I)\b/i)?.[1]?.toUpperCase();
  if (group) return group;
  if (/Động từ する/i.test(pos)) return 'III';
  if (!/^Động từ$/i.test(pos)) return '';
  if (kana.endsWith('する') || kana === 'くる') return 'III';
  if (kana.endsWith('る')) {
    // Only infer godan when the vowel before る excludes ichidan. For -iru/-eru
    // use the spelling or the explicitly tagged curriculum, never just the sound.
    return VERIFIED_RU.get(jp) || (/[あかがさざただなはばぱまゃやらわうくぐすずつづぬふぶぷむゅゆるおこごそぞとどのほぼぽもょよろを]る$/.test(kana) ? 'I' : '');
  }
  return ROWS[kana.at(-1)] ? 'I' : '';
}

function dictionaryForm(jp, kana, group) {
  const replace = (from, to) => ({
    jp: jp.endsWith(from) ? jp.slice(0, -from.length) + to : kana.slice(0, -from.length) + to,
    kana: kana.slice(0, -from.length) + to,
  });
  if (group === 'III') {
    if (kana.endsWith('きます')) {
      if (jp.endsWith('来ます')) return {jp:jp.slice(0,-2) + 'る', kana:kana.slice(0,-3) + 'くる'};
      return replace('きます', 'くる');
    }
    if (kana.endsWith('します')) return replace('します', 'する');
    if (kana.endsWith('する') || kana.endsWith('くる')) return {jp, kana};
    // A few curriculum noun + する entries store only the noun surface.
    return {jp:jp + 'する', kana:kana + 'する'};
  }
  if (!kana.endsWith('ます')) return {jp, kana};
  if (group === 'II') return replace('ます', 'る');
  const honorific = kana.replace(/います$/, 'る');
  if (HONORIFICS.has(honorific)) return replace('います', 'る');
  const tail = kana.at(-3);
  return MASU_TO_DICTIONARY.has(tail) ? replace(tail + 'ます', MASU_TO_DICTIONARY.get(tail)) : {jp, kana};
}

export function makeLemma(item) {
  const [jp = ''] = wordPieces(plain(item.kanji || item.jp || item.kana));
  const [reading = ''] = wordPieces(plain(item.kana, true));
  const kana = hiragana(reading);
  const pos = String(item.pos || '');
  const group = IS_KANA.test(kana) && (
    /Tính từ (?:đuôi )?い/i.test(pos) && kana.endsWith('い') ? 'i' :
      /Tính từ (?:đuôi )?な/i.test(pos) ? 'na' : verbGroup(pos, jp, kana));
  const root = group && /^[IV]+$/.test(group) ? dictionaryForm(jp || kana, kana, group) : {jp:jp || kana, kana};
  // Mixed-surface imports can have no reading. Keep the written entry only.
  return {...root, group:group || '', id:item.id, vi:item.vi || '', pos, lesson:item.lesson,
    source:item.source, card:item.card !== false, romaji:IS_KANA.test(root.kana) ? romanize(root.kana) : ''};
}

const FORM_LABELS = {
  dictionary:'Thể từ điển', stem:'Thân động từ trước ます', masu:'Thể lịch sự ます',
  masen:'Thể lịch sự phủ định ません', mashita:'Thể lịch sự quá khứ ました',
  masenPast:'Thể lịch sự quá khứ phủ định ませんでした', negative:'Thể thường phủ định ない',
  negativePast:'Thể thường quá khứ phủ định なかった', te:'Thể て', past:'Thể thường quá khứ た',
  potential:'Thể khả năng', potentialNegative:'Thể khả năng phủ định', potentialPast:'Thể khả năng quá khứ',
  passive:'Thể bị động', passiveNegative:'Thể bị động phủ định', passivePast:'Thể bị động quá khứ',
  causative:'Thể sai khiến', causativeNegative:'Thể sai khiến phủ định', causativePast:'Thể sai khiến quá khứ',
  causativePassive:'Thể sai khiến bị động', causativePassiveNegative:'Thể sai khiến bị động phủ định',
  causativePassivePast:'Thể sai khiến bị động quá khứ', volitional:'Thể ý chí', mashou:'Thể ý chí lịch sự',
  imperative:'Thể mệnh lệnh', ba:'Điều kiện ～ば', tara:'Điều kiện ～たら', negativeBa:'Điều kiện phủ định ～なければ',
  potentialPolite:'Thể khả năng lịch sự', potentialPolitePast:'Thể khả năng lịch sự quá khứ',
  passivePolite:'Thể bị động lịch sự', passivePolitePast:'Thể bị động lịch sự quá khứ',
  causativePolite:'Thể sai khiến lịch sự', causativePolitePast:'Thể sai khiến lịch sự quá khứ',
  causativePassivePolite:'Thể sai khiến bị động lịch sự', causativePassivePolitePast:'Thể sai khiến bị động lịch sự quá khứ',
  duty:'Nghĩa vụ ～なければならない', dutyPolite:'Nghĩa vụ ～なければなりません',
  simultaneous:'Hai hành động đồng thời ～ながら',
  dutyNaito:'Nghĩa vụ ～ないといけません', dutyNaitoPlain:'Nghĩa vụ ～ないといけない', afterTe:'Trình tự ～てから',
  experience:'Kinh nghiệm ～たことがある', experiencePolite:'Kinh nghiệm ～たことがあります',
  desire:'Mong muốn ～たい', desirePolite:'Mong muốn lịch sự ～たいです', desireNegative:'Mong muốn phủ định ～たくない',
  prohibition:'Cấm ～てはいけない', prohibitionPolite:'Cấm ～てはいけません', progressive:'～ている',
  progressivePolite:'～ています', progressivePast:'～ていました', request:'Yêu cầu ～てください',
  negativeRequest:'Yêu cầu phủ định ～ないでください', permit:'Cho phép ～てもいい', permitPolite:'Cho phép ～てもいいです',
  permitQuestion:'Xin phép ～てもいいですか', optional:'Không bắt buộc ～なくてもいい',
  optionalPolite:'Không bắt buộc ～なくてもいいです', before:'Trước khi ～前に', after:'Sau khi ～後で',
  potentialKoto:'Khả năng ～ことができる', potentialKotoPolite:'Khả năng ～ことができます',
  invite:'Lời mời ～ませんか', propose:'Đề nghị ～ましょうか', justPast:'Vừa mới ～たばかり',
  copula:'Tính từ な làm vị ngữ', attributive:'Tính từ な bổ nghĩa danh từ', adverb:'Tính từ な làm trạng ngữ',
  adjNeg:'Tính từ phủ định', adjPast:'Tính từ quá khứ', adjNegPast:'Tính từ quá khứ phủ định',
  adjConnect:'Nối tính từ', adjIf:'Điều kiện tính từ', adjPolite:'Tính từ lịch sự',
  adjNegPolite:'Tính từ phủ định lịch sự', adjPastPolite:'Tính từ quá khứ lịch sự',
  adjNegPastPolite:'Tính từ quá khứ phủ định lịch sự', adjNegAlt:'Tính từ phủ định thân mật',
  adjNegPastAlt:'Tính từ quá khứ phủ định thân mật', adjNegFormal:'Tính từ phủ định trang trọng',
  adjNegPastFormal:'Tính từ quá khứ phủ định trang trọng',
};

const FORM_GRAMMAR = {
  masu:'masu', masen:'masu', mashita:'masu', masenPast:'masu', negative:'nai', negativePast:'nai',
  te:'te', past:'ta', potential:'potential', potentialKoto:'potential', potentialKotoPolite:'potential',
  potentialNegative:'potential', potentialPast:'potential', passive:'passive', passiveNegative:'passive', passivePast:'passive',
  causative:'causative', causativeNegative:'causative', causativePast:'causative',
  causativePassive:'causative-passive', causativePassiveNegative:'causative-passive', causativePassivePast:'causative-passive',
  volitional:'volitional', mashou:'volitional', imperative:'imperative', ba:'ba', negativeBa:'ba', tara:'tara',
  simultaneous:'simultaneous', duty:'obligation', dutyPolite:'obligation', dutyNaito:'obligation', dutyNaitoPlain:'obligation', afterTe:'te-kara',
  experience:'experience', experiencePolite:'experience', desire:'desire', desirePolite:'desire', desireNegative:'desire',
  prohibition:'prohibition', prohibitionPolite:'prohibition', progressive:'progressive', progressivePolite:'progressive',
  progressivePast:'progressive', request:'request', negativeRequest:'negative-request',
  permit:'permission', permitPolite:'permission', permitQuestion:'permission', optional:'optional', optionalPolite:'optional',
  invite:'g7c_5', propose:'g14a_1', justPast:'g10b_5', before:'g10a_2', after:'g10a_3',
};

function formBuilder(lemma) {
  const forms = new Map();
  forms.set('dictionary', {key:'dictionary', jp:lemma.jp, kana:lemma.kana});
  function add(key, parent, jp, kana, rule, ending) {
    const grammar = FORM_GRAMMAR[key] || FORM_GRAMMAR[key.replace(/Polite(?:Past)?$/, '')] || (lemma.group === 'i' ? 'adj-i' : lemma.group === 'na' ? 'adj-na' : '');
    forms.set(key, {key, parent, jp, kana, rule, grammar, ending});
  }
  function change(key, parent, drop, suffix, rule, reading = suffix, ending) {
    const from = forms.get(parent);
    const stem = (word, tail) => word.slice(0, word.length - drop) + tail;
    add(key, parent, stem(from.jp, suffix), stem(from.kana, reading), rule, ending);
  }
  return {forms, add, change};
}

function adjectiveForms(lemma, change, add) {
  const {jp, kana, group} = lemma;
  if (group === 'na') {
    for (const [key, suffix, rule] of [
      ['copula','だ','Thêm だ để làm vị ngữ thể thường.'], ['attributive','な','Thêm な trước danh từ.'],
      ['adverb','に','Thêm に khi bổ nghĩa cho hành động.'], ['adjNeg','ではない','Đổi vị ngữ sang ではない.'],
      ['adjPast','だった','Thêm だった để chỉ quá khứ.'], ['adjNegPast','ではなかった','Đổi ない thành なかった.'],
      ['adjConnect','で','Thêm で để nối hai đặc điểm hoặc vế.'], ['adjIf','なら','Thêm なら để nêu điều kiện.'],
      ['adjPolite','です','Thêm です làm vị ngữ lịch sự.'], ['adjNegPolite','ではないです','Thêm です sau phủ định.'],
      ['adjPastPolite','でした','Thêm でした để diễn đạt quá khứ lịch sự.'],
      ['adjNegPastPolite','ではなかったです','Thêm です sau phủ định quá khứ.'],
      ['adjNegAlt','じゃない','Dùng じゃ để rút gọn では trong hội thoại.'],
      ['adjNegPastAlt','じゃなかった','Đổi ない thành なかった trong cách nói hội thoại.'],
      ['adjNegFormal','ではありません','Dùng ではありません làm phủ định lịch sự.'],
      ['adjNegPastFormal','ではありませんでした','Đổi ありません thành ありませんでした.'],
    ]) change(key, 'dictionary', 0, suffix, rule);
    return;
  }
  const exceptional = /^(?:いい|よい|かっこいい)$/.test(kana);
  const kStem = exceptional ? kana.replace(/(?:い|よ)い$/, 'よ') : kana.slice(0,-1);
  const jStem = exceptional && jp.endsWith('いい') ? jp.slice(0,-2) + 'よ' : jp.slice(0,-1);
  const replaceEnding = exceptional ? 'Dùng thân よ của いい／良い' : 'Bỏ い cuối';
  for (const [key, ending] of [
    ['adjNeg','くない'], ['adjPast','かった'], ['adjNegPast','くなかった'], ['adjConnect','くて'],
    ['adjIf','ければ'], ['adjNegFormal','くありません'], ['adjNegPastFormal','くありませんでした'],
  ]) add(key, 'dictionary', jStem + ending, kStem + ending, replaceEnding + ' rồi thêm ' + ending + '.');
  change('adjPolite', 'dictionary', 0, 'です', 'Giữ い và thêm です.');
  for (const [key, parent] of [['adjNegPolite','adjNeg'], ['adjPastPolite','adjPast'], ['adjNegPastPolite','adjNegPast']]) {
    change(key, parent, 0, 'です', 'Thêm です để nói lịch sự.');
  }
}

function verbBases(lemma, add) {
  const {jp, kana, group} = lemma;
  const row = ROWS[kana.at(-1)];
  const base = (key, written, reading, rule) => add(key, 'dictionary', written, reading, rule);
  const godan = (key, tail, rule) => base(key, jp.slice(0,-1) + tail, kana.slice(0,-1) + tail, rule);

  if (group === 'I' && row) {
    const [a,i,e,o,te,ta] = row;
    const iku = kana === 'いく' || kana === 'ゆく' || /[行逝]く$/.test(jp);
    const special = kana === 'ある';
    // Honorific verbs have a conventional polite stem in い.
    const stem = HONORIFICS.has(kana) ? 'い' : i;
    godan('stem', stem, 'Đổi âm cuối ' + kana.at(-1) + ' → ' + stem + ' để lấy thân trước ます.');
    if (special) base('negative','ない','ない','ある có phủ định bất quy tắc là ない.');
    else godan('negative', a + 'ない', 'Đổi âm cuối sang hàng あ (' + a + '), rồi thêm ない.');
    const teEnd = iku ? 'って' : te;
    const taEnd = iku ? 'った' : ta;
    godan('te', teEnd, (iku ? '行く dùng quy tắc đặc biệt' : 'Theo âm cuối ' + kana.at(-1)) + ', đổi đuôi thành ' + teEnd + '.');
    godan('past', taEnd, (iku ? '行く dùng quy tắc đặc biệt' : 'Theo âm cuối ' + kana.at(-1)) + ', đổi đuôi thành ' + taEnd + '.');
    godan('volitional', o + 'う', 'Đổi âm cuối sang hàng お rồi thêm う.');
    godan('ba', e + 'ば', 'Đổi âm cuối sang hàng え rồi thêm ば.');
    if (special || HONORIFICS.has(kana)) return;
    godan('potential', e + 'る', 'Đổi âm cuối sang hàng え rồi thêm る.');
    godan('passive', a + 'れる', 'Đổi âm cuối sang hàng あ rồi thêm れる.');
    godan('causative', a + 'せる', 'Đổi âm cuối sang hàng あ rồi thêm せる.');
    godan('imperative', e, 'Đổi âm cuối sang hàng え để tạo mệnh lệnh mạnh.');
    return;
  }
  if (group === 'II' && kana.endsWith('る')) {
    for (const [key, ending] of [
      ['stem',''], ['negative','ない'], ['te','て'], ['past','た'], ['volitional','よう'],
      ['ba','れば'], ['potential','られる'], ['passive','られる'], ['causative','させる'], ['imperative','ろ'],
    ]) {
      godan(key, ending, ending ? 'Bỏ る cuối rồi thêm ' + ending + '.' : 'Bỏ る cuối để lấy thân trước ます.');
    }
    return;
  }
  if (group !== 'III' || !/(する|くる)$/.test(kana)) return;
  const suru = kana.endsWith('する');
  const kanjiKuru = !suru && jp.endsWith('来る');
  const jStem = jp.slice(0, kanjiKuru ? -1 : -2);
  const kStem = kana.slice(0,-2);
  for (const [key, s, k, written = k] of [
    ['stem','し','き',''], ['negative','しない','こない','ない'], ['te','して','きて','て'],
    ['past','した','きた','た'], ['volitional','しよう','こよう','よう'], ['ba','すれば','くれば','れば'],
    ['potential','できる','こられる','られる'], ['passive','される','こられる','られる'],
    ['causative','させる','こさせる','させる'], ['imperative','しろ','こい','い'],
  ]) base(key, jStem + (suru ? s : kanjiKuru ? written : k), kStem + (suru ? s : k),
    suru ? 'する đổi bất quy tắc thành ' + s + '.' : '来る đổi bất quy tắc thành ' + k + '.');
}

export function generateForms(lemma) {
  const {forms, add, change} = formBuilder(lemma);
  if (!lemma.group) return forms;
  if (lemma.group === 'i' || lemma.group === 'na') {
    adjectiveForms(lemma, change, add);
    return forms;
  }
  verbBases(lemma, add);
  if (!forms.has('stem')) return forms;
  const attach = (key, parent, end, rule = 'Thêm ' + end + '.', reading = end, marker) =>
    change(key, parent, 0, end, rule, reading, marker);
  const replace = (key, parent, drop, end, rule, marker) => change(key, parent, drop, end, rule, end, marker);
  for (const [key, suffix] of [['masu','ます'], ['masen','ません'], ['mashita','ました'], ['masenPast','ませんでした'], ['mashou','ましょう']]) {
    attach(key, 'stem', suffix, 'Thêm ' + suffix + ' vào thân động từ trước ます.');
  }
  replace('negativePast','negative',2,'なかった','Đổi ない thành なかった.');
  replace('negativeBa','negative',2,'なければ','Đổi ない thành なければ.');
  attach('duty','negativeBa','ならない','Thêm ならない để diễn đạt nghĩa vụ.', 'ならない', 'なければならない');
  attach('dutyPolite','negativeBa','なりません','Thêm なりません để diễn đạt nghĩa vụ lịch sự.', 'なりません', 'なければなりません');
  attach('dutyNaito','negative','といけません','Thêm といけません, nghĩa là phải làm.', 'といけません', 'といけません');
  attach('dutyNaitoPlain','negative','といけない','Thêm といけない, nghĩa là phải làm.', 'といけない', 'といけない');
  attach('tara','past','ら','Thêm ら sau thể た để nêu điều kiện.', 'ら', 'ら');
  replace('optional','negative',2,'なくてもいい','Đổi ない thành なくて rồi thêm もいい.', 'なくてもいい');
  attach('optionalPolite','optional','です');
  for (const [key, parent, suffix, reading = suffix] of [
    ['afterTe','te','から'], ['experience','past','ことがある'], ['experiencePolite','past','ことがあります'],
    ['desire','stem','たい'], ['simultaneous','stem','ながら'], ['progressive','te','いる'], ['progressivePolite','te','います'], ['progressivePast','te','いました'],
    ['prohibition','te','はいけない'], ['prohibitionPolite','te','はいけません'],
    ['request','te','ください'], ['negativeRequest','negative','でください'], ['permit','te','もいい'],
    ['permitPolite','permit','です'], ['permitQuestion','permitPolite','か'], ['before','dictionary','前に','まえに'],
    ['after','past','後で','あとで'], ['potentialKoto','dictionary','ことができる'],
    ['potentialKotoPolite','dictionary','ことができます'], ['invite','masen','か'], ['propose','mashou','か'],
    ['justPast','past','ばかり'],
  ]) attach(key, parent, suffix, 'Thêm ' + suffix + ' sau ' + FORM_LABELS[parent].toLowerCase() + '.', reading, suffix);
  attach('desirePolite','desire','です');
  replace('desireNegative','desire',1,'くない','Chia たい như tính từ い, đổi い thành くない.','たくない');

  if (forms.has('causative')) replace('causativePassive','causative',1,'られる','Chia thể sai khiến như động từ nhóm II: bỏ る, thêm られる.');
  for (const key of ['potential','passive','causative','causativePassive']) {
    if (!forms.has(key)) continue;
    replace(key + 'Negative',key,1,'ない','Dạng này chia như động từ nhóm II: bỏ る, thêm ない.');
    replace(key + 'Past',key,1,'た','Dạng này chia như động từ nhóm II: bỏ る, thêm た.');
    replace(key + 'Polite',key,1,'ます','Dạng này chia như động từ nhóm II: bỏ る, thêm ます.');
    replace(key + 'PolitePast',key,1,'ました','Dạng này chia như động từ nhóm II: bỏ る, thêm ました.');
  }
  return forms;
}

export function formRomaji(form) {
  const reading = romanize(form.kana);
  return form.key.startsWith('prohibition') ? reading.replace(/hai(ke(?:nai|masen))$/, 'wai$1') : reading;
}

export function describeForm(lemma, forms, key) {
  const form = forms.get(key);
  if (!form) return null;
  const steps = [];
  let node = form;
  while (node) {
    steps.push({jp:node.jp, kana:node.kana, rule:node.rule, key:node.key, label:FORM_LABELS[node.key]});
    node = forms.get(node.parent);
  }
  const gloss = lemma.vi.split(/[;,；]/)[0].trim();
  const meaning = {
    duty:'phải ', dutyPolite:'phải ', dutyNaito:'phải ', dutyNaitoPlain:'phải ', afterTe:'sau khi ',
    desire:'muốn ', desirePolite:'muốn ', desireNegative:'không muốn ', negative:'không ',
    experience:'đã từng ', experiencePolite:'đã từng ', prohibition:'không được ', prohibitionPolite:'không được ',
    potential:'có thể ', potentialNegative:'không thể ',
  }[key];
  return {lemma, key, jp:form.jp, kana:form.kana, romaji:formRomaji(form), label:FORM_LABELS[key],
    grammar:form.grammar, ending:form.ending, meaning:gloss && meaning ? meaning + gloss : '',
    steps:steps.reverse()};
}
