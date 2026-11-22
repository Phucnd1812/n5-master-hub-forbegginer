import {HAS_HAN, IS_KANA, plain} from './text.js';
import {createSearchClient} from './search-client.js';

const TYPES = {vocab:'Từ vựng', kanji:'Kanji', grammar:'Ngữ pháp', lesson:'Giáo trình'};
const CHUNK = 20;
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

  const getGuides = () => guides ??= import('./grammar-data.js').then(module => guideById = module.GRAMMAR_BY_ID);
  const grammarTitle = id => grammarModule?.grammarName(id) || guideById?.get(id)?.title ||
    rendered?.model.results.find(entry => entry.type === 'grammar' && entry.id === id)?.title ||
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
      <div class="n5-lookup-meta">${esc(source || location)}</div>
      <h3>${button(type,id,type === 'lesson' ? esc(title) : rubric(title,reading), 'class="n5-lookup-title"')}</h3>
      ${settings.furigana && reading && reading !== title ? `<p class="n5-lookup-meta" lang="ja">${esc(reading)}</p>` : ''}
      ${settings.roman && romaji ? `<p class="n5-lookup-meta">${esc(romaji)}</p>` : ''}
      ${description ? `<p>${esc(description)}</p>` : ''}
      ${entry.approximate ? '<small class="n5-lookup-meta">Gợi ý gần đúng</small>' : ''}
    </article>`;
  }

  function analysisPanel(analysis, expanded, kanaSuggestion) {
    if (!analysis) {
      if (kanaSuggestion) return `<section class="n5-lookup-card">
        <p>Gợi ý cách gõ Kana</p>${button('search',kanaSuggestion,rubric(kanaSuggestion,''),'class="n5-lookup-chip"')}
        <p class="n5-lookup-meta">Chưa xác định được từ hoặc nghĩa từ cách gõ này.</p></section>`;
      return expanded ? '<section class="n5-lookup-card"><p>Nhập từ đã chia hoặc một câu tiếng Nhật để xem các thành phần nhận diện được.</p></section>' : '';
    }
    const {parts, grammar, original, notes, japanese:written, readings, romaji, translation} = analysis;
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
    return `<section class="n5-lookup-card n5-lookup-analysis" data-lookup-analysis>
      <h2>${words.length === 1 && mainForm ? 'Phân tích dạng chia' : 'Phân tích câu / cụm từ'}</h2>
      ${written && written !== original ? `<p class="n5-lookup-sentence" lang="ja">${esc(written)}</p>` : ''}
      <div class="n5-lookup-terms">${terms}</div>
      ${settings.furigana && readings ? labelLine('Cách đọc',readings) : ''}
      ${settings.roman && romaji ? labelLine('Romaji',romaji) : ''}
      ${translation ? labelLine('Nghĩa theo câu đối chiếu',translation) :
        (expanded && words.length > 1 ? '<p class="n5-lookup-meta">Kho hiện tại chưa có bản dịch đối chiếu cho câu này.</p>' : '')}
      ${written && words.length ? `<div class="n5-lookup-actions">
        ${button('sentence-audio','','Nghe tiếng Nhật','class="n5-lookup-chip"')}
        ${translation ? button('sentence-card','','Thêm câu vào Flashcard','class="n5-lookup-chip"') : ''}
      </div>` : ''}
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
    </div>`;
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
      search:query => getClient().search(query)});
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
      <div class="n5-lookup-detail"></div>
    </div>`;
    document.body.append(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) { closeDetail(); return; }
      const control = event.target.closest('button[data-lookup]');
      if (control) handleDetailAction(control);
    });
    dialog.addEventListener('submit', event => grammarView?.submit(event));
    dialog.addEventListener('change', event => grammarView?.change(event));
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      frames = [];
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
    if (frames.length) {
      const previous = frames.at(-1);
      previous.scroll = body.scrollTop;
      previous.elements = [...body.childNodes];
      previous.heading = dialog.querySelector('h2').textContent;
      previous.control = origin || document.activeElement;
    }
    const frame = {type,id,scroll:0,payload};
    frames.push(frame);
    showFrame(frame);
  }

  const detailButton = (action, value, label) => button(action,value,esc(label),'class="n5-lookup-chip"');

  async function showFrame(frame) {
    const title = dialog.querySelector('h2');
    const body = dialog.querySelector('.n5-lookup-detail');
    dialog.querySelector('[data-lookup="detail-back"]').hidden = frames.length < 2;
    if (frame.elements) {
      title.textContent = frame.heading;
      body.replaceChildren(...frame.elements);
      grammarView?.refreshReading(body);
      body.scrollTop = frame.scroll;
      frame.control?.focus({preventScroll:true});
      return;
    }
    const entry = rendered?.model.results.find(entry => entry.type === frame.type && entry.id === frame.id);
    const parts = rendered?.model.analysis?.parts || [];
    const partIndex = frame.type === 'part' ? Number(frame.id) :
      frame.type === 'vocab' ? parts.findIndex(part => part.lemma?.id === frame.id && part.form) : -1;
    const part = parts[partIndex];
    const alternative = frame.type === 'alternative' ? frame.id.split(':').map(Number) : null;
    const option = alternative ? rendered?.model.analysis?.parts[alternative[0]]?.alternatives[alternative[1]] : null;
    if (frame.type === 'grammar' || part && !part.lemma && part.grammar) {
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
      body.innerHTML = kanjiDetail(item);
    } else if (frame.type === 'lesson') {
      title.textContent = frame.id;
      body.innerHTML = `<div class="n5-lookup-actions">
        ${detailButton('lesson-grammar',frame.id,'Mở ngữ pháp của bài')}
        ${detailButton('lesson-vocab',frame.id,'Mở từ vựng của bài')}
      </div>`;
    } else {
      const [formWord, formKey] = frame.type === 'inflection' ? JSON.parse(frame.id) : [];
      const vocab = app.item('vocab',part?.lemma?.id || option?.lemma?.id || formWord || frame.id);
      let lemma = part?.lemma || option?.lemma || frame.payload;
      let form = part?.form || option?.form;
      if (!lemma && vocab && (!entry || formKey)) {
        title.textContent = plain(vocab.kanji || vocab.kana);
        body.innerHTML = '<p role="status">Đang mở chi tiết…</p>';
        const morph = await import('./morphology.js').catch(() => null);
        if (frames.at(-1) !== frame || !dialog.open) return;
        if (morph) {
          lemma = morph.makeLemma(vocab);
          if (formKey) form = morph.describeForm(lemma,morph.generateForms(lemma),formKey);
        }
      }
      if (form?.grammar) {
        await getGuides().catch(() => null);
        if (frames.at(-1) !== frame || !dialog.open) return;
      }
      const term = lemma ? {id:lemma.id,title:lemma.jp,reading:lemma.kana,romaji:lemma.romaji,description:lemma.vi,
        pos:lemma.pos,location:lemma.lesson,source:lemma.source,card:lemma.card} : entry;
      title.textContent = term?.title || part?.jp || 'Chi tiết tra cứu';
      if (term) body.innerHTML = wordDetail(term,vocab,form,part?.alternatives || [],partIndex);
      else body.innerHTML = labelLine('',part?.role || part?.vi) || '<p>Chưa có mục từ chi tiết.</p>';
    }
    body.scrollTop = frame.scroll;
    dialog.querySelector('[data-lookup="detail-close"]').focus({preventScroll:true});
  }

  function wordDetail(term, vocab, form, alternatives, partIndex) {
    const chars = [...new Set([...term.title].filter(char => HAS_HAN.test(char)))];
    const related = vocab ? app.related(vocab.id, term.reading) : [];
    const guided = guideById?.get(form?.grammar)?.examples.filter(([jp]) => jp.includes(form.jp)) || [];
    const examples = [...guided, ...app.examples(term.id, form?.jp || term.title, term.title)]
      .filter(([jp], index, all) => all.findIndex(example => example[0] === jp) === index).slice(0,3);
    return `<div class="n5-lookup-word">
      <p class="n5-lookup-big">${rubric(term.title,term.reading)}</p>
      ${settings.furigana ? labelLine('Hiragana',term.reading) : ''}
      ${settings.roman ? labelLine('Romaji',term.romaji) : ''}
      ${labelLine('Nghĩa',term.description)}
      ${labelLine('Từ loại',term.pos)}
      ${labelLine('Nguồn',term.source || term.location || 'Kho học liệu N5 Master Hub')}
      ${term.builtin || term.source?.startsWith('Wiktionary / Kaikki · Tích hợp') ?
        `<p><a href="https://vi.wiktionary.org/wiki/${encodeURIComponent(term.title)}" target="_blank" rel="noopener noreferrer">Mục gốc và lịch sử tác giả trên Wiktionary</a></p>` : ''}
      <div class="n5-lookup-actions">
        ${detailButton('audio',term.reading || term.title,'Nghe phát âm')}
        ${term.description ? button('flashcard','', 'Thêm Flashcard cá nhân',`class="n5-lookup-chip" data-term="${esc(JSON.stringify(term))}"`) : ''}
        ${vocab ? detailButton('review',term.id,app.isDue(term.id) ? 'Đã có trong danh sách ôn' : 'Thêm vào danh sách ôn') : ''}
        ${vocab ? detailButton('course-vocab',term.id,'Mở trong giáo trình') : ''}
      </div>
      ${chars.length ? `<section><h3>Kanji cấu thành</h3><div class="n5-lookup-actions">${chars.map(char =>
        detailButton('kanji-char',char,char)).join('')}</div></section>` : ''}
      ${form ? formSummary(form) + labelLine('Nhóm',GROUP_LABELS[form.lemma.group]) +
        `<ol class="n5-lookup-steps">${form.steps.slice(1).map(step => `<li>${rubric(step.jp,step.kana)} ${esc(step.rule)}</li>`).join('')}</ol>
        ${form.grammar ? detailButton('grammar',form.grammar,grammarTitle(form.grammar)) : ''}` : ''}
      ${examples.length ? `<section><h3>Ví dụ sử dụng</h3>${examples.map(exampleBlock).join('')}</section>` : ''}
      ${vocab ? detailButton('forms',term.id,'Xem các dạng chia') : ''}
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

  function kanjiDetail(item) {
    if (!item) return '<p>Chữ này chưa có thẻ Kanji trong giáo trình. Có thể tra ở phòng luyện viết.</p>' +
      detailButton('write',frames.at(-1).id,'Mở phòng luyện viết');
    return `<div class="n5-lookup-word">
      <p class="n5-lookup-big" lang="ja">${esc(item.kanji)}</p>
      ${labelLine('Âm Hán Việt',item.hanviet)}${labelLine('Nghĩa',item.meaning)}
      ${labelLine('Âm On',item.onyomi)}${labelLine('Âm Kun',item.kunyomi)}
      ${item.compounds?.length ? `<section><h3>Từ vựng liên quan</h3><ul>${item.compounds.map(word =>
        `<li>${detailButton('compound',word.jp,word.jp)} ${esc(word.kana)} · ${esc(word.vi)}</li>`).join('')}</ul></section>` : ''}
      <div class="n5-lookup-actions">
        ${detailButton('write',item.kanji,'Cách viết và thứ tự nét')}
        ${detailButton('course-kanji',item.id,'Mở trong giáo trình')}
      </div>
    </div>`;
  }

  async function showForms(id, control) {
    const frame = frames.at(-1);
    const item = app.item('vocab',id);
    if (!item) return;
    const {makeLemma,generateForms,describeForm} = await import('./morphology.js');
    if (!dialog.open || frames.at(-1) !== frame || !control.isConnected) return;
    const lemma = makeLemma(item);
    const forms = generateForms(lemma);
    const keys = ['masu','negative','te','past','potential','volitional','ba','passive','causative','imperative',
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
      case 'detail-back': frames.pop(); showFrame(frames.at(-1)); break;
      case 'audio': app.audio(value); break;
      case 'grammar':
      case 'kanji-char':
      case 'alternative':
      case 'inflection': openDetail(action,value); break;
      case 'related-vocab': {
        const item = app.item('vocab',value);
        if (item) openDetail('related-item', value);
        break;
      }
      case 'compound': {
        const item = app.findVocab(value);
        if (item) openDetail('related-item',item.id);
        else { closeDetail(); app.query(value); }
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
