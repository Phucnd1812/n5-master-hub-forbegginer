const KANA_ROMAJI = {
  'きゃ':'kya','きゅ':'kyu','きょ':'kyo','しゃ':'sha','しゅ':'shu','しょ':'sho',
  'ちゃ':'cha','ちゅ':'chu','ちょ':'cho','にゃ':'nya','にゅ':'nyu','にょ':'nyo',
  'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo','みゃ':'mya','みゅ':'myu','みょ':'myo',
  'りゃ':'rya','りゅ':'ryu','りょ':'ryo','ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
  'じゃ':'ja','じゅ':'ju','じょ':'jo','びゃ':'bya','びゅ':'byu','びょ':'byo',
  'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
  'あ':'a','い':'i','う':'u','え':'e','お':'o',
  'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
  'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
  'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
  'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
  'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
  'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
  'や':'ya','ゆ':'yu','よ':'yo','ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
  'わ':'wa','を':'o','ん':'n',
  'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
  'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
  'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
  'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
  'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
  'ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o','ゔ':'vu'
};
Object.assign(KANA_ROMAJI, {
  'いぇ':'ye', 'うぃ':'wi', 'うぇ':'we', 'うぉ':'wo', 'しぇ':'she', 'じぇ':'je',
  'ちぇ':'che', 'てぃ':'ti', 'でぃ':'di', 'とぅ':'tu', 'どぅ':'du',
  'つぁ':'tsa', 'つぃ':'tsi', 'つぇ':'tse', 'つぉ':'tso', 'ふぁ':'fa', 'ふぃ':'fi', 'ふぇ':'fe',
  'ふぉ':'fo', 'ふゅ':'fyu', 'ゔぁ':'va', 'ゔぃ':'vi', 'ゔぇ':'ve', 'ゔぉ':'vo'
});

export const HAS_HAN = /\p{Script=Han}/u;
export const HAS_JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々ー]/u;
export const IS_KANA = /^[ぁ-ゖー]+$/;

export function hiragana(value) {
  return String(value ?? '').normalize('NFKC').replace(/[ァ-ヶヽヾ]/g,
    char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

export function japaneseKey(value) {
  return hiragana(value).replace(/[\s、。，．！？!?・「」『』（）()[\]［］～~\-]/g, '');
}

export function wordPieces(value) {
  return String(value ?? '').normalize('NFKC').replace(/\(\s*(する|します)\s*\)/g, '$1')
    .replace(/\([^)]*\)/g, '').split(/[\/、]/).map(part => part.trim()).filter(Boolean);
}

export function fold(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

export function plain(value, reading = false) {
  return String(value ?? '').replace(/<ruby\b[^>]*>([\s\S]*?)<rt\b[^>]*>([\s\S]*?)<\/rt>[\s\S]*?<\/ruby>/gi,
    (_, base, kana) => reading ? kana : base)
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

export function romanize(input) {
  const kana = hiragana(input);
  let result = '';
  for (let i = 0; i < kana.length; i++) {
    const char = kana[i];
    const pair = kana.slice(i, i + 2);
    if (char === 'っ' || char === 'ん') {
      const next = KANA_ROMAJI[kana.slice(i + 1, i + 3)] || KANA_ROMAJI[kana[i + 1]];
      if (char === 'っ') {
        if (next) result += next.startsWith('ch') ? 't' : next[0];
      } else {
        result += next && /^[aeiouy]/.test(next) ? "n'" : 'n';
      }
    } else if (char === 'ー') {
      result += result.match(/[aeiou](?!.*[aeiou])/)?.[0] || '';
    } else if (pair.length === 2 && KANA_ROMAJI[pair]) {
      result += KANA_ROMAJI[pair];
      i++;
    } else {
      result += KANA_ROMAJI[char] || char;
    }
  }
  return result;
}

const LONG_VOWELS = {ā:'aa', â:'aa', ī:'ii', î:'ii', ū:'uu', û:'uu', ē:'ee', ê:'ee', ō:'ou', ô:'ou'};
const KUNREI = {
  sha:'sya', shu:'syu', sho:'syo', cha:'tya', chu:'tyu', cho:'tyo',
  shi:'si', chi:'ti', tsu:'tu', fu:'hu', ja:'zya', ju:'zyu', jo:'zyo', ji:'zi',
};
export const IS_ROMAN = /^[a-zāâīîūûēêōô\s'’.,!?-]+$/i;

export function romanKey(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[āâīîūûēêōô]/g, char => LONG_VOWELS[char]).replace(/[^a-z0-9]/g, '');
}

export function romanAliases(value) {
  const key = romanKey(value);
  if (!key) return [];
  const short = key.replace(/ou|oo/g, 'o').replace(/(a|i|u|e)\1/g, '$1');
  const alternative = key.replace(/sh[auoi]|ch[auoi]|tsu|fu|j[auoi]/g, value => KUNREI[value]);
  return [...new Set([key, short, alternative])];
}

// One insertion, deletion, substitution or adjacent transposition.
export function oneEdit(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length > b.length) [a, b] = [b, a];
  let first = 0;
  while (first < a.length && a[first] === b[first]) first++;
  if (a.length < b.length) return a.slice(first) === b.slice(first + 1);
  return a.slice(first + 1) === b.slice(first + 1) ||
    (a[first] === b[first + 1] && a[first + 1] === b[first] && a.slice(first + 2) === b.slice(first + 2));
}

const ROMAN_KANA = new Map();
for (const [kana,roman] of Object.entries(KANA_ROMAJI)) {
  if (!ROMAN_KANA.has(roman)) ROMAN_KANA.set(roman,kana);
}
for (const [roman,kana] of Object.entries({
  wo:'を', si:'し', ti:'ち', tu:'つ', hu:'ふ', zi:'じ',
  sya:'しゃ', syu:'しゅ', syo:'しょ', tya:'ちゃ', tyu:'ちゅ', tyo:'ちょ',
  zya:'じゃ', zyu:'じゅ', zyo:'じょ',
})) ROMAN_KANA.set(roman,kana);

export function suggestKana(roman) {
  // This is an input aid. A syllable sequence does not establish word identity.
  let result = '';
  for (let i = 0; i < roman.length;) {
    const char = roman[i];
    const next = roman[i+1] || '';
    if (char === 'n' && !/[aeiouy]/.test(next)) {
      result += 'ん';
      i += next === 'n' && i + 2 === roman.length ? 2 : 1;
      continue;
    }
    if (char === next && /[bcdfghjklmpqrstvwxyz]/.test(char) || char === 't' && roman.slice(i+1,i+3) === 'ch') {
      result += 'っ';
      i++;
      continue;
    }
    const syllable = [4,3,2,1].map(length => roman.slice(i,i+length)).find(value => ROMAN_KANA.has(value));
    if (!syllable) return '';
    result += ROMAN_KANA.get(syllable);
    i += syllable.length;
  }
  return result;
}
