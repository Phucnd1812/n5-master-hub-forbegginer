/* global N5StudyEngine, allSrsItems, srsItemTitle, srsItemAnswer, plainSearchText, state, N5_LESSONS,
  FORM_LESSONS, n5MasuPracticePrompt, READING_PRACTICE_SET, LISTENING_PRACTICE_SET, VOCAB_DATA, GRAMMAR_DATA, buildOptionSet, studyEscape,
  normalizeStudyAnswer, kanaToRomaji, navigateTo, renderCurrentView, playAudio, n5SmartApplyOutcome, showToast */
(() => {
  'use strict';

  const engine = N5StudyEngine;
  const { STORAGE_KEY, SKILLS, METHODS, REASONS } = engine;
  const minutesOptions = [[5,'Ôn cấp tốc'], [15,'Học nhanh'], [25,'Tiêu chuẩn'], [45,'Chuyên sâu'], [60,'Toàn diện']];
  const esc = studyEscape;
  const section = 'rounded-3xl border border-sky-200 dark:border-sky-800 bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5 space-y-3';
  const button = 'rounded-xl px-4 py-3 min-h-11 text-sm font-semibold border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-slate-800 text-sky-900 dark:text-sky-100';
  const primary = 'rounded-xl px-4 py-3 min-h-11 text-sm font-bold bg-sky-700 text-white hover:bg-sky-800';
  const quiet = 'text-sm text-slate-600 dark:text-slate-300';
  const control = 'block w-full mt-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-base';
  const activeTimeLimit = 180_000;
  let cachedRaw, cachedData, clock, lastViewKey;
  let playing = false;
  let busy = false;
  let dailyQueued = false;
  let renderedPlan = null;
  let renderedSettings = null;

  function read() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (cachedData && raw === cachedRaw) return cachedData;
    const data = raw === null ? engine.empty() : engine.validate(JSON.parse(raw));
    cachedRaw = raw;
    cachedData = data;
    return data;
  }

  function withLock(callback) {
    return navigator.locks ? navigator.locks.request(STORAGE_KEY, callback) : Promise.resolve().then(callback);
  }

  // Cloud/backup callers acquire this same lock around their progress snapshot.
  function restore(value) {
    const valid = engine.validate(value);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    cachedData = undefined;
  }

  function restoreRaw(previous) {
    if (previous === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, previous);
    cachedData = undefined;
  }

  function change(update) {
    return withLock(() => {
      const current = read();
      const previous = cachedRaw;
      const draft = structuredClone(current);
      const after = update(draft);
      if (after === false) return false;
      const raw = JSON.stringify(engine.validate(draft));
      if (raw === previous && !after) return true;
      if (localStorage.getItem(STORAGE_KEY) !== previous) throw Error('Smart Study vừa thay đổi ở tab khác. Hãy thử lại.');
      localStorage.setItem(STORAGE_KEY, raw);
      try {
        if (typeof after === 'function') after();
      } catch (error) {
        if (localStorage.getItem(STORAGE_KEY) === raw) restoreRaw(previous);
        throw error;
      }
      cachedRaw = raw;
      cachedData = draft;
      return true;
    });
  }

  const trimmed = (value, length) => String(value ?? '').trim().slice(0, length);
  const lesson = value => String(value ?? '');
  const legacySkills = {conjugation:'form', formPractice:'form', 'Từ vựng':'vocab', 'Kanji':'kanji',
    'Chữ Hán':'kanji', 'Ngữ pháp':'grammar', 'Đọc hiểu':'reading', 'Nghe hiểu':'listening'};
  const skillOf = type => Object.hasOwn(legacySkills,type) ? legacySkills[type] : Object.hasOwn(SKILLS,type) ? type : 'jlpt';
  const formKey = value => value === 'te' ? 'teForm' : value === 'ta' ? 'taForm' : value;

  function choice(id, skill, title, prompt, passage, {audio, explanation} = {}) {
    const options = passage.options.map(text => trimmed(plainSearchText(text),1200));
    return {
      id: skill + ':' + id, contentId:id, skill, drill:'choice', title:trimmed(title,100), prompt:trimmed(prompt,1800),
      options, correct:passage.correct, answer:options[passage.correct], seconds:skill === 'listening' || audio ? 120 : skill === 'reading' ? 115 : 60,
      ...(audio ? {audio:trimmed(audio,1800)} : {}), detail:trimmed(explanation ?? passage.explanation,1800)
    };
  }

  function examChoices(items, kind, field, titleField) {
    const eligible = items.filter(item => item[field] && item[titleField]);
    return eligible.map((item, index) => ({
      id:'jlpt:' + item.id, contentId:item.id, skill:'jlpt', section:kind, drill:'choice',
      title:trimmed(SKILLS[kind] + ' · ' + plainSearchText(item[titleField]),100),
      prompt:trimmed(kind === 'vocab'
        ? 'Chọn nghĩa đúng của「' + plainSearchText(item[titleField]) + '」'
        : 'Mẫu ngữ pháp nào diễn đạt「' + plainSearchText(item.meaning) + '」?',1800),
      answer:trimmed(plainSearchText(item[field]),1200), seconds:60,
      materialize() {
        const answer = trimmed(plainSearchText(item[field]),1200);
        const distractors = [];
        for (let step = 1; step < Math.min(eligible.length, 14); step++) {
          distractors.push(trimmed(plainSearchText(eligible[(index + step * 17) % eligible.length][field]),1200));
        }
        const options = buildOptionSet(answer, [...distractors, 'Tôi chưa chắc'], 4);
        return {options, correct:options.indexOf(answer), detail:trimmed(plainSearchText(item.brief || item.kana || ''),1800)};
      }
    }));
  }

  function catalog(settings) {
    const cards = allSrsItems().map(item => {
      const title = plainSearchText(srsItemTitle(item)).trim();
      return {
        id: 'card:' + item.id, contentId: item.id, skill: item._kind, drill:'card', title:trimmed(title,100),
        prompt:trimmed(title,1800), lesson:lesson(item.lesson), seconds:item._kind === 'grammar' ? 75 : 55,
        materialize:() => ({answer:trimmed(plainSearchText(srsItemAnswer(item).replace(/<\/p>/g,'\n')),1200)})
      };
    }).filter(card => card.prompt);
    const forms = FORM_LESSONS.flatMap(form => form.rows.map((row, i) => {
      const prompt = n5MasuPracticePrompt(form, row);
      return {
        id:'form:' + form.id + ':' + i, contentId:'form_' + form.id + '_' + i, skill:'form', drill:'write',
        title:trimmed(form.name + ' · ' + prompt,100), prompt:trimmed(prompt + '\nHãy nhập ' + form.answerLabel,1800),
        answer:trimmed(row[1],1200), detail:trimmed(row[2],1800), form:trimmed(form.id,120), seconds:75
      };
    })).filter(item => item.prompt && item.answer);
    const reading = READING_PRACTICE_SET.map(p => choice(p.id, 'reading', p.title, p.jp + '\n\n' + p.question, p,
      {explanation:[p.explanation,p.vi].filter(Boolean).join('\n')}));
    const listening = LISTENING_PRACTICE_SET.map(p => choice(p.id, 'listening', p.title, p.question, p, {audio:p.audio}));
    const items = [...cards, ...forms, ...reading, ...listening];
    const exam = settings.focus === 'jlpt' || settings.focus === 'mix' && (!settings.mix.length || settings.mix.includes('jlpt'));
    if (exam) {
      items.push(...examChoices(VOCAB_DATA, 'vocab', 'vi', 'kanji'), ...examChoices(GRAMMAR_DATA, 'grammar', 'title', 'title'));
      items.push(...[...reading,...listening].map(p => ({...p, id:'jlpt:' + p.contentId, skill:'jlpt', section:p.skill})));
    }

    // A notebook item can use its original audio or typed answer when the source still exists.
    const byId = new Map(items.filter(item => item.skill !== 'jlpt').map(item => [item.contentId, item]));
    const used = new Set();
    const mistakes = [];
    for (const m of state.mistakes) {
      const answer = trimmed(plainSearchText(m.correctAnswer),1200);
      if (m.mastered || !m.key || !answer || !m.question) continue;
      let contentId = trimmed(m.contentId || m.id || m.key,180);
      contentId = contentId.replace(/^(reading|listening)_(?=read|listen)/,'').replace(/^mock_\w+?_/,'').replace(/_\d{13}$/,'');
      const type = skillOf(m.type);
      const source = byId.get(contentId);
      const identity = type + '|' + contentId;
      if (used.has(identity)) continue;
      used.add(identity);
      const shared = {
        id:'mistake:' + trimmed(m.key,170), contentId, skill:type, mistakeKey:trimmed(m.key,1800),
        title:trimmed(source?.title || plainSearchText(m.question),100), prompt:trimmed(plainSearchText(m.question),1800),
        detail:trimmed(plainSearchText(m.explanation),1800), seconds:type === 'form' ? 75 : 65
      };
      if (source?.drill === 'choice') mistakes.push({...source,...shared, prompt:source.prompt, detail:source.detail, seconds:source.seconds});
      else if (source?.drill === 'write' || type === 'form') {
        mistakes.push({...shared, drill:'write', answer, prompt:source?.drill === 'write' ? source.prompt : shared.prompt,
          form:source?.form || formKey(trimmed(m.form || contentId.split('_').at(-1),120))});
      } else {
        const wrong = trimmed(plainSearchText(m.chosenAnswer),1200);
        const options = buildOptionSet(answer, [wrong && wrong !== answer ? wrong : 'Tôi chưa chắc'], 2);
        mistakes.push({...shared, drill:'choice', answer, options, correct:options.indexOf(answer)});
      }
    }
    return [...mistakes, ...items];
  }

  function choose(data, options = {}, settings = data.settings) {
    return engine.chooseItems(catalog(settings), {
      completed:state.completedItems, review:state.reviewData, mistakes:state.mistakes, lessons:N5_LESSONS, studyLog:state.studyLog
    }, data, settings, options);
  }

  function generate(data, options) {
    const time = Date.now();
    const items = choose(data, options);
    if (!items.length) throw Error('Chưa có bài phù hợp với trọng tâm này. Hãy chọn kỹ năng khác.');
    data.plan = engine.newPlan(items, crypto.randomUUID(), data.settings, time);
  }

  const sameDay = plan => plan?.day === engine.dayKey();
  const ongoing = plan => Boolean(plan?.started && !plan.ended);
  const expectedItem = plan => plan && !plan.ended ? [plan.id, plan.index, plan.items[plan.index]?.id].join('|') : null;
  const outcomes = plan => plan.results.filter(result => result && result.result !== 'skipped');
  const estimatedMinutes = items => Math.max(1, Math.round(items.reduce((sum, item) => sum + item.seconds, 0) / 60));
  const clockTime = () => performance.now();

  function stopClock() {
    if (!clock) return null;
    const elapsed = {...clock, ms:Math.min(activeTimeLimit, Math.max(0, Math.round(clockTime() - clock.at)))};
    clock = null;
    return elapsed;
  }

  function addTime(plan, elapsed) {
    if (!elapsed || expectedItem(plan) !== elapsed.item || plan.results[plan.index]) return false;
    plan.questionMs = Math.min(3600000, plan.questionMs + elapsed.ms);
    return elapsed.ms > 0;
  }

  function flushTime() {
    const elapsed = stopClock();
    if (elapsed) change(data => addTime(data.plan, elapsed)).catch(() => {});
  }

  function trackClock(plan) {
    const item = expectedItem(plan);
    if (!playing || !item || document.hidden || plan.results[plan.index]) {
      flushTime();
      return;
    }
    if (clock?.item === item) return;
    flushTime();
    clock = { item, at:clockTime() };
  }

  function setView(view) {
    if (view !== 'smartStudy') {
      flushTime();
      playing = false;
    }
  }

  function updateHome() {
    const home = document.getElementById('smartStudyHome');
    if (home) home.outerHTML = homeHtml(false);
  }

  function prepareDaily() {
    if (dailyQueued) return;
    const existing = read();
    if (sameDay(existing.plan) || ongoing(existing.plan)) return;
    dailyQueued = true;
    const schedule = window.requestIdleCallback || (callback => setTimeout(callback,50));
    schedule(() => change(data => {
      if (sameDay(data.plan) || ongoing(data.plan)) return false;
      generate(data);
    }).then(changed => {
      if (changed) updateHome();
      if (document.getElementById('mainContainer')?.dataset.n5Page === 'smartStudy' && !playing) renderCurrentView(true);
    }).catch(() => {}).finally(() => { dailyQueued = false; }));
  }

  function homeHtml(schedule = true) {
    let data;
    try {
      data = read();
      if (schedule) prepareDaily();
    } catch {
      data = engine.empty();
    }
    const plan = data.plan;
    const inProgress = ongoing(plan);
    const minutes = inProgress ? plan.minutes : data.settings.minutes;
    const completedToday = sameDay(plan) && plan.ended;
    const start = inProgress ? 'Tiếp tục buổi học' : completedToday ? 'Học thêm ' + minutes + ' phút' : 'Bắt đầu học ' + minutes + ' phút';
    return `<section id="smartStudyHome" aria-labelledby="smartStudyHomeTitle" class="${section} flex flex-col sm:flex-row sm:items-center sm:justify-between sm:space-y-0 gap-3">
      <div><h2 id="smartStudyHomeTitle" class="text-xl font-extrabold">Smart Study</h2>
        <p class="${quiet}">Mục tiêu ${minutes} phút · ${engine.streak(data.days)} ngày học liên tiếp</p>
        ${inProgress ? `<p class="${quiet}">Đã làm ${outcomes(plan).length}/${plan.items.length} câu hoặc thẻ</p>` : completedToday ? `<p class="${quiet}">Đã hoàn tất kế hoạch hôm nay</p>` : ''}
      </div>
      <div class="flex flex-wrap gap-2"><button type="button" data-study-action="quick" class="${primary}">${start}</button>
        <button type="button" data-study-action="open" class="${button}">Kế hoạch &amp; thiết lập</button></div>
    </section>`;
  }

  function settingsHtml(settings) {
    const standard = minutesOptions.some(([minutes]) => minutes === settings.minutes);
    return `<details class="${section}" id="smartStudySettings"><summary class="cursor-pointer font-bold">Thiết lập Smart Study</summary>
      <form id="smartStudySettingsForm" class="space-y-3" autocomplete="off">
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="text-sm font-semibold">Thời lượng
            <select name="duration" class="${control}">
              ${minutesOptions.map(([duration, name]) => `<option value="${duration}" ${settings.minutes === duration ? 'selected' : ''}>${duration} phút · ${name}</option>`).join('')}
              <option value="custom" ${standard ? '' : 'selected'}>Tùy chỉnh</option>
            </select>
          </label>
          <label data-study-custom ${standard ? 'hidden' : ''} class="text-sm font-semibold">Số phút tùy chỉnh
            <input name="custom" type="number" min="2" max="90" value="${settings.minutes}" class="${control}">
          </label>
          <label class="text-sm font-semibold">Trọng tâm
            <select name="focus" class="${control}">
              ${Object.entries({auto:'Tự động theo điểm yếu', ...SKILLS, mix:'Kết hợp nhiều kỹ năng'}).map(([key,label]) => `<option value="${key}" ${settings.focus === key ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
          <label class="text-sm font-semibold">Phương pháp
            <select name="method" class="${control}">
              ${Object.entries(METHODS).map(([key,label]) => `<option value="${key}" ${settings.method === key ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
        </div>
        <fieldset data-study-mix ${settings.focus === 'mix' ? '' : 'hidden'} class="p-3 rounded-xl border border-slate-300 dark:border-slate-700">
          <legend class="px-1 text-sm font-semibold">Kỹ năng muốn kết hợp</legend>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${Object.entries(SKILLS).map(([key,label]) => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="mix" value="${key}" ${settings.mix.includes(key) ? 'checked' : ''}> ${label}</label>`).join('')}</div>
        </fieldset>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="tracking" ${settings.tracking ? 'checked' : ''}> Ghi chi tiết lượt luyện để tìm nội dung cần ôn thêm</label>
        <button type="submit" class="${primary}">Lưu thiết lập</button>
        <p class="${quiet}">Thiết lập áp dụng cho kế hoạch chưa bắt đầu và các buổi sau.</p>
      </form>
    </details>`;
  }

  function summaryHtml(summary) {
    if (!summary) return `<section class="${section}"><h2 class="text-lg font-bold">Đã kết thúc buổi học</h2><p class="${quiet}">Buổi này chưa có câu hoặc thẻ đã làm.</p></section>`;
    const count = result => summary.items.filter(item => item.result === result).length;
    const needs = summary.items.filter(item => ['incorrect','again'].includes(item.result));
    const improved = summary.items.filter(item => item.improved);
    const seconds = Math.round(summary.ms / 1000);
    const duration = seconds >= 60 ? Math.floor(seconds / 60) + ' phút ' + seconds % 60 + ' giây' : seconds + ' giây';
    const list = items => items.slice(0, 12).map(item => `<li>${esc(item.title)}</li>`).join('');
    return `<section class="${section}" aria-label="Tóm tắt buổi học">
      <h2 class="text-lg font-bold">Tóm tắt buổi học</h2>
      <p class="${quiet}">${esc(summary.day)} · ${duration} học · ${summary.doneTasks}/${summary.tasks} nhiệm vụ hoàn thành · ${summary.items.length}/${summary.total} câu hoặc thẻ đã làm</p>
      ${count('correct') + count('incorrect') ? `<p>${count('correct')} đúng · ${count('incorrect')} sai</p>` : ''}
      ${count('remembered') + count('again') ? `<p>Tự đánh giá ${count('remembered')} đã nhớ · ${count('again')} cần ôn lại</p>` : ''}
      <details><summary class="cursor-pointer font-semibold">Nội dung đã luyện</summary><ul class="list-disc pl-5 mt-2 text-sm">${summary.items.map(item => `<li>${esc(item.title)} · ${SKILLS[item.skill]}</li>`).join('')}</ul></details>
      ${improved.length ? `<p class="font-semibold text-emerald-700 dark:text-emerald-300">Tiến bộ so với lần ghi nhận trước</p><ul class="list-disc pl-5 text-sm">${list(improved)}</ul>` : ''}
      ${needs.length ? `<p class="font-semibold">Cần ôn thêm</p><ul class="list-disc pl-5 text-sm">${list(needs)}</ul>` : ''}
      <p class="${quiet}">${needs.length ? 'Buổi sau sẽ ưu tiên những mục cần ôn lại và các bài đến hạn.' : 'Buổi sau sẽ ưu tiên bài đến hạn và bổ sung nội dung theo tiến độ.'}</p>
    </section>`;
  }

  function historyHtml(data) {
    return `<details class="${section}"><summary class="cursor-pointer font-bold">Lịch sử &amp; dữ liệu học tập</summary>
      <p class="${quiet}">${data.history.length} buổi đã lưu · ${data.events.length} lượt có dữ liệu chi tiết. Chuỗi ngày chỉ tính ngày có câu hoặc thẻ được đánh giá.</p>
      ${data.history.length ? data.history.map(summary => `<details data-study-history="${esc(summary.id)}" class="border-t border-slate-200 dark:border-slate-800 pt-2"><summary class="cursor-pointer text-sm font-semibold">${esc(summary.day)} · ${summary.items.length} câu hoặc thẻ</summary></details>`).join('')
        : `<p class="${quiet}">Chưa có buổi đã lưu. Lịch sử sẽ xuất hiện khi bạn hoàn thành buổi học.</p>`}
      <button type="button" data-study-action="clear" class="${button}">Xóa lịch sử phân tích</button>
    </details>`;
  }

  function dueNotice(settings) {
    if (settings.focus === 'auto') return '';
    const selected = settings.focus === 'mix' ? settings.mix.length ? settings.mix : Object.keys(SKILLS) : [settings.focus];
    const today = engine.dayKey();
    const count = allSrsItems().filter(item => {
      const review = state.reviewData[item.id];
      return !selected.includes(item._kind) && review && (review.remembered === false || !review.due || String(review.due).slice(0,10) <= today);
    }).length;
    return count ? `<p class="${quiet}">Có ${count} mục đến hạn hoặc chưa nhớ ngoài trọng tâm. <button type="button" data-study-action="srs" class="underline font-semibold">Mở lịch SRS</button></p>` : '';
  }

  function planHtml(data) {
    const plan = data.plan;
    if (!plan) return `<section class="${section}"><h2 class="text-lg font-bold">Kế hoạch hôm nay</h2><button type="button" data-study-action="regenerate" class="${primary}">Tạo kế hoạch</button></section>`;
    if (plan.ended) return summaryHtml(data.history.find(entry => entry.id === plan.id)) +
      `<button type="button" data-study-action="regenerate" class="${primary}">Tạo kế hoạch mới</button>`;
    const tasks = engine.groups(plan);
    const focus = plan.settings.focus === 'mix' ? plan.settings.mix.map(skill => SKILLS[skill]).join(', ') :
      SKILLS[plan.settings.focus] || 'Tự động theo điểm yếu';
    return `<section class="${section}">
      <h2 class="text-lg font-bold">${sameDay(plan) ? 'Kế hoạch hôm nay' : 'Buổi học đang dở'}</h2>
      <p class="${quiet}">${esc(focus)} · ${METHODS[plan.settings.method]}</p>
      <p class="${quiet}">Mục tiêu ${plan.minutes} phút · Ước tính ${estimatedMinutes(plan.items)} phút · ${tasks.length} nhiệm vụ · ${plan.items.length} câu hoặc thẻ</p>
      <progress class="block w-full accent-sky-700" value="${outcomes(plan).length}" max="${plan.items.length}" aria-label="Tiến độ buổi học"></progress>
      <p class="${quiet}">Đã làm ${outcomes(plan).length}/${plan.items.length} câu hoặc thẻ</p>
      <div class="flex flex-wrap gap-2"><button type="button" data-study-action="start" class="${primary}">${ongoing(plan) ? 'Tiếp tục buổi học' : 'Bắt đầu buổi học'}</button>
        <button type="button" data-study-action="regenerate" class="${button}">Tạo lại kế hoạch</button></div>
      <ol class="space-y-2">
        ${tasks.map((task, groupIndex) => {
          const items = task.indices.map(i => plan.items[i]);
          const complete = task.indices.every(i => plan.results[i]?.result && plan.results[i].result !== 'skipped');
          const skipped = task.indices.every(i => plan.results[i]?.result === 'skipped');
          const mutable = task.indices.some(i => !plan.results[i]);
          return `<li class="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <h3 class="font-semibold">${SKILLS[task.skill]} · ${items.length} câu hoặc thẻ · khoảng ${estimatedMinutes(items)} phút</h3>
            <p class="${quiet}">${[...new Set(items.map(item => REASONS[item.reason]))].map(esc).join(' ')}</p>
            ${complete ? '<p class="text-sm">Đã hoàn thành</p>' : skipped ? '<p class="text-sm">Đã bỏ qua</p>' : ''}
            ${mutable ? `<div class="flex flex-wrap gap-2 mt-2">
              <button type="button" data-study-action="skip" data-study-group="${groupIndex}" class="${button}">Bỏ qua</button>
              <button type="button" data-study-action="replace" data-study-group="${groupIndex}" class="${button}">Thay thế</button>
            </div>` : ''}
          </li>`;
        }).join('')}
      </ol>
    </section>`;
  }

  function questionHtml(plan) {
    const item = plan.items[plan.index];
    const result = plan.results[plan.index];
    const task = engine.groups(plan).findIndex(group => group.indices.includes(plan.index));
    return `<section class="${section}" id="smartStudyQuestion">
      <div class="flex flex-wrap justify-between gap-2"><p class="${quiet}">Nhiệm vụ ${task + 1} · Câu hoặc thẻ ${plan.index + 1}/${plan.items.length}</p>
        <button type="button" data-study-action="pause" class="${button}">Tạm dừng</button></div>
      <h2 class="text-xl font-bold">${SKILLS[item.skill]}</h2>
      <p class="${quiet}">${esc(REASONS[item.reason])}</p>
      ${item.audio ? `<button type="button" data-study-action="audio" class="${button}">Nghe đoạn tiếng Nhật</button>` : ''}
      <p class="whitespace-pre-line font-jp break-words text-lg">${esc(item.prompt)}</p>
      ${item.drill === 'card' && !plan.revealed && !result ? `<button type="button" data-study-action="reveal" class="${primary}">Lật thẻ</button>` : ''}
      ${item.drill === 'card' && plan.revealed && !result ? `<p class="whitespace-pre-line break-words">${esc(item.answer)}</p><div class="flex flex-wrap gap-2">
        <button type="button" data-study-action="grade" data-study-value="again" class="${button}">Chưa nhớ</button>
        <button type="button" data-study-action="grade" data-study-value="remembered" class="${primary}">Đã nhớ</button>
      </div>` : ''}
      ${item.drill === 'choice' && !result ? `<div class="grid sm:grid-cols-2 gap-2">${item.options.map((option,index) =>
        `<button type="button" data-study-action="grade" data-study-value="${index}" class="${button} text-left break-words">${esc(option)}</button>`).join('')}</div>` : ''}
      ${item.drill === 'write' && !result ? `<form id="smartStudyAnswerForm" class="space-y-2"><label class="text-sm font-semibold">Nhập đáp án
        <input name="answer" class="${control}" autocomplete="off" required></label><button type="submit" class="${primary}">Kiểm tra</button></form>` : ''}
      ${result ? `<div class="space-y-2" role="status">
        <p class="font-bold">${{correct:'Đúng',incorrect:'Chưa đúng',remembered:'Đã ghi nhận là đã nhớ',again:'Đã ghi nhận là cần ôn lại'}[result.result]}</p>
        <p class="whitespace-pre-line break-words">${esc(item.answer)}</p>
        ${item.detail ? `<p class="${quiet} whitespace-pre-line">${esc(item.detail)}</p>` : ''}
        ${item.audio ? `<details><summary class="cursor-pointer font-semibold">Xem lời thoại</summary><p class="font-jp">${esc(item.audio)}</p></details>` : ''}
        <button type="button" data-study-action="next" class="${primary}">${plan.results.slice(plan.index + 1).some(row => !row) ? 'Câu tiếp theo' : 'Hoàn tất buổi học'}</button>
      </div>` : ''}
      <button type="button" data-study-action="finish" class="${quiet} underline">Kết thúc buổi ở đây</button>
    </section>`;
  }

  function viewKey(data) {
    const p = data.plan;
    return JSON.stringify([p?.id, p?.started, p?.index, p?.ended, p?.revealed, p?.items.map(item => item.id), p?.results.map(result => result?.result), data.settings]);
  }

  function render(container) {
    let data;
    try { data = read(); }
    catch (error) {
      container.innerHTML = `<section class="${section}"><h1 class="text-2xl font-extrabold">Smart Study</h1><p role="alert">Không đọc được dữ liệu Smart Study. ${esc(error.message)}</p></section>`;
      return;
    }
    const plan = data.plan;
    if (!sameDay(plan) && !ongoing(plan)) prepareDaily();
    if (!ongoing(plan)) playing = false;
    renderedPlan = plan;
    renderedSettings = JSON.stringify(data.settings);
    lastViewKey = viewKey(data);
    container.innerHTML = `<div class="max-w-3xl mx-auto space-y-5">
      <header><h1 class="text-2xl font-extrabold">Smart Study</h1>
      <p class="${quiet}">${engine.streak(data.days)} ngày học liên tiếp · Thời lượng là mục tiêu, bạn có thể học tiếp khi cần.</p></header>
      ${playing ? questionHtml(plan) : planHtml(data) + dueNotice(data.plan && !data.plan.ended ? data.plan.settings : data.settings) + settingsHtml(data.settings) + historyHtml(data)}
    </div>`;
    trackClock(plan);
  }

  function checkShown(plan, expected, requireQuestion = true) {
    if (!expected || !plan || plan.id !== expected.id || plan.ended ||
      (requireQuestion && (expectedItem(plan) !== expectedItem(expected) ||
        plan.results[plan.index]?.result !== expected.results[expected.index]?.result))) {
      throw Error('Kế hoạch vừa thay đổi ở tab khác. Hãy kiểm tra lại câu đang mở.');
    }
  }

  function verifyAnswer(item, answer) {
    const entered = normalizeStudyAnswer(answer);
    const expected = normalizeStudyAnswer(item.answer);
    if (entered === expected) return true;
    const romaji = value => normalizeStudyAnswer(kanaToRomaji(value));
    return Boolean(entered && romaji(item.answer) && romaji(entered) === romaji(item.answer));
  }

  function rate(data, plan, value, elapsed, time) {
    const item = plan.items[plan.index];
    if (plan.results[plan.index]) return false;
    let result, selected;
    if (item.drill === 'card') {
      if (!plan.revealed || !['remembered','again'].includes(value)) return false;
      result = value;
    } else if (item.drill === 'choice') {
      selected = Number(value);
      if (!Number.isInteger(selected) || !item.options[selected]) return false;
      result = selected === item.correct ? 'correct' : 'incorrect';
    } else {
      if (!String(value).trim()) throw Error('Hãy nhập đáp án trước.');
      result = verifyAnswer(item,value) ? 'correct' : 'incorrect';
    }
    addTime(plan, elapsed);
    const previous = data.events.findLast(e => e.contentId === item.contentId && e.skill === item.skill && e.drill === item.drill) ||
      data.history.find(session => session.items.some(entry => entry.contentId === item.contentId && entry.skill === item.skill))
        ?.items.find(entry => entry.contentId === item.contentId && entry.skill === item.skill);
    const improved = (previous?.result === 'incorrect' && result === 'correct') ||
      (previous?.result === 'again' && result === 'remembered') || (Boolean(item.mistakeKey) && result === 'correct');
    const ms = plan.questionMs;
    const outcome = {result, ms, improved};
    if (selected !== undefined) outcome.selected = selected;
    plan.results[plan.index] = outcome;
    plan.questionMs = 0;
    engine.record(data, {contentId:item.contentId, skill:item.skill, drill:item.drill,
      form:item.form, result, responseMs:ms}, time);
    return () => n5SmartApplyOutcome(item, result, trimmed(selected === undefined ? value : item.options[selected],1200));
  }

  function planGroupUpdate(action, data, expected, groupIndex, elapsed, time) {
    const plan = data.plan;
    checkShown(plan, expected);
    const ids = engine.groups(expected)[groupIndex]?.indices || [];
    const current = engine.groups(plan)[groupIndex]?.indices || [];
    if (ids.length !== current.length || ids.some((index, i) => plan.items[current[i]]?.id !== expected.items[index].id)) throw Error('Nhiệm vụ vừa thay đổi. Hãy chọn lại.');
    const pending = current.filter(index => !plan.results[index]);
    if (!pending.length) return false;
    if (action === 'replace') {
      const exclude = new Set(plan.items.map(item => item.id));
      const skill = plan.items[pending[0]].skill;
      const excludeContent = new Set(plan.items.map(item => item.skill + '|' + item.contentId));
      const replacement = choose(data, {exclude, excludeContent, limit:pending.length, offset:time % 11 + 1},
        {...plan.settings, minutes:plan.minutes, focus:skill});
      if (replacement.length !== pending.length) throw Error('Chưa có đủ bài khác cùng kỹ năng để thay nhóm này.');
      pending.forEach((index,i) => {plan.items[index] = {...replacement[i], reason:'replace'};});
      if (pending.includes(plan.index)) { plan.revealed = false; plan.questionMs = 0; }
    } else {
      addTime(plan, elapsed);
      for (const index of pending) plan.results[index] = {result:'skipped', ms:index === plan.index ? plan.questionMs : 0, improved:false};
      if (pending.includes(plan.index)) engine.advance(data, time);
    }
  }

  async function perform(action, value, groupIndex) {
    if (busy) return;
    if (action === 'open') { navigateTo('smartStudy'); return; }
    if (action === 'srs') { navigateTo('srs'); return; }
    if (action === 'pause') { flushTime(); playing = false; renderCurrentView(true); return; }
    if (action === 'audio') {
      const plan = read().plan;
      checkShown(plan, renderedPlan);
      playAudio(plan.items[plan.index].audio);
      return;
    }
    if (action === 'clear' && !confirm('Xóa lịch sử phân tích và chuỗi ngày Smart Study? Lịch SRS, câu sai và buổi đang học vẫn được giữ.')) return;
    if ((action === 'regenerate' || action === 'finish') && ongoing(renderedPlan) &&
      !confirm(action === 'regenerate' ? 'Kết thúc buổi đang dở và tạo kế hoạch mới?' : 'Kết thúc buổi học tại đây?')) return;
    busy = true;
    const expected = renderedPlan;
    const expectedSettings = renderedSettings;
    const elapsed = stopClock();
    try {
      const changed = await change(data => {
        let plan = data.plan;
        const time = Math.max(Date.now(), plan?.created || 0, plan?.started || 0);
        if (action === 'quick' || action === 'start') {
          if (action === 'start') checkShown(plan,expected);
          if (!ongoing(plan) && (!sameDay(plan) || plan?.ended)) generate(data);
          plan = data.plan;
          if (!plan.started) plan.started = Math.max(time, plan.created);
        } else if (action === 'clear') {
          data.events = []; data.history = []; data.days = [];
          if (plan?.ended) { plan.results = plan.items.map(() => null); plan.questionMs = 0; }
        } else if (action === 'regenerate') {
          if (plan && expected && plan.id !== expected.id) throw Error('Kế hoạch vừa thay đổi ở tab khác. Hãy chọn lại.');
          if (ongoing(plan)) {
            checkShown(plan, expected);
            addTime(plan, elapsed);
            engine.finish(data, time);
          }
          generate(data, {offset:time % 11 + 1});
        } else if (action === 'settings') {
          if (expectedSettings !== JSON.stringify(data.settings)) throw Error('Thiết lập vừa thay đổi ở tab khác. Hãy mở lại để sửa.');
          const old = data.settings;
          data.settings = engine.checkSettings(value);
          const changedPlan = ['minutes','focus','method','mix'].some(key => JSON.stringify(old[key]) !== JSON.stringify(data.settings[key]));
          if (changedPlan && !ongoing(plan) && !plan?.ended) generate(data);
        } else {
          checkShown(plan, expected);
          if (action === 'reveal') {
            if (plan.revealed || plan.results[plan.index]) return false;
            addTime(plan, elapsed);
            plan.revealed = true;
          } else if (action === 'grade') {
            return rate(data, plan, value, elapsed, time);
          } else if (action === 'next') {
            if (!plan.results[plan.index]) return false;
            engine.advance(data, time);
          } else if (action === 'finish') {
            addTime(plan, elapsed);
            engine.finish(data, time);
          } else if (action === 'skip' || action === 'replace') {
            return planGroupUpdate(action, data, expected, Number(groupIndex), elapsed, time);
          } else return false;
        }
      });
      if (!changed) return;
      if (action === 'quick' || action === 'start') {
        playing = true;
        if (document.getElementById('mainContainer').dataset.n5Page !== 'smartStudy') navigateTo('smartStudy');
        else renderCurrentView(true);
      } else {
        if (action === 'regenerate' || action === 'finish') playing = false;
        renderCurrentView(true);
        if (action === 'settings') {
          document.getElementById('smartStudySettings').open = true;
          showToast('Đã lưu thiết lập Smart Study');
        }
      }
    } catch (error) {
      showToast(error.message || 'Không thể lưu Smart Study. Hãy thử lại.');
      renderCurrentView(true);
    } finally {
      busy = false;
    }
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-study-action]');
    if (!control) return;
    perform(control.dataset.studyAction, control.dataset.studyValue, control.dataset.studyGroup)
      .catch(error => showToast(error.message));
  });

  document.addEventListener('change', event => {
    const form = event.target.closest('#smartStudySettingsForm');
    if (!form) return;
    form.querySelector('[data-study-custom]').hidden = form.elements.duration.value !== 'custom';
    form.querySelector('[data-study-mix]').hidden = form.elements.focus.value !== 'mix';
  });

  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.id === 'smartStudySettingsForm') {
      event.preventDefault();
      const values = new FormData(form);
      const minutes = Number(values.get('duration') === 'custom' ? values.get('custom') : values.get('duration'));
      const mix = values.getAll('mix');
      if (!Number.isInteger(minutes) || minutes < 2 || minutes > 90) return showToast('Chọn thời lượng từ 2 đến 90 phút.');
      if (values.get('focus') === 'mix' && mix.length < 2) return showToast('Chọn ít nhất hai kỹ năng để kết hợp.');
      perform('settings', {minutes, focus:values.get('focus'), method:values.get('method'), mix, tracking:values.has('tracking')});
    } else if (form.id === 'smartStudyAnswerForm') {
      event.preventDefault();
      perform('grade', new FormData(form).get('answer'));
    }
  });

  document.addEventListener('toggle', event => {
    const details = event.target;
    if (!details.open || !details.dataset?.studyHistory || details.querySelector('section')) return;
    const summary = read().history.find(entry => entry.id === details.dataset.studyHistory);
    if (summary) details.insertAdjacentHTML('beforeend', summaryHtml(summary));
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushTime();
    else if (playing) trackClock(read().plan);
  });
  window.addEventListener('pagehide', flushTime);
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || event.key !== STORAGE_KEY) return;
    try {
      if (document.getElementById('mainContainer')?.dataset.n5Page === 'smartStudy' &&
        lastViewKey !== viewKey(read()) && !document.activeElement?.matches('input,select')) renderCurrentView(true);
      else updateHome();
    } catch { /* The next visit will report an invalid snapshot. */ }
  });

  window.n5SmartStudy = {
    withLock, restore, restoreRaw, render, homeHtml, setView,
    snapshot() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return undefined;
      return read();
    },
    wouldReplaceInProgress(incoming) {
      const local = read().plan;
      return incoming !== undefined && ongoing(local) && !samePlan(local, incoming.plan);
    },
    record(contentId, type, drill, result, form) {
      const id = trimmed(contentId, 180);
      if (!id) return;
      change(data => engine.record(data, {contentId:id, skill:skillOf(type), drill, result, form:formKey(form)}))
        .then(updateHome).catch(() => {});
    }
  };

  function samePlan(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
})();
