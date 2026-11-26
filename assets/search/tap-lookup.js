const TARGET='[data-n5-tappable]';
const EXCLUDE='button,a,input,textarea,select,rt,rp,rtc,[contenteditable]';

function plain(fragment) {
  fragment.querySelectorAll('rt,rp,rtc').forEach(node=>node.remove());
  fragment.querySelectorAll('br').forEach(node=>node.replaceWith('\n'));
  return fragment.textContent;
}

function characterAt(event,source) {
  const {clientX:x,clientY:y}=event;
  const position=document.caretPositionFromPoint?.(x,y);
  const fallback=position?null:document.caretRangeFromPoint?.(x,y);
  let node=position?.offsetNode || fallback?.startContainer;
  let offset=position?.offset ?? fallback?.startOffset;
  if (!node || !source.contains(node)) return null;
  const parent=node.nodeType===Node.TEXT_NODE?node.parentElement:node;
  const annotation=parent.closest('rt,rp,rtc');
  if (annotation) {
    const ruby=annotation.closest('ruby');
    if (!ruby?.parentNode) return null;
    node=ruby.parentNode;
    offset=[...node.childNodes].indexOf(ruby);
  } else if (node.nodeType===Node.TEXT_NODE && offset>0) {
    const previous=document.createRange();
    previous.setStart(node,offset-1);
    previous.setEnd(node,offset);
    const rect=previous.getBoundingClientRect();
    if (x>=rect.left && x<rect.right && y>=rect.top && y<=rect.bottom) offset--;
  }
  const before=document.createRange();
  before.selectNodeContents(source);
  before.setEnd(node,offset);
  return plain(before.cloneContents()).length;
}

export function bindTapLookup(open) {
  let last=0;
  function handle(event) {
    const source=event.target.closest?.(TARGET);
    if (!source || event.target.closest(EXCLUDE) && !event.target.closest('rt,rp,rtc')) return;
    const keyboard=event.type==='keydown';
    if (keyboard && (event.target!==source || event.key!=='Enter' || event.isComposing)) return;
    if (!keyboard && (event.button!==0 || event.altKey || event.ctrlKey || event.metaKey ||
      !window.getSelection()?.isCollapsed)) return;
    const text=plain(source.cloneNode(true));
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return;
    const offset=keyboard?null:characterAt(event,source);
    const revision=++last;
    if (!keyboard && offset===null) return;
    event.preventDefault();
    void Promise.resolve(open(text,offset,source,()=>revision===last && source.isConnected)).catch(()=>{});
  }
  document.addEventListener('click',handle);
  document.addEventListener('keydown',handle);
}
