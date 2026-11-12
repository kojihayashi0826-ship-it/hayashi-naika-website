// Protect the published gallery against deleted photos and stale history snapshots.
const assert=require('node:assert/strict');
const {setup,waitFor}=require('./content.test.cjs');
(async()=>{
 const source={news:[],closures:[],hero:{autoplay:false,fade:0,slides:[
  {src:'assets/uploads/one.jpg',alt:'入口'},
  {src:'assets/uploads/two.jpg',alt:'待合室'},
  {src:'assets/uploads/hidden.jpg',enabled:false},
  {src:'https://invalid.example/external.jpg'},
  {src:'assets/uploads/video.mp4'}
 ]}};
 const t=setup('index.html',{home:true,source}),w=t.w;
 const photos=()=>[...w.document.querySelectorAll('[data-clinic-photos] img')];
 try {
  await waitFor(()=>photos().length===2);
  assert.deepEqual(photos().map(x=>x.getAttribute('src')),['assets/uploads/one.jpg','assets/uploads/two.jpg']);
  w.document.querySelector('.seo-photo-button').click();
  assert.equal(w.document.querySelector('.seo-photo-dialog').open,true);
  t.getRemote().hero.slides.splice(0,1);
  await w.refreshManagedContent();
  assert.deepEqual(photos().map(x=>x.getAttribute('src')),['assets/uploads/two.jpg']);
  assert.equal(w.document.querySelector('.seo-photo-dialog'),null);
  w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true}));
  assert.equal(photos().length,0);
  t.getRemote().hero.slides=[];
  w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));
  await waitFor(()=>w.document.querySelector('[data-clinic-photos-note]').textContent.includes('準備中'));
  assert.equal(photos().length,0);
  t.getRemote().hero.slides=[{src:'assets/uploads/restored.jpg',alt:'院内'}];
  await w.refreshManagedContent();assert.equal(photos().length,1);
  w.fetch=async()=>{throw Error('offline');};w.console.warn=()=>{};
  await w.refreshManagedContent();
  assert.equal(photos().length,0);
  assert.match(w.document.querySelector('[data-clinic-photos-note]').textContent,/表示できません/);
  assert.deepEqual(t.errors,[]);
  console.log('PASS gallery: current images only, deletion, lightbox cleanup, history restore and network errors');
 } finally {t.dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
