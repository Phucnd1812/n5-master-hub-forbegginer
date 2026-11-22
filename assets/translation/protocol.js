export const MAX_TEXT = 320;
export const DIRECTIONS = ['ja-vi','vi-ja','romaji'];
export const OUTPUT_LANGUAGES = ['ja','vi','romaji'];

const strings = ['translatedText','literalTranslation','naturalTranslation','japaneseText','kanaReading','romaji','politenessLevel'];
const lists = ['alternativeTranslations','sentenceStructure','contextualNotes','ambiguityNotes','limitations'];
const tables = {vocabulary:['term','reading','meaning'], grammarPatterns:['pattern','explanation']};

export const translationSchema = {
  type:'object',
  properties:{
    detectedLanguage:{type:'string',enum:OUTPUT_LANGUAGES},
    ...Object.fromEntries(strings.map(key => [key,{type:'string'}])),
    ...Object.fromEntries(lists.map(key => [key,{type:'array',items:{type:'string'}}])),
    ...Object.fromEntries(Object.entries(tables).map(([key,fields]) => [key,{type:'array',items:{
      type:'object',properties:Object.fromEntries(fields.map(field => [field,{type:'string'}])),required:fields,
    }}])),
  },
  required:['detectedLanguage',...strings,...lists,...Object.keys(tables)],
};

const string = value => typeof value === 'string' && value.length <= 1400;
function list(value, check) {
  return Array.isArray(value) && value.length <= 12 && value.every(check);
}

export function validOutput(value, direction) {
  if (!value || !translationSchema.properties.detectedLanguage.enum.includes(value.detectedLanguage)
      || (direction === 'vi-ja' ? value.detectedLanguage !== 'vi' : value.detectedLanguage === 'vi')
      || (direction === 'romaji' && value.detectedLanguage !== 'romaji')
      || !strings.every(key => string(value[key])) || !value.translatedText.trim() || !value.japaneseText.trim()
      || !lists.every(key => list(value[key],string))
      || !Object.entries(tables).every(([key,fields]) => list(value[key],row => row && fields.every(field => string(row[field]))))) return null;
  const checked=Object.fromEntries(['detectedLanguage',...strings,...lists].map(key=>[key,value[key]]));
  for (const [key,fields] of Object.entries(tables)) {
    checked[key]=value[key].map(row=>Object.fromEntries(fields.map(field=>[field,row[field]])));
  }
  return checked;
}

export function validRequest(input) {
  if (!input || typeof input.text !== 'string' || input.text.length > MAX_TEXT || !DIRECTIONS.includes(input.direction)) return null;
  const text = input.text.trim();
  if (text.length < 2 || !/[\p{L}\p{N}]/u.test(text) || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(text)) return null;
  return {text,direction:input.direction};
}
