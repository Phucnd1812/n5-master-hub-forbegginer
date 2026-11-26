import {QUESTIONS_BY_TOPIC} from './questions.js';
import {romanize} from '../search/text.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[char]));

export function renderQuestionPanel(id, reading={furigana:true,roman:false}, collapsed=false) {
  const sets = QUESTIONS_BY_TOPIC.get(id);
  if (!sets?.length) return '';
  const line = ([jp,kana,vi])=>'<p lang="ja" data-n5-tappable tabindex="0" class="n5-qa-japanese">'+escape(jp)+'</p>'+
    '<small lang="ja" data-grammar-reading="furigana" '+(reading.furigana?'':'hidden')+'>'+escape(kana)+'</small>'+
    '<small data-grammar-reading="roman" '+(reading.roman?'':'hidden')+'>'+escape(romanize(kana))+'</small>'+
    '<p>'+escape(vi)+'</p>';
  return '<details class="n5-lookup-card n5-question-panel" data-grammar-qa '+(collapsed?'':'open')+'>'+
    '<summary>Cách hỏi & trả lời</summary>'+
    sets.map(({title,type,question,notes,answers},i)=>'<details class="n5-qa-topic" '+(i===0?'open':'')+'><summary>'+escape(title)+'</summary>'+
      '<div class="n5-qa-pair"><div><h4>Câu hỏi</h4>'+line(question)+'</div>'+
      '<div><h4>Cách trả lời</h4>'+answers.map(([label,...answer])=>
        '<div class="n5-qa-answer"><strong>'+escape(label)+'</strong>'+line(answer)+'</div>').join('')+'</div></div>'+
      '<p class="n5-qa-explanation">'+escape(notes)+'</p>'+
      '<details class="n5-qa-topic"><summary>Hội thoại mẫu</summary>'+
      '<p><strong>A</strong> <span lang="ja" data-n5-tappable tabindex="0">'+escape(question[0])+'</span></p>'+
      '<p><strong>B</strong> <span lang="ja" data-n5-tappable tabindex="0">'+escape(answers[0][1])+'</span></p></details>'+
      (type==='mở'?'<details class="n5-qa-topic" data-qa-practice><summary>Tự trả lời</summary>'+
        '<label>Viết câu trả lời của bạn<textarea lang="ja" maxlength="240" rows="2" data-qa-reply></textarea></label>'+
        '<p class="n5-lookup-meta">Đối chiếu mẫu và dùng công cụ Kiểm tra câu để xem gợi ý về cấu trúc.</p>'+
        '<button type="button" class="n5-lookup-chip" data-lookup="qa-check">Kiểm tra câu trả lời</button></details>':'')+
    '</details>').join('')+'</details>';
}
