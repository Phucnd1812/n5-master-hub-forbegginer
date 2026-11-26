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
  const group = IS_KANA.test(kana) && (item.catalog ? item.verifiedGroup : item.verifiedGroup ||
    (/Tính từ (?:đuôi )?い/i.test(pos) && kana.endsWith('い') ? 'i' :
      /Tính từ (?:đuôi )?な/i.test(pos) ? 'na' : verbGroup(pos, jp, kana)));
  const root = group && /^[IV]+$/.test(group) ? dictionaryForm(jp || kana, kana, group) : {jp:jp || kana, kana};
  // Mixed-surface imports can have no reading. Keep the written entry only.
  return {...root, group:group || '', id:item.id, vi:item.vi || '', pos, lesson:item.lesson,
    source:item.source, sourceId:item.sourceId, readings:item.readings, aliases:item.aliases, examples:item.examples,
    ...(item.personSuffixes ? {personSuffixes:item.personSuffixes} : {}),
    ...(item.catalog ? {catalog:true,dictionaryLevel:item.dictionaryLevel,referenceMeanings:item.referenceMeanings} : {}),
    card:item.card !== false, romaji:IS_KANA.test(root.kana) ? romanize(root.kana) : ''};
}

const FORM_LABELS = {
  dictionary:'Thể từ điển', stem:'Thân động từ trước ます', masu:'Thể lịch sự ます',
  masen:'Thể lịch sự phủ định ません', mashita:'Thể lịch sự quá khứ ました',
  masenPast:'Thể lịch sự quá khứ phủ định ませんでした', negative:'Thể thường phủ định ない',
  negativePast:'Thể thường quá khứ phủ định なかった', te:'Thể て', past:'Thể thường quá khứ た',
  potential:'Thể khả năng', passive:'Thể bị động',
  causative:'Thể sai khiến', causativePassive:'Thể sai khiến bị động',
  volitional:'Thể ý chí', mashou:'Thể ý chí lịch sự',
  imperative:'Thể mệnh lệnh', ba:'Điều kiện ～ば', tara:'Điều kiện ～たら', negativeBa:'Điều kiện phủ định ～なければ',
  duty:'Nghĩa vụ ～なければならない', dutyPolite:'Nghĩa vụ ～なければなりません',
  simultaneous:'Hai hành động đồng thời ～ながら',
  dutyNakute:'Nghĩa vụ ～なくてはいけない', dutyNakutePolite:'Nghĩa vụ ～なくてはいけません',
  negativeNakya:'Điều kiện phủ định rút gọn ～なきゃ', dutyNakya:'Nghĩa vụ trong hội thoại ～なきゃいけない',
  dutyNaito:'Nghĩa vụ ～ないといけません', dutyNaitoPlain:'Nghĩa vụ ～ないといけない', afterTe:'Trình tự ～てから',
  experience:'Kinh nghiệm ～たことがある', experiencePolite:'Kinh nghiệm ～たことがあります',
  desire:'Mong muốn ～たい', desirePolite:'Mong muốn lịch sự ～たいです', desireNegative:'Mong muốn phủ định ～たくない',
  prohibition:'Cấm ～てはいけない', prohibitionPolite:'Cấm ～てはいけません', progressive:'～ている',
  progressivePolite:'～ています', progressivePast:'～ていました', request:'Yêu cầu ～てください',
  permitShort:'Cho phép ～ていい',
  negativeRequest:'Yêu cầu phủ định ～ないでください', permit:'Cho phép ～てもいい', permitPolite:'Cho phép ～てもいいです',
  permitQuestion:'Xin phép ～てもいいですか', optional:'Không bắt buộc ～なくてもいい',
  optionalPolite:'Không bắt buộc ～なくてもいいです', before:'Trước khi ～前に', after:'Sau khi ～後で',
  negativeDe:'Không làm việc trước ～ないで', negativeTe:'Phủ định nối vế ～なくて',
  progressivePlainPast:'～ていた', progressiveNegative:'～ていない', progressiveNegativePast:'～ていなかった',
  progressivePoliteNegative:'～ていません', progressivePoliteNegativePast:'～ていませんでした',
  causativePassiveShort:'Thể sai khiến bị động rút gọn',
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

const VOICE_FORMS = ['potential','passive','causative','causativePassive'];
const VOICE_ENDINGS = [
  ['Negative', 'phủ định', 'ない'], ['Past', 'quá khứ', 'た'], ['NegativePast', 'quá khứ phủ định', 'なかった'],
  ['Polite', 'lịch sự', 'ます'], ['PolitePast', 'lịch sự quá khứ', 'ました'],
  ['PoliteNegative', 'lịch sự phủ định', 'ません'], ['PoliteNegativePast', 'lịch sự quá khứ phủ định', 'ませんでした'],
  ['Te', 'nối vế', 'て'],
];
for (const voice of [...VOICE_FORMS,'causativePassiveShort']) {
  for (const [key,label] of VOICE_ENDINGS) FORM_LABELS[voice + key] = FORM_LABELS[voice] + ' ' + label;
}

const FORM_GRAMMAR = {
  masu:'masu', masen:'masu', mashita:'masu', masenPast:'masu', negative:'nai', negativePast:'nai',
  te:'te', past:'ta', potential:'potential', potentialKoto:'potential', potentialKotoPolite:'potential',
  passive:'passive', causative:'causative', causativePassive:'causative-passive',
  volitional:'volitional', mashou:'volitional', imperative:'imperative', ba:'ba', negativeBa:'ba', tara:'tara',
  simultaneous:'simultaneous', duty:'obligation', dutyPolite:'obligation', dutyNaito:'obligation', dutyNaitoPlain:'obligation', afterTe:'te-kara',
  experience:'experience', experiencePolite:'experience', desire:'desire', desirePolite:'desire', desireNegative:'desire',
  prohibition:'prohibition', prohibitionPolite:'prohibition', progressive:'progressive', progressivePolite:'progressive',
  progressivePast:'progressive', request:'request', negativeRequest:'negative-request',
  progressivePlainPast:'progressive', progressiveNegative:'progressive', progressiveNegativePast:'progressive',
  progressivePoliteNegative:'progressive', progressivePoliteNegativePast:'progressive',
  dutyNakute:'obligation', dutyNakutePolite:'obligation',
  negativeNakya:'g11b_5', dutyNakya:'g11b_6',
  negativeDe:'compare:negative-connect', negativeTe:'compare:negative-connect', causativePassiveShort:'causative-passive',
  permit:'permission', permitShort:'permission', permitPolite:'permission', permitQuestion:'permission', optional:'optional', optionalPolite:'optional',
  invite:'g7c_5', propose:'g14a_1', justPast:'g10b_5', before:'g10a_2', after:'g10a_3',
};
for (const voice of [...VOICE_FORMS,'causativePassiveShort']) {
  for (const [key] of VOICE_ENDINGS) FORM_GRAMMAR[voice + key] = FORM_GRAMMAR[voice];
}

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
      ['adjPast','だった','Thêm だった để chỉ quá khứ.'],
      ['adjConnect','で','Thêm で để nối hai đặc điểm hoặc vế.'], ['adjIf','なら','Thêm なら để nêu điều kiện.'],
      ['adjPolite','です','Thêm です làm vị ngữ lịch sự.'], ['adjNegPolite','ではないです','Thêm です sau phủ định.'],
      ['adjPastPolite','でした','Thêm でした để diễn đạt quá khứ lịch sự.'],
      ['adjNegAlt','じゃない','Dùng じゃ để rút gọn では trong hội thoại.'],
      ['adjNegFormal','ではありません','Dùng ではありません làm phủ định lịch sự.'],
    ]) change(key, 'dictionary', 0, suffix, rule);
    change('adjNegPast','adjNeg',2,'なかった','Đổi ない thành なかった.');
    change('adjNegPastPolite','adjNegPast',0,'です','Thêm です sau phủ định quá khứ.');
    change('adjNegPastAlt','adjNegAlt',2,'なかった','Đổi ない thành なかった trong cách nói hội thoại.');
    change('adjNegPastFormal','adjNegFormal',0,'でした','Thêm でした sau ありません.');
    return;
  }
  const exceptional = /^(?:いい|よい|かっこいい)$/.test(kana);
  const kStem = exceptional ? kana.replace(/(?:い|よ)い$/, 'よ') : kana.slice(0,-1);
  const jStem = exceptional && jp.endsWith('いい') ? jp.slice(0,-2) + 'よ' : jp.slice(0,-1);
  const replaceEnding = exceptional ? 'Dùng thân よ của いい／良い' : 'Bỏ い cuối';
  for (const [key, ending] of [
    ['adjNeg','くない'], ['adjPast','かった'], ['adjConnect','くて'],
    ['adjIf','ければ'], ['adjNegFormal','くありません'], ['adjNegPastFormal','くありませんでした'],
  ]) add(key, 'dictionary', jStem + ending, kStem + ending, replaceEnding + ' rồi thêm ' + ending + '.');
  change('adjNegPast','adjNeg',2,'なかった','Đổi ない thành なかった.');
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

