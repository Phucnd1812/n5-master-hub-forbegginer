import {COURSE} from '../grammar/course.js';
import {COMPARISONS} from '../grammar/comparisons.js';
import {EXTENSIONS} from '../grammar/extensions.js';
import {GRAMMAR_GUIDES} from '../search/grammar-data.js';
import {describeForm,generateForms} from '../search/morphology.js';
import {HAS_JAPANESE,IS_KANA} from '../search/text.js';
import {BUILDER_EXERCISES,BUILDER_KINDS,BUILDER_LEVELS} from './builder-data.js';

const GROUPS = {
  I:'động từ nhóm I', II:'động từ nhóm II', III:'động từ nhóm III',
  i:'tính từ い', na:'tính từ な',
};
const PRACTICE_FORMS = [
  'te','negative','past','masu','masenPast','negativePast',
  'afterTe','potential','progressivePolite','dutyPolite','request',
  'adjNeg','adjPast','adjNegPast','adjPolite','adjPastPolite','adjNegFormal','attributive',
];
const OPEN_KINDS = new Set(['translate','free','combined']);
const FORM_LABELS = {
  dictionary:'Thể từ điển', te:'Thể て', negative:'Thể ない', past:'Thể た',
  masu:'Thể lịch sự ます', masenPast:'Lịch sự phủ định quá khứ',
  negativePast:'Thể なかった', afterTe:'Trình tự ～てから', potential:'Thể khả năng',
  progressivePolite:'Tiếp diễn ～ています', dutyPolite:'Nghĩa vụ lịch sự', request:'Yêu cầu ～てください',
  adjNeg:'Tính từ phủ định', adjPast:'Tính từ quá khứ', adjNegPast:'Tính từ phủ định quá khứ',
  adjPolite:'Tính từ lịch sự', adjPastPolite:'Tính từ lịch sự quá khứ',
  adjNegFormal:'Tính từ phủ định lịch sự', attributive:'Bổ nghĩa danh từ',
  desirePolite:'Mong muốn ～たいです', simultaneous:'Đồng thời ～ながら',
  permitQuestion:'Xin phép ～てもいいですか', negativeRequest:'Yêu cầu ～ないでください',
  negativeTe:'Dạng nối phủ định ～なくて', tara:'Điều kiện ～たら',
};
const EXAMPLES = [
  ['conjugate-iku',{jp:'行く',kana:'いく',group:'I',vi:'đi'},'te','basic','g12a_1',
    '行く là ngoại lệ của đuôi く. Dùng 行って.'],
  ['conjugate-kau',{jp:'買う',kana:'かう',group:'I',vi:'mua'},'negative','basic','g9b_5',
    'Đuôi う đổi thành わ trước ない. Tránh 買あない.'],
  ['conjugate-kuru',{jp:'来る',kana:'くる',group:'III',vi:'đến'},'past','applied','g9c_8',
    'Thể た của 来る đọc là きた. Dạng こ là âm trong 来ない（こない）.'],
  ['conjugate-benri',{jp:'便利',kana:'べんり',group:'na',vi:'tiện lợi'},'adjNegFormal','applied','g3a_4',
    '便利 là tính từ な. Ghép ではありません sau thân để nói phủ định lịch sự trang trọng.'],
  ['conjugate-ii',{jp:'いい',kana:'いい',group:'i',vi:'tốt'},'adjNegPast','challenge','g3c_10',
    'いい lấy thân よ trước くなかった. Tránh いくなかった.'],
];

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[char]);
const unique = items => [...new Set(items.filter(Boolean))];

const TOPICS = new Map();
for (const [id,title,formula,,related,rule,usage,common,examples] of [...COURSE,...EXTENSIONS]) {
  TOPICS.set(id,{title,formula,rule,usage,common,examples,related,course:[id]});
}
for (const guide of GRAMMAR_GUIDES) {
  TOPICS.set(guide.id,{title:guide.title, formula:guide.formula, rule:guide.principle,
    usage:guide.contexts, common:guide.mistakes, examples:guide.examples,
    related:guide.prerequisites, course:guide.course});
}
for (const [key,title,,related,commonGround,sides,distinction] of COMPARISONS) {
  TOPICS.set('compare:' + key,{title,formula:sides.map(side => side[0]).join(' ／ '),rule:distinction,
    usage:commonGround,common:distinction,examples:sides.map(side => side[2]),related,
    course:related.flatMap(id => TOPICS.get(id)?.course || [])});
}

