#!/usr/bin/env node
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {bucket,wordKeys} from '../../assets/search/catalog-keys.js';
import {builtInRows,jmdictRows,EXTRA_WORDS} from '../../assets/search/lexicon.js';
import {makeLemma} from '../../assets/search/morphology.js';
import {plain,japaneseKey,wordPieces} from '../../assets/search/text.js';

const repo = fileURLToPath(new URL('../../',import.meta.url));
const base = resolve(process.argv[3] || repo);
if (!process.argv[2]) throw Error('Provide the JSON extracted by prepare.py');
const raw = JSON.parse(readFileSync(process.argv[2],'utf8'));
const root = join(repo,'assets/dictionary/v1');
const json = (name,data) => writeFileSync(join(root,name),JSON.stringify(data)+'\n');
for (const subdir of ['words','kanji','strokes']) mkdirSync(join(root,subdir),{recursive:true});

const taught = JSON.parse(readFileSync(new URL('./kanji-vi.json',import.meta.url),'utf8'));
const n5 = raw.reference.filter(row=>row[7]==='N5');
const n4 = raw.reference.filter(row=>row[7]==='N4');
const shard = (index,key,item) => {
  if (!index.has(key)) index.set(key,[]);
  index.get(key).push(item);
};
const wordShards = new Map();
for (const row of [...n4,...raw.common]) for (const key of wordKeys(row)) shard(wordShards,key,row);
for (const [name,items] of wordShards) json('words/'+name+'.json',items);

const kanjiShards = new Map();
const coreKanji = [];
for (const row of raw.kanji) {
  const [character,,,,,level] = row;
  const item = [...row,taught[character] || []];
  if ([4,5].includes(level) || taught[character]) coreKanji.push(item);
  else shard(kanjiShards,bucket(character),item);
}
const strokeShards = new Map();
for (const [character,paths] of raw.strokes) shard(strokeShards,bucket(character),[character,paths]);
for (const [name,items] of kanjiShards) json('kanji/'+name+'.json',items);
for (const [name,items] of strokeShards) json('strokes/'+name+'.json',items);
json('vocab-n5.json',n5);
json('kanji-core.json',coreKanji);
json('index.json',{
  words:[...wordShards.keys()].sort(), kanji:[...kanjiShards.keys()].sort(), strokes:[...strokeShards.keys()].sort(),
  kanjidicVersion:raw.kanjidicVersion, kanjiVGVersion:'r20260714',
});

function original(root) {
  const html = readFileSync(join(root,'index.html'),'utf8');
  const data = name => JSON.parse(html.match(new RegExp('const '+name+' = (.+);'))[1]);
  const packs = name => JSON.parse(readFileSync(join(root,'assets/search',name+'.json'),'utf8'));
  const curriculum = ['VOCAB_DATA','N5_SUPPLEMENT_VOCAB_DATA'].flatMap(data);
  const kanji = ['KANJI_DATA','N5_SUPPLEMENT_KANJI_DATA'].flatMap(data);
  const oldStrokes = Object.keys(JSON.parse(readFileSync(join(root,'assets/data/kanji-strokes.json'),'utf8')));
  const legacy = builtInRows(packs('builtin-dictionary'));
  const checked = ['jmdict-context','jmdict-hotfix','jmdict-essentials'].flatMap(name=>jmdictRows(packs(name)));
  return {kanji,oldStrokes,curriculum,rows:[...curriculum,...legacy,...checked,...EXTRA_WORDS.map(([jp,kana,vi,pos])=>({jp,kana,vi,pos}))]};
}
const old = original(base);
const key = (jp,kana) => japaneseKey(jp)+'\0'+japaneseKey(kana);
const baseExact = new Map();
for (const row of old.rows) {
  const lemma = makeLemma(row);
  const written = wordPieces(plain(row.kanji || row.jp || ''));
  const read = wordPieces(plain(row.kana || '',true));
  const variants = [[lemma.jp,lemma.kana],...(lemma.aliases || []).map(alias=>[alias,lemma.kana])];
  if (written.length===read.length) written.forEach((jp,i)=>variants.push([jp,read[i]]));
  for (const [jp,kana] of variants) if (jp && kana) {
    const normalized = key(jp,kana);
    const prior = baseExact.get(normalized);
    if (!prior || !prior.vi && lemma.vi) baseExact.set(normalized,lemma);
  }
}
const refRows = new Map(raw.reference.map(row=>[row[8],row]));
const ledger = raw.audit.map(([level,id,jp,kana,jm,verified])=>{
  const baseItem = baseExact.get(key(jp,kana));
  const row = refRows.get(id);
  return [level,id,jp,kana,jm,baseItem?'yes':'no',baseItem?.vi?'yes':'no',verified?'yes':'pending',row[4] || baseItem?.vi ? 'yes':'pending'];
});
const csvLine = row => row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',');
writeFileSync(join(repo,'docs/v5.52.5-coverage.csv'),[
  ['level','reference_id','written','reading','JMdict_id','before_exact','before_VI','JMdict_verified','combined_VI'],...ledger,
].map(csvLine).join('\n')+'\n');
const beforeRows = old.rows.map(makeLemma);
const compare = rows => ({
  total:rows.length, proper:rows.filter(row => row.pos==='Tên riêng').length,
  missingVI:rows.filter(row=>!row.vi).length,missingKana:rows.filter(row=>!row.kana).length,
  missingPOS:rows.filter(row=>!row.pos).length, unknownVerbGroup:rows.filter(row=>/^Động từ/.test(row.pos) && !row.group).length,
  duplicateRows:rows.length-new Set(rows.map(row=>[row.jp,row.kana,row.vi].join('\0'))).size,
});
const corpus = [...raw.reference,...raw.common];
const catalogStats = {
  total:corpus.length, commonRows:raw.common.length, proper:corpus.filter(row=>row[3]==='proper').length,
  missingVI:corpus.filter(row=>!row[4]).length, missingKana:corpus.filter(row=>!row[2]).length,
  missingPOS:corpus.filter(row=>row[3]==='other').length, unknownVerbGroup:corpus.filter(row=>row[3]==='verb').length,
  duplicatePairs:corpus.length-new Set(corpus.map(row=>[row[0],row[1],row[2]].join('\0'))).size,
  overlapLegacy:corpus.filter(row=>baseExact.has(key(row[1],row[2]))).length,
  kanjiMetadata:raw.kanji.length, coreKanji:coreKanji.length, strokeRecords:raw.strokes.length,
  previousKanjiMetadata:new Set(old.kanji.map(row=>row.kanji)).size, previousExactStrokes:new Set(old.oldStrokes).size,
  kanjiN5:raw.kanji.filter(row=>row[5]===5).length, kanjiN4:raw.kanji.filter(row=>row[5]===4).length,
};
console.log(JSON.stringify({base:compare(beforeRows),catalog:catalogStats,
  ref:Object.fromEntries(['N5','N4'].map(level=>{
    const rows=ledger.filter(row=>row[0]===level);
    return [level,{total:rows.length,before:rows.filter(row=>row[5]==='yes').length,beforeVI:rows.filter(row=>row[6]==='yes').length,
      verified:rows.filter(row=>row[7]==='yes').length,afterVI:rows.filter(row=>row[8]==='yes').length}];
  })),
  bytes:{wordTotal:[...wordShards.values()].reduce((sum,list)=>sum + Buffer.byteLength(JSON.stringify(list)),0),
    largestWord:Math.max(...[...wordShards.values()].map(list=>Buffer.byteLength(JSON.stringify(list))))}},
null,2));
