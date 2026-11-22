import {describeForm} from '../search/morphology.js';
import {HAS_HAN,HAS_JAPANESE,hiragana} from '../search/text.js';

export const CHECKER_LIMIT = 240;
const MAX_ISSUES = 8;
const GROUP_NAMES = {I:'động từ nhóm I', II:'động từ nhóm II', III:'động từ nhóm III', i:'tính từ い', na:'tính từ な'};
const INDEXES = new WeakMap();
const BREAK = /^[\s、，,。．.!?！？；;：:…）)」』】\]]/u;
const CONNECTOR = /^(?:から|ので|のに|けれども|けれど|けど|が|し)(?=[\s、，,。．.!?！？]|[\p{Script=Han}\p{Script=Hiragana}])/u;
const FINAL_PARTICLE = /^(?:よね|よ|ね|か|な|ぞ|さ)(?=$|[\s。．.!?！？…）)」』])/u;
const JOINING_FORMS = new Set(['te','adjConnect','afterTe','ba','tara','negativeBa']);
const QUOTES = new Map([['「','」'],['『','』'],['“','”'],['(',')'],['【','】']]);
const POS_NOMINAL = /^(?:Danh từ|Đại từ|Số từ|Phó từ chỉ nơi)/iu;
const DESTINATION = /^(?:学校|小学校|大学|駅|図書館|教室|公園|家|銀行|病院|店|本屋|郵便局|日本|東京|京都|スーパー|コンビニ)$/u;
const MOVEMENT = /^(?:行く|ゆく|いく|来る|くる|帰る|かえる|戻る|向かう)$/u;

const EXAMPLES = {
  masu:['毎朝、七時に起きます。','Sáng nào tôi cũng dậy lúc bảy giờ.'],
  nai:['今日は外に出かけない。','Hôm nay tôi không ra ngoài.'],
  ta:['昨日、この本を読んだ。','Hôm qua tôi đọc cuốn sách này.'],
  te:['顔を洗って、朝ご飯を食べます。','Tôi rửa mặt rồi ăn sáng.'],
  'te-kara':['手を洗ってから、料理します。','Tôi rửa tay rồi mới nấu ăn.'],
  request:['この名前を読んでください。','Xin hãy đọc tên này.'],
  'negative-request':['ここで写真を撮らないでください。','Xin đừng chụp ảnh ở đây.'],
  experience:['富士山に登ったことがあります。','Tôi đã từng leo núi Phú Sĩ.'],
  tara:['時間があったら、図書館に行きます。','Nếu có thời gian, tôi sẽ đến thư viện.'],
  'compare:condition':['家に帰ったら、連絡してください。','Khi về tới nhà, hãy liên lạc với tôi.'],
  ba:['早く寝れば、朝は楽です。','Nếu ngủ sớm, buổi sáng sẽ dễ chịu.'],
  obligation:['明日は早く起きなければなりません。','Ngày mai tôi phải dậy sớm.'],
  'adj-i':['昨日はあまり寒くなかったです。','Hôm qua trời không lạnh lắm.'],
  'adj-na':['昨日は図書館が静かでした。','Hôm qua thư viện yên tĩnh.'],
  'g14a_2':['水しか飲みません。','Tôi chỉ uống nước.'],
  topic:['私は学生です。','Tôi là sinh viên.'],
  'compare:ni-de':['図書館に行きます。図書館で勉強します。','Tôi đến thư viện. Tôi học ở thư viện.'],
};

