import {HAS_JAPANESE,hiragana,romanize} from '../search/text.js';

export const RULE_VERSION = 'rules-1';
const subjectWords = new Map(Object.entries({
  私:'tôi',私たち:'chúng tôi',僕:'tôi',彼:'anh ấy',彼女:'cô ấy',先生:'giáo viên',学生:'học sinh',友達:'bạn',
  子供:'trẻ em',雨:'mưa',雪:'tuyết',猫:'mèo',犬:'chó',
}));
const nouns = new Map(Object.entries({
  テレビ:'TV',本:'sách',薬:'thuốc',音楽:'nhạc',映画:'phim',日本語:'tiếng Nhật',日本:'Nhật Bản',学校:'trường',
  水:'nước',お茶:'trà',ご飯:'cơm',朝ご飯:'bữa sáng',家:'nhà',公園:'công viên',図書館:'thư viện',教室:'lớp học',
  東京:'Tokyo',大阪:'Osaka',京都:'Kyoto',英語:'tiếng Anh',パン:'bánh mì',コーヒー:'cà phê',車:'ô tô',駅:'nhà ga',
  ここ:'đây',そこ:'đó',あそこ:'kia',
}));
const times = new Map(Object.entries({
  毎日:'mỗi ngày',毎朝:'mỗi sáng',今:'bây giờ',今日:'hôm nay',明日:'ngày mai',昨日:'hôm qua',明後日:'ngày kia',
  今朝:'sáng nay',今晩:'tối nay',来週:'tuần sau',来年:'năm sau',昨夜:'tối qua',先週:'tuần trước',
}));
const verbs = new Map(Object.entries({
  見る:'xem',観る:'xem',飲む:'uống',食べる:'ăn',読む:'đọc',勉強する:'học',寝る:'đi ngủ',行く:'đi',来る:'đến',
  帰る:'về',買う:'mua',書く:'viết',話す:'nói',住む:'sống',働く:'làm việc',起きる:'thức dậy',待つ:'đợi',
  泳ぐ:'bơi',遊ぶ:'chơi',走る:'chạy',歩く:'đi bộ',開ける:'mở',閉める:'đóng',作る:'làm',使う:'dùng',
}));
const adjectives = new Map(Object.entries({
  暑い:'nóng',寒い:'lạnh',高い:'cao',安い:'rẻ',大きい:'lớn',小さい:'nhỏ',新しい:'mới',古い:'cũ',
  静か:'yên tĩnh',元気:'khỏe',忙しい:'bận',おいしい:'ngon',きれい:'đẹp',難しい:'khó',簡単:'đơn giản',
}));
const leading = {
  dictionary:'',masu:'',copula:'',adjPolite:'',past:'đã',mashita:'đã',adjPast:'đã',adjPastPolite:'đã',
  negative:'không',masen:'không',adjNeg:'không',adjNegPolite:'không',adjNegAlt:'không',adjNegFormal:'không',
  negativePast:'đã không',masenPast:'đã không',adjNegPast:'đã không',adjNegPastPolite:'đã không',
  adjNegPastAlt:'đã không',adjNegPastFormal:'đã không',
  progressive:'đang',progressivePolite:'đang',progressivePast:'lúc đó đang',progressivePlainPast:'lúc đó đang',
  progressiveNegative:'không',progressivePoliteNegative:'không',progressiveNegativePast:'đã không',
  progressivePoliteNegativePast:'đã không',desire:'muốn',desirePolite:'muốn',desireNegative:'không muốn',
  request:'vui lòng',negativeRequest:'vui lòng đừng',duty:'phải',dutyPolite:'phải',dutyNakute:'phải',
  dutyNakutePolite:'phải',dutyNaito:'phải',dutyNaitoPlain:'phải',
  optional:'không cần',optionalPolite:'không cần',permit:'có thể',permitPolite:'có thể',permitQuestion:'có thể',
  prohibition:'không được',prohibitionPolite:'không được',experience:'đã từng',experiencePolite:'đã từng',
  afterTe:'',before:'',simultaneous:'',tara:'',ba:'',
};
const ongoing = new Set(['見る','観る','食べる','飲む','読む','勉強する','書く','話す','働く','待つ','泳ぐ','遊ぶ','走る','歩く','作る']);
const motion = new Set(['行く','来る','帰る']);
const join = words => words.filter(Boolean).join(' ');
const rootOf = token => token?.lemma?.jp || '';
const finish = (text, question) => text.charAt(0).toUpperCase() + text.slice(1) + (question ? '?' : '.');

