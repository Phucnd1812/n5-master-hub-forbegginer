(function (root) {
  'use strict';

  const STORAGE_KEY = 'n5_smart_study_v1';
  const SKILLS = Object.freeze({
    vocab: 'Từ vựng', kanji: 'Kanji', grammar: 'Ngữ pháp',
    form: 'Chia thể', listening: 'Nghe hiểu', reading: 'Đọc hiểu', jlpt: 'JLPT N5'
  });
  const METHODS = Object.freeze({
    balanced: 'Cân bằng kiến thức mới và ôn tập',
    review: 'Ưu tiên ôn tập',
    new: 'Ưu tiên kiến thức mới'
  });
  const REASONS = Object.freeze({
    due: 'Đến hạn ôn theo lịch SRS.',
    again: 'Bạn đã đánh dấu chưa nhớ.',
    mistake: 'Bạn từng làm sai mục này và còn cần luyện lại.',
    form: 'Bạn gần đây làm sai dạng chia này.',
    followup: 'Lần luyện gần đây cho thấy mục này cần ôn thêm.',
    chapter: 'Kiến thức mới trong bài đang học hoặc bài tiếp theo.',
    new: 'Bạn chưa học mục này trong giáo trình.',
    practice: 'Bài luyện chưa có kết quả ghi nhận.',
    review: 'Ôn lại nội dung đã học.',
    replace: 'Bạn chọn bài này để thay nhiệm vụ cũ.'
  });
  const DEFAULTS = Object.freeze({ minutes: 5, focus: 'auto', method: 'balanced', mix: Object.freeze([]), tracking: true });
  const OUTCOMES = ['correct', 'incorrect', 'remembered', 'again'];
  const DRILLS = ['card', 'choice', 'write', 'srs', 'mistake', 'quiz'];
  const MAX_ITEMS = 80;
  const MAX_SESSIONS = 45;
  const MAX_EVENTS = 600;
  const MAX_ACTIVE_DAYS = 400;
  const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

  function dayKey(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function empty() {
    return { schema: 1, settings: {...DEFAULTS, mix: []}, plan: null, history: [], events: [], days: [] };
  }

  function requireValue(condition) {
    if (!condition) throw new Error('Dữ liệu Smart Study không hợp lệ hoặc thuộc phiên bản mới hơn.');
  }

  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isText = (value, max) => typeof value === 'string' && value.length <= max;
  const isInt = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const isTime = value => isInt(value, 0, Number.MAX_SAFE_INTEGER);
  const isDay = value => typeof value === 'string' && dayPattern.test(value);
  const isSkill = value => Object.hasOwn(SKILLS, value);

  function checkSettings(value) {
    requireValue(isObject(value) && isInt(value.minutes, 2, 90) &&
      (['auto', 'mix'].includes(value.focus) || isSkill(value.focus)) &&
      Object.hasOwn(METHODS, value.method) && typeof value.tracking === 'boolean' &&
      Array.isArray(value.mix) && value.mix.length <= Object.keys(SKILLS).length && value.mix.every(isSkill));
    return { minutes:value.minutes, focus:value.focus, method:value.method, mix:[...new Set(value.mix)], tracking:value.tracking };
  }

  function checkItem(item) {
    requireValue(isObject(item) && isText(item.id, 180) && item.id.length > 0 &&
      isText(item.contentId, 180) && item.contentId.length > 0 && isSkill(item.skill) &&
      ['card', 'choice', 'write'].includes(item.drill) && Object.hasOwn(REASONS, item.reason) &&
      isText(item.title, 100) && isText(item.prompt, 1800) && isText(item.answer, 1200) &&
      isInt(item.seconds, 10, 150) && (item.section === undefined || isSkill(item.section)) && [item.detail, item.audio, item.form, item.mistakeKey].every(v => v === undefined || isText(v, 1800)) &&
      (item.drill !== 'choice' || (Array.isArray(item.options) && isInt(item.options.length, 2, 5) &&
        item.options.every(option => isText(option, 1200)) && isInt(item.correct, 0, item.options.length - 1) &&
        item.options[item.correct] === item.answer)));
  }

  function checkPlan(plan) {
    requireValue(isObject(plan) && isText(plan.id, 80) && isDay(plan.day) &&
      isInt(plan.minutes, 2, 90) && isTime(plan.created) && isTime(plan.started) && isTime(plan.ended) &&
      (plan.started === 0 || plan.started >= plan.created) && (plan.ended === 0 || plan.ended >= Math.max(plan.created, plan.started)) &&
      Array.isArray(plan.items) && isInt(plan.items.length, 1, MAX_ITEMS) &&
      Array.isArray(plan.results) && plan.results.length === plan.items.length &&
      isInt(plan.index, 0, plan.items.length) && (plan.index === plan.items.length) === Boolean(plan.ended) &&
      typeof plan.revealed === 'boolean' && isInt(plan.questionMs, 0, 3600000));
    checkSettings(plan.settings);
    requireValue(plan.minutes === plan.settings.minutes);
    const ids = new Set();
    plan.items.forEach((item, i) => {
      checkItem(item);
      const result = plan.results[i];
      requireValue(!ids.has(item.id) && (i >= plan.index || result !== null || Boolean(plan.ended)));
      if (result !== null) {
        requireValue(isObject(result) && [...OUTCOMES, 'skipped'].includes(result.result) &&
          isInt(result.ms, 0, 3600000) && typeof result.improved === 'boolean' &&
          (result.selected === undefined || (item.drill === 'choice' && isInt(result.selected, 0, item.options.length - 1))));
      }
      ids.add(item.id);
    });
  }

  function checkSummary(summary) {
    requireValue(isObject(summary) && isText(summary.id, 80) && isDay(summary.day) &&
      isInt(summary.minutes, 2, 90) && isTime(summary.ended) &&
      isInt(summary.total, 1, MAX_ITEMS) && isInt(summary.tasks, 1, MAX_ITEMS) &&
      isInt(summary.doneTasks, 0, summary.tasks) && isTime(summary.ms) &&
      Array.isArray(summary.items) && isInt(summary.items.length, 1, summary.total));
    summary.items.forEach(item => requireValue(isObject(item) && isText(item.contentId, 180) &&
      isText(item.title, 100) && isSkill(item.skill) && OUTCOMES.includes(item.result) && typeof item.improved === 'boolean'));
  }

  function checkEvent(event) {
    requireValue(isObject(event) && isText(event.contentId, 180) && event.contentId.length > 0 &&
      isSkill(event.skill) && DRILLS.includes(event.drill) && OUTCOMES.includes(event.result) &&
      isTime(event.at) && isDay(event.day) && isInt(event.attempt, 1, Number.MAX_SAFE_INTEGER) &&
      (event.form === undefined || isText(event.form, 120)) &&
      (event.responseMs === undefined || isInt(event.responseMs, 0, 3600000)));
  }

  function validate(value) {
    requireValue(isObject(value) && value.schema === 1);
    const settings = checkSettings(value.settings);
    if (value.plan !== null) checkPlan(value.plan);
    requireValue(Array.isArray(value.history) && value.history.length <= MAX_SESSIONS &&
      Array.isArray(value.events) && value.events.length <= MAX_EVENTS &&
      Array.isArray(value.days) && value.days.length <= MAX_ACTIVE_DAYS && value.days.every(isDay));
    value.history.forEach(checkSummary);
    value.events.forEach(checkEvent);
    return { schema:1, settings, plan:value.plan, history:value.history, events:value.events, days:value.days };
  }

  function rememberDay(data, day) {
    if (!data.days.includes(day)) data.days = [...data.days, day].sort().slice(-MAX_ACTIVE_DAYS);
  }

  function streak(days, now = new Date()) {
    const actual = new Set(days);
    const date = new Date(now);
    if (!actual.has(dayKey(date))) date.setDate(date.getDate() - 1);
    let count = 0;
    while (actual.has(dayKey(date))) {
      count++;
      date.setDate(date.getDate() - 1);
    }
    return count;
  }

  function record(data, activity, timestamp = Date.now()) {
    const day = dayKey(new Date(timestamp));
    rememberDay(data, day);
    if (!data.settings.tracking) return;
    const last = data.events.findLast(event => event.contentId === activity.contentId &&
      event.skill === activity.skill && event.drill === activity.drill);
    const event = {
      contentId: activity.contentId,
      skill: activity.skill,
      drill: activity.drill,
      result: activity.result,
      at: timestamp,
      day,
      attempt: Math.min(Number.MAX_SAFE_INTEGER, (last?.attempt || 0) + 1)
    };
    if (activity.form) event.form = activity.form.slice(0, 120);
    if (activity.responseMs !== undefined) event.responseMs = activity.responseMs;
    checkEvent(event);
    data.events.push(event);
    if (data.events.length > MAX_EVENTS) data.events.splice(0, data.events.length - MAX_EVENTS);
  }

  function ranked(catalog, input, study, day) {
    const completed = new Set(input.completed);
    const unresolved = new Map();
    const wrongForms = new Map();
    const latest = new Map();
    const lastSession = new Map();
    for (const entry of input.mistakes) {
      if (entry.mastered || !entry.id) continue;
      const id = String(entry.contentId || entry.id);
      unresolved.set(id, (unresolved.get(id) || 0) + 1);
    }
    for (const event of study.events) latest.set(event.skill + '|' + event.contentId, event);
    for (const event of latest.values()) {
      if (event.form && event.result === 'incorrect') wrongForms.set(event.form, (wrongForms.get(event.form) || 0) + 1);
    }
    for (const item of study.history[0]?.items || []) lastSession.set(item.skill + '|' + item.contentId, item.result);
    // The first incomplete lesson anchors new material. Untouched accounts start at the first lesson.
    const chapters = new Map(input.lessons.map(lesson => [lesson, {total:0, done:0}]));
    for (const item of catalog) {
      if (item.drill !== 'card' || !chapters.has(item.lesson)) continue;
      const chapter = chapters.get(item.lesson);
      chapter.total++;
      if (completed.has(item.contentId)) chapter.done++;
    }
    const chapter = [...chapters].find(([,v]) => v.total && v.done < v.total)?.[0];
    const recent = input.studyLog.slice(-7).some(row => Number(row.minutes) > 0);

    return catalog.map((item, order) => {
      const key = item.skill + '|' + item.contentId;
      const event = latest.get(key);
      const last = lastSession.get(key);
      const record = item.drill === 'card' ? input.review[item.contentId] : null;
      const due = Boolean(record && (!record.due || String(record.due).slice(0,10) <= day));
      const misses = unresolved.get(item.contentId) || 0;
      const formMisses = wrongForms.get(item.form) || 0;
      let priority, reason, review = true;
      if (due) [priority, reason] = [210 + Math.min(20, misses), 'due'];
      else if (record?.remembered === false) [priority, reason] = [200, 'again'];
      else if (item.mistakeKey || misses) [priority, reason] = [175 + Math.min(18, misses * 3), 'mistake'];
      else if (event?.result === 'incorrect' || event?.result === 'again' || last === 'incorrect' || last === 'again') [priority, reason] = [160, 'followup'];
      else if (formMisses) [priority, reason] = [142 + Math.min(10, formMisses), 'form'];
      else if (record || completed.has(item.contentId) || event || last) [priority, reason] = [25, 'review'];
      else {
        review = false;
        const inChapter = chapter && item.lesson === chapter;
        const newCard = item.drill === 'card';
        [priority, reason] = [inChapter ? 85 : (newCard ? 60 : recent ? 65 : 55), inChapter ? 'chapter' : newCard ? 'new' : 'practice'];
      }
      return {item, review, priority, reason, order};
    }).sort((a,b) => b.priority - a.priority || a.order - b.order);
  }

  function chooseItems(catalog, input, study, settings, options = {}) {
    const { day = dayKey(), exclude = new Set(), excludeContent = new Set(), limit = MAX_ITEMS, offset = 0 } = options;
    const focus = settings.focus === 'mix' ? (settings.mix.length ? settings.mix : Object.keys(SKILLS)) :
      settings.focus === 'auto' ? Object.keys(SKILLS).filter(skill => skill !== 'jlpt') : [settings.focus];
    const pool = ranked(catalog.filter(item => focus.includes(item.skill) && !exclude.has(item.id)), input, study, day);
    const review = pool.filter(entry => entry.review);
    const fresh = pool.filter(entry => !entry.review);
    const urgentCount = review.filter(entry => entry.priority >= 140).length;
    const baseRatio = { balanced:0.55, review:0.82, new:0.28 }[settings.method];
    const reviewRatio = Math.min(0.92, baseRatio + Math.min(0.19, urgentCount * 0.025));
    const budget = settings.minutes * 60;
    const maxCount = Math.min(limit, MAX_ITEMS, settings.minutes <= 5 ? 4 : MAX_ITEMS);
    const chosen = [];
    const counts = new Map();
    const lane = item => item.section || item.skill;
    const used = new Set(exclude);
    const contentUsed = new Set(excludeContent);
    let spent = 0, reviewing = 0;
    function best(queue) {
      let top = null, score = -Infinity;
      for (const entry of queue) {
        const {item} = entry;
        if (used.has(item.id) || contentUsed.has(item.skill + '|' + item.contentId) || (spent && spent + item.seconds > budget)) continue;
        const spread = ['auto','mix','jlpt'].includes(settings.focus) ? (counts.get(lane(item)) || 0) * 14 : 0;
        const rotate = offset ? (entry.order + offset) % Math.min(queue.length || 1, 13) : 0;
        const value = entry.priority - spread - rotate;
        if (value > score) { top = entry; score = value; }
      }
      return top;
    }
    while (chosen.length < maxCount) {
      const needReview = (!chosen.length && urgentCount > 0) || reviewing < (spent + 55) * reviewRatio;
      const next = best(needReview ? review : fresh) || best(needReview ? fresh : review);
      if (!next) break;
      const {item, reason} = next;
      // Materialize options only for the selected cards and prompts.
      const { lesson, materialize, ...question } = item;
      const selected = {...question, ...(materialize ? materialize() : {}), reason};
      checkItem(selected);
      chosen.push(selected);
      used.add(item.id);
      contentUsed.add(item.skill + '|' + item.contentId);
      counts.set(lane(item), (counts.get(lane(item)) || 0) + 1);
      spent += item.seconds;
      if (next.review) reviewing += item.seconds;
    }
    return chosen;
  }

  function groups(plan) {
    const grouped = [];
    plan.items.forEach((item, index) => {
      const last = grouped.at(-1);
      if (last && last.skill === item.skill && last.indices.length < 3) last.indices.push(index);
      else grouped.push({skill:item.skill, indices:[index]});
    });
    return grouped;
  }

  function newPlan(items, id, settings, time = Date.now()) {
    if (!items.length) return null;
    return {
      id, day:dayKey(new Date(time)), minutes:settings.minutes, settings:checkSettings(settings), created:time, started:0, ended:0,
      items, results:items.map(() => null), index:0, revealed:false, questionMs:0
    };
  }

  function finish(data, time) {
    const plan = data.plan;
    plan.ended = time;
    plan.index = plan.items.length;
    plan.revealed = false;
    const completed = plan.results.flatMap((result, i) => {
      if (!result || result.result === 'skipped') return [];
      const {contentId, title, skill} = plan.items[i];
      return [{contentId, title, skill, result:result.result, improved:result.improved}];
    });
    if (!completed.length) return null;
    const tasks = groups(plan);
    const summary = {
      id:plan.id, day:dayKey(new Date(time)), ended:time, minutes:plan.minutes, tasks:tasks.length,
      doneTasks:tasks.filter(task => task.indices.every(i => plan.results[i] && plan.results[i].result !== 'skipped')).length,
      total:plan.items.length, ms:plan.questionMs + plan.results.reduce((sum, result) => sum + (result?.ms || 0), 0), items:completed
    };
    data.history = [summary, ...data.history.filter(entry => entry.id !== summary.id)].slice(0, MAX_SESSIONS);
    return summary;
  }

  function advance(data, time) {
    const plan = data.plan;
    plan.revealed = false;
    plan.questionMs = 0;
    while (plan.results[plan.index] && plan.index < plan.items.length) plan.index++;
    if (plan.index >= plan.items.length) finish(data, time);
  }

  root.N5StudyEngine = {
    STORAGE_KEY, SKILLS, METHODS, REASONS, DEFAULTS, MAX_ITEMS,
    dayKey, empty, validate, checkSettings, streak, record, chooseItems, groups, newPlan, finish, advance
  };
})(globalThis);
