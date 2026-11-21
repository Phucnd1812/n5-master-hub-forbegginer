const yieldWork = () => new Promise(resolve => setTimeout(resolve, 0));

export function createSearchClient(sources, workerURL) {
  let worker;
  let fallback;
  let closed = false;
  let serial = 0;
  const pending = new Map();

  function stopWorker() {
    worker?.terminate();
    worker = null;
    for (const request of pending.values()) request.finish(null);
  }

  const {vocab,kanji,grammar,imported} = sources;
  let started = Promise.resolve();
  try {
    worker = new Worker(workerURL, {type:'module'});
    worker.onmessage = ({data}) => pending.get(data.id)?.finish(data.failed ? null : data.result);
    worker.onerror = stopWorker;
    worker.onmessageerror = stopWorker;
    const active = worker;
    active.postMessage({type:'init', sources:{vocab,kanji,grammar,pack:[]}});
    started = (async () => {
      for (let offset = 0; offset < imported.length && worker === active; offset += 2000) {
        await yieldWork();
        if (worker === active) active.postMessage({type:'pack', rows:imported.slice(offset, offset + 2000)});
      }
    })().catch(stopWorker);
  } catch {
    stopWorker();
  }

  async function search(query) {
    await started;
    if (worker && !closed) {
      const result = await new Promise(resolve => {
        const id = ++serial;
        const timer = setTimeout(stopWorker, 20_000);
        pending.set(id, {finish(value) {
          clearTimeout(timer);
          pending.delete(id);
          resolve(value);
        }});
        try { worker.postMessage({type:'search', id, query}); }
        catch { stopWorker(); }
      });
      if (result) return result;
    }
    if (closed) return null;
    fallback ??= Promise.all([import('./search-engine.js'),import('./lexicon.js')])
      .then(async ([{createSearchEngine},{loadBuiltInDictionary}]) =>
        createSearchEngine({vocab,kanji,grammar,pack:[...await loadBuiltInDictionary(), ...imported]}, yieldWork));
    return (await fallback).search(query);
  }

  return {search, close() { closed = true; stopWorker(); }};
}
