import {HAS_HAN, IS_KANA, plain} from './text.js';
import {createSearchClient} from './search-client.js';

const TYPES = {vocab:'Từ vựng', kanji:'Kanji', grammar:'Ngữ pháp', lesson:'Giáo trình'};
const MATCH_LABELS = {
  exact:'Khớp chính xác', prefix:'Khớp đầu từ', partial:'Khớp một phần',
  inferred:'Suy luận từ cách dùng', fuzzy:'Gợi ý gần đúng',
};
const CHUNK = 14;
const DIALOG_RESULTS = 6;
const RESULT_CAP = 300;
const PREFS = 'n5_lookup_display_v1';
const GROUP_LABELS = {
  I:'Động từ nhóm I (godan)', II:'Động từ nhóm II (ichidan)', III:'Động từ nhóm III (bất quy tắc)',
  i:'Tính từ い', na:'Tính từ な',
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[char]);

function button(action, value, label, attributes = '') {
  return `<button type="button" data-lookup="${action}" data-value="${esc(value)}" ${attributes}>${label}</button>`;
}

function list(values) {
  return `<ul>${values.map(value => `<li>${esc(value)}</li>`).join('')}</ul>`;
}

function labelLine(name, value) {
  return value ? `<p><strong>${name}</strong> ${esc(value)}</p>` : '';
}

function japanese(value, reading, showReading) {
  const text = esc(value);
  return `<span lang="ja" class="n5-lookup-jp">${showReading && IS_KANA.test(reading) && HAS_HAN.test(value)
    ? `<ruby>${text}<rt>${esc(reading)}</rt></ruby>` : text}</span>`;
}

function tokenClass(part) {
  if (part.kind === 'function') return 'particle';
  if (/Tính từ/i.test(part.pos || '') || ['i','na'].includes(part.lemma?.group)) return 'adjective';
  if (/Động từ/i.test(part.pos || '') || /^(I|II|III)$/.test(part.lemma?.group || '')) return 'verb';
  if (/Danh từ/i.test(part.pos || '')) return 'noun';
  return 'word';
}

function displaySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS) || '{}');
    return {roman:saved?.roman !== false, furigana:saved?.furigana !== false};
  } catch {
    return {roman:true, furigana:true};
  }
}

function pendingLookup(query) {
  return `<div class="n5-lookup">
    <h1>Kết quả cho “${esc(query)}”</h1>
    <p class="n5-lookup-status" role="status">Đang tra cứu…</p>
  </div>`;
}