const PERSON_SUFFIXES = {
  plural:['たち','たち','Nhóm người ～たち','Chỉ nhiều người hoặc một người cùng nhóm đi với họ.'],
  respective:['方','がた','Nhóm người kính trọng ～方','Cách nói trang trọng về một nhóm người.'],
  san:['さん','さん','Xưng hô lịch sự ～さん','Thêm sau tên hoặc cách gọi người phù hợp để xưng hô lịch sự.'],
  chan:['ちゃん','ちゃん','Xưng hô thân mật ～ちゃん','Cách gọi trìu mến, phụ thuộc quan hệ với người được gọi.'],
  kun:['くん','くん','Xưng hô thân mật ～くん','Cách gọi tùy mức độ thân thiết và quan hệ.'],
};

export function formSpellings(lemma,form) {
  let prefix=0;
  while (prefix<lemma.jp.length && lemma.jp[prefix]===form.jp[prefix]) prefix++;
  const tail=lemma.jp.slice(prefix);
  const values=[form.jp];
  if (prefix) for (const alias of lemma.aliases || []) {
    if (lemma.group==='III' && lemma.jp.endsWith('来る') && lemma.kana.endsWith('くる') && alias.endsWith('くる')) {
      values.push(alias.slice(0,-2)+form.kana.slice(lemma.kana.length-2));
    } else if (alias.endsWith(tail)) values.push(alias.slice(0,alias.length-tail.length)+form.jp.slice(prefix));
  }
  if (form.key==='person-plural') for (const spelling of values.slice()) {
    values.push(spelling.slice(0,-2)+'達');
  }
  return [...new Set(values)];
}

