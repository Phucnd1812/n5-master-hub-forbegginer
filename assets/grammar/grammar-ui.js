import {COURSE} from './course.js';
import {COMPARISONS} from './comparisons.js';
import {EXTENSIONS} from './extensions.js';
import {APPLY,GUIDE_DISTRACTORS,checkPractice} from './practice.js';
import {GRAMMAR_GUIDES} from '../search/grammar-data.js';
import {HAS_HAN,japaneseKey,romanKey,romanize,wordPieces} from '../search/text.js';

const ADVANCED = new Set(['imperative','passive','causative','causative-passive','simultaneous','g11b_5','g11b_6','g13b_7','g13c_11','g14b_6']);
const TOPICS = new Map();
for (const [id,title,formula,meaning,prerequisites,principle,usage,avoid,examples,exercise] of [...COURSE,...EXTENSIONS]) {
  TOPICS.set(id,{id,title,formula,meaning,prerequisites,principle,usage,avoid,examples,exercise});
}
for (const guide of GRAMMAR_GUIDES) {
  const [prompt,answers,right,why] = guide.exercise;
  const wrong = answers.filter((_,index) => index !== right);
  TOPICS.set(guide.id,{...guide,usage:guide.contexts,
    exercise:[prompt,[answers[right],why],...wrong.map((answer,index) => [answer,GUIDE_DISTRACTORS[guide.id][index]])]});
}
const COMPARE = new Map(COMPARISONS.map(row => ['compare:' + row[0],row]));
const MAP_SECTIONS = [
  ['Nền tảng và trợ từ',['g1a_1','topic','subject','object','particle-no','particle-mo','particle-ni','particle-de','particle-e','particle-to','particle-kara']],
  ['Nhóm từ và thể cơ sở',['g9a_1','masu','nai','te','ta','adj-i','adj-na']],
  ['Từ thể て',['te','te-kara','request','permission','prohibition','progressive','compare:state']],
  ['Từ thể ない',['nai','negative-request','optional','obligation','compare:duty-option']],
  ['Từ thể た',['ta','experience','g10b_5','g10a_3','tara','compare:condition']],
  ['Khả năng, ý định và cách nhìn',['potential','volitional','desire','ba','g14c_7','simultaneous','compare:giving','passive','causative']],
];
const VISUAL_FORMS = {
  g6a_1:'mashita', g6a_5:'masenPast', g7d_8:'desire', g8a_1:'potential', g9a_1:'dictionary',
  g9a_3:'potentialKoto', g9b_5:'negative', g9b_7:'potentialNegative', g9c_8:'past', g9c_9:'negativePast',
  g10a_1:'volitional', g10a_2:'before', g10a_3:'after', g10b_4:'tara', g10b_5:'justPast',
  g10b_5_2:'experiencePolite', g11a_1:'ba', g11b_3:'negativeBa', g11b_4:'dutyPolite',
  g12a_1:'te', g12a_2:'afterTe', g12b_3:'progressivePolite', g12b_4:'progressivePolite',
  g12b_5:'progressivePolite', g12c_6:'progressivePolite', g12c_7:'progressivePolite',
  g13a_2:'permitQuestion', g13a_3:'permitPolite', g13a_4:'optionalPolite',
  g13b_5:'request', g13b_5_2:'negativeRequest', g14a_1:'propose',
  masu:'masu', nai:'negative', te:'te', ta:'past', potential:'potential', volitional:'volitional',
  ba:'ba', tara:'tara', imperative:'imperative', passive:'passive', causative:'causative',
  'causative-passive':'causativePassive', obligation:'duty', 'te-kara':'afterTe', experience:'experience',
  prohibition:'prohibition', desire:'desire', progressive:'progressive', permission:'permit',
  request:'request', 'negative-request':'negativeRequest', optional:'optional', simultaneous:'simultaneous',
  g3a_1:'adjPolite', g3a_2:'adjNeg', g3a_3:'adjPolite', g3b_6:'adjConnect', g3c_10:'adjNegPast', g4b_9:'adjPast', g4b_10:'adjNegPast',
  g3a_4:'adjNegPolite', g14c_8:'adjIf', g3b_7:'adjConnect', g3c_11:'adjPastPolite', g4a_5:'adjNegPastAlt',
  'adj-i':'adjNegPast', 'adj-na':'adjNegPolite',
};
const NA_LESSONS = new Set(['g3a_3','g3a_4','g3b_7','g3c_11','g4a_5','g14c_8','adj-na']);
const EXTRA_MAPS = {'g13c_8':['compare:giving'],g13c_9:['compare:giving'],g13c_10:['compare:giving']};