export function createLookupUI(app) {
  const settings = displaySettings();
  const workerURL = new URL('./search-worker.js', import.meta.url);
  workerURL.search = new URL(import.meta.url).search;
  let guides;
  let guideById;
  let grammarModule;
  let grammarView;
  let client;
  let revision;
  let serial = 0;
  let rendered = null;
  let limits = {};
  let activeArea;
  let dialog;
  let previousFocus;
  let frames = [];
  let composing = false;

  const getGuides = () => guides ??= import('./grammar-data.js').then(module => guideById = module.GRAMMAR_BY_ID);
  const grammarTitle = id => grammarModule?.grammarName(id) || guideById?.get(id)?.title ||
    (frames.at(-1)?.model || rendered?.model)?.results.find(entry => entry.type === 'grammar' && entry.id === id)?.title ||
    plain(app.item('grammar',id)?.title) || 'Ngữ pháp liên quan';
  const rubric = (value, reading) => japanese(value, reading, settings.furigana);

  function getClient() {
    const current = app.dictionaryRevision();
    if (!client || current !== revision) {
      client?.close();
      client = createSearchClient(app.sources(), workerURL);
      revision = current;
    }
    return client;
  }

  function resultCard(entry) {
    const {type, id, title, reading, romaji, description, location, source} = entry;
    return `<article class="n5-lookup-card" data-result-type="${type}" data-result-id="${esc(id)}">
      ${source || location ? '<div class="n5-lookup-meta">' + esc(source || location) + '</div>' : ''}
      <h3>${button(type,id,type === 'lesson' ? esc(title) : rubric(title,reading), 'class="n5-lookup-title"')}</h3>
      ${settings.furigana && reading && reading !== title ? `<p class="n5-lookup-meta" lang="ja">${esc(reading)}</p>` : ''}
      ${settings.roman && romaji ? `<p class="n5-lookup-meta">${esc(romaji)}</p>` : ''}
      ${description ? `<p>${esc(description)}</p>` : ''}
      ${entry.match ? '<small class="n5-lookup-meta" data-match="' + entry.match + '">' + MATCH_LABELS[entry.match] + '</small>' : ''}
    </article>`;
  }

  function analysisPanel(analysis, expanded, kanaSuggestion) {
    if (!analysis) {
      if (kanaSuggestion) return `<section class="n5-lookup-card">
        <p>Gợi ý cách gõ Kana</p>${button('search',kanaSuggestion,rubric(kanaSuggestion,''),'class="n5-lookup-chip"')}
        <p class="n5-lookup-meta">Chưa xác định được từ hoặc nghĩa từ cách gõ này.</p></section>`;
      return expanded ? '<section class="n5-lookup-card"><p>Nhập từ đã chia hoặc một câu tiếng Nhật để xem các thành phần nhận diện được.</p></section>' : '';
    }
    const {parts, grammar, phrases, original, notes, japanese:written, readings, romaji, translation} = analysis;
    const words = parts.filter(part => part.kind === 'word' || part.kind === 'function');
    if (!expanded && !words.some(part => part.form || part.alternatives.length) &&
        !grammar.length && !translation && !notes.length && words.length <= 1) return '';
    const terms = parts.map((part, index) => {
      if (part.kind === 'punct') return `<span class="n5-lookup-punct">${esc(part.text)}</span>`;
      if (part.kind === 'unknown') return `<span class="n5-lookup-unknown" lang="ja">${esc(part.text)}</span>`;
      const word = part.text === part.jp || /^[a-z0-9]+$/i.test(part.text) ? part.jp : part.text;
      const type = part.ending ? 'structure' : tokenClass(part);
      const content = rubric(word,part.kana);
      return part.lemma || part.grammar ? button('part',String(index),content,`class="n5-token ${type}"`)
        : `<span class="n5-token ${type}">${content}</span>`;
    }).join('');
    const mainForm = words.find(part => part.form);
    const showPhrases = expanded && phrases?.length > 0 && parts.filter(part => part.kind !== 'punct').length > 1;
    const phraseCards = showPhrases ? '<div class="n5-lookup-phrases">' + phrases.map(({label,indices,tentative}) =>
      '<div><span class="n5-lookup-meta">' + esc(label) + (tentative ? ' · theo ngữ cảnh' : '') + '</span><div>' +
      indices.map(index => {
        const part = parts[index];
        return part.lemma || part.grammar ? button('part',index,rubric(part.jp,part.kana),'class="n5-token ' + tokenClass(part) + '"') :
          '<span lang="ja">' + esc(part.text) + '</span>';
      }).join('') + '</div></div>').join('') + '</div>' : '';
    return `<section class="n5-lookup-card n5-lookup-analysis" data-lookup-analysis>
      <h2>${words.length === 1 && mainForm ? 'Phân tích dạng chia' : 'Phân tích câu / cụm từ'}</h2>
      ${expanded ? `<p class="n5-lookup-sentence" ${written === original ? 'lang="ja"' : ''}>${esc(original)}</p>` : ''}
      ${written && written !== original ? `<p class="n5-lookup-sentence" lang="ja">${esc(written)}</p>` : ''}
      ${settings.furigana && readings ? labelLine('Cách đọc',readings) : ''}
      ${settings.roman && romaji ? labelLine('Romaji',romaji) : ''}
      ${translation ? labelLine('Nghĩa theo câu đối chiếu',translation) :
        (expanded && words.length > 1 ? '<p class="n5-lookup-meta">Kho hiện tại chưa có bản dịch đối chiếu cho câu này.</p>' : '')}
      ${written && words.length ? `<div class="n5-lookup-actions">
        ${button('sentence-audio','','Nghe tiếng Nhật','class="n5-lookup-chip"')}
        ${translation ? button('sentence-card','','Thêm câu vào Flashcard','class="n5-lookup-chip"') : ''}
      </div>` : ''}
      ${showPhrases ? phraseCards : `<div class="n5-lookup-terms">${terms}</div>`}
      ${words.length === 1 && mainForm ? formSummary(mainForm.form) : ''}
      ${expanded && words.length > 0 ? `<div class="n5-lookup-analysis-list">${parts.map((part, index) => {
        if (part.kind === 'punct') return '';
        if (part.kind === 'unknown') return `<div class="n5-lookup-term"><span lang="ja">${esc(part.text)}</span><span class="n5-lookup-meta">Chưa nhận diện</span></div>`;
        const content = rubric(part.jp,part.kana);
        return `<div class="n5-lookup-term">
          ${part.lemma || part.grammar ? button('part',index,content,'class="n5-lookup-title"') : content}
          <div>${labelLine(part.form ? 'Từ gốc' : '',part.form?.lemma.jp || '')}
          ${labelLine('',part.form?.label || part.pos || 'Thành phần ngữ pháp')}
          ${labelLine('',part.role || part.vi)}
          ${part.ending ? labelLine('Phần cấu trúc',part.ending) : ''}
          ${part.form ? button('part',index,'Xem từng bước chia','class="n5-lookup-chip"') : ''}
          ${part.alternatives.length ? button('part',index,'Xem cách phân tích khác','class="n5-lookup-chip"') : ''}</div>
        </div>`;
      }).join('')}</div>` : ''}
      ${grammar.length ? `<div class="n5-lookup-actions">${grammar.map(id =>
        button('grammar',id,esc(grammarTitle(id)),'class="n5-lookup-chip"')).join('')}</div>` : ''}
      ${(notes || []).map(note => `<p class="n5-lookup-meta">${esc(note)}</p>`).join('')}
      ${!expanded ? button('filter','sentence','Xem toàn bộ phân tích','class="n5-lookup-chip"') : ''}
    </section>`;
  }

  function formSummary(form) {
    return `<div class="n5-lookup-form">
      <h3>${esc(form.label)}</h3>
      <p class="n5-lookup-path" lang="ja">${form.steps.map(step => esc(step.jp)).join(' → ')}</p>
      ${labelLine('Nghĩa của dạng chia',form.meaning)}
      ${labelLine('Sắc thái',form.register)}
    </div>`;
  }

  function formSteps(form) {
    return `<ol class="n5-lookup-steps">${form.steps.map(step => `<li>
      <strong>${rubric(step.jp,step.kana)}</strong> ${esc(step.label)}
      ${step.changed ? labelLine('Biến đổi cách đọc',(step.changed.removed || '∅') + ' → ' + (step.changed.added || '∅')) : ''}
      ${labelLine('Quy tắc',step.rule)}${labelLine('Ý nghĩa',step.meaning)}
      </li>`).join('')}</ol>`;
  }

  function draw(container, query, filter, model) {
    const {results, counts, analysis, kanaSuggestion} = model;
    const group = (type) => {
      const title = TYPES[type];
      const limit = limits[type] || CHUNK;
      const entries = results.filter(entry => entry.type === type);
      if (!entries.length) return '';
      return `<section class="n5-lookup-group">
        <header><h2>${title}</h2><span class="n5-lookup-meta">${counts[type]} kết quả</span></header>
        <div class="n5-lookup-grid">${entries.slice(0,limit).map(resultCard).join('')}</div>
        ${entries.length > limit ? button('more',type,'Hiện thêm ' + Math.min(CHUNK,entries.length-limit) + ' kết quả','class="n5-lookup-chip"') : ''}
        ${counts[type] > RESULT_CAP ? `<p class="n5-lookup-meta">Hiển thị tối đa ${RESULT_CAP} kết quả. Nhập thêm để thu hẹp.</p>` : ''}
      </section>`;
    };
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const filters = [['all','Tất cả',total],['vocab','Từ vựng',counts.vocab],['kanji','Kanji',counts.kanji],
      ['grammar','Ngữ pháp',counts.grammar],['sentence','Phân tích câu']];
    const rankedTypes = [...new Set(results.map(entry => entry.type))];
    const visible = filter === 'sentence' ? analysisPanel(analysis,true,kanaSuggestion) :
      filter === 'all' ? analysisPanel(analysis,false,results.length ? '' : kanaSuggestion) + rankedTypes.map(group).join('') : group(filter);
    const history = app.saved();
    const recent = app.recent().filter(entry => entry !== query);
    container.innerHTML = `<div class="n5-lookup" data-lookup-state="ready">
      <header class="n5-lookup-heading">
        <h1>Kết quả cho “${esc(query)}”</h1>
        <div class="n5-lookup-actions">
          ${button('save','','Lưu tra cứu','class="n5-lookup-chip"')}
          ${button('clear','','Xóa tìm kiếm','class="n5-lookup-chip"')}
        </div>
      </header>
      <div class="n5-lookup-actions n5-lookup-filters" aria-label="Lọc loại kết quả" role="group">
        ${filters.map(([key,title,count]) => button('filter',key,
          title + (count ? ` <small>${count}</small>` : ''),`class="n5-lookup-chip" aria-pressed="${filter === key}"`)).join('')}
      </div>
      <div class="n5-lookup-actions n5-lookup-settings">
        ${button('setting','roman','Romaji',`class="n5-lookup-chip" aria-pressed="${settings.roman}"`)}
        ${button('setting','furigana','Furigana',`class="n5-lookup-chip" aria-pressed="${settings.furigana}"`)}
      </div>
      ${visible || '<p class="n5-lookup-status">Chưa thấy kết quả phù hợp. Thử cách đọc, nghĩa hoặc một phần của từ.</p>'}
      <footer class="n5-lookup-footer">
        ${recent.length ? historyList('Tra cứu gần đây',recent,'clear-recent') : ''}
        ${history.length ? historyList('Lịch sử đã lưu',history,'clear-history') : ''}
        <div class="n5-lookup-actions">
          ${button('dictionary','','Quản lý kho từ điển','class="n5-lookup-chip"')}
          ${button('translate','ja-vi','Dịch Nhật → Việt (Google)','class="n5-lookup-chip"')}
          ${button('translate','vi-ja','Dịch Việt → Nhật (Google)','class="n5-lookup-chip"')}
        </div>
      </footer>
    </div>`;
  }

  function historyList(title, entries, action) {
    return `<details class="n5-lookup-card n5-lookup-history">
      <summary>${title} (${entries.length})</summary>
      <div class="n5-lookup-actions">${entries.map(entry =>
        button('search',entry,esc(entry),'class="n5-lookup-chip"')).join('')}
        ${button(action,'','Xóa danh sách','class="n5-lookup-chip"')}</div>
    </details>`;
  }

  function render(container, query, filter) {
    if (!activeArea) {
      activeArea = container;
      activeArea.addEventListener('click', handlePageAction);
    }
    if (rendered?.query === query && rendered.revision === app.dictionaryRevision()) {
      draw(container,query,filter,rendered.model);
      app.rendered(query);
      return;
    }
    if (rendered?.query !== query) limits = {};
    const ticket = ++serial;
    const epoch = app.dictionaryRevision();
    container.innerHTML = pendingLookup(query);
    getClient().search(query).then(model => {
      if (!model || serial !== ticket || !app.current(query) || epoch !== app.dictionaryRevision()) return;
      rendered = {query, revision:epoch, model};
      draw(container,query,app.filter(),model);
      app.rendered(query);
    }).catch(() => {
      if (serial === ticket && app.current(query)) {
        container.innerHTML = `<div class="n5-lookup"><h1>Kết quả cho “${esc(query)}”</h1>
          <p role="status">Chưa mở được công cụ tra cứu. Hãy thử tải lại trang.</p></div>`;
      }
    });
  }

  function preserveButton(action, value) {
    const control = [...activeArea.querySelectorAll('button[data-lookup]')].find(candidate =>
      candidate.dataset.lookup === action && candidate.dataset.value === value);
    control?.focus({preventScroll:true});
  }

  function toggleDisplay(key) {
    if (key !== 'roman' && key !== 'furigana') return;
    settings[key] = !settings[key];
    try { localStorage.setItem(PREFS,JSON.stringify(settings)); } catch {}
  }

  function handlePageAction(event) {
    const control = event.target.closest('button[data-lookup]');
    if (!control) return;
    const {lookup:action, value} = control.dataset;
    if (action === 'filter') { app.setFilter(value); preserveButton(action,value); return; }
    if (action === 'setting') {
      toggleDisplay(value);
      app.refresh();
      preserveButton(action,value);
      return;
    }
    if (action === 'more') { limits[value] = (limits[value] || CHUNK) + CHUNK; app.refresh(); preserveButton(action,value); return; }
    if (action === 'search') { app.query(value); return; }
    if (action === 'clear') { app.clear(); return; }
    if (action === 'save') { app.save(rendered.query); preserveButton(action,value); return; }
    if (action === 'clear-history') { app.clearSaved(); return; }
    if (action === 'clear-recent') { app.clearRecent(); return; }
    if (action === 'dictionary') { app.openCourse(() => app.openDictionary()); return; }
    if (action === 'translate') {
      app.translate(value === 'ja-vi' ? rendered.model.analysis?.japanese || rendered.query : rendered.query,value);
      return;
    }
    if (action === 'sentence-audio') { app.audio(rendered.model.analysis.japanese); return; }
    if (action === 'sentence-card') {
      const {japanese, readings, translation} = rendered.model.analysis;
      app.addCard({title:japanese,reading:readings,description:translation,pos:'Câu mẫu',source:'N5 Master Hub'});
      return;
    }
    app.remember(rendered?.query);
    openDetail(action,value,control);
  }

  async function getGrammarView() {
    grammarModule ??= await import('../grammar/grammar-ui.js');
    grammarView ??= grammarModule.createGrammarView({esc,button,detailButton,settings,toggleDisplay,app,
      open:(type,id,payload) => openDetail(type,id,document.activeElement,payload),
      search:query => getClient().search(query), entryLemma});
    return grammarView;
  }

  function makeDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'n5-lookup-dialog';
    dialog.setAttribute('aria-labelledby','n5-lookup-dialog-title');
    dialog.innerHTML = `<div class="n5-lookup-sheet">
      <header class="n5-lookup-dialog-head">
        <h2 id="n5-lookup-dialog-title"></h2>
        ${button('detail-back','','Quay lại','class="n5-lookup-chip" hidden')}
        ${button('detail-close','','Đóng','class="n5-lookup-chip" autofocus')}
      </header>
      <form class="n5-lookup-dialog-search" role="search" aria-label="Tra cứu trong cửa sổ" data-dialog-search>
        <input name="query" type="search" aria-label="Từ, mẫu hoặc câu cần tra" placeholder="Từ, mẫu hoặc câu cần tra" maxlength="320" required autocomplete="off">
        <button type="submit" class="n5-lookup-chip">Tra cứu</button>
      </form>
      <div class="n5-lookup-detail"></div>
    </div>`;
    document.body.append(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) { closeDetail(); return; }
      const control = event.target.closest('button[data-lookup]');
      if (control) handleDetailAction(control);
    });
    const input = dialog.querySelector('[data-dialog-search] input');
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    dialog.addEventListener('cancel', event => { if (composing) event.preventDefault(); });
    dialog.addEventListener('submit', event => {
      if (!event.target.matches('[data-dialog-search]')) { grammarView?.submit(event); return; }
      event.preventDefault();
      const query = input.value.trim();
      if (!composing && query) openDetail('dialog-search',query,input);
    });
    dialog.addEventListener('change', event => grammarView?.change(event));
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      frames = [];
      composing = false;
      previousFocus?.focus({preventScroll:true});
      previousFocus = null;
    });
  }

  function closeDetail() {
    if (dialog?.open) dialog.close();
  }

  function openDetail(type, id, origin, payload) {
    if (!dialog) makeDialog();
    if (!dialog.open) {
      previousFocus = origin || document.activeElement;
      frames = [];
      dialog.showModal();
    }
    const body = dialog.querySelector('.n5-lookup-detail');
    const previous = frames.at(-1);
    const input = dialog.querySelector('[data-dialog-search] input');
    if (previous) {
      previous.scroll = body.scrollTop;
      if (previous.ready) {
        previous.elements = [...body.childNodes];
        previous.heading = dialog.querySelector('h2').textContent;
      }
      previous.control = origin || document.activeElement;
      if (type !== 'dialog-search') previous.input = input.value;
    }
    const current = rendered && app.current(rendered.query) ? rendered : null;
    const frame = {type,id,scroll:0,payload,model:payload?.model || previous?.model || current?.model,
      input:type === 'dialog-search' ? id : previous?.input || current?.query || ''};
    frames.push(frame);
    showFrame(frame);
  }

  const detailButton = (action, value, label) => button(action,value,esc(label),'class="n5-lookup-chip"');

  async function showFrame(frame) {
    const title = dialog.querySelector('h2');
    const body = dialog.querySelector('.n5-lookup-detail');
    dialog.querySelector('[data-lookup="detail-back"]').hidden = frames.length < 2;
    dialog.querySelector('[data-dialog-search] input').value = frame.input;
    if (frame.elements) {
      title.textContent = frame.heading;
      body.replaceChildren(...frame.elements);
      grammarView?.refreshReading(body);
      body.scrollTop = frame.scroll;
      frame.control?.focus({preventScroll:true});
      return;
    }
    const entry = frame.model?.results.find(entry => entry.type === frame.type && entry.id === frame.id);
    const parts = frame.model?.analysis?.parts || [];
    const partIndex = frame.type === 'part' ? Number(frame.id) :
      frame.type === 'vocab' ? parts.findIndex(part => part.lemma?.id === frame.id && part.form) : -1;
    const part = parts[partIndex];
    const alternative = frame.type === 'alternative' ? frame.id.split(':').map(Number) : null;
    const option = alternative ? parts[alternative[0]]?.alternatives[alternative[1]] : null;
    if (frame.type === 'dialog-search') {
      title.textContent = 'Tra cứu';
      body.innerHTML = '<p role="status">Đang tra cứu…</p>';
      body.scrollTop = 0;
      try {
        const model = await getClient().search(frame.id);
        if (frames.at(-1) !== frame || !dialog.open) return;
        frame.model = model;
        frame.shown = DIALOG_RESULTS;
        body.innerHTML = model ? dialogResults(model) : '<p>Chưa mở được công cụ tra cứu.</p>';
      } catch {
        if (frames.at(-1) !== frame || !dialog.open) return;
        body.innerHTML = '<p role="status">Chưa tải được kết quả. Hãy thử tra lại.</p>';
      }
    } else if (frame.type === 'grammar' || part && !part.lemma && part.grammar) {
      const id = part?.grammar || frame.id;
      title.textContent = grammarTitle(id);
      body.innerHTML = '<p role="status">Đang mở ngữ pháp…</p>';
      const view = await getGrammarView().catch(() => null);
      if (frames.at(-1) !== frame || !dialog.open) return;
      title.textContent = grammarTitle(id);
      body.innerHTML = view?.render(id) || legacyGrammar(app.item('grammar',id));
    } else if (frame.type === 'kanji' || frame.type === 'kanji-char') {
      const item = app.item(frame.type,frame.id);
      title.textContent = item?.kanji || frame.id;
      body.innerHTML = kanjiDetail(item, item?.kanji || frame.id);
    } else if (frame.type === 'lesson') {
      title.textContent = frame.id;
      body.innerHTML = `<div class="n5-lookup-actions">
        ${detailButton('lesson-grammar',frame.id,'Mở ngữ pháp của bài')}
        ${detailButton('lesson-vocab',frame.id,'Mở từ vựng của bài')}
      </div>`;
    } else {
      const [formWord, formKey] = frame.type === 'inflection' ? JSON.parse(frame.id) : [];
      const vocab = app.item('vocab',part?.lemma?.id || option?.lemma?.id || formWord || frame.id);
      let lemma = part?.lemma || option?.lemma || frame.payload?.lemma || (entry?.type === 'vocab' ? entryLemma(entry) : null);
      let form = part?.form || option?.form || frame.payload?.form;
      if (formKey || !lemma && vocab) {
        title.textContent = plain(vocab?.kanji || vocab?.kana || lemma?.jp);
        body.innerHTML = '<p role="status">Đang mở chi tiết…</p>';
        const morph = await import('./morphology.js').catch(() => null);
        if (frames.at(-1) !== frame || !dialog.open) return;
        if (morph) {
          lemma ||= vocab && morph.makeLemma(vocab);
          if (formKey && lemma) form = morph.describeForm(lemma,morph.generateForms(lemma),formKey);
        }
      }
      if (form?.grammar) {
        await getGuides().catch(() => null);
        if (frames.at(-1) !== frame || !dialog.open) return;
      }
      frame.lemma = lemma;
      const term = lemma ? {...entry,id:lemma.id,title:lemma.jp,reading:lemma.kana,romaji:lemma.romaji,description:lemma.vi,
        pos:lemma.pos,location:lemma.lesson,source:lemma.source,card:lemma.card,sourceId:lemma.sourceId,
        aliases:lemma.aliases,readings:lemma.readings,examples:lemma.examples || entry?.examples} : entry;
      title.textContent = term?.title || part?.jp || 'Chi tiết tra cứu';
      if (term) body.innerHTML = wordDetail(term,vocab,form,part?.alternatives || [],partIndex,lemma?.group);
      else body.innerHTML = labelLine('',part?.role || part?.vi) || '<p>Chưa có mục từ chi tiết.</p>';
    }
    frame.ready = true;
    body.scrollTop = frame.scroll;
    dialog.querySelector('[data-lookup="detail-close"]').focus({preventScroll:true});
  }

  function dialogResults(model) {
    const panel = model.analysis || model.kanaSuggestion ? analysisPanel(model.analysis,true,model.kanaSuggestion) : '';
    const entries = model.results.slice(0,DIALOG_RESULTS);
    return `<div class="n5-lookup">
      ${panel}
      ${entries.length ? `<div class="n5-lookup-grid" data-dialog-results>${entries.map(resultCard).join('')}</div>` : ''}
      ${model.results.length > DIALOG_RESULTS ? detailButton('dialog-more','','Xem thêm kết quả') : ''}
      ${!panel && !entries.length ? '<p>Chưa thấy kết quả phù hợp.</p>' : ''}</div>`;
  }

  function entryLemma(entry) {
    return {id:entry.id,jp:entry.title,kana:entry.reading,romaji:entry.romaji,vi:entry.description,
      pos:entry.pos,lesson:entry.location,source:entry.source,group:entry.group,card:entry.card,
      sourceId:entry.sourceId,aliases:entry.aliases,readings:entry.readings,examples:entry.examples};
  }

  function wordDetail(term, vocab, form, alternatives, partIndex, group) {
    const chars = [...new Set([...term.title].filter(char => HAS_HAN.test(char)))];
    const related = vocab ? app.related(vocab.id, term.reading) : [];
    const guideExamples = guideById?.get(form?.grammar)?.examples || [];
    const guided = guideExamples.filter(([jp]) => jp.includes(form.jp));
    const examples = [...(term.examples || []), ...guided, ...app.examples(term.id, form?.jp || term.title, term.title)]
      .filter(([jp], index, all) => all.findIndex(example => example[0] === jp) === index).slice(0,3);
    const senses = term.description?.split(/[;；]/).map(value => value.trim()).filter(Boolean) || [];
    const readings = [...new Set([term.reading,...(term.readings || [])].filter(Boolean))];
    const source = term.sourceId ? term.source + ' · #' + term.sourceId : term.source || term.location || 'Kho học liệu N5 Master Hub';
    return `<div class="n5-lookup-word">
      <p class="n5-lookup-big">${rubric(term.title,term.reading)}</p>
      ${settings.furigana ? labelLine('Cách đọc',readings.join(' · ')) : ''}
      ${settings.roman && term.romaji ? `<div class="n5-lookup-actions"><strong>Romaji</strong>
        ${detailButton('audio',term.reading,term.romaji)}</div>` : ''}
      ${senses.length > 1 ? section('Các nghĩa',senses) : labelLine('Nghĩa',term.description)}
      ${labelLine('Từ loại',term.pos)}
      ${labelLine('Nhóm',GROUP_LABELS[group])}
      ${labelLine('Cách viết khác',(term.aliases || []).join(' · '))}
      ${labelLine('Nguồn',source)}
      ${term.sourceId ? '<p><a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noopener noreferrer">Giấy phép JMdict · CC BY-SA 4.0</a></p>' : ''}
      ${term.builtin || term.source?.startsWith('Wiktionary / Kaikki · Tích hợp') ?
        `<p><a href="https://vi.wiktionary.org/wiki/${encodeURIComponent(term.title)}" target="_blank" rel="noopener noreferrer">Mục gốc và lịch sử tác giả trên Wiktionary</a> ·
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></p>` : ''}
      <div class="n5-lookup-actions">
        ${detailButton('audio',term.reading || term.title,'Nghe phát âm')}
        ${term.reading ? detailButton('dialog-search',term.reading,'Tra theo cách đọc') : ''}
        ${term.description ? button('flashcard','', 'Thêm Flashcard cá nhân',`class="n5-lookup-chip" data-term="${esc(JSON.stringify(term))}"`) : ''}
        ${vocab ? detailButton('review',term.id,app.isDue(term.id) ? 'Đã có trong danh sách ôn' : 'Thêm vào danh sách ôn') : ''}
        ${vocab ? detailButton('course-vocab',term.id,'Mở trong giáo trình') : ''}
      </div>
      ${chars.length ? `<section><h3>Kanji cấu thành</h3><div class="n5-lookup-actions">${chars.map(char =>
        detailButton('kanji-char',char,char)).join('')}</div></section>` : ''}
      ${form ? formSummary(form) + labelLine('Ngữ cảnh',form.context) + formSteps(form) +
        (form.grammar ? detailButton('grammar',form.grammar,grammarTitle(form.grammar)) : '') : ''}
      ${examples.length ? `<section><h3>Ví dụ sử dụng</h3>${examples.map(exampleBlock).join('')}</section>` : ''}
      ${form && !guided.length && guideExamples.length ? `<section><h3>Ví dụ cùng mẫu</h3>${exampleBlock(guideExamples[0])}</section>` : ''}
      ${group ? `<div class="n5-lookup-actions">${detailButton('forms',term.id,'Xem các dạng chia')}
        ${group === 'i' || group === 'na' ? detailButton('grammar','adj-' + group,'Cách chia tính từ') : detailButton('grammar','masu','Chia thể ます')}</div>` : ''}
      ${related.length ? `<section><h3>Từ dễ nhầm hoặc cùng cách đọc</h3><div class="n5-lookup-actions">${related.map(item =>
        detailButton('related-vocab',item.id,item.kanji || item.kana)).join('')}</div></section>` : ''}
      ${alternatives.length ? `<section><h3>Cách phân tích khác</h3><div class="n5-lookup-actions">${alternatives.map((alt,index) =>
        detailButton('alternative',partIndex + ':' + index,alt.lemma.jp + ' · ' + (alt.form?.label || alt.lemma.vi))).join('')}</div></section>` : ''}
    </div>`;
  }

  function exampleBlock([jp,kana,translation,notes]) {
    return `<div class="n5-lookup-example">
      <div class="n5-lookup-example-line"><p lang="ja">${esc(jp)}</p>${detailButton('audio',jp,'Nghe')}</div>
      ${settings.furigana && kana ? `<p class="n5-lookup-meta" lang="ja">${esc(kana)}</p>` : ''}
      ${translation ? `<p>${esc(translation)}</p>` : ''}${notes ? `<p class="n5-lookup-meta">${esc(notes)}</p>` : ''}
      <div class="n5-lookup-actions">${detailButton('dialog-search',jp,'Phân tích câu')}</div>
    </div>`;
  }

  function section(title, value) {
    return value ? `<section><h3>${title}</h3>${Array.isArray(value) ? list(value) : `<p>${esc(value)}</p>`}</section>` : '';
  }

  function legacyGrammar(item) {
    if (!item) return '<p>Chưa có bài ngữ pháp cho mẫu này.</p>';
    return `<div class="n5-lookup-word n5-lookup-grammar">
      ${section('Ý nghĩa',plain(item.meaning))}
      ${section('Công thức',plain(item.formula))}
      ${section('Cách dùng',plain(item.explanation || item.brief))}
      ${section('Lưu ý',plain(item.notes))}
      <section><h3>Ví dụ trong giáo trình</h3>${(item.examples || []).map(example =>
        exampleBlock([plain(example.jp || example.audio),example.kana,plain(example.vi)])).join('')}</section>
      <div class="n5-lookup-actions">${detailButton('course-grammar',item.id,'Mở trong giáo trình')}</div>
    </div>`;
  }

  function strokeDiagram(character) {
    const paths = app.strokes(character);
    if (!paths?.length) return '';
    const numbers = paths.map((path,i) => {
      const start = path.match(/^M(-?[\d.]+)[,\s]+(-?[\d.]+)/i);
      return start ? `<text x="${start[1]}" y="${start[2]}">${i + 1}</text>` : '';
    });
    return `<details><summary>Thứ tự nét · ${paths.length} nét</summary>
      <svg class="n5-lookup-strokes" viewBox="0 0 109 109" role="img" aria-label="Thứ tự nét chữ ${esc(character)}">
        ${paths.map(path => `<path d="${esc(path)}"/>`).join('')}${numbers.join('')}
      </svg></details>`;
  }

  function kanjiDetail(item, character) {
    if (!item) return '<p>Chữ này chưa có thẻ Kanji trong giáo trình.</p>' + strokeDiagram(character) +
      detailButton('write',character,'Mở phòng luyện viết');
    return `<div class="n5-lookup-word">
      <p class="n5-lookup-big" lang="ja">${esc(item.kanji)}</p>
      ${labelLine('Âm Hán Việt',item.hanviet)}${labelLine('Nghĩa',item.meaning)}
      ${labelLine('Âm On',item.onyomi)}${labelLine('Âm Kun',item.kunyomi)}
      ${item.compounds?.length ? `<section><h3>Từ vựng liên quan</h3><ul>${item.compounds.map(word =>
        `<li>${detailButton('compound',word.jp,word.jp)} ${esc(word.kana)} · ${esc(word.vi)}</li>`).join('')}</ul></section>` : ''}
      ${strokeDiagram(character)}
      <div class="n5-lookup-actions">
        ${detailButton('write',item.kanji,'Cách viết và thứ tự nét')}
        ${detailButton('course-kanji',item.id,'Mở trong giáo trình')}
      </div>
    </div>`;
  }

  async function showForms(id, control) {
    const frame = frames.at(-1);
    if (frame.lemma?.id !== id) return;
    const {generateForms,describeForm} = await import('./morphology.js');
    if (!dialog.open || frames.at(-1) !== frame || !control.isConnected) return;
    const lemma = frame.lemma;
    const forms = generateForms(lemma);
    const keys = ['masu','masen','mashita','masenPast','negative','negativePast','te','past',
      'potential','volitional','ba','tara','passive','causative','causativePassive','imperative',
      'progressivePolite','dutyPolite','afterTe','simultaneous','optional',
      'adjNeg','adjPast','adjNegPast','adjConnect','adjIf','attributive'];
    const values = keys.flatMap(key => forms.has(key) ? [describeForm(lemma,forms,key)] : []);
    control.outerHTML = values.length ? `<section><h3>${esc(GROUP_LABELS[lemma.group])}</h3>
      <div class="n5-lookup-actions">${values.map(form => detailButton('inflection',JSON.stringify([id,form.key]),form.jp + ' · ' + form.label)).join('')}</div>
      </section>` : '<p>Kho hiện tại chưa có quy tắc chia đã xác định cho mục này.</p>';
  }

  function handleDetailAction(control) {
    const {lookup:action,value} = control.dataset;
    switch (action) {
      case 'detail-close': closeDetail(); break;
      case 'detail-back':
        if (frames.length > 1) { frames.pop(); showFrame(frames.at(-1)); }
        break;
      case 'audio': app.audio(value); break;
      case 'part':
      case 'vocab':
      case 'kanji':
      case 'lesson':
      case 'grammar':
      case 'kanji-char':
      case 'alternative':
      case 'dialog-search':
      case 'search': openDetail(action === 'search' ? 'dialog-search' : action,value,control); break;
      case 'inflection': openDetail(action,value,control,{lemma:frames.at(-1)?.lemma}); break;
      case 'dialog-more': {
        const frame = frames.at(-1);
        const next = frame.model.results.slice(frame.shown,frame.shown + DIALOG_RESULTS);
        dialog.querySelector('[data-dialog-results]').insertAdjacentHTML('beforeend',next.map(resultCard).join(''));
        frame.shown += next.length;
        if (frame.shown >= frame.model.results.length) control.remove();
        break;
      }
      case 'sentence-audio': {
        const analysis = frames.at(-1)?.model?.analysis;
        if (analysis) app.audio(analysis.japanese);
        break;
      }
      case 'sentence-card': {
        const analysis = frames.at(-1)?.model?.analysis;
        if (!analysis?.translation) break;
        closeDetail();
        app.addCard({title:analysis.japanese,reading:analysis.readings,description:analysis.translation,pos:'Câu mẫu',source:'N5 Master Hub'});
        break;
      }
      case 'related-vocab': {
        const item = app.item('vocab',value);
        if (item) openDetail('related-item', value);
        break;
      }
      case 'compound': {
        const item = app.findVocab(value);
        if (item) openDetail('related-item',item.id);
        else openDetail('dialog-search',value,control);
        break;
      }
      case 'forms':
        showForms(value,control).catch(() => app.message('Chưa tải được bảng chia thể.'));
        break;
      case 'flashcard':
        closeDetail();
        app.addCard(JSON.parse(control.dataset.term));
        break;
      case 'review':
        app.review(value).then(saved => { if (saved) control.textContent = 'Đã có trong danh sách ôn'; });
        break;
      case 'write':
        closeDetail();
        app.openCourse(() => app.write(value));
        break;
      case 'course-vocab': case 'course-kanji': case 'course-grammar':
        closeDetail();
        app.openCourse(() => app.course(action.slice(7),value));
        break;
      case 'lesson-vocab': case 'lesson-grammar':
        closeDetail();
        app.openCourse(() => app.lesson(action.slice(7),value));
        break;
      default:
        if (action.startsWith('grammar-')) {
          Promise.resolve().then(() => grammarView?.click(control)).catch(() => app.message('Chưa mở được nội dung ngữ pháp.'));
        }

    }
  }

  return {render, openDetail};
}
