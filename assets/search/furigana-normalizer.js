import {hiragana,japaneseKey} from './text.js';

const annotate = /([\p{Script=Han}々]+)([ぁ-ゖァ-ヺー]{1,36})/gu;
const targetSelector = '#globalSearchInput, [data-dialog-search] input, .n5-translation-form textarea, '+
  '[data-n5-checker] textarea, [data-qa-reply], [name="builder-answer"]:not([type="radio"])';
const editorSelector = 'input,textarea,[contenteditable="true"]';

function cleanFragment(fragment,trim=true) {
  for (const item of fragment.querySelectorAll('rt,rp,rtc,script,style,iframe,object,template,svg')) item.remove();
  for (const br of fragment.querySelectorAll('br')) br.replaceWith('\n');
  for (const block of fragment.querySelectorAll('p,div,li,section,article')) block.append('\n');
  const value=fragment.textContent.replace(/\n{3,}/g,'\n\n');
  return trim ? value.trim() : value;
}

export function rubyPaste(html,doc=document) {
  if (!/<ruby(?:\s|>)/i.test(html || '')) return null;
  const template = doc.createElement('template');
  template.innerHTML = html;
  const content = template.content;
  if (![...content.querySelectorAll('ruby')].some(ruby=>ruby.querySelector('rt'))) return null;
  const annotations=[...content.querySelectorAll('ruby rt')].map(rt=>rt.textContent.trim()).filter(Boolean);
  const text = cleanFragment(content);
  return text ? {text,reading:annotations.join('・')} : null;
}

function candidates(value) {
  const tokens = [...value.matchAll(annotate)];
  const proposals = [];
  for (let start=0; start<tokens.length; start++) {
    const first = tokens[start];
    let written = '';
    let priorReading = '';
    for (let end=start; end<Math.min(start+6,tokens.length); end++) {
      const token = tokens[end];
      if (end>start && token.index!==tokens[end-1].index+tokens[end-1][0].length) break;
      written += token[1];
      if (end>start || Array.from(token[1]).length>=2) {
        proposals.push({written,start:first.index,priorReading,tail:token[2],last:token.index+token[1].length});
      }
      priorReading += hiragana(token[2]);
    }
  }
  return proposals.sort((a,b)=>b.written.length-a.written.length || a.start-b.start);
}

export async function normalizeFlatFurigana(value,readings) {
  const original = String(value ?? '');
  if (original.length>320) return null;
  const proposed = original.normalize('NFC');
  const changes = [];
  const known = new Map();
  for (const candidate of candidates(proposed)) {
    const {written,start,priorReading,tail,last}=candidate;
    if (changes.some(change=>start<change.end && last>=change.start)) continue;
    if (!known.has(written)) {
      if (known.size>=20) break;
      known.set(written,await readings(written));
    }
    const found = [...new Set(known.get(written) || [])].map(hiragana).filter(reading=>
      reading.startsWith(priorReading) && reading.length>priorReading.length &&
      hiragana(tail).startsWith(reading.slice(priorReading.length)));
    if (found.length!==1) continue;
    const reading=found[0];
    changes.push({start,end:last+reading.length-priorReading.length,written,reading});
  }
  if (!changes.length) return null;
  changes.sort((a,b)=>a.start-b.start);
  let text='', last=0;
  for (const change of changes) {
    text += proposed.slice(last,change.start)+change.written;
    last = change.end;
  }
  return {original,text:text+proposed.slice(last),reading:changes.map(change=>change.reading).join('・')};
}

export function readingsFromLookup(model,word) {
  const written = japaneseKey(word);
  const readings = (model?.results || []).filter(entry=>entry.type==='vocab' && entry.reading &&
    [entry.title,...(entry.aliases || [])].some(value=>japaneseKey(value)===written)).map(entry=>entry.reading);
  const parts = model?.analysis?.parts.filter(part=>part.kind!=='punct');
  if (parts?.length===1 && parts[0].lemma?.jp===word && parts[0].kana) readings.push(parts[0].kana);
  return [...new Set(readings)];
}

