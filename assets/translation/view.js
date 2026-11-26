import {MAX_TEXT,MAX_TRANSLATION_FIELD,validRequest,validOutput} from './protocol.js';
import {directionFor} from './rules.js';
import {acceptsAutomatic,splitDocument,translateDocument} from './document.js';
import {findTranslation,history,saveTranslation,setMarked,removeTranslation,clearHistory} from './memory.js';
import {getMode,setMode,MODES,messages,createTranslationRequests} from './client.js';
import {escapeResult as esc, sentenceReading, sentenceHeader, readingLines, readingDifferences} from '../search/result-ui.js';

const labels={verified:'Bản dịch đối chiếu',rule:'Dịch tham khảo theo quy tắc',ai:'Bản dịch AI · Gemini',imported:'Bản dịch đã nhập'};
const modes={auto:'Tự động nhận diện','ja-vi':'Nhật / Romaji → Việt','vi-ja':'Việt → Nhật'};
const chip=(label,action)=>'<button type="button" class="n5-lookup-chip" data-translation-action="'+action+'">'+esc(label)+'</button>';
const select=(values,selected)=>Object.entries(values).map(([key,label])=>'<option value="'+key+'"'+
  (key===selected ? ' selected' : '')+'>'+esc(label)+'</option>').join('');
const detail=(label,value)=>value ? '<p><strong>'+esc(label)+'</strong> '+esc(value)+'</p>' : '';
const list=(title,items)=>items?.length ? '<section><h4>'+esc(title)+'</h4><ul>'+items.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></section>' : '';

function resultContent(result,saved,presentation,settings) {
  const reverse=result.direction==='vi-ja';
  const natural=result.naturalTranslation?.trim();
  const primary=natural || result.translatedText;
  const alternatives=[result.literalTranslation && result.literalTranslation!==primary &&
      detail('Sát nghĩa',result.literalTranslation),
    result.translatedText!==primary && result.translatedText!==result.literalTranslation &&
      detail('Bản dịch chính của nguồn',result.translatedText)].filter(Boolean).join('');
  return '<section class="n5-result-surface n5-translation-result" data-result-tone="translation">'+
    '<h3>Bản dịch'+(natural?' tự nhiên':'')+'</h3>'+
    '<p class="n5-translation-output"'+(reverse?' lang="ja" data-n5-tappable tabindex="0"':' lang="vi"')+'>'+esc(primary)+'</p>'+
    (reverse?readingLines(presentation,settings):'')+
    '<p class="n5-result-source-label">'+esc(labels[result.source] || labels.imported)+(saved?' · Bản dịch đã lưu':'')+'</p>'+
    (result.contextualNotes?.[0]?'<p class="n5-result-note">'+esc(result.contextualNotes[0])+'</p>':'')+
    (alternatives?'<details><summary>Dịch sát nghĩa và cách dịch khác</summary>'+alternatives+'</details>':'')+'</section>';
}

function technicalContent(result) {
  const sections={overview:'',vocab:'',grammar:'',detail:''};
  if (!result) return sections;
  const ai=result.source==='ai';
  const origin=ai?'Gemini':labels[result.source];
  const group=(heading,body)=>body?'<section class="n5-result-surface"><h3>'+heading+' · '+esc(origin)+'</h3>'+body+'</section>':'';
  sections.overview=group('Lưu ý',list('Cách hiểu khác',result.ambiguityNotes?.slice(0,1)));
  sections.vocab=group('Từ vựng',list('Từ và nghĩa',result.vocabulary?.map(row=>[row.term,row.reading,row.meaning].filter(Boolean).join(' · '))));
  sections.grammar=group('Ngữ pháp',list('Mẫu và giải thích',result.grammarPatterns?.map(row=>row.pattern+' · '+row.explanation)));
  sections.detail=group('Chi tiết bản dịch',list('Cấu trúc câu',result.sentenceStructure)+detail('Mức độ lịch sự',result.politenessLevel)+
    list('Bản dịch khác',result.alternativeTranslations)+list('Ngữ cảnh',result.contextualNotes?.slice(1))+
    list('Điểm mơ hồ',result.ambiguityNotes)+list('Giới hạn',result.limitations)+
    detail('Nguồn',result.origin)+detail(ai?'Mô hình':'Phiên bản',result.version));
  return sections;
}