export function grammarName(id) {
  return TOPICS.get(id)?.title || COMPARE.get(id)?.[1] ||
    {'library:map':'Sơ đồ kiến thức','library:compare':'So sánh ngữ pháp','library:examples':'Kho câu ví dụ'}[id];
}
const includesJapaneseVerb = group => ['I','II','III'].includes(group);

export function createGrammarView({esc,button,detailButton,settings,toggleDisplay,app,open,search}) {
  let lexicon;
  const group = (content) => `<div class="n5-lookup-actions">${content}</div>`;
  const links = ids => group([...new Set(ids)].map(id => detailButton('grammar',id,grammarName(id) || id)).join(''));
  const section = (id,title,content,opened = false) => content ?
    `<details class="n5-grammar-section" data-section="${id}" ${opened ? 'open' : ''}>
      <summary><h3>${title}</h3></summary><div class="n5-grammar-body">${content}</div></details>` : '';
  const note = (title,text) => text ? `<p><strong>${title}</strong> ${esc(text)}</p>` : '';
  const steps = lines => `<ol>${lines.map(line => `<li>${esc(line)}</li>`).join('')}</ol>`;
  const readingControls = () => group([['roman','Romaji'],['furigana','Cách đọc']].map(([key,label]) =>
    button('grammar-display',key,label,`class="n5-lookup-chip" aria-pressed="${settings[key]}"`)).join(''));
  function refreshReading(container) {
    container.querySelectorAll('[data-grammar-reading]').forEach(node => {
      node.hidden = !settings[node.dataset.grammarReading];
    });
    container.querySelectorAll('[data-lookup="grammar-display"]').forEach(control => {
      control.setAttribute('aria-pressed',String(settings[control.dataset.value]));
    });
  }

  function example([jp,kana,vi,notes], context) {
    return `<article class="n5-lookup-example n5-grammar-example">
      <p lang="ja">${esc(jp)}</p>
      ${kana ? `<p class="n5-lookup-meta" lang="ja" data-grammar-reading="furigana" ${settings.furigana ? '' : 'hidden'}>${esc(kana)}</p>` : ''}
      ${kana ? `<div data-grammar-reading="roman" ${settings.roman ? '' : 'hidden'}>${note('Romaji theo Kana',romanize(kana))}</div>` : ''}
      <p>${esc(vi)}</p>
      ${note('Ngữ cảnh',context)}${note('Thành phần',notes)}
      ${group(detailButton('audio',jp,'Nghe') + detailButton('grammar-segment',jp,'Tra từ và Kanji trong câu'))}
      <div class="n5-grammar-tokens" aria-live="polite"></div>
    </article>`;
  }

  function choice(exercise, id) {
    const [prompt, correct,...distractors] = exercise;
    const offset = [...id].reduce((sum,char) => sum + char.charCodeAt(0),0) % (distractors.length+1);
    const options = [...distractors];
    options.splice(offset,0,correct);
    return `<fieldset class="n5-lookup-exercise" data-closed-id="${esc(id)}" data-correct="${esc(correct[0])}">
      <legend>${esc(prompt)}</legend>
      ${group(options.map(option => button('grammar-choice',option[0],esc(option[0]),
        `class="n5-lookup-chip" aria-pressed="false"`)).join(''))}
      <p role="status"></p>
      <ul data-choice-reasons hidden>${options.map(option => `<li data-answer="${esc(option[0])}">
        <strong>${esc(option[0])}</strong> ${esc(option[1])}</li>`).join('')}</ul>
    </fieldset>`;
  }

  function practice(topic) {
    const item = APPLY[topic.id];
    const sample = topic.examples[0];
    let drill = '';
    if (item?.kind === 'input') {
      drill = `<form class="n5-grammar-form" data-grammar-input="${esc(topic.id)}">
        <label>${esc(item.prompt)}<input name="answer" lang="ja" maxlength="100" required autocomplete="off"></label>
        <button type="submit" class="n5-lookup-chip">Kiểm tra</button><p role="status"></p></form>`;
    }
    if (item?.kind === 'sort') {
      drill = `<div class="n5-grammar-form" data-grammar-sort="${esc(topic.id)}">
        <p>${esc(item.prompt)}</p>
        ${group([...item.answers].reverse().map(answer => detailButton('grammar-order',answer,answer)).join(''))}
        <p data-grammar-order aria-label="Thứ tự đã chọn"></p>
        ${group(detailButton('grammar-sort-reset','','Xếp lại') + detailButton('grammar-sort-check','','Đối chiếu thứ tự'))}
        <p role="status"></p></div>`;
    }
    const selfCheck = (kind,prompt,model) => `<label class="n5-grammar-writing">${prompt}
          <textarea rows="2" maxlength="320" lang="${kind}"></textarea></label>
        <details><summary>Xem đáp án tham khảo</summary><p>${esc(model)}</p><p>${esc(sample[3])}</p></details>`;
    return `<h4>Nhận diện cấu trúc</h4>${choice(topic.exercise,topic.id)}
      ${drill}<h4>Dịch và đặt câu</h4>
      <div class="n5-grammar-form">${selfCheck('vi','Dịch câu sau sang tiếng Việt: ' + esc(sample[0]),sample[2])}</div>
      <div class="n5-grammar-form">${selfCheck('ja','Đặt một câu tiếng Nhật dùng mẫu trong một tình huống của bạn.',sample[0])}
        <p class="n5-lookup-meta">Tự đối chiếu cấu trúc và ngữ cảnh. Cách diễn đạt khác cũng có thể đúng.</p></div>`;
  }

  function visualizer(id) {
    const form = VISUAL_FORMS[id];
    if (!form) return '';
    const adjective = form.startsWith('adj');
    const samples = adjective ? ['高い','いい','静か','便利'] : ['飲む','食べる','行く','書く','する','来る'];
    const initial = adjective ? NA_LESSONS.has(id) ? '静か' : '高い' : '飲む';
    return `<form class="n5-grammar-form" data-grammar-visualizer="${esc(id)}">
      <label>${adjective ? 'Tính từ' : 'Động từ'} trong từ điển
        <input name="word" lang="ja" maxlength="60" list="n5-grammar-words" value="${initial}" required autocomplete="off"></label>
      <datalist id="n5-grammar-words">${samples.map(word => `<option value="${word}"></option>`).join('')}</datalist>
      ${group(detailButton('grammar-preview',initial,'Xem ví dụ với ' + initial) +
        '<button type="submit" class="n5-lookup-chip">Xem từng bước</button>')}
      <div data-grammar-steps aria-live="polite"></div></form>`;
  }

  function chapter(topic) {
    const related = [...COMPARE.entries()].filter(([,data]) => data[3].includes(topic.id) ||
      data[3].some(id => topic.prerequisites.includes(id))).map(([key]) => key);
    const visual = visualizer(topic.id);
    const formation = topic.formation ? steps(topic.formation) : '';
    const sections = [['rules','Cách dùng'], ...(formation || visual ? [['formation','Biến đổi']] : []),
      ['examples','Ví dụ'],['practice','Luyện tập'],['related','Kiến thức nền']];
    return `<div class="n5-lookup-word n5-lookup-grammar n5-grammar-chapter">
      <div class="n5-lookup-form">${note('Công thức',topic.formula)}${note('Ý nghĩa',topic.meaning)}
        ${ADVANCED.has(topic.id) ? '<p class="n5-lookup-meta">Phần mở rộng ngoài trọng tâm N5</p>' : ''}</div>
      ${readingControls()}
      ${group(sections
        .map(([id,label]) => detailButton('grammar-jump',id,label)).join('') +
        detailButton('grammar-expand','','Mở rộng tất cả') + detailButton('grammar-collapse','','Thu gọn tất cả'))}
      ${section('rules','Cách dùng và sắc thái',note('Cơ chế',topic.principle) +
        note('Điều kiện',topic.conditions) + note('Ngữ cảnh',topic.usage) +
        note('Lưu ý và ngoại lệ',topic.avoid) + note('Lỗi thường gặp',topic.mistakes) + note('So với mẫu gần',topic.compare))}
      ${section('formation','Hình thành từng bước',formation + (topic.groups ? steps(topic.groups) : '') + visual,true)}
      ${section('examples','Ví dụ và phân tích',topic.examples.map(row => example(row,topic.usage)).join(''),true)}
      ${section('practice','Bài tập áp dụng',practice(topic),true)}
      ${section('related','Kiến thức nền và bài học',links([...topic.prerequisites,...(topic.course || []),...(EXTRA_MAPS[topic.id] || []),...related]) +
        group(detailButton('grammar','library:map','Sơ đồ kiến thức') +
        (app.item('grammar',topic.id) ? detailButton('course-grammar',topic.id,'Mở trong giáo trình') : '')),true)}
    </div>`;
  }

  function comparison([key,title,,prerequisites,common,sides,detail,exercise]) {
    return `<div class="n5-lookup-word n5-grammar-chapter">
      ${readingControls()}
      ${note('Điểm chung',common)}
      <div class="n5-grammar-compare">${sides.map(([label,usage,row]) =>
        `<section class="n5-lookup-card"><h3 lang="ja">${esc(label)}</h3>${example(row,usage)}</section>`).join('')}</div>
      ${note('Điểm cần phân biệt',detail)}
      ${section('practice','Luyện phân biệt',choice(exercise,'compare:' + key),true)}
      ${links(prerequisites)}${detailButton('grammar','library:compare','Xem các bài so sánh')}
    </div>`;
  }

  function bank(id = COURSE[0][0]) {
    const compare = COMPARE.get(id);
    const chapter = TOPICS.get(id);
    const rows = compare ? compare[5].map(([,context,row]) => [row,context]) :
      chapter?.examples.map(row => [row,chapter.usage]) || [];
    return `<div class="n5-lookup-word n5-grammar-chapter">
      ${readingControls()}
      <label>Chọn chuyên đề<select data-grammar-bank>
        ${[...TOPICS.keys(),...COMPARE.keys()].map(key =>
          `<option value="${esc(key)}" ${id === key ? 'selected' : ''}>${esc(app.item('grammar',key)?.lesson || '')} ${esc(grammarName(key))}</option>`).join('')}
      </select></label>
      <div data-bank-examples>${rows.map(([row,context]) => example(row,context)).join('')}</div>
      ${links([id])}
    </div>`;
  }

  function render(id) {
    if (TOPICS.has(id)) return chapter(TOPICS.get(id));
    if (COMPARE.has(id)) return comparison(COMPARE.get(id));
    if (id === 'library:compare') return '<div class="n5-lookup-word">' + links([...COMPARE.keys()]) + '</div>';
    if (id === 'library:examples') return bank();
    if (id === 'library:map') return '<div class="n5-lookup-word">' + MAP_SECTIONS.map(([name,ids],index) =>
      `<section><h3>${esc(name)}</h3>${index < 2 ? links(ids) : `<div class="n5-grammar-chain">
        ${links(ids.slice(0,1))}<span aria-label="dẫn đến">→</span>${links(ids.slice(1))}</div>`}</section>`).join('') + '</div>';
    return '';
  }

  async function showSteps(form,value,chosenId) {
    const id = form.dataset.grammarVisualizer;
    const key = VISUAL_FORMS[id];
    const adjectiveGroup = key.startsWith('adj') ? (NA_LESSONS.has(id) ? 'na' : 'i') : '';
    const result = form.querySelector('[data-grammar-steps]');
    const ticket = String(Number(form.dataset.request || 0) + 1);
    form.dataset.request = ticket;
    result.textContent = 'Đang tra từ…';
    const {makeLemma,generateForms,describeForm} = await import('../search/morphology.js');
    lexicon ??= app.vocab().flatMap(item => {
      const lemma = makeLemma(item);
      if (!lemma.group) return [];
      const keys = [lemma.jp,lemma.kana,...wordPieces(item.kanji),...wordPieces(item.kana)].map(japaneseKey);
      return [{lemma,keys,roman:romanKey(lemma.romaji)}];
    });
    if (!form.isConnected || form.dataset.request !== ticket) return;
    const raw = String(value ?? '').trim();
    form.elements.word.value = raw;
    const matches = lexicon.filter(({lemma,keys,roman}) => chosenId ? lemma.id === chosenId :
      keys.includes(japaneseKey(raw)) || roman && roman === romanKey(raw));
    const eligible = matches.flatMap(({lemma}) => {
      if (adjectiveGroup ? lemma.group !== adjectiveGroup :
          !includesJapaneseVerb(lemma.group) && !(id === 'g11a_1' && lemma.group === 'i')) return [];
      const target = id === 'g11a_1' && lemma.group === 'i' ? 'adjIf' : key;
      const inflections = generateForms(lemma);
      if (target === 'dictionary') {
        const polite = describeForm(lemma,inflections,'masu');
        if (!polite) return [];
        const [dictionary,stem,masu] = polite.steps;
        const rule = {I:'Nhóm I đổi âm cuối của thân sang hàng う để về dạng từ điển. Một số động từ kính ngữ có thân bất quy tắc.',
          II:'Nhóm II thêm る vào thân.',III:'Khôi phục dạng gốc đã xác định của する hoặc 来る.'}[lemma.group];
        return [{lemma,steps:[{...masu,rule:''},{...stem,rule:'Bỏ ます để lấy thân.'},{...dictionary,rule}]}];
      }
      const inflection = describeForm(lemma,inflections,target);
      return inflection ? [inflection] : [];
    });
    const unique = [...new Map(eligible.map(item => [item.lemma.jp + '\0' + item.lemma.kana + '\0' + item.lemma.group,item])).values()];
    if (!unique.length) {
      result.textContent = 'Chưa xác định được mục từ có nhóm và quy tắc phù hợp. Hãy thử thể từ điển, Kana hoặc Romaji của từ trong giáo trình.';
    } else if (unique.length > 1) {
      result.innerHTML = '<p>Chọn từ gốc phù hợp với ngữ cảnh.</p>' + group(unique.map(({lemma}) =>
        detailButton('grammar-lemma',lemma.id,lemma.jp + ' · ' + lemma.vi)).join(''));
    } else {
      const [item] = unique;
      const gloss = item.lemma.vi.split(/[;,；]/)[0];
      const meanings = {dictionary:gloss,stem:'Thân để ghép đuôi. Chưa tạo vị ngữ hoàn chỉnh.',
        negative:'không ' + gloss,negativeBa:'nếu không ' + gloss,te:'Dạng nối để ghép cấu trúc.'};
      result.innerHTML = `<p class="n5-lookup-path" lang="ja">${item.steps.map(step => esc(step.jp)).join(' → ')}</p>
        <ol class="n5-grammar-steps">${item.steps.map((step,index) => {
          const old = item.steps[index-1];
          let unchanged = 0;
          while (old && unchanged < old.jp.length && unchanged < step.jp.length && old.jp[unchanged] === step.jp[unchanged]) unchanged++;
          const changed = old ? (old.jp.slice(unchanged) || '∅') + ' → ' + (step.jp.slice(unchanged) || '∅') : '';
          return `<li><b lang="ja">${esc(step.jp)}</b> · ${esc(step.label)}
            ${settings.furigana && step.kana !== step.jp ? note('Cách đọc',step.kana) : ''}
            ${note('Thay đổi',changed)}${note('Quy tắc',step.rule)}
            ${note('Ý nghĩa',meanings[step.key] || (index === item.steps.length-1 ? item.meaning || step.label : 'Chuẩn bị cho bước tiếp theo.'))}</li>`;
        }).join('')}</ol>`;
    }
  }

  function saveIncorrect(block,id,prompt,answer,entered,why) {
    if (block.dataset.saved) return;
    block.dataset.saved = 'pending';
    app.mistake({id,prompt,answer,entered,why}).then(saved => { block.dataset.saved = saved ? 'yes' : ''; })
      .catch(() => { block.dataset.saved = ''; });
  }

  async function segment(control) {
    const result = control.closest('.n5-grammar-example').querySelector('.n5-grammar-tokens');
    result.textContent = 'Đang tách câu…';
    try {
      const model = await search(control.dataset.value);
      if (!result.isConnected) return;
      result.innerHTML = group((model?.analysis?.parts || []).map(part => {
        if (part.lemma?.id) return button('grammar-word',part.text,esc(part.text),
          `class="n5-lookup-chip" lang="ja" data-lemma="${esc(JSON.stringify(part.lemma))}"`);
        if (part.grammar) return detailButton('grammar',part.grammar,part.text);
        return `<span lang="ja">${esc(part.text)}</span>`;
      }).join('') || '<p>Chưa tách được cụm từ trong ví dụ này.</p>') +
      (model?.analysis?.romaji && model.analysis.coverage === 1 ?
        `<div data-grammar-reading="roman" ${settings.roman ? '' : 'hidden'}>${note('Romaji theo phân tích',model.analysis.romaji)}</div>` : '') +
      group([...new Set([...control.dataset.value].filter(char => HAS_HAN.test(char)))].map(char =>
        detailButton('kanji-char',char,char)).join(''));
    } catch { result.textContent = 'Chưa tải được phân tích của ví dụ.'; }
  }

  function click(control) {
    const {lookup:action,value} = control.dataset;
    const article = control.closest('.n5-grammar-chapter');
    switch (action) {
      case 'grammar-display':
        toggleDisplay(value);
        refreshReading(article);
        break;
      case 'grammar-jump': {
        const target = article.querySelector('[data-section="' + value + '"]');
        target.open = true;
        target.querySelector('summary').focus({preventScroll:true});
        target.scrollIntoView({block:'start'});
        break;
      }
      case 'grammar-expand':
      case 'grammar-collapse':
        article.querySelectorAll('details[data-section]').forEach(detail => { detail.open = action === 'grammar-expand'; });
        break;
      case 'grammar-segment': return segment(control);
      case 'grammar-word': {
        const lemma = JSON.parse(control.dataset.lemma);
        open(app.item('vocab',lemma.id) ? 'related-item' : 'example-word',lemma.id,lemma);
        break;
      }
      case 'grammar-preview':
        return showSteps(control.form,value);
      case 'grammar-lemma':
        return showSteps(control.form,control.form.elements.word.value,value);
      case 'grammar-choice': {
        const block = control.closest('[data-closed-id]');
        const correct = block.dataset.correct === value;
        for (const option of block.querySelectorAll('button')) option.setAttribute('aria-pressed',String(option === control));
        block.querySelector('[role=status]').textContent = correct ? 'Đúng.' : 'Chưa đúng. Đáp án: ' + block.dataset.correct + '.';
        const reasons = block.querySelector('[data-choice-reasons]');
        reasons.hidden = false;
        if (!correct) {
          const why = [...reasons.children].filter(row => row.dataset.answer === value || row.dataset.answer === block.dataset.correct)
            .map(row => row.textContent.trim()).join(' ');
          saveIncorrect(block,block.dataset.closedId,block.querySelector('legend').textContent,block.dataset.correct,value,why);
        }
        break;
      }
      case 'grammar-order':
      case 'grammar-sort-reset':
      case 'grammar-sort-check': {
        const block = control.closest('[data-grammar-sort]');
        const order = block.querySelector('[data-grammar-order]');
        const tokens = [...block.querySelectorAll('[data-lookup="grammar-order"]')];
        const exercise = APPLY[block.dataset.grammarSort];
        const status = block.querySelector('[role=status]');
        if (action === 'grammar-order') {
          control.disabled = true;
          order.textContent += (order.textContent ? ' ' : '') + value;
        } else if (action === 'grammar-sort-reset') {
          tokens.forEach(token => { token.disabled = false; });
          order.textContent = '';
          status.textContent = '';
        } else if (tokens.some(token => !token.disabled)) status.textContent = 'Hãy chọn đủ các cụm.';
        else {
          const model = exercise.answers.join(' ');
          status.textContent = (checkPractice({answers:[model]},order.textContent) ? 'Đúng. ' : 'Thứ tự mẫu: ' + model + ' ') + exercise.why;
        }
        break;
      }
    }
  }

  function submit(event) {
    const form = event.target;
    if (form.dataset.grammarVisualizer) {
      event.preventDefault();
      showSteps(form,form.elements.word.value).catch(() => {
        form.querySelector('[data-grammar-steps]').textContent = 'Chưa tải được quy tắc chia.';
      });
      return;
    }
    const id = form.dataset.grammarInput;
    if (!id) return;
    event.preventDefault();
    const exercise = APPLY[id];
    const value = form.elements.answer.value;
    const result = checkPractice(exercise,value);
    const [answer] = exercise.answers;
    form.querySelector('[role=status]').textContent = result === null ? 'Hãy nhập câu trả lời.' :
      (result ? 'Đúng. ' : 'Dạng theo yêu cầu: ' + answer + '. ') + exercise.why;
  }

  function change(event) {
    if (!event.target.matches('[data-grammar-bank]')) return;
    const fragment = document.createElement('template');
    fragment.innerHTML = bank(event.target.value);
    const replacement = fragment.content.firstElementChild;
    event.target.closest('.n5-grammar-chapter').replaceWith(replacement);
    replacement.querySelector('select').focus({preventScroll:true});
  }

  return {render,click,submit,change,refreshReading};
}
