const {readFileSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {performance}=require('node:perf_hooks');
const {runInNewContext}=require('node:vm');
const independent=require('../.github/tests/handwriting-fixtures.cjs');
const root=resolve(__dirname,'..');
const chars='知折着新電食見聞書語時間駅勉強';
const old=process.argv[2];

function engine(source) {
  const html=readFileSync(join(source,'index.html'),'utf8');
  const from=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
  const code=[
    'const N5_KVG_POINT_COUNT=12;',
    from('function handwritingResampleStroke','function handwritingPathToPoints'),
    from('function handwritingStrokePairDistance','async function loadHandwritingCandidateTemplates'),
    from('function n5HandwritingSignature','async function n5HandwritingStrokePreview'),
    '({normalize:handwritingNormalizeStrokes,rank:n5RankHandwriting,decode:n5DecodeHandwritingStrokes})',
  ].join('\n');
  const matcher=runInNewContext(code);
  const course=new Set(JSON.parse(html.match(/const KANJI_DATA = (.+);/)[1]).map(item=>item.kanji));
  const bytes=readFileSync(join(source,'assets/data/kanji-templates.bin'));
  const records=[];
  for(let offset=0;offset+4<=bytes.length;) {
    const char=String.fromCodePoint(bytes.readUIntBE(offset,3));
    const count=bytes[offset+3];
    offset+=4;
    records.push({char,count,offset,course:course.has(char)});
    offset+=count*24;
  }
  return {...matcher,bytes,records};
}

function cases(matcher) {
  const result=[];
  for(const char of chars) {
    const record=matcher.records.find(item=>item.char===char);
    if (!record) throw Error('Missing KanjiVG glyph '+char);
    const strokes=matcher.decode(record,matcher.bytes).map(line=>line.map(([x,y])=>[x*100,y*100]));
    const cases={
      standard:strokes,
      proportion:strokes.map(line=>line.map(([x,y])=>[x*.70,y*1.15+x*.16])),
      quick:strokes.map((line,i)=>line.filter((_,j)=>j%4===0 || j===line.length-1).map(([x,y],j)=>[x+Math.sin(i*5+j)*3,y+Math.cos(i+j*3)*3])),
      reorder:[...strokes].reverse(),
      missing:strokes.slice(0,-1),
      extra:[...strokes,[[51,46],[62,48]]],
    };
    if (independent[char]) cases.independent=independent[char];
    for(const [type,points] of Object.entries(cases)) result.push({char,type,points});
  }
  return result;
}

function measure(matcher,scope,inputs) {
  const rows=[];
  for(const {char,type,points} of inputs) {
    const normalized=matcher.normalize(points);
    const start=performance.now();
    const top=matcher.rank(normalized,scope,matcher.records,matcher.bytes).scored.slice(0,10);
    rows.push({char,type,ms:performance.now()-start,rank:top.findIndex(item=>item.char===char)+1,first:top[0]?.char});
  }
  const summarize=list=>{
    const sorted=list.map(row=>row.ms).sort((a,b)=>a-b);
    return {total:list.length,top1:list.filter(row=>row.rank===1).length,
      top5:list.filter(row=>row.rank && row.rank<=5).length,top10:list.filter(row=>row.rank).length,
      p50ms:+sorted[Math.floor(sorted.length/2)].toFixed(1),p95ms:+sorted[Math.ceil(sorted.length*.95)-1].toFixed(1)};
  };
  return {all:summarize(rows),byCase:Object.fromEntries([...new Set(rows.map(row=>row.type))].map(type=>
    [type,summarize(rows.filter(row=>row.type===type))])),
    independent:rows.filter(row=>row.type==='independent').map(({ms,...rest})=>rest)};
}

if (!old) throw Error('Supply the directory for v5.52.5');
const before=engine(old),after=engine(root),inputs=cases(before);
console.log(JSON.stringify({
  oldDefault:measure(before,'n5',inputs),oldExtended:measure(before,'all',inputs),
  smart:measure(after,'smart',inputs),
},null,2));