function sentencePart(tokens) {
  const predicate = tokens.at(-1);
  const root = rootOf(predicate);
  const form = predicate?.form?.key || 'dictionary';
  if (!Object.hasOwn(leading,form)) return null;
  let verb = verbs.get(root) || adjectives.get(root);
  if (root === 'いる' || root === '居る') verb = 'ở';
  if (root === '聞く' && tokens[0]?.lemma?.jp === '音楽' && tokens[1]?.jp === 'を') verb = 'nghe';
  if (root === '降る' && ['雨','雪'].includes(rootOf(tokens[0])) && tokens[1]?.jp === 'が') verb = 'rơi';
  if (!verb || (form.startsWith('progressive') && !ongoing.has(root) && root !== '来る')) return null;
  const ambiguous=(token,option)=>option.lemma.jp !== rootOf(token) ||
    option.form && token.form && option.form.key !== token.form.key && option.form.grammar !== token.form.grammar;
  if (tokens.some(token=>token.alternatives?.some(option=>ambiguous(token,option) &&
      !(token===predicate && verb==='ở' && option.lemma.jp==='要る' && tokens.some((piece,i)=>
        piece.jp==='に' && nouns.has(rootOf(tokens[i-1]))))))) return null;

  const args = {time:'',subject:'',object:'',place:'',compare:''};
  let still = false;
  for (let i=0;i<tokens.length-1;i++) {
    const token=tokens[i];
    const word=rootOf(token);
    let particle=tokens[i+1]?.kind === 'function' ? tokens[i+1].jp : '';
    let slot, meaning;
    if (times.has(word) && (!particle || particle === 'は')) {
      slot='time';
      meaning=times.get(word);
    } else if (word === 'まだ' && !particle && /^(?:negative|masen|progressive.*Negative)/.test(form)) {
      if (still) return null;
      still=true;
      continue;
    } else if (token.kind === 'word') {
      let person=token.vi?.match(/^\(Tên người\)\s*([\p{L}-]+)$/u)?.[1];
      if (person && tokens[i+1]?.text === 'さん' && ['は','が'].includes(tokens[i+2]?.jp)) {
        i++;
        particle=tokens[i+1].jp;
      }
      // Resolve only common case roles whose predicate makes the meaning clear.
      if (particle === 'は' || particle === 'が') {
        slot='subject';
        meaning=person || subjectWords.get(word) || nouns.get(word);
      } else if (particle === 'を' && verb && !motion.has(root) && !adjectives.has(root) && verb !== 'ở') {
        slot='object';
        meaning=nouns.get(word);
      } else if (['に','へ'].includes(particle) && (motion.has(root) || particle === 'に' && verb === 'ở')) {
        slot='place';
        meaning=nouns.get(word);
        if (meaning && root === '来る') meaning='đến ' + meaning;
      } else if (particle === 'で' && ['図書館','家','公園','教室','学校','ここ','そこ','あそこ'].includes(word)) {
        slot='place';
        meaning=nouns.get(word) && 'ở ' + nouns.get(word);
      } else if (particle === 'より' && adjectives.has(root)) {
        slot='compare';
        meaning=nouns.get(word) || subjectWords.get(word);
      }
    }
    if (!slot || !meaning || args[slot]) return null;
    args[slot]=meaning;
    if (particle) i++;
  }
  if (args.compare && !args.subject) return null;
  if (form.startsWith('progressive') && root === '来る' && !still) return null;
  let prefix=still ? 'vẫn chưa' : leading[form];
  if (!prefix && ['ngày mai','ngày kia','tuần sau','năm sau'].includes(args.time) && !adjectives.has(root)) prefix='sẽ';
  if (root === '行く' && args.place === 'trường') verb='đến';
  if (root === '来る' && args.place.startsWith('đến ')) args.place=args.place.slice(4);
  if (root === '降る' && args.subject === 'mưa') return {form,subject:'mưa',text:join([args.time,'trời',prefix,'mưa'])};
  return {form,subject:args.subject,text:join([
    args.time,args.subject,prefix,verb,args.object,args.place,args.compare && 'hơn ' + args.compare,
  ])};
}

