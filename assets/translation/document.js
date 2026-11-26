import {localTranslation,looksLikeSentence} from './rules.js';

const closers=new Map([['「','」'],['『','』'],['“','”'],['（','）'],['(',')'],['【','】']]);
const terminal=/[。！？!?…]/u;
const whitespace=/\s/u;

export function splitDocument(input) {
  const parts=[];
  const quote=[];
  let start=0;
  let boundary=false;
  const add=(stop,next)=>{
    const text=input.slice(start,stop).trim();
    if (text) parts.push({text,after:input.slice(stop,next)});
    start=next;
    boundary=false;
  };
  for (let index=0;index<input.length;index++) {
    const char=input[index];
    const following=input[index+1] || '';
    if (closers.has(char)) quote.push(closers.get(char));
    else if (char===quote.at(-1)) {
      quote.pop();
      if (following && !whitespace.test(following) && !terminal.test(following)) boundary=false;
    }
    if (terminal.test(char) || char==='.' && (!following || whitespace.test(following))) boundary=true;
    else if (!whitespace.test(char) && char!=='」' && char!=='』' && char!=='”' && char!=='）' && char!==')') boundary=false;
    if (quote.length) continue;
    if (char==='\n' || char==='\r') {
      let next=index+1;
      while (whitespace.test(input[next] || '')) next++;
      add(index,next);
      index=next-1;
    } else if (boundary && !(terminal.test(following) || following==='.' || closers.has(following) && following==='“')) {
      let next=index+1;
      while (whitespace.test(input[next] || '')) next++;
      add(index+1,next);
      index=next-1;
    }
  }
  if (start<input.length) add(input.length,input.length);
  return parts;
}

export function acceptsAutomatic(text,analysis) {
  const original=text.trim();
  const meaningful=analysis?.parts.filter(part=>part.kind!=='punct') || [];
  if (meaningful.length===1 && meaningful[0].kind==='word' && !meaningful[0].form && !analysis.translation) return false;
  if (looksLikeSentence(original,analysis)) return true;
  if (splitDocument(original).length>1) return true;
  return original.split(/\s+/u).length>=5 && /[.?!]$/u.test(original);
}

export async function translateDocument(text,direction,analysis,analyze,signal) {
  const pieces=splitDocument(text);
  if (pieces.length<=1) {
    return {result:localTranslation(text,direction,analysis),pieces};
  }
  const translated=[];
  for (const piece of pieces.slice(0,12)) {
    if (signal.aborted) break;
    const reading=direction==='vi-ja' || piece.text.length>240 ? null : await analyze(piece.text,signal);
    translated.push(localTranslation(piece.text,direction,reading));
  }
  const unresolved=pieces.length-translated.filter(Boolean).length;
  if (unresolved || signal.aborted) return {result:null,pieces,unresolved,
    verified:translated.flatMap((result,index)=>result?[{text:pieces[index].text,result}]:[])};
  const combine=(name,spaced=true)=>translated.map((item,index)=>{
    const separator=pieces[index].after;
    return (item[name] || '')+(separator || (spaced && index+1<translated.length?' ':''));
  }).join('').trim();
  const translatedText=combine('translatedText',direction!=='vi-ja');
  return {pieces,result:{
    source:translated.every(item=>item.source==='verified')?'verified':'rule',
    version:'document-1',translatedText,japaneseText:combine('japaneseText',false),
    kanaReading:combine('kanaReading',false),romaji:combine('romaji'),
    sentenceStructure:translated.map((item,index)=>pieces[index].text+' → '+item.translatedText),
    contextualNotes:['Các câu được dịch riêng trên thiết bị.'],
  }};
}
