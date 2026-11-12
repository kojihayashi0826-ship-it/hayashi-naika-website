const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {setup,load,sleep,waitFor}=require('./content.test.cjs');
const fixture=()=>({closures:[],news:[],hero:{autoplay:true,hold:1,fade:.15,edgeSoftness:0,slides:[
  {src:'assets/uploads/one.jpg',alt:'入口'},{src:'assets/uploads/two.jpg',alt:'待合室'}
]}});
async function run(){
 const t=setup('index.html',{home:true,source:fixture(),publicDelay:20});
 try {
  const w=t.w,q=s=>w.document.querySelector(s);
  assert.equal(q('[data-home-status-title]').textContent,'診療状況を確認しています');
  await waitFor(()=>q('[data-hero-slideshow] img'));
  const cases=[
   ['2026-11-13T08:59:00+09:00','本日は診療日です','本日 9:00から診療します'],
   ['2026-11-13T09:00:00+09:00','現在診療中です','午前の受付は12:00まで'],
   ['2026-11-13T12:00:00+09:00','午後は13:30から診療します','午後の受付は18:30まで'],
   ['2026-11-13T13:30:00+09:00','現在診療中です','午後の受付は18:30まで'],
   ['2026-11-13T18:30:00+09:00','本日の診療は終了しました','次の診療：11月14日（土） 9:00から'],
   ['2026-11-12T10:00:00+09:00','本日は休診日です',null],
   ['2026-11-23T10:00:00+09:00','本日は休診日です',null],
   ['2026-11-14T14:00:00+09:00','現在診療中です','午後の受付は18:30まで'],
   ['2026-11-13T15:00:00Z','本日は診療日です','本日 9:00から診療します']
  ];
  for(const [date,title,detail] of cases){
   const model=w.homeClinicStatus(new Date(date),[]);w.renderHomeClinicStatus(model);
   assert.equal(model.title,title,date);if(detail)assert.equal(model.detail,detail,date);
   for(const selector of ['[data-home-status-title]','[data-mobile-status-label]','#today-label'])assert.equal(q(selector).textContent,title);
   assert.equal(q('[data-home-status-detail]').textContent,q('[data-mobile-status-detail]').textContent);
  }
  const half=[{start:'2026-12-30',end:'2027-01-03',startSession:'pm',endSession:'pm',season:'yearEnd',published:true}];
  for(const [date,title] of [['2026-12-30T10:00:00+09:00','現在診療中です'],['2026-12-30T12:00:00+09:00','本日の診療は終了しました']]){
   const model=w.homeClinicStatus(new Date(date),half);w.renderHomeClinicStatus(model);
   assert.equal(model.title,title);assert.equal(q('[data-home-status-partial]').textContent,'本日は午前のみ診療します。');
  }
  w.fetch=async()=>{throw Error('offline');};w.console.warn=()=>{};await w.refreshManagedContent();
  assert.equal(q('[data-home-status-title]').textContent,'診療状況はお電話でご確認ください');
  assert.equal(q('[data-mobile-status-detail]').textContent,'0761-24-6288');
  assert.equal(q('[data-hero-slideshow] img'),null);
  assert.deepEqual(t.errors,[]);
 } finally {t.dom.window.close();}
 for(const reduced of [false,true])for(const mobile of [false,true]){
  const page=setup('index.html',{home:true,source:fixture(),reduced,mobile});
  try {
   const w=page.w,q=s=>w.document.querySelector(s),current=()=>q('.slideshow-image:not([aria-hidden])');
   await waitFor(current);
   assert.equal(current().style.opacity,'1','The first photo is immediately opaque');
   assert.equal(current().style.getPropertyValue('--slideshow-fade-duration'),'0ms');
   const button=()=>q('.slideshow-photo-toggle');
   assert.equal(button().hidden,false);
   if(!reduced)button().click();
   assert.equal(button().textContent,'写真の切り替えを再開');
   const first=current();await sleep(1150);assert.equal(current(),first,'Paused photos do not advance');
   q('[aria-label="次の写真"]').click();await waitFor(()=>current()!==first);
   assert.equal(first.style.opacity,'1','Crossfade never fades both photos to white');
   await sleep(300);assert.equal(button().textContent,'写真の切り替えを再開');
   const second=current();await sleep(1100);assert.equal(current(),second,'Manual arrows preserve pause');
   w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true}));
   w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await waitFor(current);
   assert.equal(button().textContent,'写真の切り替えを再開','History/tab lifecycle preserves the visitor pause');
   button().click();assert.equal(button().textContent,'写真の切り替えを停止');
   const resumed=current();await waitFor(()=>current()!==resumed,1600);
   q('[data-hero-slideshow]').dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true}));
   assert.equal(button().textContent,'写真の切り替えを再開');
   assert.deepEqual(page.errors,[]);
  } finally {page.dom.window.close();}
 }
 const {JSDOM}=require('jsdom');
 for(const file of ['index.html','care.html','first-visit.html','tests.html','vaccines.html','checkups.html','doctor.html']){
  const dom=new JSDOM(load(file)),d=dom.window.document;
  const src='https://www.hayashinaika.clinic/assets/clinic-exterior-og-20261112.jpg';
  assert.equal(d.querySelector('[property="og:image"]').content,src);
  assert.equal(d.querySelector('[name="twitter:image"]').content,src);
  assert.equal(d.querySelector('[property="og:image:width"]').content,'1200');
  assert.equal(d.querySelector('[property="og:image:height"]').content,'630');
  if(file==='index.html'){
   const text=d.querySelector('[name="description"]').content;
   assert.equal(d.querySelector('[property="og:description"]').content,text);
   assert.equal(d.querySelector('[name="twitter:description"]').content,text);
   const graph=JSON.parse(d.querySelector('[type="application/ld+json"]').textContent)['@graph'];
   assert.equal(graph.find(v=>v['@type']==='WebPage').description,text);
  }
  dom.window.close();
 }
 // Frozen baseline: the excluded page and every local CSS/JS dependency stay unchanged.
 const manifest=JSON.parse(load('tests/fixtures/endoscopy-protected.json'));
 for(const [file,hash] of Object.entries(manifest))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex'),hash,file+' must remain unchanged');
 console.log('PASS homepage: synchronized JST status/boundaries/half days/failure; opaque first photo, crossfade, pause/resume/arrows/history/keyboard/reduced motion; 7 OG images and protected endoscopy files');
}
run().catch(error=>{console.error(error);process.exit(1);});
