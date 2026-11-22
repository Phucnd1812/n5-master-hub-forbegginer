import {MAX_TEXT,validRequest,validOutput} from './protocol.js';
import {directionFor,localTranslation,looksLikeSentence} from './rules.js';
import {findTranslation,history,saveTranslation,setMarked,removeTranslation,clearHistory} from './memory.js';
import {getMode,setMode,MODES,messages,requestTranslation} from './client.js';

const labels={verified:'Bản dịch đối chiếu',rule:'Dịch tham khảo theo quy tắc',ai:'Bản dịch AI · Gemini',imported:'Bản dịch đã nhập'};
const modes={auto:'Tự động nhận diện','ja-vi':'Nhật / Romaji → Việt','vi-ja':'Việt → Nhật'};
const esc=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const chip=(label,action)=>'<button type="button" class="n5-lookup-chip" data-translation-action="'+action+'">'+esc(label)+'</button>';
const select=(values,selected)=>Object.entries(values).map(([key,label])=>'<option value="'+key+'"'+
  (key===selected ? ' selected' : '')+'>'+esc(label)+'</option>').join('');
const detail=(label,value)=>value ? '<p><strong>'+esc(label)+'</strong> '+esc(value)+'</p>' : '';
const list=(title,items)=>items?.length ? '<section><h4>'+esc(title)+'</h4><ul>'+items.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></section>' : '';

function resultContent(result,saved) {
  const viToJa=result.detectedLanguage==='vi' || result.direction==='vi-ja';
  return '<div class="n5-translation-result">'+
    (result.japaneseText && (!viToJa || result.japaneseText!==result.translatedText) ? '<p lang="ja">'+esc(result.japaneseText)+'</p>' : '')+
    detail('Kana',result.kanaReading)+detail('Romaji',result.romaji)+
    '<p class="n5-translation-output" lang="'+(viToJa?'ja':'vi')+'">'+esc(result.translatedText)+'</p>'+
    '<p class="n5-lookup-meta">'+esc(labels[result.source] || labels.imported)+(saved?' · Bản dịch đã lưu':'')+
    (result.origin?' · '+esc(result.origin):'')+(result.source==='ai'?' · '+esc(result.version):'')+'</p>'+
    (!!(result.literalTranslation || result.naturalTranslation) ? '<details><summary>Bản sát nghĩa và tự nhiên</summary>'+
      detail('Sát nghĩa',result.literalTranslation)+detail('Tự nhiên',result.naturalTranslation)+'</details>' : '')+
    (result.source==='ai' || result.source==='imported' ? '<details><summary>Xem giải thích và cách diễn đạt</summary>'+
      list('Từ vựng',result.vocabulary?.map(row=>[row.term,row.reading,row.meaning].filter(Boolean).join(' · ')))+
      list('Ngữ pháp',result.grammarPatterns?.map(row=>row.pattern+' · '+row.explanation))+
      list('Cấu trúc câu',result.sentenceStructure)+detail('Mức độ lịch sự',result.politenessLevel)+
      list('Bản dịch khác',result.alternativeTranslations)+list('Ngữ cảnh',result.contextualNotes)+
      list('Điểm mơ hồ',result.ambiguityNotes)+list('Giới hạn',result.limitations)+'</details>' :
      (result.contextualNotes || []).map(note=>'<p class="n5-lookup-meta">'+esc(note)+'</p>').join(''))+
    '<div class="n5-lookup-actions">'+chip('Sao chép bản dịch','copy')+chip('Lưu câu','save')+
    (result.source==='ai'?chip('Dịch lại bằng AI','retry'):'')+
    (result.japaneseText?chip('Nghe tiếng Nhật','audio')+chip('Kiểm tra câu','check'):'')+'</div></div>';
}

