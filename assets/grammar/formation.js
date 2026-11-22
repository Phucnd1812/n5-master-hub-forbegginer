import {generateForms} from '../search/morphology.js';

// These are teaching examples with established groups. The table and the
// word-by-word visualizer both use the actual morphology engine.
const GODAN = [
  ['う','買う','かう','mua'],
  ['く','書く','かく','viết'],
  ['ぐ','泳ぐ','およぐ','bơi'],
  ['す','話す','はなす','nói'],
  ['つ','待つ','まつ','đợi'],
  ['ぬ','死ぬ','しぬ','chết'],
  ['ぶ','遊ぶ','あそぶ','chơi'],
  ['む','飲む','のむ','uống'],
  ['る','帰る','かえる','trở về'],
].map(([ending,jp,kana,vi]) => [['Nhóm I',ending],{jp,kana,vi,group:'I'}]);

const VERBS = [
  ...GODAN,
  [['Nhóm II','る'],{jp:'食べる',kana:'たべる',vi:'ăn',group:'II'}],
  [['Nhóm II','る'],{jp:'借りる',kana:'かりる',vi:'mượn',group:'II'}],
  [['Nhóm III','する'],{jp:'する',kana:'する',vi:'làm',group:'III'}],
  [['Nhóm III','来る'],{jp:'来る',kana:'くる',vi:'đến',group:'III'}],
];
const I_ADJECTIVES = [
  {jp:'高い',kana:'たかい',vi:'cao',group:'i'},
  {jp:'いい',kana:'いい',vi:'tốt',group:'i'},
];
const NA_ADJECTIVES = [
  {jp:'静か',kana:'しずか',vi:'yên tĩnh',group:'na'},
  {jp:'きれい',kana:'きれい',vi:'đẹp, sạch',group:'na'},
];
const EXCEPTIONS = {
  iku:[['Nhóm I','行く'],{jp:'行く',kana:'いく',vi:'đi',group:'I'}],
  aru:[['Nhóm I','ある'],{jp:'ある',kana:'ある',vi:'có',group:'I'}],
  honorific:[['Nhóm I','くださる'],{jp:'くださる',kana:'くださる',vi:'cho (kính ngữ)',group:'I'}],
};
const LEXICAL_FORMS = new WeakMap();

function resolve(lemma,key) {
  if (!LEXICAL_FORMS.has(lemma)) LEXICAL_FORMS.set(lemma, generateForms(lemma));
  return LEXICAL_FORMS.get(lemma).get(key);
}

const VERB_LABELS = {
  dictionary:'Từ ～ます về thể từ điển',
  stem:'Thân trước ～ます',
  masu:'Thể ～ます',
  mashita:'Thể ～ました',
  masen:'Thể ～ません',
  masenPast:'Thể ～ませんでした',
  te:'Thể ～て／～で',
  past:'Thể ～た／～だ',
  negative:'Thể ～ない',
  negativePast:'Thể ～なかった',
  potential:'Thể khả năng',
  passive:'Thể bị động',
  causative:'Thể sai khiến',
  causativePassive:'Thể sai khiến bị động',
  volitional:'Thể ý chí',
  ba:'Thể điều kiện ～ば',
  imperative:'Thể mệnh lệnh',
};