const STYLE = {
  polite:'Dùng thân trước ます để ghép đuôi lịch sự. Chọn đuôi theo phủ định và thời điểm.',
  plain:'Dạng thường có quy tắc đổi âm cuối theo nhóm. Chọn thể ない cho phủ định, thể た cho quá khứ hoặc thể て để nối.',
  group:'Xác định nhóm từ trong từ điển, rồi đổi đuôi theo nhóm đó.',
  iku:'行く là ngoại lệ ở thể て và た. Âm cuối chuyển thành って hoặc った.',
  request:'Lời yêu cầu khẳng định dùng thể て + ください.',
  negativeRequest:'Yêu cầu phủ định giữ dạng ない rồi thêm でください.',
  after:'Mẫu trình tự dùng thể て + から để biểu thị làm việc này trước.',
  experience:'Mẫu nói về kinh nghiệm dùng thể た + ことがある.',
  tara:'Tạo ～たら từ thể た hoặc だ trong dạng quá khứ rồi thêm ら.',
  ba:'Dùng dạng điều kiện ～ば. Nhóm I đổi âm cuối sang hàng え rồi thêm ば, nhóm II đổi る thành れば.',
  negativeBa:'Thể điều kiện phủ định thay ない bằng なければ. Các mẫu nghĩa vụ có thể nối thêm ならない hoặc なりません.',
  adjI:'Đổi đuôi い theo dạng cần dùng. Với いい／よい, dùng thân よ khi đổi đuôi.',
  adjNa:'Dùng thân tính từ な với です, でした hoặc ではありません. Để nối vế, thêm で.',
};

function indexRef(ref, index) {
  const {lemma,forms} = ref;
  if (!lemma?.jp || !forms?.has('dictionary')) return;
  const {valid,errors,byLemma} = index;
  byLemma.set(lemmaKey(lemma),ref);
  for (const form of forms.values()) {
    for (const text of [form.jp,form.kana]) if (text) valid.add(hiragana(text));
  }
  for (const spelling of [lemma.jp,lemma.kana,...(lemma.aliases || [])]) if (spelling) valid.add(hiragana(spelling));
  if (!GROUP_NAMES[lemma.group]) return;

  for (const script of ['jp','kana']) {
    const form = key => forms.get(key)?.[script] || '';
    const root = form('dictionary');
    if (!root || (script === 'kana' && root === lemma.jp)) continue;
    const add = (wrong, key, style) => {
      const replacement = form(key);
      const normalized = hiragana(wrong);
      if (!wrong || !replacement || normalized === hiragana(replacement) ||
          (normalized.length < 3 && !HAS_HAN.test(normalized))) return;
      const candidate = {replacement,key,style,ref};
      if (!errors.has(normalized)) errors.set(normalized,[candidate]);
      else errors.get(normalized).push(candidate);
    };
    if (lemma.group === 'i') {
      for (const [ending,key] of [['くない','adjNeg'],['かった','adjPast'],['くなかった','adjNegPast'],['くて','adjConnect'],['でした','adjPastPolite']]) {
        add(root + ending,key,'adjI');
      }
      for (const [ending,key] of [['くないです','adjNegPolite'],['かったです','adjPastPolite'],['くなかったです','adjNegPastPolite']]) {
        add(root + ending,key,'adjI');
      }
      add(form('adjNeg') + 'でした','adjNegPastPolite','adjI');
      if (/^(?:いい|よい|良い)$/.test(root)) {
        for (const [ending,key] of [['くない','adjNeg'],['かった','adjPast'],['くなかった','adjNegPast']]) {
          add(root.slice(0,-1) + ending,key,'adjI');
        }
      }
      continue;
    }
    if (lemma.group === 'na') {
      for (const [ending,key] of [['くない','adjNeg'],['かった','adjPast'],['くなかった','adjNegPast'],['くて','adjConnect'],['なです','adjPolite'],['なでした','adjPastPolite']]) {
        add(root + ending,key,'adjNa');
      }
      for (const [ending,key] of [['くないです','adjNegPolite'],['かったです','adjPastPolite'],['くなかったです','adjNegPastPolite']]) {
        add(root + ending,key,'adjNa');
      }
      continue;
    }
    if (!form('stem')) continue;
    for (const [ending,key] of [['ます','masu'],['ません','masen'],['ました','mashita'],['ませんでした','masenPast']]) {
      add(root + ending,key,'polite');
    }
    for (const [ending,key] of [['ない','negative'],['なかった','negativePast'],['て','te'],['た','past']]) add(root + ending,key,'plain');
    for (const [ending,key,style] of [
      ['てください','request','request'], ['ください','request','request'], ['てから','afterTe','after'],
      ['たことがある','experience','experience'], ['たことがあります','experiencePolite','experience'],
      ['たら','tara','tara'], ['ば','ba','ba'],
    ]) add(root + ending,key,style);

    add(form('negativeTe') + 'ください','negativeRequest','negativeRequest');
    add(form('negative') + 'ければ','negativeBa','negativeBa');
    add(form('negative') + 'ければなりません','dutyPolite','negativeBa');
    add(form('negative') + 'ければならない','duty','negativeBa');
    add(form('negative') + 'ます','masen','polite');
    add(form('negative') + 'ました','masenPast','polite');
    add(form('negativePast') + 'ました','masenPast','polite');
    add(form('past') + 'ます','mashita','polite');
    add(form('masu') + 'でした','mashita','polite');
    add(form('masen') + 'ました','masenPast','polite');
    if (lemma.group === 'I') {
      for (const [ending,key] of [['ない','negative'],['なかった','negativePast'],['て','te'],['た','past']]) {
        add(root.slice(0,-1) + ending,key,'group');
      }
      if (/^(?:行く|いく|ゆく)$/.test(root)) {
        for (const [ending,key] of [['いて','te'],['いた','past'],['いてください','request'],['いてから','afterTe']]) {
          add(root.slice(0,-1) + ending,key,'iku');
        }
      }
    }
    if (lemma.group === 'II') {
      for (const [ending,key] of [['らない','negative'],['らなかった','negativePast'],['った','past'],['って','te'],['ります','masu'],['りません','masen'],['りました','mashita']]) {
        add(root.slice(0,-1) + ending,key,'group');
      }
    }
  }
}