for (const [key, [,,label]] of Object.entries(PERSON_SUFFIXES)) FORM_LABELS['person-'+key]=label;

export function generateForms(lemma) {
  const {forms, add, change} = formBuilder(lemma);
  if (!lemma.group) {
    for (const [key, meaning] of Object.entries(lemma.personSuffixes || {})) {
      const suffix=PERSON_SUFFIXES[key];
      if (!suffix || !meaning) continue;
      const [written,kana,,rule]=suffix;
      add('person-'+key,'dictionary',lemma.jp+written,lemma.kana+kana,rule,written);
    }
    return forms;
  }
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
  replace('negativeNakya','negativeBa',4,'なきゃ','Rút なければ thành なきゃ trong hội thoại.');
  attach('negativeDe','negative','で','Thêm で sau dạng ない. Dùng để nêu việc không làm trước hành động khác.');
  replace('negativeTe','negative',2,'なくて','Đổi ない thành なくて để nối vế phủ định.');
  attach('duty','negativeBa','ならない','Thêm ならない để diễn đạt nghĩa vụ.', 'ならない', 'なければならない');
  attach('dutyPolite','negativeBa','なりません','Thêm なりません để diễn đạt nghĩa vụ lịch sự.', 'なりません', 'なければなりません');
  attach('dutyNakute','negativeTe','はいけない','Thêm はいけない sau なくて để nói phải làm.', 'はいけない', 'なくてはいけない');
  attach('dutyNakutePolite','negativeTe','はいけません','Thêm はいけません sau なくて để nói nghĩa vụ lịch sự.', 'はいけません', 'なくてはいけません');
  attach('dutyNakya','negativeNakya','いけない','Thêm いけない để diễn đạt việc phải làm.', 'いけない', 'なきゃいけない');
  attach('dutyNaito','negative','といけません','Thêm といけません, nghĩa là phải làm.', 'といけません', 'といけません');
  attach('dutyNaitoPlain','negative','といけない','Thêm といけない, nghĩa là phải làm.', 'といけない', 'といけない');
  attach('tara','past','ら','Thêm ら sau thể た để nêu điều kiện.', 'ら', 'ら');
  attach('optional','negativeTe','もいい','Thêm もいい sau なくて để cho phép bỏ qua việc đó.', 'もいい', 'なくてもいい');
  attach('optionalPolite','optional','です');
  for (const [key, parent, suffix, reading = suffix] of [
    ['afterTe','te','から'], ['experience','past','ことがある'], ['experiencePolite','past','ことがあります'],
    ['desire','stem','たい'], ['simultaneous','stem','ながら'], ['progressive','te','いる'],
    ['prohibition','te','はいけない'], ['prohibitionPolite','te','はいけません'],
    ['request','te','ください'], ['permit','te','もいい'], ['permitShort','te','いい'],
    ['permitPolite','permit','です'], ['permitQuestion','permitPolite','か'], ['before','dictionary','前に','まえに'],
    ['after','past','後で','あとで'], ['potentialKoto','dictionary','ことができる'],
    ['potentialKotoPolite','dictionary','ことができます'], ['invite','masen','か'], ['propose','mashou','か'],
    ['justPast','past','ばかり'],
  ]) attach(key, parent, suffix, 'Thêm ' + suffix + ' sau ' + FORM_LABELS[parent].toLowerCase() + '.', reading, suffix);
  attach('negativeRequest','negativeDe','ください','Thêm ください sau ないで để tạo lời yêu cầu phủ định.', 'ください', 'ないでください');
  attach('desirePolite','desire','です');
  replace('desireNegative','desire',1,'くない','Chia たい như tính từ い, đổi い thành くない.','たくない');
  for (const [key,parent,end,marker] of [
    ['progressivePolite','progressive','ます','ています'],
    ['progressivePast','progressive','ました','ていました'],
    ['progressivePlainPast','progressive','た','ていた'],
    ['progressiveNegative','progressive','ない','ていない'],
    ['progressivePoliteNegative','progressive','ません','ていません'],
  ]) replace(key,parent,1,end,'Chia いる sau thể て: bỏ る rồi thêm ' + end + '.',marker);
  replace('progressiveNegativePast','progressiveNegative',2,'なかった','Đổi ない thành なかった.','ていなかった');
  attach('progressivePoliteNegativePast','progressivePoliteNegative','でした','Thêm でした sau ません.','ていませんでした');

  if (forms.has('causative')) {
    replace('causativePassive','causative',1,'られる','Chia thể sai khiến như động từ nhóm II: bỏ る, thêm られる.');
    if (lemma.group === 'I' && !lemma.kana.endsWith('す')) {
      replace('causativePassiveShort','causativePassive',4,'される','Trong hội thoại, dạng nhóm I đuôi ～せられる thường rút thành ～される. Động từ đuôi す giữ ～せられる.');
    }
  }
  for (const key of [...VOICE_FORMS,'causativePassiveShort']) {
    if (!forms.has(key)) continue;
    for (const [suffix,,ending] of VOICE_ENDINGS) {
      if (suffix === 'NegativePast') {
        replace(key + suffix,key + 'Negative',2,ending,'Đổi ない thành なかった.');
      } else if (suffix === 'PoliteNegativePast') {
        attach(key + suffix,key + 'PoliteNegative','でした','Thêm でした sau ません.');
      } else {
        replace(key + suffix,key,1,ending,'Dạng này chia như động từ nhóm II: bỏ る, thêm ' + ending + '.');
      }
    }
  }
  return forms;
}