export function translateRule(analysis) {
  if (!analysis || analysis.coverage !== 1 || analysis.original.length > 240
      || /[「」『』"\n]/u.test(analysis.original)) return null;
  const raw=analysis.parts;
  if (raw.some((part,i) => part.kind === 'unknown'
      || part.kind === 'punct' && /[。！？!?]/u.test(part.text) && i !== raw.length-1)) return null;
  const parts=raw.filter(part => part.kind !== 'punct');
  const question=/[?？]$/.test(analysis.original) || parts.at(-1)?.jp === 'か' ||
    parts.at(-1)?.text === 'か' || parts.at(-1)?.form?.key === 'permitQuestion';
  if (question && (parts.at(-1)?.jp === 'か' || parts.at(-1)?.text === 'か')) parts.pop();
  const connector=parts.findIndex(part => ['afterTe','before','simultaneous','tara','ba'].includes(part.form?.key));
  const first=connector < 0 ? null : sentencePart(parts.slice(0,connector+1));
  const final=sentencePart(parts.slice(connector+1));
  if (!final || (connector >= 0 && (!first || first.subject && final.subject && first.subject !== 'mưa' && first.subject !== 'tuyết'))) return null;
  if (['afterTe','before','simultaneous','tara','ba'].includes(final.form)) return null;
  const connectors={afterTe:'sau khi',before:'trước khi',simultaneous:'trong khi',tara:'nếu',ba:'nếu'};
  const consequent=first?.form==='tara' && final.text==='ở nhà'?'sẽ ở nhà':final.text;
  let text=first ? first.form === 'simultaneous' || first.form === 'before' ? final.text + ' ' + connectors[first.form] + ' ' + first.text
    : connectors[first.form] + ' ' + first.text + ', ' + consequent : final.text;
  if (question) text+=' không';
  return {
    source:'rule',version:RULE_VERSION,translatedText:finish(text,question),japaneseText:analysis.japanese,
    kanaReading:analysis.readings,romaji:analysis.romaji,
    contextualNotes:final.subject ? [] : ['Chủ thể của vị ngữ có thể được lược trong câu gốc.'],
  };
}

const VI_EXAMPLES = [
  ['Tôi đang học tiếng Nhật','日本語を勉強しています','にほんごをべんきょうしています','～ています diễn đạt việc đang làm. Có thể nói 私は日本語を勉強しています khi cần nêu rõ chủ đề.'],
  ['Tôi muốn đi Nhật Bản','日本へ行きたいです','にほんへいきたいです','～たいです diễn đạt mong muốn. Có thể dùng 日本に行きたいです, với に đánh dấu đích đến.'],
  ['Tôi không cần phải đi học ngày mai','明日は学校へ行かなくてもいいです','あしたはがっこうへいかなくてもいいです','～なくてもいいです diễn đạt việc không bắt buộc. は đặt ngày mai làm chủ đề.'],
  ['Tôi phải uống thuốc trước khi đi ngủ','寝る前に薬を飲まなければなりません','ねるまえにくすりをのまなければなりません','～前に nêu mốc trước khi ngủ. ～なければなりません diễn đạt việc phải làm.'],
];
const viKey = text => text.normalize('NFC').trim().replace(/[.。]+$/,'').replace(/\s+/g,' ').toLocaleLowerCase('vi');
export const isVietnameseExample = text => VI_EXAMPLES.some(([vi]) => viKey(vi) === viKey(text));

export function translateVietnamese(text) {
  const row=VI_EXAMPLES.find(([vi]) => viKey(vi) === viKey(text));
  if (!row) return null;
  const [,jp,kana,note]=row;
  return {
    source:'verified',version:RULE_VERSION,translatedText:jp+'。',japaneseText:jp+'。',kanaReading:kana+'。',
    romaji:romanize(hiragana(kana)),contextualNotes:[note],origin:'Câu đối chiếu Việt–Nhật do N5 Master Hub biên soạn',
  };
}

export function directionFor(text,mode,analysis) {
  if (mode === 'vi-ja') return 'vi-ja';
  if (HAS_JAPANESE.test(text)) return 'ja-vi';
  if (mode === 'ja-vi' || (analysis?.coverage === 1 && analysis.parts.some(part => part.form))) return 'romaji';
  return 'vi-ja';
}

export function looksLikeSentence(text,analysis) {
  const words=text.trim().split(/\s+/);
  return isVietnameseExample(text) || /[。！？!?]$/.test(text) && HAS_JAPANESE.test(text) && text.length >= 3
    || !!analysis?.translation
    || !!analysis?.parts.some(part => part.form) && analysis.parts.filter(part => part.kind === 'word' || part.kind === 'function').length >= 2
    || words.length >= 5 && /[ăâđêôơưạ-ỹ]/iu.test(text) &&
      /^(?:tôi|mình|chúng tôi|chúng ta|bạn|anh ấy|cô ấy|hôm nay|hôm qua|ngày mai|sáng nay)\b/iu.test(text);
}

export function localTranslation(text,direction,analysis) {
  if (direction === 'vi-ja') return translateVietnamese(text);
  if (analysis?.translation) return {
    source:'verified',version:'reference-1',origin:'Câu đối chiếu N5 Master Hub',translatedText:analysis.translation,
    japaneseText:analysis.japanese,kanaReading:analysis.readings,romaji:analysis.romaji,
  };
  return translateRule(analysis);
}