function normalizeAnswer(value, sentence) {
  let answer = String(value ?? '').normalize('NFKC').replace(/\s+/g,'').replace(/[。.]+$/u,'');
  if (sentence) answer = answer.replace(/[、,]/g,'');
  return answer;
}

export function gradeBuilderAnswer(exercise, value) {
  const sentence = OPEN_KINDS.has(exercise.kind) || exercise.kind === 'order';
  const entered = normalizeAnswer(value,sentence);
  if (!entered) return 'empty';
  const match = exercise.answers.findIndex(answer => normalizeAnswer(answer,sentence) === entered);
  if (match >= 0) {
    const acceptsAlternative = sentence || Boolean(exercise.options);
    return match > 0 && acceptsAlternative ? 'alternate' : 'match';
  }
  // A missing match for an open response is not evidence of a grammar error.
  return OPEN_KINDS.has(exercise.kind) ? 'review' : 'mismatch';
}

function describeConjugation(lemma,forms,key) {
  if (key === 'dictionary') return null;
  const result = describeForm(lemma,forms,key);
  if (!result || !result.jp || !result.kana || result.steps.length < 2) return null;
  return result;
}

function conjugationCard(lemma,result,{id,level,topic,common} = {}) {
  const {key,label,jp,kana,steps,grammar} = result;
  const group = GROUPS[lemma.group];
  return {
    id:id || 'lemma-' + key, kind:'conjugation',
    level:level || (/^(?:te|negative|past|masu|adjNeg|adjPolite)$/.test(key) ? 'basic' : 'applied'),
    grammarIds:unique([topic,grammar,['i','na'].includes(lemma.group) ? '' : 'g9a_1']),
    form:key, formLabel:label,
    prompt:label + ' của ' + lemma.jp + ' là gì?',
    hint:lemma.jp + ' thuộc ' + group + '. Xem cách đổi đuôi theo nhóm.',
    answers:unique([jp,kana]), steps:steps.map(step => step.jp),
    parts:'Từ gốc ' + lemma.jp + ' thuộc ' + group + '. ' + label + ' dùng dạng ' + jp + '.',
    rule:steps.slice(1).map(step => step.rule).filter(Boolean).join(' '),
    common:common || 'Kiểm tra đúng nhóm của ' + lemma.jp + ' và quy tắc ở bước cuối. Hai động từ cùng đuôi có thể chia khác nhau.',
    lesson:lemma.lesson,
  };
}

export function buildWordDrills(lemma, requested) {
  if (!GROUPS[lemma?.group] || !HAS_JAPANESE.test(lemma.jp || '') || !IS_KANA.test(lemma.kana || '')) return [];
  // The source supplies the verified group. The drill never guesses from the spelling.
  const normalized = {...lemma,vi:String(lemma.vi ?? '')};
  const forms = generateForms(normalized);
  return unique([requested,...PRACTICE_FORMS]).flatMap(key => {
    const result = describeConjugation(normalized,forms,key);
    return result ? [conjugationCard(normalized,result)] : [];
  });
}

function topicDrills() {
  return [...TOPICS].flatMap(([id,topic]) => topic.examples.slice(0,id.startsWith('compare:') ? 2 : 1)
    .map(([jp,kana,vi,parts],index) => ({
      id:'topic-' + id + '-' + index, kind:'translate',
      level:id.startsWith('compare:') ? 'applied' : 'basic', grammarIds:[id],
      prompt:'Dịch “' + vi.replace(/[.!?。！？]+$/u,'') + '” theo mẫu đang học.',
      hint:topic.formula, answers:unique([jp,kana]), parts,
      rule:topic.rule, common:topic.common,
    })));
}

