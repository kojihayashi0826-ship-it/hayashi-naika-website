(() => {
  const root=document.querySelector('[data-public-documents]');let loading=false;
  async function refresh(){
    if(loading)return;loading=true;
    try{
      const response=await fetch('data/site-updates.json?v='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('load failed');
      const source=await response.json();
      if(!source || !Array.isArray(source.news) || !Array.isArray(source.closures))throw Error('invalid data');
      ClinicContent.documentList(root,ClinicContent.normalize(source).documents);
    }catch{
      root.replaceChildren();const p=document.createElement('p');p.className='documents-empty';p.textContent='資料を読み込めませんでした。';const retry=document.createElement('button');retry.type='button';retry.textContent='もう一度読み込む';retry.addEventListener('click',refresh);root.append(p,retry);
    }finally{loading=false;}
  }
  refresh();setInterval(()=>{if(!document.hidden)refresh();},120000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
