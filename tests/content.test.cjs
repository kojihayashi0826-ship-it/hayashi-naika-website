const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');const {IDBFactory}=require('fake-indexeddb');
const ROOT=path.resolve(__dirname,'..');const source=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/site-updates.json')));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function load(name){return fs.readFileSync(path.join(ROOT,name),'utf8');}
function setup(name='site-editor.html',options={}){
 const dom=new JSDOM(load(name).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,''),{url:'https://www.hayashinaika.clinic/'+name,runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window;let remote=structuredClone(options.source||source),sha='initialsha',calls=[],blobs=new Map(),tree=[],commit='',errors=[];
 w.addEventListener('error',e=>errors.push(e.message));w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortSignal=AbortSignal;w.structuredClone=structuredClone;w.indexedDB=new IDBFactory();w.confirm=()=>true;w.matchMedia=()=>({matches:!!options.reduced,addEventListener(){},removeEventListener(){}});w.IntersectionObserver=class{observe(){}disconnect(){}};w.scrollTo=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.Blob.prototype.arrayBuffer=function(){return new Promise((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsArrayBuffer(this);});};
 w.URL.createObjectURL=()=> 'blob:https://test/photo';w.URL.revokeObjectURL=()=>{};
 w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});w.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new w.Blob([new Uint8Array([255,216,255,224,0])],{type:'image/jpeg'}));};
 w.Image=function(){const img=w.document.createElement('img');Object.defineProperty(img,'naturalWidth',{value:4000});Object.defineProperty(img,'naturalHeight',{value:3000});Object.defineProperty(img,'src',{get(){return img.getAttribute('src');},set(value){img.setAttribute('src',value);setTimeout(()=>{if(value.includes('broken'))img.onerror?.();else img.onload?.();},0);}});img.decode=()=>Promise.resolve();return img;};
 const response=(json,status=200)=>({ok:status<400,status,headers:{get(){return null;}},json:async()=>json});
 w.fetch=async(url,opts={})=>{
  url=String(url);const method=opts.method||'GET';let body=opts.body?JSON.parse(opts.body):null;calls.push({url,method,body});
  if(!url.startsWith('https://api.github.com/'))return response(remote);
  if(url==='https://api.github.com/user')return response({login:'test-user'});
  if(url.includes('/contents/data/site-updates.json')){
   if(method==='GET')return response({sha,encoding:'base64',content:Buffer.from(JSON.stringify(remote)).toString('base64')});
   assert.equal(body.sha,sha);remote=JSON.parse(Buffer.from(body.content,'base64'));sha='updatedsha';return response({content:{sha},commit:{sha:'b'.repeat(40)}});
  }
  if(url.endsWith('/git/ref/heads/main'))return response({object:{sha:'a'.repeat(40)}});
  if(url.includes('/git/commits/') && method==='GET')return response({tree:{sha:'basetree'}});
  if(url.endsWith('/git/blobs')){if(options.failBlob)return response({},500);const id='blob'+(blobs.size+1);blobs.set(id,body);return response({sha:id});}
  if(url.endsWith('/git/trees')){tree=body.tree;assert.equal(body.base_tree,'basetree');return response({sha:'newtree'});}
  if(url.endsWith('/git/commits')){assert.deepEqual(body.parents,['a'.repeat(40)]);commit='c'.repeat(40);return response({sha:commit});}
  if(url.endsWith('/git/refs/heads/main')){
   assert.equal(body.force,false);if(options.conflict)return response({},422);
   const json=blobs.get(tree.find(e=>e.path==='data/site-updates.json').sha);remote=JSON.parse(json.content);sha=tree.find(e=>e.path==='data/site-updates.json').sha;if(options.uncertain)throw Error('lost response');return response({object:{sha:commit}});
  }
  throw Error('Unexpected request: '+url);
 };
 let scripts;
 if(name==='site-editor.html')scripts=['clinic-schedule.js','clinic-theme.js','clinic-content.js','editor-content.js','editor-theme.js','site-editor.js','editor-drafts.js','github-publisher.js'];
 else if(name==='index.html')scripts=['clinic-schedule.js','clinic-theme.js','clinic-content.js','content-public.js','script.js'];
 else scripts=['clinic-theme.js','clinic-content.js','clinic-documents.js'];
 const expose=name==='site-editor.html'?`\nwindow.qa={get:()=>JSON.parse(JSON.stringify(data)),set:v=>{data=safeData(v);render();},prepare:()=>JSON.parse(preparedJson()),validate:()=>{collect();return validate();},dirty:()=>dirty,mark:markDirty};`:'';
 w.eval(scripts.map(load).join('\n')+expose);
 return {dom,w,calls,errors,getRemote:()=>remote,setConflict:()=>{sha='other'},getTree:()=>tree};
}
const field=(w,selector,value)=>{const el=w.document.querySelector(selector);assert.ok(el,selector);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));return el;};
async function connect(t){t.w.document.querySelector('[data-token]').value='github_pat_TESTONLY';t.w.document.querySelector('[data-connect]').click();await sleep(15);assert.equal(t.w.ClinicPublisher.isConnected(),true);}
async function editorTests(){
 const t=setup(),w=t.w;await w.editorReady;assert.equal(t.errors.length,0,JSON.stringify(t.errors));assert.equal(w.qa.get().highlights[0].title,source.highlight.title);assert.equal(w.qa.get().hero.slides.length,1);assert.deepEqual(JSON.parse(JSON.stringify(w.qa.get().closures)),source.closures);
 w.document.querySelector('[data-add-highlight]').click();field(w,'[data-highlights] article:last-child [data-content-field="title"]','第二のお知らせ');field(w,'[data-highlights] article:last-child [data-content-field="body"]','本文');
 assert.equal(w.qa.prepare().highlights.length,2);w.document.querySelector('[data-highlights] article:last-child button').click();assert.equal(w.qa.get().highlights[0].title,'第二のお知らせ');
 field(w,'[data-highlights] article:first-child [data-content-field="enabled"]',false);assert.equal(w.qa.prepare().highlights[0].enabled,false);
 field(w,'[data-hero-settings] [data-content-field="hold"]','0');assert.ok(w.qa.validate().some(x=>x.includes('秒数')));field(w,'[data-hero-settings] [data-content-field="hold"]','7.5');field(w,'[data-hero-settings] [data-content-field="fade"]','2');
 const picker=w.document.querySelector('[data-add-photos]');const photo=new w.File([new Uint8Array([255,216,255,224])],'待合室.jpg',{type:'image/jpeg'});Object.defineProperty(picker,'files',{value:[photo],configurable:true});picker.dispatchEvent(new w.Event('change'));await sleep(40);assert.equal(w.qa.get().hero.slides.length,2);assert.ok(w.qa.get().hero.slides[1].fileData.startsWith('data:image/jpeg;base64,'));
 const dp=w.document.querySelector('[data-add-documents]');Object.defineProperty(dp,'files',{value:[new w.File(['%PDF-1.4\n%%EOF'],'院内案内.pdf',{type:'application/pdf'})],configurable:true});dp.dispatchEvent(new w.Event('change'));await sleep(40);assert.equal(w.qa.get().documents[0].title,'院内案内');assert.equal(w.qa.validate().length,0);
 const backup=w.qa.prepare();const publication=w.ClinicEditorContent.publication(backup);assert.equal(publication.files.length,2);assert.equal(JSON.stringify(publication.data).includes('base64'),false);w.qa.set(backup);assert.equal(w.qa.prepare().documents[0].fileData,backup.documents[0].fileData);
 await sleep(550);assert.equal((await w.ClinicDrafts.read()).data.documents.length,1);
 const invalid=w.qa.prepare();invalid.documents[0].src='javascript:alert(1)';w.qa.set(invalid);assert.ok(w.qa.validate().length);w.qa.set(backup);
 await connect(t);await w.ClinicPublisher.publish();assert.equal(w.qa.dirty(),false);assert.equal(t.getTree().length,3);assert.ok(t.getRemote().documents[0].src.endsWith('.pdf'));assert.equal(JSON.stringify(t.getRemote()).includes('fileData'),false);assert.equal(t.errors.length,0,JSON.stringify(t.errors));assert.equal(w.document.querySelector('[data-token]').value,'');
 // Remove a listed document and update text only: no uploads needed.
 w.document.querySelector('[data-documents] .danger-button').click();assert.equal(w.qa.prepare().documents.length,0);await w.ClinicPublisher.publish();assert.equal(t.getRemote().documents.length,0);assert.ok(t.calls.some(c=>c.method==='PUT'));await sleep(50);t.dom.window.close();console.log('PASS editor: legacy migration, multiple notices, reorder, toggles, numeric validation, image/PDF import, backup, IndexedDB draft, atomic media publication, removal, text publication');
}
async function failureTests(){
 for(const options of [{conflict:true},{failBlob:true},{uncertain:true}]){
  const t=setup('site-editor.html',options),w=t.w;await w.editorReady;await connect(t);
  const state=w.qa.get();state.documents.push({id:'qa',src:'assets/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf',title:'TEST',published:true,fileData:'data:application/pdf;base64,JVBERi0xLjQKJSVFT0Y='});w.qa.set(state);w.qa.mark();await w.ClinicPublisher.publish();
  assert.equal(w.qa.dirty(),!options.uncertain);if(options.failBlob)assert.equal(t.calls.some(c=>c.method==='PATCH'),false);if(options.conflict)assert.equal(t.getRemote().documents,undefined);if(options.uncertain)assert.equal(t.calls.filter(c=>c.method==='PATCH').length,1);
  await sleep(50);t.dom.window.close();
 }
 const t=setup(),w=t.w;await w.editorReady;await connect(t);field(w,'[data-field="siteStatus.title"]','Changed');t.setConflict();await w.ClinicPublisher.publish();assert.equal(t.calls.some(c=>c.method==='PUT'),false);assert.equal(w.qa.dirty(),true);await sleep(50);t.dom.window.close();console.log('PASS failures: concurrent content update, failed file upload, concurrent branch update, lost successful ref response');
}
async function publicTests(){
 const fixture=structuredClone(source);fixture.highlights=[{id:'a',enabled:true,title:'FIRST',body:'<img src=x onerror=alert(1)>',mode:'banner'},{id:'b',enabled:true,title:'SECOND',body:'text',mode:'popup'},{id:'c',enabled:false,title:'HIDDEN'}];fixture.hero={hold:1,fade:.1,autoplay:true,pauseOnHover:true,slides:[{id:'1',enabled:true,src:'assets/clinic-logo-clean.webp',alt:'First',x:50,y:50},{id:'2',enabled:true,src:'assets/director-koji-hayashi.webp',alt:'Second',x:40,y:60}]};fixture.documents=[{id:'d',title:'施設基準',src:'assets/uploads/test.pdf',published:true},{id:'e',title:'非掲載',src:'assets/uploads/test.jpg',published:false}];
 const t=setup('index.html',{source:fixture}),w=t.w;await sleep(35);assert.equal(w.document.querySelectorAll('.important-notice').length,2);assert.equal(w.document.querySelectorAll('.important-notice img').length,0);assert.equal(w.document.querySelector('dialog').open,true);assert.equal(w.document.querySelector('.slideshow-count').textContent,'1 / 2');w.document.querySelector('dialog').close();await sleep(1150);assert.equal(w.document.querySelector('.slideshow-count').textContent,'2 / 2');
 const pause=[...w.document.querySelectorAll('.slideshow-controls button')].find(e=>e.textContent==='一時停止');pause.click();const current=w.document.querySelector('.slideshow-count').textContent;await sleep(1200);assert.equal(w.document.querySelector('.slideshow-count').textContent,current);
 const next=[...w.document.querySelectorAll('.slideshow-controls button')].find(e=>e.textContent==='次へ');next.click();await sleep(30);assert.equal(w.document.querySelector('.slideshow-count').textContent,'1 / 2');assert.equal(t.errors.length,0,JSON.stringify(t.errors));await sleep(50);t.dom.window.close();
 const reduced=setup('index.html',{source:fixture,reduced:true});await sleep(1300);assert.equal(reduced.w.document.querySelector('.slideshow-count').textContent,'1 / 2');assert.equal([...reduced.w.document.querySelectorAll('.slideshow-controls button')].at(-1).textContent,'再生');reduced.dom.window.close();
 const board=setup('clinic-documents.html',{source:fixture});await sleep(20);assert.equal(board.w.document.querySelectorAll('.document-card').length,1);assert.equal(board.w.document.querySelector('.document-card a').textContent,'施設基準');assert.equal(board.errors.length,0);board.dom.window.close();
 console.log('PASS public: two notices, safe text, popup, slideshow auto/manual/pause/reduced-motion, document list and hidden documents');
}