export function createTranslationView({analyze,send,audio,check,open}) {
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

  function mount(root,{text='',analysis=null,submitted=false,full=false,direction='auto'}={}) {
    let inputText=text;
    let currentAnalysis=analysis;
    let analyzed=!!analysis || !full;
    let mode=direction;
    let current;
    root.classList.add('n5-translation');
    root.innerHTML=(full?'<form class="n5-translation-form"><label>Câu cần dịch<textarea required maxlength="'+MAX_TEXT+
      '" rows="3" name="text">'+esc(text)+'</textarea></label><button class="n5-lookup-chip">Dịch câu</button></form>':'')+
      '<div class="n5-lookup-actions"><label>Chiều dịch <select data-translation-direction>'+select(modes,mode)+'</select></label>'+
      chip('Đổi chiều dịch','reverse')+(full?'':chip('Mở công cụ Dịch','open'))+'</div>'+
      '<div data-translation-result></div><p class="n5-lookup-meta" data-translation-status role="status"></p>'+
      '<div class="n5-lookup-actions">'+chip('Dịch chuyên sâu bằng AI','ai')+'</div>'+
      '<p class="n5-lookup-meta">Khi dùng AI, hệ thống gửi câu cần dịch và chiều dịch tới Gemini.</p>'+
      (full?'<details><summary>Thiết lập AI và lịch sử bản dịch</summary><label>Chế độ dịch <select data-translation-mode>'+
      select(MODES,getMode())+'</select></label><p class="n5-lookup-meta">Tự động thông minh chỉ gửi khi bạn thực hiện tìm kiếm hoặc nộp câu và phương án cục bộ chưa có kết quả.</p>'+
      '<label>Khôi phục các câu đã đánh dấu<input type="file" accept="application/json,.json" data-translation-import></label>'+
      '<div data-translation-history></div></details>':'');
    const target=root.querySelector('[data-translation-result]');
    const status=root.querySelector('[data-translation-status]');
    const source=root.querySelector('[name="text"]');
    const selector=root.querySelector('[data-translation-direction]');
    const ai=root.querySelector('[data-translation-action="ai"]');
    function show(result,saved=false) {
      current=result;
      target.innerHTML=result?resultContent(result,saved):'';
    }
    function begin() {
      stop(root);
      const controller=new AbortController();
      track(root,controller);
      controller.signal.addEventListener('abort',()=>{
        if (ai.disabled) {ai.disabled=false;status.textContent='Đã dừng lượt dịch.';}
      },{once:true});
      status.textContent='';
      return controller;
    }
    const live=controller=>root.isConnected && !controller.signal.aborted;
    const resolvedDirection=()=>directionFor(inputText,mode,currentAnalysis);
    async function run({force=false,retry=false,commit=false,useCurrent=false}={}) {
      const controller=begin();
      ai.disabled=false;
      const selected=(useCurrent?inputText:source?.value ?? inputText).trim();
      if (inputText!==selected) {currentAnalysis=null;analyzed=false;}
      inputText=selected;
      if (!selected) {show(null);stop(root);return;}
      if (!force) show(null);
      try {
        if (!analyzed && mode !== 'vi-ja') {
          status.textContent='Đang phân tích…';
          const parsed=await analyze(selected,controller.signal);
          if (!live(controller)) return;
          currentAnalysis=parsed;
          analyzed=true;
        }
        const actual=resolvedDirection();
        if (!validRequest({text:selected,direction:actual})) {
          status.textContent=messages.bad_request;return;
        }
        const local=localTranslation(selected,actual,currentAnalysis);
        const stored=await findTranslation(selected,actual).catch(()=>null);
        if (!live(controller)) return;
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
        const usesAi=force || commit && modeAI==='auto' && looksLikeSentence(selected,currentAnalysis);
        if (!usesAi || modeAI==='offline') {
          status.textContent=modeAI==='offline' && force?'Đang chọn chế độ Ngoại tuyến.':
            'Chưa đủ căn cứ để dịch trọn câu. Bạn có thể xem phần phân tích hoặc yêu cầu Gemini.';
          return;
        }
        status.textContent='Đang dịch…';
        ai.disabled=true;
        const reply=await requestTranslation({text:selected,direction:actual},send,controller.signal);
        if (!live(controller)) return;
        if (reply.error) {status.textContent=messages[reply.error] || '';return;}
        const result={...reply.result,direction:actual};
        show(result);
        status.textContent='';
        const saved=await saveTranslation(selected,actual,result).catch(()=>false);
        if (live(controller) && saved) {
          show(result,true);
          await refreshHistory();
        }
      } catch {
        if (live(controller)) status.textContent=messages.unavailable;
      } finally {
        if (active.get(root)===controller) { ai.disabled=false; stop(root); }
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
            .map(key=>[key,typeof data[key]==='string'?data[key].slice(0,1400):'']));
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

    source?.addEventListener('input',()=>{
      stop(root); ai.disabled=false; show(null); status.textContent='';
    });
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
        else if (control.value==='offline') {stop(root);ai.disabled=false;status.textContent='Đang dùng chế độ Ngoại tuyến.';}
      }
    });
    root.addEventListener('click',async event=>{
      const action=event.target.closest('[data-translation-action]')?.dataset.translationAction;
      if (!action) return;
      if (ai.disabled && (action==='ai' || action==='retry')) return;
      const row=historyElement?.rows?.[event.target.closest('[data-history-index]')?.dataset.historyIndex];
      try {
        if (action==='ai') {void run({force:true});return;}
        if (action==='retry') {void run({force:true,retry:true});return;}
        if (action==='open') {open(inputText,mode);return;}
        if (action==='reverse') {
          const actual=resolvedDirection();
          const next=actual==='vi-ja'?'ja-vi':'vi-ja';
          if (current) {
            inputText=next==='ja-vi'?current.japaneseText:current.translatedText;
            if (source) source.value=inputText;
            currentAnalysis=null;analyzed=false;
          }
          selector.value=mode=next;
          void run({useCurrent:true});return;
        }
        if (action==='open-saved' && row) {
          stop(root);ai.disabled=false;source.value=inputText=row.text;currentAnalysis=null;analyzed=false;
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
        if (action==='audio' && current) audio(current.japaneseText);
        if (action==='check' && current) check(current.japaneseText,event.target);
        if (action==='copy' && current) {
          await navigator.clipboard.writeText(current.translatedText);
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
    void refreshHistory();
    if (text) void run({commit:submitted});
  }

  return {
    inline(root,options) { if (looksLikeSentence(options.text,options.analysis)) mount(root,options); },
    full(root,options) {mount(root,{...options,full:true});},
    cancelScope(scope) { if (scope) for (const root of active.keys()) if (scope.contains(root)) stop(root); },
  };
}
