const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');const {IDBFactory}=require('fake-indexeddb');
const ROOT=path.resolve(__dirname,'..');const source=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/site-updates.json')));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function load(name){return fs.readFileSync(path.join(ROOT,name),'utf8');}
function setup(name='site-editor.html',options={}){
 const dom=new JSDOM(load(name).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,''),{url:'https://www.hayashinaika.clinic/'+name,runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window;let remote=structuredClone(options.source||source),remoteHTML=options.html??load('index.html'),sha='initialsha',calls=[],blobs=new Map(),tree=[],commit='',errors=[];
 w.addEventListener('error',e=>errors.push(e.message));w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortSignal=AbortSignal;w.structuredClone=structuredClone;w.indexedDB=new IDBFactory();w.confirm=()=>true;w.matchMedia=()=>({matches:!!options.reduced,addEventListener(){},removeEventListener(){}});w.IntersectionObserver=class{observe(){}disconnect(){}};w.scrollTo=()=>{};
 w.ResizeObserver=class{observe(){}disconnect(){}};
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
  if(url.includes('/contents/index.html'))return response({encoding:'base64',content:Buffer.from(remoteHTML).toString('base64')});
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
   const json=blobs.get(tree.find(e=>e.path==='data/site-updates.json').sha);remote=JSON.parse(json.content);sha=tree.find(e=>e.path==='data/site-updates.json').sha;
   const page=tree.find(e=>e.path==='index.html');if(page)remoteHTML=blobs.get(page.sha).content;
   if(options.uncertain)throw Error('lost response');return response({object:{sha:commit}});
  }
  throw Error('Unexpected request: '+url);
 };
 let scripts;
 if(name==='site-editor.html')scripts=['clinic-schedule.js','clinic-theme.js','clinic-design.js','clinic-content.js','editor-content.js','editor-theme.js','editor-canvas.js','site-editor.js','editor-drafts.js','github-publisher.js'];
 else if(['index.html','care.html','tests.html','doctor.html','first-visit.html','vaccines.html','checkups.html'].includes(name))scripts=['clinic-schedule.js','clinic-theme.js','clinic-design.js','clinic-content.js','content-public.js','script.js'];
 else scripts=['clinic-theme.js','clinic-design.js','clinic-content.js','clinic-documents.js'];
 const expose=name==='site-editor.html'?`\nwindow.qa={get:()=>JSON.parse(JSON.stringify(data)),set:v=>{data=safeData(v);render();},prepare:()=>JSON.parse(preparedJson()),validate:()=>{collect();return validate();},dirty:()=>dirty,mark:markDirty};`:'';
 w.eval(scripts.map(load).join('\n')+expose);
 return {dom,w,calls,errors,getRemote:()=>remote,getRemoteHTML:()=>remoteHTML,setConflict:()=>{sha='other'},getTree:()=>tree};
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