async function themeTests(){
 const t=setup(),w=t.w;await w.editorReady;
 assert.equal(w.qa.get().theme.preset,'mint');
 assert.equal(w.qa.get().theme.accent,'#8fc9aa');
 const baseline=w.qa.get();
 w.document.querySelector('[data-tab="design"]').click();
 assert.equal(w.document.querySelector('[data-panel="design"]').hidden,false);
 w.document.querySelector('[data-theme-preset="sky"]').click();
 assert.equal(w.qa.prepare().theme.accent,'#91bfd9');
 assert.equal(w.document.querySelector('[data-theme-preset="sky"]').getAttribute('aria-pressed'),'true');
 field(w,'[data-theme-accent]','#ffff00');field(w,'[data-theme-tint]','100');
 assert.equal(w.qa.prepare().theme.accent,'#ffff00');
 assert.equal(w.qa.prepare().theme.tint,100);
 assert.equal(w.document.querySelector('[data-theme-preset="sky"]').getAttribute('aria-pressed'),'false');
 assert.equal(w.document.querySelector('[data-theme-preview]').style.getPropertyValue('--theme-accent'),'#ffff00');
 assert.equal(w.document.documentElement.style.getPropertyValue('--theme-accent'),''); // preview never changes the editor shell
 const backup=w.qa.prepare();w.qa.set(backup);assert.deepEqual(w.qa.prepare().theme,backup.theme);
 assert.deepEqual(w.qa.prepare().closures,baseline.closures);assert.deepEqual(w.qa.prepare().news,baseline.news);
 await sleep(550);assert.equal((await w.ClinicDrafts.read()).data.theme.accent,'#ffff00');
 const normalized=w.ClinicTheme.normalize({preset:'__proto__',accent:'url(https://invalid/)',tint:Infinity});
 assert.equal(normalized.preset,'mint');assert.equal(normalized.accent,'#8fc9aa');assert.equal(normalized.tint,25);
 assert.equal(w.ClinicTheme.normalize({tint:-10}).tint,0);assert.equal(w.ClinicTheme.normalize({tint:150}).tint,100);
 const accents=['#000000','#ffffff','#ffff00','#00ff00','#ff0000','#0000ff',...Object.values(w.ClinicTheme.presets).map(p=>p.accent)];
 for(const accent of accents)for(const tint of [0,25,100]){
  const c=w.ClinicTheme.colors({accent,tint});
  for(const fg of ['--theme-link','--theme-heading'])for(const bg of ['--paper','--theme-surface','--theme-pale','--theme-button','--theme-button-hover'])
   assert.ok(w.ClinicTheme.contrast(c[fg],c[bg])>=4.5,`${accent} ${tint}: ${fg}/${bg}`);
 }
 w.document.querySelector('[data-theme-reset]').click();assert.equal(w.qa.prepare().theme.accent,'#8fc9aa');assert.equal(w.qa.prepare().theme.tint,25);
 w.document.querySelector('[data-theme-preset="peach"]').click();
 await connect(t);await w.ClinicPublisher.publish();
 assert.equal(t.getRemote().theme.preset,'peach');assert.equal(w.qa.dirty(),false);
 const published=JSON.parse(JSON.stringify(t.getRemote()));
 const publicPage=setup('index.html',{source:published});await sleep(35);
 assert.equal(publicPage.w.document.documentElement.style.getPropertyValue('--theme-accent'),'#d4b58d');
 const docs=setup('clinic-documents.html',{source:published});await sleep(20);
 assert.equal(docs.w.document.documentElement.style.getPropertyValue('--theme-accent'),'#d4b58d');
 assert.equal(t.errors.length,0,JSON.stringify(t.errors));
 await sleep(50);t.dom.window.close();publicPage.dom.window.close();docs.dom.window.close();
 console.log('PASS theme: legacy defaults, presets, custom colors, reset, readable extreme colors, draft/backup, publication, public and documents pages');
}

(async()=>{await themeTests();await editorTests();await failureTests();await publicTests();console.log('ALL TESTS PASSED');})().catch(e=>{console.error(e);process.exitCode=1;process.exit(1)});