function lemmaKey({jp,kana,group}) {
  return [jp,kana,group].join('\0');
}

function getIndex(refs) {
  if (INDEXES.has(refs)) return INDEXES.get(refs);
  const index = {valid:new Set(),errors:new Map(),byLemma:new Map()};
  for (const ref of refs) indexRef(ref,index);
  index.lengths = [...new Set([...index.errors.keys()].map(key => key.length))].sort((a,b) => b - a);
  INDEXES.set(refs,index);
  return index;
}

// Preserve UTF-16 offsets for highlighting after NFKC and kana normalization.
// Dakuten/handakuten may be a separate code point in the user's original input.
function normalizeWithOffsets(original) {
  const offsets = new Map();
  let text = '';
  for (const match of original.matchAll(/.[\u3099\u309a\uff9e\uff9f]*/gsu)) {
    offsets.set(text.length,match.index);
    text += hiragana(match[0]);
  }
  offsets.set(text.length,original.length);
  return {text,offsets};
}

function quoteMask(text) {
  const masked = new Uint8Array(text.length);
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (QUOTES.has(char)) stack.push(QUOTES.get(char));
    if (stack.length) {
      masked[i] = 1;
      if (char === stack.at(-1)) stack.pop();
    }
  }
  return masked;
}

function mapParts(text, analysis) {
  if (!analysis?.parts) return [];
  let position = text.length - text.trimStart().length;
  const mapped = [];
  for (const part of analysis.parts) {
    const token = hiragana(part.text);
    if (!token || !text.startsWith(token,position)) return [];
    mapped.push({part,start:position,end:position + token.length});
    position += token.length;
  }
  return mapped;
}

function supportedBoundary(text, end, key, parts) {
  const following = text.slice(end);
  if (!following || BREAK.test(following) || FINAL_PARTICLE.test(following)) return true;
  if (CONNECTOR.test(following)) return parts.some(({start,part}) => start === end && part.kind === 'function');
  return JOINING_FORMS.has(key) && parts.some(({start,part}) => start === end && part.kind === 'word');
}

function makeIssue(original, offsets, start, end, details) {
  const from = offsets.get(start);
  const to = offsets.get(end);
  if (from === undefined || to === undefined || from >= to) return null;
  return {start:from,end:to,excerpt:original.slice(from,to),...details};
}

