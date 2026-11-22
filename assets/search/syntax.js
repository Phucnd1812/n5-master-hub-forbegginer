const NOUN = /^(?:Danh từ|Đại từ|Số)/i;
const COPULA = /^(?:です|でした|だ|だった|ではありません(?:でした)?|じゃな(?:い|かった))$/;
const SEPARATOR_BOUNDARY = /[、,。．！？!?]/;
const TIME_WORD = /^(?:今朝|昨日|今日|明日|毎日|毎朝|毎晩|今夜|先週|来週|去年|来年|今月)$/;
const CASE_PARTICLES = new Set(['は','が','を','に','へ','で','と','も','から','まで','までに','より']);
const DEPENDENT_FORMS = {
  afterTe:'Hành động trước', simultaneous:'Hành động đồng thời', before:'Mốc trước', after:'Mốc sau',
  negativeDe:'Hành động được bỏ qua', negativeTe:'Vế phủ định nối tiếp', te:'Vế nối thể て',
  ba:'Điều kiện', negativeBa:'Điều kiện phủ định', negativeNakya:'Điều kiện hoặc nghĩa vụ rút gọn', tara:'Điều kiện',
};
const PARTICLE_LABELS = {
  は:'Chủ đề', に:'Bổ ngữ với に', へ:'Hướng', で:'Bổ ngữ với で', と:'Cụm với と', も:'Thành phần được thêm',
  から:'Mốc bắt đầu hoặc lý do', まで:'Mốc kết thúc', までに:'Hạn cuối', より:'Mốc so sánh hoặc điểm xuất phát',
};

export function isPredicate(part) {
  if (!part) return false;
  if (part.kind === 'function') return COPULA.test(part.jp);
  return Boolean(part.lemma?.group && !['attributive','adverb'].includes(part.form?.key));
}

function isNominal(part) {
  return part?.kind === 'word' && !part.form && NOUN.test(part.pos || '');
}

function phraseRole(particle) {
  if (particle.jp === 'が') {
    return particle.role.includes('sở thích') ? {label:'Đối tượng của sở thích hoặc khả năng'} :
      {label:'Thành phần với が', tentative:true};
  }
  if (particle.jp === 'を') {
    return particle.role.includes('đi qua') ? {label:'Đường đi hoặc nơi rời khỏi', tentative:true} : {label:'Tân ngữ'};
  }
  if (particle.jp === 'に' && particle.role.includes('thời gian')) return {label:'Mốc thời gian'};
  if (particle.jp === 'に' && particle.role.includes('đích')) return {label:'Đích đến'};
  if (particle.jp === 'に' && particle.role.includes('tồn tại')) return {label:'Vị trí tồn tại', tentative:true};
  if (particle.jp === 'で' && particle.role.includes('phương tiện được')) return {label:'Phương tiện'};
  if (particle.jp === 'で' && particle.role.includes('hành động diễn ra')) return {label:'Nơi thực hiện'};
  if (particle.jp === 'と' && particle.role.includes('cùng thực hiện')) return {label:'Người cùng thực hiện', tentative:true};
  return {label:PARTICLE_LABELS[particle.jp], tentative:['に','で','と','から','より'].includes(particle.jp)};
}

export function collectPhrases(parts) {
  const phrases = [];
  const sentenceParts = parts.map((part,index) => ({part,index})).filter(({part}) =>
    part.kind !== 'punct' || SEPARATOR_BOUNDARY.test(part.text));
  let pending = [];
  const push = (label, indices, tentative = false) => {
    if (indices.length) phrases.push({label, indices, tentative});
  };
  const flush = () => {
    if (pending.length) push('Cụm chưa xác định vai trò', pending, true);
    pending = [];
  };

  for (const [offset,{part,index}] of sentenceParts.entries()) {
    const previous = sentenceParts[offset - 1]?.part;
    const next = sentenceParts[offset + 1]?.part;
    if (part.kind === 'punct') { flush(); continue; }
    if (part.kind === 'unknown') {
      flush();
      push('Chưa nhận diện', [index], true);
      continue;
    }
    if (part.form?.key === 'te' && next?.grammar === 'compare:state' && next.lemma?.kana === 'ある') {
      pending.push(index);
      continue;
    }
    pending.push(index);
    if (part.kind === 'word' && TIME_WORD.test(part.jp) && !CASE_PARTICLES.has(next?.jp) && next?.jp !== 'の') {
      push('Mốc thời gian', pending);
      pending = [];
      continue;
    }
    if (part.kind === 'function' && part.jp === 'の' && isNominal(previous) && isNominal(next)) {
      push('Bổ nghĩa cho danh từ sau の', pending.slice(-2));
      continue;
    }
    if (part.kind === 'function' && CASE_PARTICLES.has(part.jp) && isNominal(previous)) {
      const {label,tentative} = phraseRole(part);
      push(label, pending, tentative);
      pending = [];
      continue;
    }
    if (!isPredicate(part)) continue;
    const dependent = DEPENDENT_FORMS[part.form?.key];
    if (!dependent && isNominal(next) && part.kind === 'word') {
      push('Có thể bổ nghĩa cho danh từ sau', pending, true);
    } else if (dependent) {
      push(dependent, pending);
    } else {
      push('Vị ngữ', pending, pending.length > 1 && part.kind !== 'function');
    }
    pending = [];
  }

  flush();
  // Only promote が to a probable subject when there is a predicate in the
  // same unbroken clause and the sentence has no stronger interpretation.
  for (const phrase of phrases) {
    if (phrase.label !== 'Thành phần với が') continue;
    const next = parts.slice(phrase.indices.at(-1) + 1).find(part =>
      part.kind === 'unknown' || part.kind === 'punct' && SEPARATOR_BOUNDARY.test(part.text) || isPredicate(part));
    if (isPredicate(next) && !next.alternatives?.some(option => option.form?.grammar !== next.form?.grammar)) {
      phrase.label = 'Chủ thể có thể có';
    }
  }
  return phrases;
}