const FOUNDATION = {
  before:'dictionary', potentialKoto:'dictionary', potentialKotoPolite:'dictionary',
  desire:'stem', simultaneous:'stem', invite:'stem', propose:'stem',
  afterTe:'te', progressive:'te', progressivePolite:'te', permit:'te', permitQuestion:'te', permitPolite:'te',
  request:'te', prohibition:'te', prohibitionPolite:'te',
  after:'past', experience:'past', experiencePolite:'past', justPast:'past', tara:'past',
  negativeBa:'negative', negativeNakya:'negative', duty:'negative', dutyPolite:'negative',
  dutyNakya:'negative', dutyNaito:'negative', negativeRequest:'negative', optional:'negative', optionalPolite:'negative',
  potentialNegative:'potential',
};
const COMPOSE = {
  before:'Sau thể từ điển, thêm 前に. Với danh từ, dùng Nの前に.',
  potentialKoto:'Giữ thể từ điển rồi thêm ことができる. Dạng lịch sự là ことができます.',
  potentialKotoPolite:'Giữ thể từ điển rồi thêm ことができます.',
  desire:'Thêm たい vào thân. Chia phần たい như tính từ い, chẳng hạn たくない.',
  simultaneous:'Thêm ながら sau thân. Hành động chính đứng ở vế sau.',
  invite:'Thêm ませんか sau thân để hỏi người nghe có muốn cùng làm.',
  propose:'Thêm ましょうか sau thân để đề nghị hoặc hỏi ý.',
  afterTe:'Giữ nguyên thể て／で rồi thêm から.',
  progressive:'Giữ nguyên thể て／で rồi thêm いる.',
  progressivePolite:'Giữ nguyên thể て／で rồi thêm います. Khi nói thường dùng いる.',
  permit:'Giữ nguyên thể て／で rồi thêm もいい.',
  permitQuestion:'Giữ nguyên thể て／で rồi thêm もいいですか.',
  permitPolite:'Giữ nguyên thể て／で rồi thêm もいいです.',
  request:'Giữ nguyên thể て／で rồi thêm ください.',
  prohibition:'Giữ nguyên thể て／で rồi thêm はいけない. Trợ từ は đọc wa.',
  prohibitionPolite:'Giữ nguyên thể て／で rồi thêm はいけません. Trợ từ は đọc wa.',
  after:'Sau thể た／だ, thêm 後で. Với danh từ, dùng Nの後で.',
  experience:'Sau thể た／だ, thêm ことがある.',
  experiencePolite:'Sau thể た／だ, thêm ことがあります.',
  justPast:'Sau thể た／だ, thêm ばかり. Dạng lịch sự thường kết thúc bằng です.',
  tara:'Thêm ら sau thể た／だ. Tính từ い dùng ～かったら, tính từ な và danh từ dùng ～だったら.',
  negativeBa:'Đổi ない thành なければ trước vế kết quả.',
  negativeNakya:'Rút gọn なければ thành なきゃ trong hội thoại.',
  duty:'Đổi ない thành なければ rồi thêm ならない.',
  dutyPolite:'Đổi ない thành なければ rồi thêm なりません.',
  dutyNakya:'Đổi ない thành なきゃ rồi thêm いけない trong hội thoại.',
  dutyNaito:'Giữ ない rồi thêm といけません.',
  negativeRequest:'Giữ ない rồi thêm でください.',
  optional:'Đổi ない thành なくて rồi thêm もいい.',
  optionalPolite:'Đổi ない thành なくて rồi thêm もいいです.',
  potentialNegative:'Các dạng khả năng trong bảng đều kết thúc bằng る và tiếp tục chia kiểu nhóm II. Bỏ る rồi thêm ない hoặc ます.',
};
const TE_COMPOUNDS = {
  g13b_6:'Giữ nguyên thể て／で rồi thêm くれますか.',
  g13b_7:'Giữ nguyên thể て／で rồi thêm くれませんか hoặc くださいませんか.',
  g13c_9:'Giữ nguyên thể て／で rồi thêm くれる hoặc くださる.',
  g13c_11:'Giữ nguyên thể て／で rồi thêm あげる.',
};
const STEM_COMPOUNDS = {
  g7d_7:'Gắn に sau thân rồi thêm động từ di chuyển.',
  g7d_9:'Gắn 方（かた）sau thân. Với danh động từ như 勉強する, thường dùng 勉強の仕方.',
};
const REVERSE_FORMS = {
  g9b_5:['masen','Từ ～ません về thể ～ない'],
  g9c_8:['mashita','Từ ～ました về thể ～た／～だ'],
  g10a_1:['mashou','Từ ～ましょう về thể ý chí'],
};
const I_LABELS = {
  dictionary:['Trước danh từ','Giữ い cuối trước danh từ.'],
  adjPolite:['Vị ngữ lịch sự','Giữ い, thêm です.'],
  adjNeg:['Phủ định','Đổi い thành くない.'],
  adjNegPolite:['Phủ định lịch sự','Đổi い thành くない, thêm です.'],
  adjNegFormal:['Phủ định trang trọng','Đổi い thành くありません.'],
  adjPast:['Quá khứ','Đổi い thành かった.'],
  adjPastPolite:['Quá khứ lịch sự','Đổi い thành かった, thêm です.'],
  adjNegPast:['Quá khứ phủ định','Đổi い thành くなかった.'],
  adjNegPastPolite:['Quá khứ phủ định lịch sự','Đổi い thành くなかった, thêm です.'],
  adjNegPastFormal:['Quá khứ phủ định trang trọng','Đổi い thành くありませんでした.'],
  adjConnect:['Nối tính từ','Đổi い thành くて.'],
  adjIf:['Điều kiện','Đổi い thành ければ.'],
};
const NA_LABELS = {
  attributive:['Trước danh từ','Thêm な trước danh từ.'],
  copula:['Vị ngữ thường','Thêm だ sau thân.'],
  adjPolite:['Vị ngữ lịch sự','Thêm です sau thân.'],
  adjNeg:['Phủ định','Thêm ではない sau thân.'],
  adjNegAlt:['Phủ định hội thoại','Thêm じゃない sau thân.'],
  adjNegPolite:['Phủ định lịch sự','Thêm ではないです sau thân.'],
  adjNegFormal:['Phủ định trang trọng','Thêm ではありません sau thân.'],
  adjPast:['Quá khứ','Thêm だった sau thân.'],
  adjPastPolite:['Quá khứ lịch sự','Thêm でした sau thân.'],
  adjNegPast:['Quá khứ phủ định','Thêm ではなかった sau thân.'],
  adjNegPastAlt:['Quá khứ phủ định hội thoại','Thêm じゃなかった sau thân.'],
  adjNegPastPolite:['Quá khứ phủ định lịch sự','Thêm ではなかったです sau thân.'],
  adjNegPastFormal:['Quá khứ phủ định trang trọng','Thêm ではありませんでした sau thân.'],
  adjConnect:['Nối tính từ','Thêm で sau thân.'],
  adverb:['Bổ nghĩa hành động','Thêm に sau thân.'],
  adjIf:['Điều kiện','Thêm なら sau thân.'],
};
const NA_CHAPTERS = new Set(['g3a_3','g3a_4','g3b_7','g3c_11','g4a_3','g4a_3_2','g4a_4','g4a_5','g14c_8','adj-na']);
const ADJECTIVE_FAMILIES = {
  g3a_2:['adjNeg','adjNegPolite','adjNegFormal'],
  g3a_4:['adjNegAlt','adjNegPolite','adjNegFormal'],
  g3c_10:['adjPastPolite','adjNegPastPolite','adjNegPastFormal'],
  g3c_11:['adjPastPolite','adjNegPastAlt','adjNegPastPolite','adjNegPastFormal'],
  g4a_5:['adjNegAlt','adjNegPastAlt'],
  g4b_10:['adjNeg','adjNegPast'],
};