export function installFuriganaClipboard(doc,lookUp) {
  let note, pendingInput, unbind;
  const clear = () => {
    pendingInput = null;
    note?.remove();
    note = null;
    unbind?.();
    unbind = null;
  };
  function present(target,original,candidate,accept,cancel,applied=false) {
    clear();
    note=doc.createElement('aside');
    note.className='n5-paste-note';
    note.setAttribute('aria-label','Furigana trong văn bản đã dán');
    for (const [label,value] of [['Văn bản gốc',original],['Đề xuất',candidate.text],['Cách đọc',candidate.reading]]) {
      if (!value) continue;
      const line=doc.createElement('p');
      line.textContent=label+' · '+value;
      note.append(line);
    }
    const controls=doc.createElement('div');
    controls.className='n5-lookup-actions';
    function add(label,action) {
      const control=doc.createElement('button');
      control.type='button';control.className='n5-lookup-chip';control.textContent=label;
      control.addEventListener('click',action);
      controls.append(control);
    }
    if (applied) add('Hoàn tác',()=>{clear();cancel();});
    else add('Sử dụng bản chuẩn hóa',()=>{clear();accept();});
    add('Giữ nguyên',()=>{clear();target.focus({preventScroll:true});});
    if (globalThis.navigator?.clipboard?.writeText) add('Sao chép bản chuẩn hóa',async()=>{
      try {await navigator.clipboard.writeText(candidate.text);}
      catch { /* An unavailable clipboard leaves both texts on screen. */ }
    });
    note.append(controls);
    const shell=target.closest('#n5SearchShell');
    if (shell) shell.append(note);
    else target.insertAdjacentElement('afterend',note);
    const onInput = () => clear();
    target.addEventListener('input',onInput,{once:true});
    unbind=()=>target.removeEventListener('input',onInput);
  }
  function replace(target,text,start,end,maximum) {
    const accepted=text.slice(0,Math.max(0,maximum-(target.value.length-(end-start))));
    target.setRangeText(accepted,start,end,'end');
    target.focus({preventScroll:true});
    target.dispatchEvent(new Event('input',{bubbles:true}));
    return accepted;
  }

  doc.addEventListener('copy',event=>{
    if (!event.clipboardData || doc.activeElement?.matches(editorSelector)) return;
    const selection=doc.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range=selection.getRangeAt(0);
    const container=range.commonAncestorContainer;
    const owner=container.nodeType===1 ? container : container.parentElement;
    if (!owner?.closest('#mainLayout,.n5-lookup-dialog,[data-n5-grammar]')) return;
    const contents=range.cloneContents();
    if (!contents.querySelector('ruby')) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain',cleanFragment(contents,false));
  });

  doc.addEventListener('paste',event=>{
    const target=event.target;
    if (!target.matches?.(targetSelector) || !event.clipboardData || target.selectionStart===null) return;
    clear();
    const original=event.clipboardData.getData('text/plain');
    const ruby=rubyPaste(event.clipboardData.getData('text/html'),doc);
    const start=target.selectionStart,end=target.selectionEnd;
    const maximum=target.maxLength>0 ? target.maxLength : Infinity;
    if (ruby && ruby.text!==original) {
      event.preventDefault();
      const before=target.value;
      const inserted=replace(target,ruby.text,start,end,maximum);
      const applied=target.value;
      present(target,original,ruby,()=>{},()=>{
        if (target.value!==applied) return;
        const restored=original || before.slice(start,end);
        replace(target,restored,start,start+inserted.length,maximum);
      },true);
      return;
    }
    if (!/[\p{Script=Han}][ぁ-ゖァ-ヺ]/u.test(original)) return;
    const token={};
    pendingInput=token;
    setTimeout(async()=>{
      if (pendingInput!==token || !target.isConnected) return;
      const pasted=target.value;
      const added=pasted.slice(start,target.selectionEnd);
      if (added!==original) return;
      let result;
      try { result=await normalizeFlatFurigana(original,async word=>readingsFromLookup(await lookUp(word),word)); }
      catch { return; }
      if (!result || pendingInput!==token || !target.isConnected || target.value!==pasted) return;
      present(target,original,result,()=>{
        if (target.value===pasted) replace(target,result.text,start,start+original.length,maximum);
      });
    },0);
  });
}
