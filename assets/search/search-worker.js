import {createSearchEngine} from './search-engine.js';
import {loadBuiltInDictionary} from './lexicon.js';

let initialized;
let sources;
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    sources = data.sources;
    initialized = null;
    return;
  }
  if (data.type === 'pack') {
    sources.pack.push(...data.rows);
    return;
  }
  try {
    initialized ??= loadBuiltInDictionary().then(rows =>
      createSearchEngine({...sources, pack:[...rows, ...sources.pack]}));
    const result = await (await initialized).search(data.query);
    self.postMessage({id:data.id, result});
  } catch {
    self.postMessage({id:data.id, failed:true});
  }
};