const BANK = [
  ...BUILDER_EXERCISES,
  ...EXAMPLES.map(([id,lemma,key,level,topic,common]) =>
    conjugationCard(lemma,describeConjugation(lemma,generateForms(lemma),key),{id,level,topic,common})),
  ...topicDrills(),
];

function syllabusLesson(id, lessonFor) {
  const fromApp = lessonFor?.(id);
  if (fromApp) return fromApp;
  const courseId = id.match(/^g(\d+)([a-z])_/i);
  return courseId ? 'Bài ' + courseId[1] + courseId[2].toUpperCase() : '';
}

export function builderExercises(context = {}, lessonFor) {
  const requested = typeof context.form === 'string' ? context.form : context.form?.key;
  return [...buildWordDrills(context.lemma,requested),...BANK].map(exercise => ({
    ...exercise,
    lessons: unique([
      exercise.lesson,
      ...exercise.grammarIds.flatMap(id => (TOPICS.get(id)?.course || [id]).map(course => syllabusLesson(course,lessonFor))),
    ]),
  }));
}

const MATCH_MESSAGES = {
  match:'Đúng theo yêu cầu của bài.',
  alternate:'Khớp một cách diễn đạt hợp lệ.',
  review:'Hãy tự đối chiếu cách dùng và ý nghĩa với lời giải. Bài này có thể có nhiều câu hợp lệ.',
  mismatch:'Phần điền hoặc thứ tự cụm chưa khớp yêu cầu của bài.',
};

function asOptions(entries, emptyLabel) {
  return '<option value="">' + esc(emptyLabel) + '</option>' +
    entries.map(([value,caption]) => '<option value="' + esc(value) + '">' + esc(caption) + '</option>').join('');
}

function optionsByType(exercises) {
  const lessons = unique(exercises.flatMap(exercise => exercise.lessons))
    .filter(lesson => /^Bài \d+[A-Z]$/i.test(lesson))
    .sort((a,b) => a.localeCompare(b,'vi',{numeric:true}));
  const grammar = unique(exercises.flatMap(exercise => exercise.grammarIds));
  const forms = unique(exercises.map(exercise => exercise.form));
  return [
    ['lesson','Bài giáo trình',lessons.map(lesson => [lesson,lesson])],
    ['grammar','Mẫu ngữ pháp',grammar.map(id => [id,TOPICS.get(id)?.title || id])],
    ['form','Dạng chia',forms.map(key => [key,FORM_LABELS[key] || exercises.find(exercise => exercise.form === key)?.formLabel || key])],
    ['level','Mức độ',Object.entries(BUILDER_LEVELS)],
    ['kind','Hoạt động',Object.entries(BUILDER_KINDS)],
  ];
}

function toolButton(action, label, attrs = '') {
  return '<button class="n5-lookup-chip" type="button" data-builder-action="' + action + '" ' + attrs + '>' +
    esc(label) + '</button>';
}

function answerLabel(exercise) {
  if (exercise.kind === 'order') return 'Thứ tự cụm đã chọn';
  if (exercise.kind === 'particle') return 'Trợ từ cần điền';
  if (OPEN_KINDS.has(exercise.kind)) return 'Câu tiếng Nhật của bạn';
  return 'Phần cần điền';
}

function solutionHtml(exercise, audioAvailable) {
  const [model,...alternates] = exercise.answers;
  const details = [
    ['Phân tích',exercise.parts], ['Quy tắc',exercise.rule], ['Lỗi thường gặp',exercise.common],
    ['Cách diễn đạt khác',exercise.alternative],
  ].filter(([,value]) => value).map(([term,value]) =>
    '<dt>' + esc(term) + '</dt><dd>' + esc(value) + '</dd>').join('');
  return `<details data-builder-solution>
    <summary>Xem lời giải</summary>
    <div class="n5-builder-solution">
      <p class="n5-builder-model" lang="ja">${esc(exercise.example || model)}</p>
      ${exercise.example ? '<p>Phần cần điền <strong lang="ja">' + esc(model) + '</strong></p>' : ''}
      ${alternates.length ? '<p>Cách viết hoặc đáp án khác <span lang="ja">' + alternates.map(esc).join(' ／ ') + '</span></p>' : ''}
      ${exercise.steps ? '<p class="n5-builder-chain" lang="ja">' + exercise.steps.map(esc).join(' → ') + '</p>' : ''}
      ${audioAvailable ? toolButton('audio','Nghe mẫu') : ''}
      <dl>${details}</dl>
    </div></details>`;
}