export function createTranslationView({analyze,send,account,audio,check,open,addCard,openAnalysis}) {
  const sendOnce=createTranslationRequests(send,account);
  const submissions=new WeakMap();
  const active = new Map();
  let observer;
  function stop(root) {
    active.get(root)?.abort();
    active.delete(root);
    if (!active.size) {observer?.disconnect(); observer=undefined;}
  }
  function track(root,controller) {
    active.set(root,controller);
    observer ??= new MutationObserver(()=>{
      for (const element of active.keys()) if (!element.isConnected) stop(element);
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function mount(root,{text='',analysis=null,submitted=false,full=false,compact=false,initialDelay=0,direction='auto',settings={},technical,
    automatic=true}={}) {
    let inputText=text;
    let currentAnalysis=analysis;
    let analyzed=!!analysis || !full;
    let mode=direction;
    let current, presentation, timer=0, composing=false, generation=0;
    root.classList.add('n5-translation');
    root.innerHTML=(full?'<form class="n5-translation-form"><label>Văn bản cần dịch<textarea required aria-describedby="n5-translation-limit"'+
      ' rows="5" name="text">'+esc(text)+'</textarea></label><small id="n5-translation-limit" data-translation-limit></small>'+
      '<button class="n5-lookup-chip">Dịch câu</button></form>':'')+
      '<div data-translation-source></div><div data-translation-result></div><div data-translation-document></div>'+
      (full?'<div data-translation-facts></div>':'')+
      '<p class="n5-result-note" data-translation-status role="status"></p>'+
      '<div class="n5-lookup-actions n5-result-toolbar" aria-label="Thao tác bản dịch">'+
      (compact?['Dừng lượt dịch|cancel']:['Nghe tiếng Nhật|audio','Sao chép bản dịch|copy','Lưu câu|save','Kiểm tra câu|check','Dịch chuyên sâu bằng AI|ai','Dừng lượt dịch|cancel'])
        .map(item=>chip(...item.split('|'))).join('')+'</div>'+
      (compact?'':'<details class="n5-result-options"><summary>Tùy chọn dịch</summary>'+
      '<div class="n5-lookup-actions"><label>Chiều dịch <select data-translation-direction>'+select(modes,mode)+'</select></label>'+
      chip('Đổi chiều dịch','reverse')+(full?'':chip('Mở công cụ Dịch','open'))+
      (analysis?.translation && addCard?chip('Thêm câu mẫu vào Flashcard','flashcard'):'')+'</div>'+
      '<p class="n5-lookup-meta">Khi dùng AI, hệ thống gửi câu cần dịch và chiều dịch tới Gemini.</p></details>')+
      (full?'<div data-translation-technical></div>':'')+
      (full?'<details><summary>Thiết lập AI và lịch sử bản dịch</summary><label>Chế độ dịch <select data-translation-mode>'+
      select(MODES,getMode())+'</select></label><p class="n5-lookup-meta">Tự động thông minh gửi câu hoàn chỉnh tới Gemini khi bản dịch trên thiết bị chưa đủ. Ngoại tuyến giữ nội dung trên thiết bị. Theo yêu cầu chỉ gửi khi bạn bấm dịch AI.</p>'+
      '<label>Khôi phục các câu đã đánh dấu<input type="file" accept="application/json,.json" data-translation-import></label>'+
      '<div data-translation-history></div></details>':'');
    const target=root.querySelector('[data-translation-result]');
    const status=root.querySelector('[data-translation-status]');
    const heading=root.querySelector('[data-translation-source]');
    const extra=root.querySelector('[data-translation-technical]');
    const source=root.querySelector('[name="text"]');
    const selector=root.querySelector('[data-translation-direction]');
    const ai=root.querySelector('[data-translation-action="ai"]');
    const documentPanel=root.querySelector('[data-translation-document]');
    const facts=root.querySelector('[data-translation-facts]');
    const tools=Object.fromEntries([...root.querySelector('.n5-result-toolbar').children]
      .map(control=>[control.dataset.translationAction,control]));
    function show(result,saved=false) {
      current=result;
      presentation=sentenceReading(inputText,currentAnalysis,result);
      heading.innerHTML=!compact && inputText?sentenceHeader(presentation,settings,{reverse:result?.direction==='vi-ja'}):'';
      target.innerHTML=result?(compact?'<p class="n5-instant-sentence">'+esc(result.naturalTranslation?.trim() || result.translatedText)+
        '</p><small>'+esc(saved?'Bản dịch đã lưu':labels[result.source])+'</small>':resultContent(result,saved,presentation,settings)):'';
      for (const [action,visible] of Object.entries({audio:presentation.japaneseText,check:presentation.japaneseText,copy:result,save:result})) {
        if (tools[action]) tools[action].hidden=!visible;
      }
      if (ai) ai.textContent=result?.source==='ai'?'Dịch lại bằng AI':'Dịch chuyên sâu bằng AI';
      const sections=technicalContent(result);
      technical?.(presentation,sections);
      if (extra) {
        const content=readingDifferences(presentation)+Object.values(sections).join('');
        extra.innerHTML=content?'<details><summary>Kiến thức và nguồn bản dịch</summary>'+content+'</details>':'';
      }
    }
    function begin() {
      stop(root);
      const controller=new AbortController();
      track(root,controller);
      controller.signal.addEventListener('abort',()=>{
        if (ai) ai.disabled=false;
        tools.cancel.hidden=true;
      },{once:true});
      tools.cancel.hidden=false;
      status.textContent='';
      return controller;
    }
    const live=controller=>root.isConnected && !controller.signal.aborted;
    const resolvedDirection=()=>directionFor(inputText,mode,currentAnalysis);
    async function run({force=false,retry=false,commit=false,useCurrent=false}={}) {
      clearTimeout(timer);
      if (composing || !root.isConnected) return;
      const controller=begin();
      if (ai) ai.disabled=false;
      const supplied=useCurrent?inputText:source?.value ?? inputText;
      const selected=supplied.trim();
      const pieces=full?splitDocument(selected):[];
      if (inputText!==selected) {currentAnalysis=null;analyzed=false;}
      inputText=selected;
      documentPanel.innerHTML=full && pieces.length>1?'<details><summary>Phân tích từng câu ('+pieces.length+
        ')</summary><ol>'+pieces.map(({text},index)=>'<li><button type="button" class="n5-lookup-chip" data-translation-action="analyze-piece" data-index="'+
          index+'">'+esc(text)+'</button></li>').join('')+'</ol></details>':'';
      facts?.replaceChildren();
      if (!selected) {show(null);stop(root);return;}
      if (!force) show(null);
      try {
        let actual=resolvedDirection();
        if (!validRequest({text:supplied,direction:actual})) {
          if (force || commit || supplied.length>MAX_TEXT) status.textContent=messages.bad_request;
          return;
        }
        const saved=await findTranslation(selected,actual).catch(()=>null);
        if (!live(controller)) return;
        if (!force && saved) {
          show({...saved.result,direction:actual},true);
          status.textContent='Đã sử dụng bản dịch đã lưu.';
          return;
        }
        if (!analyzed && mode !== 'vi-ja' && pieces.length<=1 && selected.length<=320) {
          status.textContent='Đang phân tích…';
          const parsed=await analyze(selected,controller.signal);
          if (!live(controller)) return;
          currentAnalysis=parsed;
          analyzed=true;
          if (!force) show(null);
        }
        const nextDirection=resolvedDirection();
        const stored=nextDirection===actual?saved:await findTranslation(selected,nextDirection).catch(()=>null);
        actual=nextDirection;
        status.textContent='Đang dịch ngoại tuyến…';
        const {result:local,unresolved,verified}=await translateDocument(selected,actual,currentAnalysis,analyze,controller.signal);
        if (!live(controller)) return;
        if (facts && !local) {
          const rows=(verified || []).map(item=>item.text+' — '+item.result.translatedText);
          const clauses=(currentAnalysis?.clauses || []).map(({label,text})=>label+' · '+text);
          const words=(currentAnalysis?.parts || []).filter(part=>part.kind==='word' && part.vi).slice(0,20)
            .map(part=>[part.text,part.form?.lemma.jp,part.form?.label,part.vi].filter(Boolean).join(' · '));
          const detail=list('Các câu dịch được trên thiết bị',rows)+list('Mệnh đề',clauses)+list('Từ tra được',words);
          if (detail) facts.innerHTML='<details><summary>Phân tích ngoại tuyến</summary>'+detail+'</details>';
        }
        if (!force && (local?.source==='verified' || stored || local)) {
          const output=local?.source==='verified'?local:stored?.result || local;
          show({...output,direction:actual},!!stored);
          status.textContent='';
          return;
        }
        if (force && !retry && stored?.result.source==='ai') {
          show({...stored.result,direction:actual},true);
          return;
        }
        const modeAI=getMode();
        const usesAi=force || automatic && modeAI==='auto' && acceptsAutomatic(selected,currentAnalysis);
        if (!usesAi || modeAI==='offline') {
          status.textContent=modeAI==='offline' && force?'Đang chọn chế độ Ngoại tuyến.':
            'Chưa đủ căn cứ để dịch '+(unresolved?'toàn bộ đoạn văn.':'trọn câu.')+(compact?'':' Bạn có thể xem phần phân tích hoặc yêu cầu Gemini.');
          return;
        }
        status.textContent='Đang dịch bằng Gemini…';
        if (ai) ai.disabled=true;
        const reply=await sendOnce({text:selected,direction:actual},controller.signal,{retry:retry || force});
        if (!live(controller)) return;
        if (reply.error) {status.textContent=messages[reply.error] || '';return;}
        const result={...reply.result,direction:actual};
        show(result);
        status.textContent='';
        const written=await saveTranslation(selected,actual,result).catch(()=>false);
        if (live(controller) && written) {
          show(result,true);
          await refreshHistory();
        }
      } catch {
        if (live(controller)) status.textContent=messages.unavailable;
      } finally {
        if (active.get(root)===controller) stop(root);
      }
    }

    const historyElement=root.querySelector('[data-translation-history]');
    async function refreshHistory() {
      if (!historyElement) return;
      try {
        const rows=await history();
        if (!root.isConnected) return;
        historyElement.innerHTML='<h3>Lịch sử bản dịch</h3><div class="n5-lookup-actions">'+
          chip('Xuất các câu đã đánh dấu','export')+chip('Xóa toàn bộ lịch sử dịch','clear')+'</div>'+
          (rows.length?rows.map((row,index)=>'<article><p>'+esc(row.text)+'</p><p>'+esc(row.result.translatedText)+'</p>'+
            '<p class="n5-lookup-meta">'+esc(labels[row.result.source])+' · '+new Date(row.savedAt).toLocaleDateString('vi')+'</p>'+
            '<div class="n5-lookup-actions" data-history-index="'+index+'">'+chip('Mở bản dịch','open-saved')+
            chip(row.marked?'Bỏ đánh dấu':'Đánh dấu','mark')+chip('Xóa','delete')+'</div></article>').join(''):
            '<p>Chưa có bản dịch đã lưu.</p>');
        historyElement.rows=rows;
      } catch { historyElement.textContent='Không mở được lịch sử trên thiết bị này.'; }
    }
    function exportMarked() {
      const rows=historyElement.rows?.filter(row=>row.marked);
      if (!rows?.length) { status.textContent='Chưa có câu đã đánh dấu.';return; }
      const file=URL.createObjectURL(new Blob([JSON.stringify({format:'n5-translation-memory-v1',rows},null,2)],{type:'application/json'}));
      const link=document.createElement('a');
      link.href=file;link.download='N5-cau-dich-da-danh-dau.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(file),1500);
    }

    async function importMarked(file) {
      if (!file || file.size>8_000_000) return;
      try {
        const text=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(reader.result);
          reader.onerror=()=>reject(reader.error);
          reader.readAsText(file);
        });
        const backup=JSON.parse(text);
        if (backup.format!=='n5-translation-memory-v1' || !Array.isArray(backup.rows) || backup.rows.length>60) throw Error();
        const rows=backup.rows.map(row=>{
          const input=validRequest(row);
          const data=row?.result;
          if (!row?.marked || !input || !data || typeof data.translatedText!=='string' || !data.translatedText.trim()) throw Error();
          const entry=validOutput(data,input.direction) || Object.fromEntries(['translatedText','japaneseText','kanaReading','romaji']
            .map(key=>[key,typeof data[key]==='string'?data[key].slice(0,MAX_TRANSLATION_FIELD):'']));
          return {...input,result:{...entry,source:'imported',version:'import-1',direction:input.direction}};
        });
        let imported=0;
        for (const row of rows) {
          if (await saveTranslation(row.text,row.direction,row.result,{mark:true,ifMissing:true})) imported++;
        }
        status.textContent='Đã nhập '+imported+' câu mới. Lịch sử có sẵn được giữ.';
        await refreshHistory();
      } catch {status.textContent='Không đọc được tệp câu dịch đã đánh dấu.';}
    }

    function count() {
      if (!source) return;
      root.querySelector('[data-translation-limit]').textContent=source.value.length.toLocaleString('vi')+
        ' / '+MAX_TEXT.toLocaleString('vi')+' ký tự';
    }
    function schedule(event) {
      clearTimeout(timer);
      stop(root);
      current=null;
      target.replaceChildren();
      status.textContent='';
      count();
      const revision=++generation;
      if (composing || event?.isComposing || !source.value.trim()) return;
      timer=setTimeout(()=>{
        if (revision===generation && !source.dataset.n5PastePending) void run();
      },800);
    }
    source?.addEventListener('input',schedule);
    source?.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);stop(root);});
    source?.addEventListener('compositionend',()=>{composing=false;schedule();});
    source?.addEventListener('n5-paste-resolved',schedule);
    root.querySelector('form')?.addEventListener('submit',event=>{event.preventDefault();void run({commit:true});});
    root.addEventListener('change',event=>{
      const control=event.target;
      if (control===selector) {mode=control.value;void run();}
      if (control.matches('[data-translation-import]')) {
        void importMarked(control.files?.[0]).finally(()=>{control.value='';});
      }
      if (control.matches('[data-translation-mode]')) {
        if (control.value==='auto' && !confirm('Bật tự động gửi câu hoàn chỉnh chưa dịch được trên thiết bị tới Gemini?')) {
          control.value=getMode();return;
        }
        if (!setMode(control.value)) {control.value=getMode();status.textContent='Không lưu được thiết lập.';}
        else {
          stop(root);
          if (control.value==='auto' && source?.value.trim()) schedule();
          if (control.value==='offline') status.textContent='Đang dùng chế độ Ngoại tuyến.';
        }
      }
    });
    root.addEventListener('click',async event=>{
      const action=event.target.closest('[data-translation-action]')?.dataset.translationAction;
      if (!action) return;
      if (ai?.disabled && action==='ai') return;
      const row=historyElement?.rows?.[event.target.closest('[data-history-index]')?.dataset.historyIndex];
      try {
        if (action==='cancel') {clearTimeout(timer);stop(root);status.textContent='Đã dừng lượt dịch.';return;}
        if (action==='analyze-piece') {
          const piece=splitDocument(inputText)[Number(event.target.closest('[data-index]').dataset.index)];
          if (piece) openAnalysis?.(piece.text,event.target);
          return;
        }
        if (action==='ai') {void run({force:true,retry:current?.source==='ai'});return;}
        if (action==='flashcard' && analysis?.translation) {addCard(analysis);return;}
        if (action==='open') {open(inputText,mode);return;}
        if (action==='reverse') {
          const actual=resolvedDirection();
          const next=actual==='vi-ja'?'ja-vi':'vi-ja';
          if (!full) {open(current?(next==='ja-vi'?current.japaneseText:current.translatedText):inputText,next);return;}
          if (current) {
            inputText=next==='ja-vi'?current.japaneseText:current.translatedText;
            if (source) source.value=inputText;
            currentAnalysis=null;analyzed=false;
          }
          selector.value=mode=next;
          void run({useCurrent:true});return;
        }
        if (action==='open-saved' && row) {
          clearTimeout(timer);stop(root);ai.disabled=false;source.value=inputText=row.text;currentAnalysis=null;analyzed=false;count();
          selector.value=mode=row.direction==='romaji'?'ja-vi':row.direction;
          status.textContent='';show({...row.result,direction:row.direction},true);return;
        }
        if (action==='mark' && row) {
          if (!await setMarked(row.id,!row.marked)) status.textContent='Đã đạt giới hạn 60 câu đánh dấu.';
          await refreshHistory();return;
        }
        if (action==='delete' && row) {await removeTranslation(row.id);await refreshHistory();return;}
        if (action==='clear' && confirm('Xóa toàn bộ bản dịch trên thiết bị này?')) {
          stop(root);ai.disabled=false;await clearHistory();show(null);await refreshHistory();return;
        }
        if (action==='export') {exportMarked();return;}
        if (action==='audio' && presentation?.japaneseText) audio(presentation.japaneseText);
        if (action==='check' && presentation?.japaneseText) check(presentation.japaneseText,event.target);
        if (action==='copy' && current) {
          await navigator.clipboard.writeText(current.naturalTranslation?.trim() || current.translatedText);
          status.textContent='Đã sao chép bản dịch.';
        }
        if (action==='save' && current) {
          const saved=await saveTranslation(inputText,current.direction || resolvedDirection(),current);
          if (saved) {show(current,true);status.textContent='Đã lưu câu.';await refreshHistory();}
        }
      } catch {
        status.textContent=action==='copy'?'Không sao chép được. Bạn có thể chọn văn bản để sao chép.':'Không ghi được lịch sử bản dịch.';
      }
    });
    submissions.set(root,()=>{
      if (!current && !active.has(root)) void run({commit:true});
    });
    root.n5CancelTranslation=()=>{clearTimeout(timer);stop(root);};
    count();
    tools.cancel.hidden=true;
    void refreshHistory();
    if (text && initialDelay) timer=setTimeout(()=>void run({commit:submitted}),initialDelay);
    else if (text) void run({commit:submitted});
    else show(null);
  }

  return {
    inline(root,options) { if (acceptsAutomatic(options.text,options.analysis)) mount(root,options); },
    full(root,options) {mount(root,{...options,full:true});},
    submit(root) {
      const submit=submissions.get(root);
      submit?.();
      return !!submit;
    },
    cancelScope(scope) {
      if (!scope) return;
      scope.n5CancelTranslation?.();
      for (const root of scope.querySelectorAll('.n5-translation')) root.n5CancelTranslation?.();
    },
  };
}