export function formRomaji(form) {
  const reading = romanize(form.kana);
  return /^(?:prohibition|dutyNakute)/.test(form.key) ? reading.replace(/hai(ke(?:nai|masen))$/, 'wai$1') : reading;
}

const STEP_MEANINGS = {
  stem:'Thân dùng trước ます và một số mẫu như ～たい, ～ながら.',
  te:'Dạng nối làm nền cho yêu cầu, trình tự và các trợ động từ.',
  negative:'Phủ định một hành động hoặc trạng thái.',
  negativePast:'Một hành động đã không xảy ra, hoặc một trạng thái đã không đúng.',
  negativeBa:'Đặt việc không làm (hoặc không có trạng thái) làm điều kiện.',
  negativeNakya:'Điều kiện “nếu không…”. Khi bỏ vế sau trong hội thoại có thể ngụ ý “phải…”.',
  negativeTe:'Nối vế phủ định với kết quả hoặc lý do.',
  negativeDe:'Nêu việc được bỏ qua khi thực hiện hành động khác.',
  duty:'Diễn đạt một việc phải làm.',
  dutyPolite:'Diễn đạt một việc phải làm trong lời nói lịch sự.',
  dutyNakute:'Diễn đạt một việc phải làm.',
  dutyNakutePolite:'Diễn đạt một việc phải làm trong lời nói lịch sự.',
  potential:'Nói về khả năng thực hiện.',
  passive:'Nhìn hành động từ phía người hoặc vật chịu tác động.',
  causative:'Nêu việc khiến hoặc cho phép ai làm gì.',
  causativePassive:'Nêu việc một người bị bắt hoặc bị thúc phải làm.',
  causativePassiveShort:'Vẫn mang nghĩa bị khiến phải làm. Dạng rút gọn thường gặp trong hội thoại.',
  progressive:'Tùy động từ, nêu việc đang diễn ra, thói quen hoặc trạng thái kết quả.',
  simultaneous:'Nêu hành động nền diễn ra đồng thời với hành động chính. Hai hành động thường cùng chủ thể.',
  afterTe:'Đặt hành động này trước hành động tiếp theo.',
};