function changes(from,to) {
  let common = 0;
  while (common < from.length && from[common] === to[common]) common++;
  return [from.slice(common) || '∅',to.slice(common) || '∅'];
}

function verbTable(key, reversal) {
  const samples = [...VERBS];
  if (['te','past'].includes(key)) samples.push(EXCEPTIONS.iku);
  if (['negative','negativePast'].includes(key)) samples.push(EXCEPTIONS.aru);
  if (['dictionary','stem','masu','mashita','masen','masenPast'].includes(key)) samples.push(EXCEPTIONS.honorific);
  return {
    kind:'verb',
    title:reversal?.[1] || VERB_LABELS[key],
    rows:samples.map(([label,lemma]) => {
      const from = resolve(lemma,reversal?.[0] || (key === 'dictionary' ? 'masu' : 'dictionary'));
      const to = resolve(lemma,key);
      return {label,from,to,change:changes(from.kana,to.kana)};
    }),
    notes:key === 'dictionary' ?
      ['Bỏ ます rồi khôi phục theo nhóm. Nhóm I đổi hàng い về hàng う, nhóm II thêm る, nhóm III khôi phục する hoặc 来る（くる）.',
       'Cần biết nhóm của từ trước. 帰ります → 帰る thuộc nhóm I, còn 借ります → 借りる thuộc nhóm II. Thân kính ngữ ください trở về くださる.'] :
      [
        reversal ? 'Khôi phục thể từ điển theo nhóm trước. Sau đó tạo dạng thường cần dùng.' :
          'Nhóm I đổi đuôi theo từng hàng. Nhóm II giữ thân trước る. Với nhóm III, học riêng する và 来る.',
        ...(key === 'causativePassive' ? ['Tạo thể sai khiến rồi đổi る thành られる. Trong hội thoại, 書かせられる có thể rút thành 書かされる. Dạng nhóm I đuôi す giữ ～せられる.'] : []),
      ],
  };
}

