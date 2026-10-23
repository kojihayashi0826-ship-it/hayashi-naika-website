/* IndexedDB keeps drafts with photos/PDFs without localStorage's small quota. */
(() => {
  let opening=null,queue=Promise.resolve();
  function db(){
    if(!opening)opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open('hayashi-editor-drafts',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(Error('下書き保存を開始できません。'));
    });
    return opening;
  }
  const transact=async(mode,action)=>{const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('drafts',mode);const req=action(tx.objectStore('drafts'));let result;req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});};
  const run=fn=>{const next=queue.catch(()=>{}).then(fn);queue=next;return next;};
  window.ClinicDrafts={write:value=>run(()=>transact('readwrite',s=>s.put(value,'current'))),read:()=>run(()=>transact('readonly',s=>s.get('current'))),remove:()=>run(()=>transact('readwrite',s=>s.delete('current')))};
})();
