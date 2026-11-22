import {createSearchEngine} from './search-engine.js';
import {loadBuiltInDictionary} from './lexicon.js';

let initialized;
let sources;
const requests = new Set();

function getEngine() {
  initialized ??= loadBuiltInDictionary().then(rows =>
    createSearchEngine({...sources,pack:[...rows,...sources.pack]}))
    .catch(error => { initialized = null; throw error; });
  return initialized;
}

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
  if (data.type === 'cancel') {
    requests.delete(data.id);
    return;
  }
  if (data.type === 'warm') {
    await getEngine().catch(() => null);
    return;
  }
  if (data.type !== 'search' && data.type !== 'check') return;
  requests.add(data.id);
  try {
    const engine = await getEngine();
    // Let cancellation messages reach the worker after the index build.
    await new Promise(resolve => setTimeout(resolve,0));
    if (!requests.has(data.id)) return;
    const result = await engine[data.type](data.query,{limit:data.limit});
    if (requests.has(data.id)) self.postMessage({id:data.id,result});
  } catch {
    if (requests.has(data.id)) self.postMessage({id:data.id,failed:true});
  } finally {
    requests.delete(data.id);
  }
};
