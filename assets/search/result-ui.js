import {HAS_JAPANESE, hiragana} from './text.js';

export const escapeResult = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[char]);

const kana = value => typeof value==='string' && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value) &&
  /^[\p{Script=Hiragana}\p{Script=Katakana}\p{M}\s\p{P}ー\d]+$/u.test(value) && !/\[|…/.test(value);
const roman = value => typeof value==='string' && /\p{Script=Latin}/u.test(value) &&
  /^[\p{Script=Latin}\p{M}\s\p{P}\d]+$/u.test(value) && !/\[|…/.test(value);
const spelling = value => String(value ?? '').normalize('NFKC').replace(/[\s。、！？.!?,]/g,'');
const normalizeKana = value => hiragana(spelling(value));
const normalizeRoman = value => spelling(value).toLowerCase().replace(/[’']/g,"'");

function offlineQuality(analysis) {
  if (!analysis || analysis.coverage !== 1 || !analysis.parts?.length) return false;
  return !analysis.parts.some(part => part.kind==='unknown' || part.kind==='word' && !part.kana ||
    part.alternatives?.some(option=>option.lemma?.kana!==part.lemma?.kana ||
      option.form && part.form && option.form.kana!==part.form.kana));
}

export function sentenceReading(query,analysis,result) {
  const japaneseInput=HAS_JAPANESE.test(query);
  const reverse=result?.direction==='vi-ja';
  const complete=offlineQuality(analysis);
  const reference=reverse ? null : analysis?.referenceReading ||
    (result?.source==='verified' ? {kana:result.kanaReading,romaji:result.romaji} : null);
  const ai=result?.source==='ai' ? result : null;
  const aiMatches=!!ai && (!japaneseInput || spelling(ai.japaneseText)===spelling(query)) &&
    (reverse || !complete || japaneseInput || spelling(ai.japaneseText)===spelling(analysis.japanese));
  const sourceText=japaneseInput || reverse ? query :
    analysis?.referenceReading && analysis.japanese || complete && analysis.japanese ||
    (aiMatches && ai.japaneseText) || query;
  const options=[
    {name:'Kana',reference:reference?.kana,local:analysis?.readings,ai:ai?.kanaReading,valid:kana,normalize:normalizeKana},
    {name:'Romaji',reference:reference?.romaji,local:analysis?.romaji,ai:ai?.romaji,valid:roman,normalize:normalizeRoman},
  ];
  const readings=[];
  const differences=[];
  for (const item of options) {
    const choices=[
      [item.reference,'Câu đối chiếu'],
      [!reverse && complete && item.local,'Phân tích ngoại tuyến'],
      [aiMatches && item.ai,'Gemini'],
      [reverse && !ai && result?.[item.name==='Kana'?'kanaReading':'romaji'],
        result?.source==='verified'?'Câu đối chiếu':'Bản dịch đã nhập'],
    ];
    const chosen=choices.find(([value])=>item.valid(value));
    if (chosen) readings.push({kind:item.name,value:chosen[0],source:chosen[1]});
    const referenceValue=item.valid(item.reference) ? item.reference : item.local;
    if (item.ai && referenceValue && item.normalize(item.ai)!==item.normalize(referenceValue)) {
      differences.push({kind:item.name,local:referenceValue,ai:item.ai,partial:!item.valid(item.reference) && !complete});
    } else if (!complete && item.local && !chosen) {
      differences.push({kind:item.name,local:item.local,ai:'',partial:true});
    }
  }
  return {
    text:sourceText,
    input:sourceText!==query ? query : '',
    japaneseText:reverse ? result?.japaneseText || '' : HAS_JAPANESE.test(sourceText) ? sourceText : '',
    readings,differences,
    unaligned:ai && !aiMatches && ai.japaneseText || '',
    partial:!!analysis && !complete && !reference,
  };
}

export function readingLines(presentation,{furigana=true,roman=true}={}) {
  return presentation.readings.filter(({kind,value})=>kind==='Kana'?
    furigana && normalizeKana(value)!==normalizeKana(presentation.text):roman).map(({kind,value,source})=>
    '<p data-result-reading="'+kind+'"><strong>'+kind+'</strong> <span lang="'+(kind==='Kana'?'ja':'ja-Latn')+'">'+
    escapeResult(value)+'</span><small>'+escapeResult(source)+'</small></p>').join('');
}

export function sentenceHeader(presentation,settings,{reverse=false}={}) {
  return '<header class="n5-result-surface n5-result-source" data-result-tone="source">'+
    '<h2>Câu gốc</h2><p class="n5-result-sentence"'+(HAS_JAPANESE.test(presentation.text)?' lang="ja" data-n5-tappable tabindex="0"':'')+'>'+
    escapeResult(presentation.text)+'</p>'+
    (presentation.input?'<p class="n5-lookup-meta">Truy vấn · '+escapeResult(presentation.input)+'</p>':'')+
    (reverse?'':readingLines(presentation,settings))+
    (presentation.partial?'<p class="n5-result-note">Phân tích ngoại tuyến chưa đầy đủ.</p>':'')+'</header>';
}

export function readingDifferences(presentation) {
  const lines=presentation.differences.map(({kind,local,ai,partial})=>
    '<div><h4>'+kind+'</h4><p><strong>'+(partial?'Ngoại tuyến · chưa đầy đủ':'Học liệu / ngoại tuyến')+'</strong> '+escapeResult(local)+
    '</p>'+(ai?'<p><strong>Gemini</strong> '+escapeResult(ai)+'</p>':'')+'</div>').join('');
  const alternative=presentation.unaligned?'<p><strong>Cách viết Gemini đề xuất</strong> <span lang="ja">'+
    escapeResult(presentation.unaligned)+'</span></p>':'';
  return lines || alternative?'<section class="n5-result-surface" data-result-tone="warning" data-reading-differences>'+
    '<h3>Đối chiếu cách đọc</h3>'+lines+alternative+'</section>':'';
}