function toDetails(candidate, alternatives = []) {
  const {ref,key,replacement,style} = candidate;
  const form = describeForm(ref.lemma,ref.forms,key);
  const grammarId = form.grammar;
  const certainty = alternatives.length ? 'uncertain' : 'error';
  return {
    certainty,replacement,grammarId,
    title:alternatives.length ? 'Dạng này có nhiều từ gốc khả dĩ' : form.label,
    explanation:alternatives.length ? 'Cách viết hiện tại có thể nhắm đến nhiều từ. Chọn từ gốc theo ý định của câu.' :
      ref.lemma.jp + ' là ' + GROUP_NAMES[ref.lemma.group] + '. Dạng phù hợp với mẫu là ' + replacement + '.',
    rule:STYLE[style],steps:form.steps,example:EXAMPLES[grammarId],lemma:ref.lemma,form:key,
    alternatives:alternatives.map(option => ({replacement:option.replacement,lemma:option.ref.lemma.jp,form:option.key})),
  };
}

function collectMorphology(original, source, quoted, parts, index) {
  const {text,offsets} = source;
  const issues = [];
  for (let start = 0; start < text.length; start++) {
    if (quoted[start] || !offsets.has(start)) continue;
    const spanningWord = parts.find(span => span.start < start && span.end > start && span.part.kind === 'word');
    if (spanningWord) continue;
    for (const length of index.lengths) {
      const end = start + length;
      if (end > text.length || !offsets.has(end) || quoted[end - 1]) continue;
      const written = text.slice(start,end);
      const matches = index.errors.get(written);
      if (!matches || index.valid.has(written)) continue;
      const moreComplete = parts.find(span => span.start === start && span.end >= end && span.part.kind === 'word');
      if (moreComplete) continue;
      const candidates = matches.filter(candidate => supportedBoundary(text,end,candidate.key,parts));
      if (!candidates.length) continue;
      const byReplacement = new Map();
      for (const candidate of candidates) {
        if (!byReplacement.has(candidate.replacement)) byReplacement.set(candidate.replacement,candidate);
      }
      const [best,...alternatives] = byReplacement.values();
      const issue = makeIssue(original,offsets,start,end,toDetails(best,alternatives));
      if (!issue) continue;
      issues.push(issue);
      start = end - 1;
      break;
    }
    if (issues.length >= MAX_ISSUES) break;
  }
  return issues;
}

function displayForm(ref, key, originalPart) {
  const form = ref.forms.get(key);
  if (!form) return '';
  return HAS_HAN.test(originalPart) ? form.jp : form.kana;
}

function compareConditional(original, source, quoted, parts, index, i) {
  const previous = parts[i - 1];
  const connector = parts[i];
  if (!previous?.part.lemma || previous.end !== connector.start || quoted[previous.start] ||
      previous.part.form || !/^I{1,3}$/.test(previous.part.lemma.group) ||
      !/^\s*[、,]/u.test(source.text.slice(connector.end))) return null;
  // A form of request must finish the following clause. Quoted examples and
  // intermediate requests inside a longer sentence do not establish this use.
  const nextClause = parts.slice(i + 2);
  const boundary = nextClause.findIndex(({part}) => part.kind === 'punct' && /[、,。．.!?！？]/u.test(part.text));
  const request = (boundary < 0 ? nextClause : nextClause.slice(0,boundary)).findLast(({part}) => part.kind !== 'punct');
  if (!request || quoted[request.start] || !['request','negativeRequest'].includes(request.part.form?.key)) return null;
  const ref = index.byLemma.get(lemmaKey(previous.part.lemma));
  const replacement = ref && displayForm(ref,'tara',previous.part.text);
  if (!replacement) return null;
  return makeIssue(original,source.offsets,previous.start,connector.end,{
    ...toDetails({ref,key:'tara',replacement,style:'tara'}),
    certainty:'uncertain',grammarId:'compare:condition',title:'Xem lại điều kiện trước lời yêu cầu',
    explanation:'Nếu vế sau nhờ người nghe làm việc gì khi điều kiện xảy ra, ～たら thường phù hợp.',
    rule:'～と thường nêu hệ quả lặp lại hoặc tự nhiên. ～たら cũng dùng được để đặt điều kiện cho lời yêu cầu.',
    example:EXAMPLES['compare:condition'],
  });
}