function answerHtml(exercise, draft, checkerAvailable) {
  if (exercise.options) {
    const choices = exercise.options.map(option =>
      `<label class="n5-builder-option"><input type="radio" name="builder-answer" value="${esc(option)}" ${option === draft.value ? 'checked' : ''}><span lang="ja">${esc(option)}</span></label>`).join('');
    return '<fieldset class="n5-builder-options"><legend>' + answerLabel(exercise) + '</legend>' + choices + '</fieldset>';
  }
  if (exercise.tiles) {
    return `<fieldset class="n5-builder-order"><legend>Sắp xếp từng cụm</legend>
      <div class="n5-builder-actions">
        ${exercise.tiles.map((tile,index) => toolButton('tile',tile,'lang="ja" data-builder-tile="' + index + '"')).join('')}
      </div>
      <p class="n5-builder-order-value" lang="ja" aria-label="${answerLabel(exercise)}" aria-live="polite" data-builder-order-text></p>
      <div class="n5-builder-actions">${toolButton('undo','Bỏ cụm cuối')}${toolButton('reset','Xếp lại')}</div>
    </fieldset>`;
  }
  const control = OPEN_KINDS.has(exercise.kind)
    ? '<textarea name="builder-answer" lang="ja" maxlength="320" rows="3" autocomplete="off" spellcheck="false">' + esc(draft.value) + '</textarea>'
    : '<input name="builder-answer" lang="ja" maxlength="160" value="' + esc(draft.value) + '" autocomplete="off" spellcheck="false">';
  return '<label class="n5-builder-field">' + answerLabel(exercise) + control + '</label>' +
    (OPEN_KINDS.has(exercise.kind) ? '<p class="n5-lookup-meta">Tự đối chiếu câu của bạn với lời giải và tình huống.</p>' : '') +
    (checkerAvailable && OPEN_KINDS.has(exercise.kind) ? toolButton('checker','Kiểm tra câu') : '');
}

