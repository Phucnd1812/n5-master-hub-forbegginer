import {fold,hiragana,IS_ROMAN,japaneseKey,romanAliases,romanize,romanKey} from './text.js';

export const HAN = /\p{Script=Han}/u;
const JAPANESE_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu;
const KANA_RUN = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const prefix = value => value.length >= 2 ? value.slice(0,2) : '';
const wordParts = value => String(value || '').split(/[;；]/).map(fold).filter(Boolean);
export const bucket = character => (character.codePointAt(0) % 256).toString(16).padStart(2,'0');
export const kanjiKey = character => 'h-' + bucket(character);
export const readingKeys = kana => [...new Set(romanAliases(romanize(hiragana(kana))).map(prefix).filter(Boolean))];

export function wordKeys([,title,kana,,meaning,aliases]) {
  const keys = new Set(readingKeys(kana).map(key => 'r-' + key));
  for (const char of [title,...aliases].join('')) if (HAN.test(char)) keys.add(kanjiKey(char));
  for (const gloss of wordParts(meaning)) {
    const key = prefix(gloss).trimEnd();
    if (key.length===2) keys.add('v-' + key);
  }
  return keys;
}

export function queryKeys(text) {
  const normalized = text.normalize('NFKC').trim();
  const runs = [...normalized.matchAll(JAPANESE_RUN)].map(match => japaneseKey(match[0]));
  const isLatin = !runs.length;
  const roman = isLatin && IS_ROMAN.test(normalized) ? romanKey(normalized) : '';
  const latin = isLatin ? fold(normalized) : '';
  const singleKanji = runs.length===1 && Array.from(runs[0]).length===1 && HAN.test(runs[0]) ? runs[0] : '';
  const keys = new Set();
  if (roman.length>=2) keys.add('r-' + prefix(roman));
  if (prefix(latin).trimEnd().length===2) keys.add('v-' + prefix(latin));
  for (const run of runs) {
    for (const char of run) if (HAN.test(char)) keys.add(kanjiKey(char));
    if (KANA_RUN.test(run)) for (const key of readingKeys(run)) keys.add('r-' + key);
  }
  return {keys,runs,roman,latin,singleKanji};
}

function stems(value,group) {
  if (!/^(?:I|II|III|i|na)$/.test(group)) return [];
  if (group==='na') return [value];
  if (group==='III' && /(?:する|くる)$/u.test(value)) {
    return [...['し','す','さ','で','き','こ','く'].map(stem=>value.slice(0,-2)+stem)];
  }
  return [Array.from(value).slice(0,-1).join('')];
}

export function wordMatch(row, {runs,roman,latin,singleKanji}) {
  const [,title,kana,group,vi,aliases] = row;
  const forms = [title,...aliases,kana].map(japaneseKey);
  if (singleKanji) {
    const contains = forms.slice(0,-1).some(word=>word.includes(singleKanji));
    return contains ? 'head' : '';
  }
  if (runs.length) {
    for (const run of runs) {
      for (const form of forms) {
        if (run.includes(form)) return 'analyze';
        if (stems(form,group).some(stem=>stem.length && run.includes(stem) && run.length>stem.length)) return 'analyze';
      }
    }
    return forms.some(form=>form.startsWith(runs[0])) ? 'head' : '';
  }
  if (roman) {
    const letters = romanAliases(romanize(kana));
    if (letters.includes(roman) || stems(kana,group).some(stem=>romanAliases(romanize(stem))
      .some(key=>key && roman.startsWith(key) && roman.length>key.length))) return 'analyze';
    if (letters.some(value=>value.startsWith(roman))) return 'head';
  }
  return latin && wordParts(vi).some(meaning=>meaning.startsWith(latin) || latin.length>=3 && meaning.includes(latin))
    ? 'head' : '';
}