function collectParticles(original, source, quoted, parts, index) {
  const issues = [];
  for (const [i,span] of parts.entries()) {
    const {part,start,end} = span;
    if (quoted[start] || part.kind !== 'function') continue;
    if (part.jp === 'と') {
      issues.push(compareConditional(original,source,quoted,parts,index,i));
      continue;
    }
    if (!['しか','で'].includes(part.jp)) continue;
    const before = parts[i - 1]?.part;
    const next = parts[i + 1];
    if (!next?.part.lemma || next.start !== end || quoted[next.start]) continue;
    if (part.jp === 'で' && DESTINATION.test(before?.jp || '') && MOVEMENT.test(next.part.lemma.jp)) {
      issues.push(makeIssue(original,source.offsets,start,end,{
        certainty:'uncertain',replacement:'に',grammarId:'compare:ni-de',
        title:'Xem lại trợ từ chỉ nơi đến',
        explanation:'Nếu ' + before.jp + ' là đích đến, に hoặc へ phù hợp. で có thể mang nghĩa khác khi ngữ cảnh nêu nơi thực hiện, phương tiện hoặc nhóm đi cùng.',
        rule:'に／へ đánh dấu đích hoặc hướng. で có thể đánh dấu nơi hay phương tiện thực hiện hành động.',
        example:EXAMPLES['compare:ni-de'],alternatives:[{replacement:'へ',lemma:'hướng di chuyển'}],
      }));
    }
    if (part.jp !== 'しか') continue;
    const noun = /^(?:に|へ|と|で)$/.test(before?.jp || '') ? parts[i - 2]?.part : before;
    if (noun?.kind !== 'word' || !POS_NOMINAL.test(noun.pos || '') || next.part.kind !== 'word') continue;
    const key = next.part.form?.key || 'dictionary';
    const negativeKey = {dictionary:'negative',past:'negativePast',masu:'masen',mashita:'masenPast'}[key];
    const after = source.text.slice(next.end);
    if (!negativeKey || after && !BREAK.test(after) && !FINAL_PARTICLE.test(after)) continue;
    const ref = index.byLemma.get(lemmaKey(next.part.lemma));
    const replacement = ref && displayForm(ref,negativeKey,next.part.text);
    if (!replacement) continue;
    const details = toDetails({ref,key:negativeKey,replacement,style:'plain'});
    issues.push(makeIssue(original,source.offsets,next.start,next.end,{
      ...details,grammarId:'g14a_2',title:'Vị ngữ của mẫu しか',
      explanation:'Khi しか có nghĩa “chỉ”, vị ngữ đi với phủ định. Nếu muốn giữ câu khẳng định, có thể dùng だけ.',
      rule:'Danh từ + しか + vị ngữ phủ định.',
      example:EXAMPLES.g14a_2,
    }));
  }
  return issues.filter(Boolean);
}

function collectSpelling(original, {text,offsets}, quoted) {
  const issues = [];
  for (const [pattern,replacement,certainty,explanation] of [
    [/(?:^|[\s。！!？?、,])(?<wrong>ありがとうごさいます)(?=$|[\s。！!？?、,])/gu,'ありがとうございます','error','Dạng chào chuẩn có âm đục ざ ở ございます.'],
    [/(?:^|[\s。！!？?、,])(?<wrong>おはよございます)(?=$|[\s。！!？?、,])/gu,'おはようございます','error','おはよう có う để kéo dài âm よ.'],
    [/(?:^|[\s。！!？?、,])(?<wrong>こんにちわ)(?=$|[\s。！!？?、,])/gu,'こんにちは','uncertain','Trong văn viết chuẩn, lời chào này kết thúc bằng は, đọc là wa.'],
    [/(?:^|[\s。！!？?、,])(?<wrong>こんばんわ)(?=$|[\s。！!？?、,])/gu,'こんばんは','uncertain','Trong văn viết chuẩn, lời chào này kết thúc bằng は, đọc là wa.'],
    [/(?:私|わたし|僕|ぼく|あなた)(?<wrong>わ)(?=(?:学生|がくせい|先生|せんせい|会社員|かいしゃいん)(?:です|でした|ではありません|じゃない))/gu,'は','error','Trợ từ nêu chủ đề được viết は và đọc là wa.'],
  ]) {
    for (const match of text.matchAll(pattern)) {
      const end = match.index + match[0].length;
      const start = end - match.groups.wrong.length;
      if (quoted[start]) continue;
      const topic = replacement === 'は';
      const issue = makeIssue(original,offsets,start,end,{
        certainty,replacement,title:topic ? 'Cách viết trợ từ は' : 'Cách viết lời chào',
        explanation,rule:topic ? 'Chủ đề + は (đọc wa) + phần nói về chủ đề.' : explanation,
        grammarId:topic ? 'topic' : '',
        example:topic ? EXAMPLES.topic : [replacement + '。','Cách viết dùng trong tiếng Nhật chuẩn.'],
        steps:[],alternatives:[],
      });
      if (issue) issues.push(issue);
    }
  }
  return issues;
}