export function mountSentenceBuilder(container, context = {}, hooks = {}) {
  const exercises = builderExercises(context,hooks.lessonFor);
  const root = container.ownerDocument.createElement('section');
  root.className = 'n5-builder';
  root.setAttribute('data-sentence-builder','');
  root.setAttribute('aria-label','Luyện đặt câu');
  const filterSpec = optionsByType(exercises);
  root.innerHTML = `<div class="n5-builder-filters" aria-label="Lọc bài luyện đặt câu" role="group">
    ${filterSpec.map(([key,label,items]) =>
      '<label class="n5-builder-field">' + label + '<select data-builder-filter="' + key + '">' +
      asOptions(items,'Tất cả') + '</select></label>').join('')}
    </div><p data-builder-count class="n5-lookup-meta" aria-live="polite"></p><div data-builder-card></div>
    <nav class="n5-builder-navigation" aria-label="Chuyển bài luyện đặt câu">${toolButton('prev','Bài trước')}${toolButton('next','Bài tiếp')}</nav>`;
  container.replaceChildren(root);
  const get = selector => root.querySelector(selector);
  const filters = [...root.querySelectorAll('[data-builder-filter]')];
  const cardHost = get('[data-builder-card]');
  const drafts = new Map();
  let composition = false;
  let current;
  let visible;
  let position = 0;

  const contextForm = typeof context.form === 'string' ? context.form : context.form?.key;
  const targetWord = exercises.find(exercise => exercise.id === 'lemma-' + contextForm) ||
    exercises.find(exercise => exercise.id.startsWith('lemma-'));
  if (targetWord) get('[data-builder-filter="kind"]').value = 'conjugation';
  if (context.lesson) get('[data-builder-filter="lesson"]').value = context.lesson;
  if (context.grammarId && !targetWord) get('[data-builder-filter="grammar"]').value = context.grammarId;
  if (contextForm && exercises.some(exercise => exercise.form === contextForm)) get('[data-builder-filter="form"]').value = contextForm;

  function state() {
    if (!drafts.has(current.id)) drafts.set(current.id,{value:'',chosen:[],result:'',saved:false});
    return drafts.get(current.id);
  }

  function refreshOrder() {
    if (!current?.tiles) return;
    const {chosen} = state();
    get('[data-builder-order-text]').textContent = chosen.map(index => current.tiles[index]).join(' ');
    for (const choice of root.querySelectorAll('[data-builder-tile]')) {
      choice.disabled = chosen.includes(Number(choice.dataset.builderTile));
    }
    for (const action of ['undo','reset']) get('[data-builder-action="' + action + '"]').disabled = !chosen.length;
    get('button[type="submit"]').disabled = chosen.length !== current.tiles.length;
  }

  function refreshFeedback() {
    const draft = state();
    const feedback = get('[data-builder-feedback]');
    feedback.dataset.result = draft.result;
    feedback.textContent = MATCH_MESSAGES[draft.result] || (draft.result === 'empty' ? 'Nhập hoặc chọn câu trả lời.' : '');
    const save = get('[data-builder-action="save"]');
    if (save) {
      save.hidden = draft.result !== 'mismatch';
      save.textContent = draft.saved ? 'Đã lưu vào Sổ tay câu sai' : 'Lưu vào Sổ tay câu sai';
      save.disabled = draft.saved || draft.saving;
    }
    const checker = get('[data-builder-action="checker"]');
    if (checker) checker.disabled = !HAS_JAPANESE.test(draft.value);
  }

  function present() {
    current = visible[position];
    get('[data-builder-count]').textContent = current ? 'Bài ' + (position + 1) + ' / ' + visible.length : 'Chưa có bài phù hợp với bộ lọc.';
    get('[data-builder-action="prev"]').disabled = !current || position === 0;
    get('[data-builder-action="next"]').disabled = !current || position >= visible.length - 1;
    if (!current) {
      cardHost.innerHTML = toolButton('clear','Đặt lại bộ lọc');
      return;
    }
    const draft = state();
    const contextNote = context.prompt ? '<p class="n5-lookup-meta">Câu đang luyện <span lang="ja">' + esc(context.prompt) + '</span></p>' : '';
    const related = current.grammarIds.filter(id => TOPICS.has(id));
    cardHost.innerHTML = `<article class="n5-builder-card" data-exercise="${esc(current.id)}">
      <p class="n5-lookup-meta">${esc(BUILDER_KINDS[current.kind])} · ${esc(BUILDER_LEVELS[current.level])}</p>
      ${contextNote}
      <h3 class="n5-builder-prompt">${esc(current.prompt)}</h3>
      <details><summary>Gợi ý</summary><p>${esc(current.hint)}</p></details>
      <form data-builder-answer novalidate>
        ${answerHtml(current,draft,Boolean(hooks.open))}
        <button type="submit" class="n5-lookup-chip">${OPEN_KINDS.has(current.kind) ? 'Đối chiếu câu' : 'Kiểm tra'}</button>
      </form>
      <p data-builder-feedback role="status"></p>
      ${hooks.mistake ? toolButton('save','Lưu vào Sổ tay câu sai','hidden') + '<p data-builder-save-status role="status"></p>' : ''}
      ${solutionHtml(current,Boolean(hooks.audio))}
      ${hooks.open && related.length ? '<div class="n5-builder-links"><h4>Bài học liên quan</h4><div class="n5-builder-actions">' +
          related.map(id => toolButton('grammar',TOPICS.get(id).title,'data-builder-id="' + esc(id) + '"')).join('') +
          '</div></div>' : ''}
      </article>`;
    if (draft.result && draft.result !== 'empty') get('[data-builder-solution]').open = true;
    refreshOrder();
    refreshFeedback();
  }

  function filter(initialId) {
    const selected = Object.fromEntries(filters.map(control => [control.dataset.builderFilter,control.value]));
    visible = exercises.filter(exercise =>
      (!selected.lesson || exercise.lessons.includes(selected.lesson)) &&
      (!selected.grammar || exercise.grammarIds.includes(selected.grammar)) &&
      (!selected.form || exercise.form === selected.form) &&
      (!selected.level || exercise.level === selected.level) &&
      (!selected.kind || exercise.kind === selected.kind));
    position = Math.max(0,visible.findIndex(exercise => exercise.id === initialId));
    present();
  }

  function answerChanged(value) {
    const draft = state();
    draft.value = value;
    draft.result = '';
    draft.saved = false;
    const message = get('[data-builder-save-status]');
    if (message) message.textContent = '';
    refreshFeedback();
  }

  root.addEventListener('compositionstart',() => { composition = true; });
  root.addEventListener('compositionend',() => { composition = false; });
  root.addEventListener('change',event => {
    if (event.target.matches('[data-builder-filter]')) {
      filter(current?.id);
    } else if (event.target.matches('input[type="radio"][name="builder-answer"]')) {
      answerChanged(event.target.value);
    }
  });
  root.addEventListener('input',event => {
    if (event.target.matches('[name="builder-answer"]:not([type="radio"])')) answerChanged(event.target.value);
  });
  root.addEventListener('submit',event => {
    if (!event.target.matches('[data-builder-answer]')) return;
    event.preventDefault();
    if (!current || composition) return;
    const draft = state();
    draft.result = gradeBuilderAnswer(current,draft.value);
    if (draft.result !== 'empty') get('[data-builder-solution]').open = true;
    refreshFeedback();
  });

  async function saveMistake() {
    const exercise = current;
    const draft = state();
    if (draft.result !== 'mismatch' || draft.saved || draft.saving || !hooks.mistake) return;
    const entered = draft.value;
    const id = exercise.grammarIds[0];
    if (!id) return;
    draft.saving = true;
    refreshFeedback();
    let saved = false;
    try {
      saved = await hooks.mistake({
        id, prompt:exercise.prompt, answer:exercise.answers[0], entered,
        why:exercise.rule, source:'sentence-builder',
      }) === true;
    } catch {
      // Storage and cross-tab checks are handled by the app's notebook hook.
    } finally {
      draft.saving = false;
    }
    if (draft.value === entered) draft.saved = saved;
    if (current !== exercise) return;
    refreshFeedback();
    if (draft.value === entered) {
      get('[data-builder-save-status]').textContent = saved ? 'Đã lưu câu trả lời.' : 'Chưa lưu được câu trả lời.';
    }
  }

  root.addEventListener('click',event => {
    const button = event.target.closest('[data-builder-action]');
    if (!button) return;
    const action = button.dataset.builderAction;
    if (action === 'clear') {
      filters.forEach(control => { control.value = ''; });
      filter();
      filters[0]?.focus();
      return;
    }
    if (!current) return;
    if (action === 'prev' || action === 'next') {
      position += action === 'prev' ? -1 : 1;
      present();
      if (button.disabled) get('[data-builder-action="' + (action === 'prev' ? 'next' : 'prev') + '"]').focus();
      return;
    }
    if (action === 'grammar') hooks.open('grammar',button.dataset.builderId);
    else if (action === 'audio') hooks.audio(current.example || current.answers[0]);
    else if (action === 'checker') hooks.open('checker',state().value,{grammarId:current.grammarIds[0]});
    else if (action === 'save') saveMistake();
    else if (action === 'tile' || action === 'undo' || action === 'reset') {
      const draft = state();
      if (action === 'tile') draft.chosen.push(Number(button.dataset.builderTile));
      else if (action === 'undo') draft.chosen.pop();
      else draft.chosen = [];
      answerChanged(draft.chosen.map(index => current.tiles[index]).join(''));
      refreshOrder();
      if (button.disabled) {
        (root.querySelector('[data-builder-tile]:not(:disabled)') || get('button[type="submit"]')).focus();
      }
    }
  });

  filter(context.exerciseId || targetWord?.id);
  return root;
}
