const LIMIT = 120;
const MARK_LIMIT = 60;
const STORE = 'translations';
let connection;

async function database() {
  if (connection) return connection;
  connection = new Promise((resolve,reject) => {
    const request = indexedDB.open('n5_translation_memory_v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  }).catch(error=>{ connection=undefined; throw error; });
  return connection;
}

const requestValue = request => new Promise((resolve,reject) => {
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});

async function transaction(mode,run) {
  const db=await database();
  const tx=db.transaction(STORE,mode);
  const complete=new Promise((resolve,reject) => {
    tx.oncomplete=resolve;
    tx.onabort=()=>reject(tx.error || Error('Translation storage transaction aborted'));
  });
  const [result]=await Promise.all([run(tx.objectStore(STORE)),complete]);
  return result;
}

export const memoryId=(text,direction)=>direction+'\n'+text.normalize('NFC').trim();

export function findTranslation(text,direction) {
  return transaction('readonly',store=>requestValue(store.get(memoryId(text,direction))));
}

export async function history() {
  const rows=await transaction('readonly',store=>requestValue(store.getAll()));
  return rows.sort((a,b)=>b.savedAt-a.savedAt);
}

export function saveTranslation(text,direction,result,{mark=false,ifMissing=false}={}) {
  const id=memoryId(text,direction);
  return transaction('readwrite',async store => {
    const rows=await requestValue(store.getAll());
    const existing=rows.find(row=>row.id===id);
    if (ifMissing && existing) return false;
    const marked=mark || existing?.marked || false;
    if (marked && !existing?.marked && rows.filter(row=>row.marked).length >= MARK_LIMIT) return false;
    const saved={id,text,direction,result,marked,savedAt:Date.now()};
    const old=rows.filter(row=>row.id!==id).sort((a,b)=>a.savedAt-b.savedAt);
    store.put(saved);
    for (let i=0;i<Math.max(0,old.length+1-LIMIT);i++) {
      const earliest=old.findIndex(row=>!row.marked);
      if (earliest>=0) store.delete(old.splice(earliest,1)[0].id);
    }
    return saved;
  });
}

export function setMarked(id,marked) {
  return transaction('readwrite',async store => {
    const rows=await requestValue(store.getAll());
    const row=rows.find(row=>row.id===id);
    if (!row || marked && !row.marked && rows.filter(item=>item.marked).length>=MARK_LIMIT) return false;
    store.put({...row,marked});
    return true;
  });
}

export const removeTranslation = id => transaction('readwrite',store=>requestValue(store.delete(id)));
export const clearHistory = () => transaction('readwrite',store=>requestValue(store.clear()));
