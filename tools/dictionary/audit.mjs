#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {COURSE} from '../../assets/grammar/course.js';
import {EXTENSIONS} from '../../assets/grammar/extensions.js';
import {COMPARISONS} from '../../assets/grammar/comparisons.js';
import {GRAMMAR_GUIDES} from '../../assets/search/grammar-data.js';
import {QUESTION_SETS,QUESTIONS_BY_TOPIC} from '../../assets/grammar/questions.js';
import {builtInRows,jmdictRows} from '../../assets/search/lexicon.js';
import {makeLemma} from '../../assets/search/morphology.js';
import {HAS_JAPANESE,hiragana,IS_KANA,japaneseKey,plain} from '../../assets/search/text.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const html=readFileSync(join(root,'index.html'),'utf8');
const dataset=name=>JSON.parse(html.match(new RegExp('const '+name+' = (.+);'))[1]);
const json=name=>JSON.parse(readFileSync(join(root,'assets',name),'utf8'));
const catalogue=json('dictionary/v1/index.json');
const compareKey=([id])=>'compare:'+id;
const topics=new Map();
const audited = new Map();
for (const [id,title,,, , , , , examples] of [...COURSE,...EXTENSIONS]) topics.set(id,{title,examples});
for (const guide of GRAMMAR_GUIDES) topics.set(guide.id,guide);
for (const comparison of COMPARISONS) topics.set(compareKey(comparison),{title:comparison[1],examples:[]});
for (const item of dataset('GRAMMAR_DATA')) {
  const topic=topics.get(item.id) || {title:plain(item.title),examples:[]};
  topics.set(item.id,{...topic,examples:[...topic.examples,...(item.examples || []).map(e=>[plain(e.audio || e.jp),e.kana,e.vi])]});
}
const isQuestion=jp=>/[?？]\s*$|(?:ですか|ますか|ませんか|ましたか|ましょうか|くれるか|かな|のか|だろうか)[。.\s]*$/u.test(jp);
const normalize=jp=>japaneseKey(jp).replace(/[。.!！？?»]+$/u,'');
const grammarRows=[];
for (const [id,{title,examples}] of topics) {
  const authored=new Set((QUESTIONS_BY_TOPIC.get(id) || []).map(row=>normalize(row.question[0])));
  const seen=new Set();
  for (const [index,entry] of examples.entries()) {
    const [jp]=entry;
    if(!jp || !isQuestion(jp) || seen.has(normalize(jp))) continue;
    seen.add(normalize(jp));
    const following=examples[index+1];
    const adjacent=following && !isQuestion(following[0]) &&
      (/^(?:はい|いいえ|ええ|うん|ううん|そうです|いいですよ)/u.test(following[0]) || /câu trả lời/i.test(following[3] || ''));
    const state=authored.has(normalize(jp)) ? 'answered' : adjacent ? 'existing-response-cue' : 'review';
    grammarRows.push([id,title,jp,state]);
    audited.set(id,true);
  }
  if (authored.size && !seen.size) grammarRows.push([id,title,'','authored-topic']);
}
const csv=line=>line.map(value=>'"'+String(value ?? '').replaceAll('"','""')+'"').join(',');
writeFileSync(join(root,'docs/v5.52.5-grammar-audit.csv'),[['topic','title','source_question','coverage'],...grammarRows].map(csv).join('\n')+'\n');

const common=new Map();
for (const key of catalogue.words) {
  for (const row of json('dictionary/v1/words/'+key+'.json')) {
    const [seq,jp,kana,,,,,,ref]=row;
    common.set([seq || ref,jp,kana].join('\0'),row);
  }
}
const byKana=new Map();
const collect=(jp,kana,aliases,senses,kind)=>{
  kana=hiragana(kana);
  if (!IS_KANA.test(kana) || !HAS_JAPANESE.test(jp)) return;
  if (!byKana.has(kana)) byKana.set(kana,{heads:new Map(),aliases:new Map()});
  const group=byKana.get(kana);
  const base=japaneseKey(jp);
  if (!group.heads.has(base)) group.heads.set(base,new Set());
  for (const sense of senses.filter(Boolean)) group.heads.get(base).add(String(sense).trim());
  if (kind==='verified') for (const alias of aliases || []) {
    if (IS_KANA.test(alias)) continue;
    group.aliases.set(japaneseKey(alias),base);
  }
};
for (const row of [...dataset('VOCAB_DATA'),...dataset('N5_SUPPLEMENT_VOCAB_DATA'),
  ...builtInRows(json('search/builtin-dictionary.json')),
  ...['essentials','context','hotfix'].flatMap(name=>jmdictRows(json('search/jmdict-'+name+'.json')))]) {
  const l=makeLemma(row);
  collect(l.jp,l.kana,l.aliases,l.vi.split(/[;；]/),row.sourceId?'verified':'legacy');
}
for (const [,jp,kana,,vi,aliases,english] of [...json('dictionary/v1/vocab-n5.json'),...common.values()]) {
  collect(jp,kana,aliases,vi ? vi.split(/[;；]/) : english,'verified');
}
const homophones=[];
let multiSense=0;
for (const [kana,{heads,aliases}] of byKana) {
  const verifiedMappings = new Map();
  for (const [alias,base] of aliases) {
    if (!verifiedMappings.has(alias)) verifiedMappings.set(alias,new Set());
    verifiedMappings.get(alias).add(base);
  }
  const candidates=new Map();
  for (const [word,meanings] of heads) {
    const destinations=verifiedMappings.get(word);
    const canonical=destinations?.size===1 ? [...destinations][0] : word;
    if (!candidates.has(canonical)) candidates.set(canonical,new Set());
    for (const meaning of meanings) candidates.get(canonical).add(meaning);
  }
  const names=[...candidates.keys()];
  multiSense += [...candidates.values()].filter(set=>set.size>1).length;
  if (names.length>1) homophones.push([kana,names.length,names.join('・')]);
}
homophones.sort((a,b)=>a[0].localeCompare(b[0],'ja'));
writeFileSync(join(root,'docs/v5.52.5-homophones.csv'),[['kana','heads','written'],...homophones].map(csv).join('\n')+'\n');
console.log(JSON.stringify({
  grammar:{topics:topics.size,topicsWithSourceQuestions:audited.size,sourceQuestions:grammarRows.filter(row=>row[2]).length,
    answeredExactSource:grammarRows.filter(row=>row[3]==='answered').length,
    earlierAdjacentCue:grammarRows.filter(row=>row[3]==='existing-response-cue').length,
    needsReview:grammarRows.filter(row=>row[3]==='review').length, authoredTopics:QUESTIONS_BY_TOPIC.size,
    authoredSets:QUESTION_SETS.length},
  dictionary:{readings:byKana.size,homophoneGroups:homophones.length,multiSenseEstimate:multiSense,
    overThreeGroups:homophones.filter(row=>row[1]>3).length,
    pastThreePotential:homophones.reduce((sum,row)=>sum+Math.max(0,row[1]-3),0)},
},null,2));