async function designTests(){
 const t=setup(),w=t.w;await w.editorReady;
 assert.deepEqual(Array.from(w.qa.get().design.order),['news','visit','links','access','recruitment','faq','contact']);
 const bad=w.ClinicDesign.normalize({fontScale:500,spacing:-1,heroLayout:'invalid',order:['access','access','__proto__'],sectionColors:{news:'url(x)',access:'#AABBCC'}});
 assert.equal(bad.fontScale,130);assert.equal(bad.spacing,24);assert.equal(bad.heroLayout,'overlay');assert.equal(bad.order[0],'access');assert.equal(bad.order.length,7);assert.equal(bad.sectionColors.news,null);assert.equal(bad.sectionColors.access,'#aabbcc');
 assert.equal(w.ClinicTheme.normalize({accent:['#ffffff']}).accent,'#8fc9aa');
 const custom={background:'#112233',surface:'#333333',card:'#ffffff',heading:'#ffff00',text:'#ff0000',button:'#000000',notice:'#fff100'};
 const colors=w.ClinicTheme.colors({custom});
 for(const role of ['page','surface','card','notice'])for(const part of ['ink','heading','muted'])assert.ok(w.ClinicTheme.contrast(colors[`--theme-${role}-${part}`],colors[`--theme-${role}`])>=4.5,role+part);
 w.document.querySelector('[data-design-section="news"] [data-move="1"]').click();
 field(w,'[data-design-field="fontScale"]','125');field(w,'[data-design-field="heroLayout"]','split');field(w,'[data-design-field="guideColumns"]','2');
 field(w,'[data-custom-colors] [data-custom-enabled="background"]',true);field(w,'[data-custom-colors] [data-custom-color="background"]','#112233');
 field(w,'[data-design-order] [data-custom-enabled="access"]',true);field(w,'[data-design-order] [data-custom-color="access"]','#fbeedf');
 const backup=w.qa.prepare();assert.equal(backup.design.order[0],'visit');assert.equal(backup.design.fontScale,125);assert.equal(backup.design.heroLayout,'split');assert.equal(backup.design.guideColumns,2);assert.equal(backup.theme.custom.background,'#112233');assert.equal(backup.design.sectionColors.access,'#fbeedf');
 w.qa.set(backup);assert.deepEqual(w.qa.prepare(),backup);
 await sleep(550);assert.equal((await w.ClinicDrafts.read()).data.design.fontScale,125);
 await connect(t);await w.ClinicPublisher.publish();assert.equal(t.getRemote().design.heroLayout,'split');assert.equal(t.getRemote().theme.custom.background,'#112233');
 const publicPage=setup('index.html',{source:JSON.parse(JSON.stringify(t.getRemote()))}),pub=publicPage.w;await sleep(35);
 assert.equal(pub.document.documentElement.dataset.heroLayout,'split');assert.equal(pub.document.documentElement.style.getPropertyValue('--design-font'),'1.25');
 assert.equal(pub.document.querySelector('[data-home-layout] [data-design-section]').dataset.designSection,'visit');
 assert.equal(pub.document.querySelector('#access').style.backgroundColor,'rgb(251, 238, 223)');
 assert.equal(pub.document.querySelectorAll('.access-caution').length,0);assert.equal(pub.document.querySelector('.fever-card .card-label').textContent,'発熱のある方へ');assert.equal(pub.document.querySelector('.fever-card').textContent.includes('徒歩'),false);assert.equal(pub.document.querySelector('#news h2').textContent,'お知らせ');
 const standard=setup('index.html');await sleep(35);assert.equal(standard.w.document.querySelector('#top').nextElementSibling.id,'news');assert.equal(standard.w.document.querySelector('#top .today-panel'),null);
 w.document.querySelector('[data-design-reset]').click();assert.equal(w.qa.prepare().design.order[0],'news');assert.equal(w.qa.prepare().design.fontScale,100);assert.equal(w.qa.prepare().theme.custom.background,'#112233');
 assert.equal(t.errors.length,0,JSON.stringify(t.errors));await sleep(50);t.dom.window.close();publicPage.dom.window.close();standard.dom.window.close();
 console.log('PASS design: normalization, per-surface contrast, reorder, sizes, color overrides, backup/draft/publication, DOM reading order, content edits, independent reset');
}