function adjectiveTable(group,keys) {
  const na = group === 'na';
  const labels = na ? NA_LABELS : I_LABELS;
  const samples = na ? NA_ADJECTIVES : I_ADJECTIVES;
  const rows = (keys || Object.keys(labels)).map(key => {
    const [label,rule] = labels[key];
    return {label,rule,forms:samples.map(lemma => resolve(lemma,key))};
  });
  return {
    kind:'adjective',title:na ? 'Các dạng của tính từ な' : 'Các dạng của tính từ い',
    samples,rows,
    notes:na ? ['Chọn nhóm theo mục từ. きれい và きらい thuộc nhóm な dù kết thúc bằng い.'] :
      ['Với いい, giữ いいです ở dạng lịch sự phi quá khứ. Các dạng biến đổi dùng thân よ, như よくない và よかった.'],
  };
}

export function formationFor(id,target) {
  if (id === 'adj-i') return {tables:[adjectiveTable('i')]};
  if (id === 'adj-na') return {tables:[adjectiveTable('na')]};
  if (id === 'g3a_5') return {
    tables:[adjectiveTable('i',['adjPolite']),adjectiveTable('na',['adjPolite'])],
    composition:'Thêm か vào cuối câu lịch sự để hỏi về tính chất.',
  };
  if (id === 'g3c_12') return {
    tables:[adjectiveTable('i',['dictionary']),adjectiveTable('na',['attributive'])],
    composition:'Đặt danh từ sau tính từ. Chẳng hạn 高い山 và 静かな町.',
  };
  if (target?.startsWith('adj')) return {
    tables:[adjectiveTable(NA_CHAPTERS.has(id) ? 'na' : 'i',ADJECTIVE_FAMILIES[id] || [target])],
  };
  const base = FOUNDATION[target] || target;
  if (!VERB_LABELS[base]) return null;
  const tables = [verbTable(base,REVERSE_FORMS[id])];
  if (id === 'masu') tables.push(verbTable('mashita'));
  if (id === 'g6a_1') tables.unshift(verbTable('masu'));
  if (id === 'g6a_5') tables.unshift(verbTable('masen'));
  if (id === 'g9c_9') tables.unshift(verbTable('past'));
  if (['ba','g11a_1'].includes(id)) tables.push(adjectiveTable('i',['adjIf']));
  if (id === 'tara') tables.push(adjectiveTable('i',['adjPast','adjNegPast']),adjectiveTable('na',['adjPast','adjNegPast']));
  return {tables,composition:id === 'g11a_2' ? 'Sau V ở thể ば, thêm いいですか để hỏi nên chọn phương án nào.' :
    TE_COMPOUNDS[id] || STEM_COMPOUNDS[id] || COMPOSE[target]};
}