function correctedText(original, issues) {
  const supported = issues.filter(issue => issue.certainty === 'error');
  if (!supported.length) return '';
  let offset = 0;
  let fixed = '';
  for (const issue of supported) {
    fixed += original.slice(offset,issue.start) + issue.replacement;
    offset = issue.end;
  }
  return fixed + original.slice(offset);
}

function hasPredicate(analysis) {
  return analysis?.parts.some(part => part.form && !['te','stem','afterTe','before','after','tara','ba','negativeBa','adverb','attributive'].includes(part.form.key) ||
    part.kind === 'word' && !part.form && Boolean(part.lemma?.group) ||
    part.kind === 'function' && /^(?:です|でした|だ|だった|ではありません|じゃない)$/.test(part.jp));
}

export function checkJapanese(input,{analyze,refs}) {
  const original = String(input ?? '');
  const trimmed = original.trim();
  if (!trimmed || !HAS_JAPANESE.test(trimmed) || original.length > CHECKER_LIMIT) {
    return {original,status:'insufficient',issues:[],corrected:'',coverage:null,
      note:'Nhập câu tiếng Nhật bằng Kanji hoặc Kana. Mỗi lượt kiểm tra tối đa ' + CHECKER_LIMIT + ' ký tự.'};
  }
  const source = normalizeWithOffsets(original);
  const quoted = quoteMask(source.text);
  const analysis = analyze(trimmed);
  const parts = mapParts(source.text,analysis);
  const index = getIndex(refs);
  const candidates = [
    ...collectMorphology(original,source,quoted,parts,index),
    ...collectSpelling(original,source,quoted),
    ...collectParticles(original,source,quoted,parts,index),
  ].sort((a,b) => a.start - b.start || b.end - a.end);
  const issues = [];
  for (const issue of candidates) {
    if (issue.start >= (issues.at(-1)?.end ?? 0)) issues.push(issue);
    if (issues.length === MAX_ISSUES) break;
  }
  const coverage = Number.isFinite(analysis?.coverage) ? analysis.coverage : null;
  const uncertain = coverage !== 1 || !hasPredicate(analysis);
  const status = issues.some(issue => issue.certainty === 'error') ? 'error' :
    issues.length ? 'uncertain' : uncertain ? 'insufficient' : 'clean';
  const note = status === 'insufficient' ? 'Câu có đoạn ngoài kho hoặc thiếu ngữ cảnh để áp dụng các quy tắc hiện có.' :
    status === 'uncertain' ? 'Các gợi ý cần đối chiếu với ngữ cảnh. Bạn có thể tra câu hoặc mở bài liên quan.' :
    status === 'error' ? 'Gợi ý sửa dựa trên các quy tắc đã khớp. Kiểm tra lại cả câu theo ý định ban đầu.' :
    'Các quy tắc hiện có chưa phát hiện lỗi. Độ tự nhiên và ý nghĩa còn phụ thuộc ngữ cảnh.';
  return {original,status,issues,corrected:correctedText(original,issues),coverage,note};
}