async function visualTests(){
 const t=setup(),w=t.w;await w.editorReady;
 const q=s=>w.document.querySelector(s),before=w.qa.get();
 const pointer=(node,type,x,y)=>{const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(e,'pointerId',{value:7});Object.defineProperty(e,'pointerType',{value:'touch'});node.dispatchEvent(e);};
 const outlineRects=()=>q('[data-visual-outline]').querySelectorAll('[data-visual-id]').forEach((el,i)=>{el.getBoundingClientRect=()=>({top:i*50,height:50,bottom:(i+1)*50});});
 outlineRects();pointer(q('[data-visual-drag="news"]'),'pointerdown',20,75);pointer(w.document,'pointermove',20,220);pointer(w.document,'pointerup',20,220);
 assert.deepEqual(Array.from(w.qa.get().design.order.slice(0,4)),['visit','links','news','access']);
 q('[data-visual-undo]').click();assert.deepEqual(w.qa.get().design.order,before.design.order);assert.equal(q('[data-visual-undo]').disabled,true);
 q('[data-visual-redo]').click();assert.equal(w.qa.get().design.order[2],'news');q('[data-visual-undo]').click();
 outlineRects();pointer(q('[data-visual-drag="news"]'),'pointerdown',20,75);pointer(w.document,'pointermove',20,260);pointer(w.document,'pointercancel',20,260);assert.deepEqual(w.qa.get().design.order,before.design.order);
 q('[data-visual-drag="news"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(w.qa.get().design.order[1],'news');q('[data-visual-undo]').click();
 const f=q('[data-design-frame]'),d=f.contentDocument;d.body.innerHTML='<main data-home-layout><section id="top"><div class="hero-grid"></div></section><section data-design-section="news" style="padding:40px"><div class="container"><div class="section-heading"><h2>お知らせ</h2></div></div></section></main>';
 f.contentWindow.ResizeObserver=class{observe(){}};f.contentWindow.scrollTo=()=>{};f.dispatchEvent(new w.Event('load'));
 q('[data-visual-select="news"]').click();const section=d.querySelector('[data-design-section]');section.getBoundingClientRect=()=>({left:0,top:0,bottom:300,height:300,width:1000});section.querySelector('.container').getBoundingClientRect=section.getBoundingClientRect;
 pointer(d.querySelector('[data-canvas-action="width"]'),'pointerdown',1000,150);pointer(d,'pointermove',900,150);pointer(d,'pointerup',900,150);assert.equal(w.qa.get().design.sectionSizes.news.width,800);
 q('[data-visual-undo]').click();assert.equal(w.qa.get().design.sectionSizes.news,undefined);q('[data-visual-redo]').click();assert.equal(w.qa.get().design.sectionSizes.news.width,800);
 pointer(d.querySelector('[data-canvas-action="height"]'),'pointerdown',500,300);pointer(d,'pointermove',500,380);pointer(d,'pointerup',500,380);assert.equal(w.qa.get().design.sectionSizes.news.padding,80);
 pointer(d.querySelector('[data-canvas-action="height"]'),'pointerdown',500,300);pointer(d,'pointermove',500,420);d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(w.qa.get().design.sectionSizes.news.padding,80);
 d.querySelector('h2').click();pointer(d.querySelector('[data-canvas-action="type"]'),'pointerdown',100,100);pointer(d,'pointermove',140,140);pointer(d,'pointerup',140,140);assert.equal(w.qa.get().design.headingScale,120);
 const saved=w.qa.prepare();w.qa.set(saved);assert.deepEqual(w.qa.prepare().design,saved.design);await sleep(550);assert.equal((await w.ClinicDrafts.read()).data.design.sectionSizes.news.width,800);
 await connect(t);await w.ClinicPublisher.publish();assert.deepEqual(t.getRemote().design.sectionSizes,JSON.parse(JSON.stringify(saved.design.sectionSizes)));
 const pub=setup('index.html',{source:t.getRemote()});await sleep(35);assert.equal(pub.w.document.querySelector('#news').style.getPropertyValue('--design-section-width'),'800px');
 const invalid=w.ClinicDesign.normalize({sectionSizes:{news:{width:1,padding:999},access:{width:'url(x)',padding:NaN},unknown:{width:1000}}});assert.equal(invalid.sectionSizes.news.width,640);assert.equal(invalid.sectionSizes.news.padding,160);assert.equal(invalid.sectionSizes.access,undefined);assert.equal(invalid.sectionSizes.unknown,undefined);
 assert.equal(t.errors.length,0,JSON.stringify(t.errors));await sleep(50);t.dom.window.close();pub.dom.window.close();console.log('PASS visual: touch pointer reorder/resize, keyboard, cancel, undo/redo, type resize, validation, draft, backup, publish, public styles');
}

async function faqTests(){
 const t=setup(),w=t.w;await w.editorReady;
 const baseline=w.qa.get(),q=s=>w.document.querySelector(s);
 assert.equal(baseline.faqs.length,6); // old backups receive the existing questions
 assert.equal(w.ClinicContent.normalize({faqs:[]}).faqs.length,0); // empty does not restore defaults
 const normalized=w.ClinicContent.normalize({faqs:[null,{id:'same',question:' Q ',answer:' A '},{id:'same',question:'B',answer:'C'}]}).faqs;
 assert.equal(normalized.length,2);assert.notEqual(normalized[0].id,normalized[1].id);assert.equal(normalized[0].question,'Q');
 q('[data-tab="faq"]').click();assert.equal(q('[data-panel="faq"]').hidden,false);
 q('[data-add-faq]').click();assert.ok(w.qa.validate().some(e=>e.includes('質問 7')));
 const row='[data-faqs] article:last-child ';
 field(w,row+'[data-content-field="question"]','質問 <img src=x onerror=alert(1)>');
 field(w,row+'[data-content-field="answer"]','1行目 & <script>alert(1)</script>\n2行目 $&');
 assert.equal(w.qa.validate().length,0);
 q(row+'button').click();assert.equal(w.qa.get().faqs[5].question,'質問 <img src=x onerror=alert(1)>');
 field(w,'[data-faqs] article:first-child [data-content-field="published"]',false);
 const backup=w.qa.prepare();w.qa.set(backup);assert.deepEqual(w.qa.prepare().faqs,backup.faqs);
 assert.deepEqual(w.qa.prepare().closures,baseline.closures);assert.deepEqual(w.qa.prepare().news,baseline.news);
 await sleep(550);assert.equal(JSON.stringify((await w.ClinicDrafts.read()).data.faqs),JSON.stringify(backup.faqs));
 q('[data-preview]').click();assert.equal(q('[data-preview-dialog] .faq-list').querySelectorAll('details').length,6);assert.equal(q('[data-preview-dialog] .faq-list').querySelector('img'),null);q('[data-preview-dialog]').close();
 const html=w.ClinicContent.updateFaqHTML(load('index.html'),backup.faqs);
 const marker=/<\!-- clinic-faq:start -->[\s\S]*?<\!-- clinic-faq:end -->/;
 assert.equal(html.replace(marker,''),load('index.html').replace(marker,''));
 assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(html.includes('2行目 $&amp;'));
 assert.throws(()=>w.ClinicContent.updateFaqHTML('<html></html>',backup.faqs));
 await connect(t);await w.ClinicPublisher.publish();assert.equal(w.qa.dirty(),false);
 assert.deepEqual(t.getTree().map(e=>e.path).sort(),['data/site-updates.json','index.html']);
 const snapshot=new JSDOM(t.getRemoteHTML());assert.equal(snapshot.window.document.querySelectorAll('.faq-list details').length,6);
 assert.equal(snapshot.window.document.querySelector('.faq-list img'),null);assert.equal(snapshot.window.document.querySelector('.faq-list script'),null);snapshot.window.close();
 const pub=setup('index.html',{source:t.getRemote()});await sleep(40);
 assert.equal(pub.w.document.querySelectorAll('.faq-list details').length,6);assert.equal(pub.w.document.querySelector('.faq-list img'),null);
 const publishedFaqText=pub.w.document.querySelector('.faq-list').textContent;
 pub.w.ClinicPublicContent.apply({loadError:true});
 assert.equal(pub.w.document.querySelector('.faq-list').textContent,publishedFaqText);
 // All questions removed stays empty through normalization, rendering and static publication.
 while(q('[data-faqs] .danger-button'))q('[data-faqs] .danger-button').click();
 assert.equal(w.qa.prepare().faqs.length,0);await w.ClinicPublisher.publish();
 assert.equal(t.getRemote().faqs.length,0);assert.equal(new JSDOM(t.getRemoteHTML()).window.document.querySelectorAll('.faq-list details').length,0);
 const empty=setup('index.html',{source:t.getRemote()});await sleep(30);assert.equal(empty.w.document.querySelectorAll('.faq-list details').length,0);
 assert.equal(t.errors.length,0,JSON.stringify(t.errors));await sleep(50);t.dom.window.close();pub.dom.window.close();empty.dom.window.close();
 for(const option of [{conflict:true},{failBlob:true},{html:'<html>missing marker</html>'}]){
  const fail=setup('site-editor.html',option);await fail.w.editorReady;await connect(fail);
  field(fail.w,'[data-faqs] article:first-child [data-content-field="answer"]','変更した回答');
  const before=JSON.stringify(fail.getRemote());await fail.w.ClinicPublisher.publish();
  assert.equal(JSON.stringify(fail.getRemote()),before);assert.equal(fail.w.qa.dirty(),true);await sleep(50);fail.dom.window.close();
 }
 console.log('PASS FAQ: legacy/empty data, CRUD/reorder/visibility, validation, draft/backup/preview, safe text, atomic HTML+JSON, concurrent edits and failed writes');
}
async function todayStatusTests(){
 const published=JSON.parse(load('data/site-updates.json'));
 const t=setup('index.html',{source:published}),w=t.w;await sleep(40);
 const RealDate=w.Date;let instant;
 w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return new RealDate(instant).getTime();}};
 const q=s=>w.document.querySelector(s),text=s=>q(s).textContent;
 q('.today-panel').getBoundingClientRect=()=>({top:-400,bottom:-100});
 function at(time,closures=[]){instant=time;w.applyManagedContent({...published,closures});}
 at('2026-10-26T08:59:00+09:00');
 assert.equal(text('#today-label'),'本日は診療日です');assert.equal(text('#today-detail'),'次の診療は09:00からです');
 at('2026-10-26T09:00:00+09:00');
 assert.equal(text('#today-label'),'本日は診療しています');assert.equal(text('#today-reception-current'),'午前は12時まで受付');assert.equal(text('#today-detail'),'次の診療は13:30からです');
 at('2026-10-26T12:00:00+09:00');
 assert.equal(text('#today-label'),'本日は診療日です');assert.equal(text('#today-detail'),'次の診療は13:30からです');assert.equal(text('#today-reception-current'),'午後は18時30分まで受付');
 at('2026-10-26T13:30:00+09:00');
 assert.equal(text('#today-label'),'本日は診療しています');assert.equal(text('#floating-today-reception-current'),'午後は18時30分まで受付');
 assert.ok(text('#today-detail').includes('10月27日（火） 09:00'));
 at('2026-10-26T18:30:00+09:00');
 assert.equal(text('#floating-today-label'),'本日の診療は終了しました');assert.equal(q('#floating-today-reception-current').hidden,true);
 at('2026-10-29T10:00:00+09:00',published.closures);
 assert.equal(text('#today-label'),'本日は休診日です');assert.ok(text('#today-detail').includes('11月2日（月） 09:00'));
 at('2026-10-30T10:00:00+09:00',published.closures);
 assert.equal(text('#today-label'),'本日は休診日です');assert.ok(text('#today-detail').includes('11月2日（月） 09:00'));
 at('2026-11-03T10:00:00+09:00');assert.equal(text('#today-label'),'本日は休診日です');
 at('2026-10-26T10:00:00+09:00',[{start:'2026-10-26',period:'am'}]);
 assert.equal(text('#today-label'),'本日は午前休診です');assert.equal(text('[data-reception-am]'),'午前 休診');assert.ok(text('#today-detail').includes('13:30'));
 at('2026-10-26T12:00:00+09:00',[{start:'2026-10-26',period:'pm'}]);
 assert.equal(q('#today-reception-current').hidden,true);assert.equal(text('[data-reception-pm]'),'午後 休診');assert.ok(text('#today-detail').includes('10月27日'));
 // Loading failures and subsequent recoveries must immediately reach the fixed panel.
 w.applyManagedContent({...published,loadError:true});
 assert.equal(text('#floating-today-label'),'診療状況はお電話でご確認ください');assert.equal(q('#floating-today-reception-current').hidden,true);
 at('2026-10-26T10:00:00+09:00');assert.equal(text('#floating-today-label'),'本日は診療しています');
 assert.equal(q('.today-floating').classList.contains('visible'),true);
 q('.today-panel').getBoundingClientRect=()=>({top:200,bottom:400});w.syncTodayFloating();assert.equal(q('.today-floating').classList.contains('visible'),false);
 q('.today-panel').getBoundingClientRect=()=>({top:2000,bottom:2200});w.syncTodayFloating();assert.equal(q('.today-floating').classList.contains('visible'),true);
 assert.equal(q('#faq').textContent.includes('発熱や咳、のどの痛みがある場合'),false);
 assert.ok(q('#faq').textContent.includes('受付時間はいつまでですか？'));
 assert.equal(t.errors.length,0,JSON.stringify(t.errors));t.dom.window.close();
 console.log('PASS today: JST opening/lunch/closing boundaries, weekends/holidays/closures, half days, fixed-panel sync, errors/recovery and published FAQ');
}
async function mobileStatusTests(){
 const published=JSON.parse(load('data/site-updates.json'));
 const t=setup('index.html',{source:published}),w=t.w;await sleep(40);
 const RealDate=w.Date;let instant='2026-10-26T08:59:00+09:00';
 w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return new RealDate(instant).getTime();}};
 const badge=w.document.querySelector('.mobile-clinic-status');
 const label=()=>badge.querySelector('strong').textContent,detail=()=>badge.querySelector('small').textContent;
 const cases=[
  ['2026-10-26T08:59:00+09:00','next','次回受付','本日 9:00〜'],
  ['2026-10-26T09:00:00+09:00','open','現在診療中','12:00まで受付'],
  ['2026-10-26T11:59:00+09:00','open','現在診療中','12:00まで受付'],
  ['2026-10-26T12:00:00+09:00','next','次回受付','本日 13:30〜'],
  ['2026-10-26T13:29:00+09:00','next','次回受付','本日 13:30〜'],
  ['2026-10-26T13:30:00+09:00','open','現在診療中','18:30まで受付'],
  ['2026-10-26T18:30:00+09:00','ended','本日の受付終了','次回 10/27(火) 9:00〜'],
  ['2026-10-29T10:00:00+09:00','closed','本日休診日','次回 11/2(月) 9:00〜'],
  ['2026-10-30T10:00:00+09:00','closed','本日休診日','次回 11/2(月) 9:00〜'],
  ['2026-10-31T10:00:00+09:00','closed','本日休診日','次回 11/2(月) 9:00〜'],
  ['2026-11-01T10:00:00+09:00','closed','本日休診日','次回 11/2(月) 9:00〜'],
  ['2026-11-03T10:00:00+09:00','closed','本日休診日','次回 11/4(水) 9:00〜']
 ];
 for(const [time,state,title,description] of cases){
  instant=time;w.applyManagedContent(published);
  assert.equal(badge.dataset.state,state,time);assert.equal(label(),title,time);assert.equal(detail(),description,time);
 }
 instant='2026-10-26T10:00:00+09:00';
 w.applyManagedContent({...published,closures:[{start:'2026-10-26',period:'am'}]});
 assert.equal(label(),'次回受付');assert.equal(detail(),'本日 13:30〜');
 instant='2026-10-26T12:00:00+09:00';
 w.applyManagedContent({...published,closures:[{start:'2026-10-26',period:'pm'}]});
 assert.equal(label(),'本日の受付終了');assert.equal(detail(),'次回 10/27(火) 9:00〜');
 w.applyManagedContent({...published,loadError:true});
 assert.equal(badge.dataset.state,'unknown');assert.equal(detail(),'お電話でご確認ください');
 w.applyManagedContent(published);assert.equal(label(),'次回受付');
 assert.equal(t.errors.length,0,JSON.stringify(t.errors));t.dom.window.close();
 for(const name of ['care.html','tests.html','doctor.html','first-visit.html','vaccines.html','checkups.html']){
  const page=setup(name,{source:published});await sleep(30);
  assert.notEqual(page.w.document.querySelector('.mobile-clinic-status').dataset.state,'loading',name);
  assert.equal(page.w.document.querySelector('.today-panel'),null,name);
  assert.equal(page.errors.length,0,JSON.stringify(page.errors));page.dom.window.close();
 }
 console.log('PASS mobile header: opening/lunch/closing boundaries, holiday/temporary/half-day closures, error recovery, all seven patient pages');
}
function seoTests(){
 const pages=['index.html','care.html','tests.html','doctor.html','first-visit.html','vaccines.html','checkups.html'];const titles=new Set();
 for(const file of pages){
  const dom=new JSDOM(load(file)),d=dom.window.document;const title=d.title;assert.ok(title.includes('小松市'));assert.ok(title.includes('林内科医院'));assert.ok(!titles.has(title));titles.add(title);
  assert.equal(d.querySelectorAll('h1').length,1);assert.equal(d.querySelector('meta[property="og:title"]').content,title);
  const graph=JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
  const web=graph.find(n=>n['@type']==='WebPage');assert.equal(web.name,title);assert.equal(web.description,d.querySelector('meta[name="description"]').content);assert.equal(web.url,d.querySelector('link[rel="canonical"]').href);
  if(file==='index.html'){
   assert.equal(d.querySelector('.hero-hours-note,.saturday-hours'),null);assert.equal(d.querySelector('#faq').textContent.includes('土曜'),false);
   assert.equal(graph.some(n=>n['@type']==='FAQPage'),false);
   assert.equal(graph.find(n=>n['@type']==='MedicalClinic').openingHoursSpecification[1].closes,'18:30');
   const faqs=JSON.parse(load('data/site-updates.json')).faqs;assert.equal(d.querySelectorAll('.faq-list details').length,faqs.length);
   [...d.querySelectorAll('.faq-list details')].forEach((el,i)=>{assert.equal(el.querySelector('summary').textContent,faqs[i].question);assert.equal(el.querySelector('p').textContent,faqs[i].answer);});
  }
  dom.window.close();
 }
 assert.ok(!load('robots.txt').includes('Disallow: /site-editor.html'));assert.ok(load('site-editor.html').includes('noindex,nofollow,noarchive'));
 console.log('PASS SEO: unique local metadata, one H1, canonical/OG/schema agreement, no Saturday promotions, static FAQ source parity and crawlable noindex');
}
(async()=>{seoTests();await todayStatusTests();await mobileStatusTests();await faqTests();await visualTests();await designTests();await themeTests();await editorTests();await failureTests();await publicTests();console.log('ALL TESTS PASSED');})().catch(e=>{console.error(e);process.exitCode=1;process.exit(1)});