const MEANING_VOICES = ['causativePassiveShort', ...VOICE_FORMS.slice().reverse()];
const MEANING_PREFIX = {
  duty:'phải ', dutyPolite:'phải ', dutyNakute:'phải ', dutyNakutePolite:'phải ', dutyNakya:'phải ',
  dutyNaito:'phải ', dutyNaitoPlain:'phải ', afterTe:'sau khi ', simultaneous:'trong khi ',
  desire:'muốn ', desirePolite:'muốn ', desireNegative:'không muốn ', negative:'không ', negativePast:'đã không ',
  negativeBa:'nếu không ', experience:'đã từng ', experiencePolite:'đã từng ',
  prohibition:'không được ', prohibitionPolite:'không được ', potential:'có thể ', potentialNegative:'không thể ',
  potentialNegativePast:'đã không thể ', past:'đã ', masen:'không ', mashita:'đã ', masenPast:'đã không ',
  permit:'được phép ', permitShort:'được phép ', permitPolite:'được phép ', permitQuestion:'có được phép ',
  progressive:'đang ', progressivePolite:'đang ', progressivePlainPast:'lúc đó đang ', progressivePast:'lúc đó đang ',
  progressiveNegative:'hiện không ', progressivePoliteNegative:'hiện không ', progressiveNegativePast:'lúc đó không ',
  progressivePoliteNegativePast:'lúc đó không ', passive:'bị/được ', causative:'khiến/cho phép ', causativePassive:'bị bắt ',
  causativePassiveShort:'bị bắt ', ba:'nếu ', tara:'nếu ', volitional:'định ', mashou:'hãy ', imperative:'hãy ',
  request:'vui lòng ', adjNeg:'không ', adjNegPolite:'không ', adjPast:'đã ', adjPastPolite:'đã ',
  adjNegPast:'đã không ', adjNegPastPolite:'đã không ',
  optional:'không cần ', optionalPolite:'không cần ', negativeDe:'không ', negativeRequest:'xin đừng ',
};

