const STATUS_LABELS = {
  clean:'Không phát hiện lỗi trong phạm vi kiểm tra',
  error:'Lỗi xác định được bằng quy tắc',
  uncertain:'Cần thêm ngữ cảnh',
  insufficient:'Chưa đủ dữ liệu để đánh giá',
};

function element(tag,text,className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function action(label,handler,attribute) {
  const button = element('button',label,'n5-checker-button');
  button.type = 'button';
  if (attribute) button.setAttribute(attribute,'');
  button.addEventListener('click',handler);
  return button;
}

function paragraph(label,value,lang) {
  const heading = element('strong',label);
  const content = element('span',value);
  if (lang) content.lang = lang;
  const line = element('p');
  line.append(heading,' ',content);
  return line;
}

function originalLine(original,issues) {
  const line = element('p',undefined,'n5-checker-japanese');
  line.lang = 'ja';
  let offset = 0;
  for (const issue of issues) {
    const marked = element('mark',original.slice(issue.start,issue.end));
    marked.dataset.n5Issue = issue.certainty;
    line.append(original.slice(offset,issue.start),marked);
    offset = issue.end;
  }
  line.append(original.slice(offset));
  return line;
}

function issueArticle(issue,original,{open,mistake}) {
  const article = element('article',undefined,'n5-checker-issue');
  article.dataset.issueCertainty = issue.certainty;
  article.append(element('h4',issue.title || STATUS_LABELS[issue.certainty]));
  const certainty = element('p',issue.certainty === 'error' ? 'Lỗi xác định được' : 'Đối chiếu theo ngữ cảnh','n5-checker-certainty');
  article.append(certainty,paragraph('Đoạn kiểm tra',issue.excerpt,'ja'));
  if (issue.replacement) article.append(paragraph(issue.certainty === 'error' ? 'Gợi ý sửa' : 'Gợi ý theo một cách hiểu',issue.replacement,'ja'));
  if (issue.explanation) article.append(element('p',issue.explanation));
  if (issue.rule) article.append(paragraph('Quy tắc',issue.rule));
  if (issue.alternatives?.length) {
    const list = element('ul',undefined,'n5-checker-list');
    for (const option of issue.alternatives) {
      const item = element('li');
      item.append(element('span',option.lemma),' → ',element('span',option.replacement));
      item.lastElementChild.lang = 'ja';
      list.append(item);
    }
    article.append(element('h5','Cách hiểu khác'),list);
  }
  if (issue.steps?.length > 1) {
    const chain = element('p',issue.steps.map(step => step.jp).join(' → '),'n5-checker-japanese n5-checker-chain');
    chain.lang = 'ja';
    const details = element('details');
    const steps = element('ol',undefined,'n5-checker-list');
    for (const step of issue.steps) {
      const item = element('li');
      const written = element('strong',step.jp);
      written.lang = 'ja';
      item.append(written,' · ',step.rule || step.meaning || step.label);
      steps.append(item);
    }
    details.append(element('summary','Giải thích từng bước'),steps);
    article.append(chain,details);
  }
  if (issue.example) {
    article.append(paragraph('Ví dụ đối chiếu',issue.example[0],'ja'),element('p',issue.example[1],'n5-checker-note'));
  }

  const actions = element('div',undefined,'n5-checker-actions');
  if (issue.grammarId && open) {
    actions.append(action('Mở bài ngữ pháp',() => open('grammar',issue.grammarId)));
    actions.append(action('Luyện mẫu này',() => open('builder',issue.grammarId,{grammarId:issue.grammarId,
      lemma:issue.lemma,form:issue.form}), 'data-checker-practice'));
  }
  if (issue.certainty === 'error' && issue.replacement && mistake) {
    const saveStatus = element('p',undefined,'n5-checker-note');
    saveStatus.setAttribute('role','status');
    const save = action('Lưu vào Sổ tay câu sai',async () => {
      save.disabled = true;
      saveStatus.textContent = '';
      try {
        const stored = await mistake({
          id:issue.grammarId || 'checker-kana',prompt:original,answer:issue.replacement,entered:issue.excerpt,
          why:issue.explanation + ' ' + (issue.rule || ''),form:issue.form,source:'grammar-checker',
        });
        if (stored) {
          save.textContent = 'Đã lưu';
          saveStatus.textContent = 'Đã lưu vào Sổ tay câu sai.';
          return;
        }
      } catch {
        // Keep the report and let the learner retry the local write.
      }
      save.disabled = false;
      saveStatus.textContent = 'Chưa lưu được. Bạn có thể thử lại.';
    },'data-checker-save');
    actions.append(save);
    article.append(actions,saveStatus);
  } else if (actions.childElementCount) {
    article.append(actions);
  }
  return article;
}

function renderReport(report,result,input,hooks) {
  result.replaceChildren();
  const status = element('h3',STATUS_LABELS[report.status],'n5-checker-status');
  status.dataset.checkerStatus = report.status;
  result.append(status,element('p',report.note,'n5-checker-note'));
  if (report.original.trim()) result.append(originalLine(report.original,report.issues));
  if (report.corrected) {
    result.append(paragraph('Câu sau khi áp dụng các sửa đổi có căn cứ',report.corrected,'ja'));
    result.append(action('Đưa gợi ý vào ô nhập',() => {
      input.value = report.corrected;
      input.focus();
    }));
  }
  for (const issue of report.issues) result.append(issueArticle(issue,report.original,hooks));
  if (report.original.trim() && hooks.open && report.coverage !== null) {
    const actions = element('div',undefined,'n5-checker-actions');
    actions.append(action('Phân tích câu',() => hooks.open('dialog-search',report.corrected || report.original)));
    result.append(actions);
  }
}

export function mountGrammarChecker(container,context = {},hooks = {}) {
  const root = element('section',undefined,'n5-checker');
  root.dataset.n5Checker = '';
  root.innerHTML = '<form class="n5-checker-form">' +
    '<label>Câu tiếng Nhật <small class="n5-checker-note">Tối đa 240 ký tự</small>' +
    '<textarea name="sentence" lang="ja" rows="3" maxlength="240" spellcheck="false" required></textarea></label>' +
    '<div class="n5-checker-actions"><button type="submit" class="n5-checker-button n5-checker-submit">Kiểm tra câu</button></div>' +
    '</form><p role="status" class="n5-checker-note" data-checker-feedback></p><div data-checker-report></div>';
  const input = root.querySelector('textarea');
  input.value = String(context.sentence || '');
  const form = root.querySelector('form');
  const result = root.querySelector('[data-checker-report]');
  const feedback = root.querySelector('[data-checker-feedback]');
  let composition = false;
  let pending;

  async function run() {
    if (composition || !input.value.trim()) return;
    pending?.abort();
    const request = new AbortController();
    pending = request;
    const original = input.value;
    feedback.textContent = 'Đang kiểm tra…';
    result.replaceChildren();
    try {
      const report = await hooks.check(original,{signal:request.signal});
      if (request.signal.aborted) return;
      if (!report) throw new Error('Missing grammar-check result');
      feedback.textContent = STATUS_LABELS[report.status];
      renderReport(report,result,input,hooks);
    } catch {
      if (!request.signal.aborted) feedback.textContent = 'Chưa kiểm tra được câu. Hãy thử lại.';
    }
  }

  input.addEventListener('compositionstart',() => { composition = true; });
  input.addEventListener('compositionend',() => { composition = false; });
  input.addEventListener('input',() => {
    pending?.abort();
    feedback.textContent = '';
    result.replaceChildren();
  });
  input.addEventListener('keydown',event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing && event.keyCode !== 229 && !composition) {
      event.preventDefault();
      void run();
    }
  });
  form.addEventListener('submit',event => {
    event.preventDefault();
    void run();
  });
  container.replaceChildren(root);
  if (input.value.trim()) void run();
  return root;
}