const RESULTATIVE_READINGS = new Map([
  ['知る','biết, hiện có thông tin'],
  ['結婚する','đã kết hôn'],
]);

const FORM_CONTEXTS = {
  potential:'Dùng khi nói về năng lực hoặc điều kiện cho phép thực hiện việc đó.',
  passive:'Góc nhìn đặt vào người hoặc vật chịu tác động. Các dạng ～られる còn có cách hiểu khác.',
  'causative-passive':'Góc nhìn đặt vào người bị buộc hoặc được khiến phải thực hiện hành động.',
  obligation:'Dùng cho quy định, trách nhiệm hoặc điều người nói xem là cần làm.',
  progressive:'Xét loại động từ và ngữ cảnh để phân biệt đang diễn ra, thói quen và kết quả còn lại.',
  'te-kara':'Dùng khi hành động sau bắt đầu từ lúc hành động trước đã xong.',
  simultaneous:'Hành động chính đứng ở vế sau, hành động đồng thời đứng trước ながら.',
};

function changedEnding(before, after) {
  let start = 0;
  while (start < before.length && before[start] === after[start]) start++;
  return {removed:before.slice(start), added:after.slice(start)};
}

export function describeForm(lemma, forms, key) {
  const form = forms.get(key);
  if (!form) return null;
  const steps = [];
  const gloss = lemma.vi.split(/[;,；]/)[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
  const meaning = key => {
    if (!gloss) return '';
    if (key.startsWith('person-')) return lemma.personSuffixes?.[key.slice(7)] || '';
    if (key==='progressive' || key==='progressivePolite') {
      const state = RESULTATIVE_READINGS.get(lemma.jp);
      if (state) return state;
    }
    if (MEANING_PREFIX[key]) return MEANING_PREFIX[key] + gloss;
    const voice=MEANING_VOICES.find(base=>key.startsWith(base));
    if (voice) {
      const ending=key.slice(voice.length);
      const tense=ending.includes('Past') ? 'đã ' : '';
      const negative=ending.includes('Negative') ? 'không ' : '';
      return tense + negative + MEANING_PREFIX[voice] + gloss;
    }
    return gloss;
  };
  let node = form;
  while (node) {
    const parent = forms.get(node.parent);
    steps.push({jp:node.jp, kana:node.kana, rule:node.rule, key:node.key, label:FORM_LABELS[node.key],
      changed:parent ? changedEnding(parent.kana,node.kana) : null,
      meaning:node.key === 'dictionary' ? gloss : meaning(node.key) || STEP_MEANINGS[node.key] || FORM_LABELS[node.key]});
    node = parent;
  }
  const register = /Polite|masu|masen|mashita|mashou|masenPast/.test(key) ? 'Lịch sự' :
    /Short|Nakya/.test(key) ? 'Thường gặp trong hội thoại' :
    key === 'imperative' ? 'Mệnh lệnh mạnh' :
    ['negative','past','negativePast','progressive','progressivePlainPast','progressiveNegative','progressiveNegativePast'].includes(key) ?
      'Thể thông thường' : '';
  return {lemma, key, jp:form.jp, kana:form.kana, romaji:formRomaji(form), label:FORM_LABELS[key],
    grammar:form.grammar, ending:form.ending, meaning:meaning(key), spellings:formSpellings(lemma,form),
    register, context:FORM_CONTEXTS[form.grammar] || STEP_MEANINGS[key] || form.rule || '',
    steps:steps.reverse()};
}
