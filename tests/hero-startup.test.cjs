// Request ordering and stale-media regression checks; not a browser speed benchmark.
const assert=require('node:assert/strict');
const {setup,load,sleep,waitFor}=require('./content.test.cjs');
const bootstrap=load('index.html').match(/<script id="clinic-content-bootstrap">([\s\S]*?)<\/script>/)[1];
const fixture=()=>({closures:[],news:[],hero:{autoplay:false,fade:0,slides:[
  {id:'one',src:'assets/uploads/one.jpg',alt:'One'},
  {id:'two',src:'assets/uploads/two.jpg',alt:'Two'}
]}});
const image=t=>t.w.document.querySelector('[data-hero-slideshow] img');
const response=data=>({ok:true,json:async()=>data});
function page(source=fixture()){
  const t=setup('index.html',{home:true,source,deferScripts:true});
  t.w.console.warn=()=>{};
  return t;
}
async function run(){
  // Fetch starts before application scripts; the exact promise is consumed only once.
  {
    const t=page(),w=t.w;let release;const requests=[];
    w.fetch=(url,options)=>{requests.push({url,options});return new Promise(r=>{release=r;});};
    w.eval(bootstrap);await sleep(0);
    assert.equal(requests.length,1);assert.equal(requests[0].options.cache,'no-store');
    assert.match(requests[0].url,/^data\/site-updates\.json\?v=\d+$/);
    assert.equal(image(t),null);
    t.start();await sleep(0);assert.equal(requests.length,1);
    release(response(fixture()));await waitFor(()=>image(t));
    assert.equal(image(t).getAttribute('src'),'assets/uploads/one.jpg');
    assert.equal(image(t).fetchPriority,'high');assert.equal(image(t).loading,'eager');
    assert.equal(w.ClinicInitialContentRequest,undefined);
    const reordered=fixture();reordered.hero.slides.reverse();
    w.fetch=(url,options)=>{requests.push({url,options});return Promise.resolve(response(reordered));};
    await w.refreshManagedContent();await waitFor(()=>image(t)?.alt==='Two');
    assert.equal(requests.length,2,'Refresh must fetch again, not reuse the initial result');
    w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true}));
    assert.equal(image(t),null,'History snapshot must have no old photo');
    reordered.hero.slides=[];
    w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await sleep(20);
    assert.equal(requests.length,3);assert.equal(image(t),null);
    reordered.hero.slides=fixture().hero.slides;
    await w.refreshManagedContent();await waitFor(()=>image(t));
    w.fetch=async()=>{throw Error('offline');};
    await w.refreshManagedContent();assert.equal(image(t),null);
    assert.equal(t.errors.length,0);t.dom.window.close();
  }
  // Missing playlists must not be normalized into the historical illustration.
  for(const hero of [undefined,null,{}, {slides:null},{slides:[]},
    {slides:[{src:'assets/uploads/one.jpg',enabled:false}]},
    {slides:[{src:'https://invalid.example/photo.jpg'}]}]){
    const source=fixture();source.hero=hero;const t=page(source);
    t.w.eval(bootstrap);t.start();await sleep(20);
    assert.equal(image(t),null);assert.equal(t.calls.length,1);t.dom.window.close();
  }
  // A canceled or too-old bootstrap response cannot be reused at startup.
  for(const stale of ['pagehide','expired']){
    const t=page();t.w.eval(bootstrap);await sleep(0);
    if(stale==='pagehide')t.w.dispatchEvent(new t.w.PageTransitionEvent('pagehide',{persisted:true}));
    else t.w.ClinicInitialContentRequest.startedAt-=9000;
    t.getRemote().hero.slides.reverse();t.start();await waitFor(()=>image(t));
    assert.equal(t.calls.length,2);assert.equal(image(t).alt,'Two');t.dom.window.close();
  }
  // A page opened in the background remains empty until it becomes visible.
  {
    const t=page();let hidden=true;
    Object.defineProperty(t.w.document,'hidden',{get:()=>hidden,configurable:true});
    t.w.eval(bootstrap);t.start();await sleep(0);
    assert.equal(t.calls.length,0);assert.equal(image(t),null);
    hidden=false;t.w.document.dispatchEvent(new t.w.Event('visibilitychange'));
    await waitFor(()=>image(t));assert.equal(t.calls.length,1);t.dom.window.close();
  }
  // Bound both headers and body to eight seconds, even without AbortController.
  for(const bodyStall of [false,true])for(const abortSupport of [false,true]){
    const t=page(),w=t.w;const nativeTimeout=w.setTimeout.bind(w);let deadline,late;
    if(!abortSupport)w.AbortController=undefined;
    w.setTimeout=(fn,ms,...args)=>ms===8000?(deadline=fn,987654):nativeTimeout(fn,ms,...args);
    w.fetch=()=>bodyStall?Promise.resolve({ok:true,json:()=>new Promise(r=>{late=r;})}):new Promise(r=>{late=r;});
    w.eval(bootstrap);t.start();await sleep(0);deadline();await sleep(0);
    assert.equal(image(t),null);
    late(bodyStall?fixture():response(fixture()));await sleep(20);
    assert.equal(image(t),null,'Timed-out responses cannot revive the first playlist');t.dom.window.close();
  }
  for(const bad of [async()=>({ok:false,status:503}),async()=>({ok:true,json:async()=>{throw Error('Invalid JSON');}}),async()=>response({hero:fixture().hero})]){
    const t=page();t.w.fetch=bad;t.w.eval(bootstrap);t.start();await sleep(20);
    assert.equal(image(t),null);t.dom.window.close();
  }
  // Deleting while image/decode is pending must cancel the old slideshow generation.
  {
    const t=page(),w=t.w;const pending=[];
    w.Image=function(){
      const img=w.document.createElement('img');
      Object.defineProperties(img,{naturalWidth:{value:600},naturalHeight:{value:400},
        src:{get(){return img.getAttribute('src');},set(src){img.setAttribute('src',src);pending.push(()=>img.onload?.());}}});
      img.decode=()=>Promise.resolve();return img;
    };
    w.eval(bootstrap);t.start();await waitFor(()=>pending.length);
    t.getRemote().hero.slides=[];await w.refreshManagedContent();
    pending.forEach(f=>f());await sleep(20);assert.equal(image(t),null);
    t.getRemote().hero.slides=fixture().hero.slides;await w.refreshManagedContent();
    const resume=pending.at(-1);w.dispatchEvent(new w.PageTransitionEvent('pagehide',{persisted:true}));
    resume();await sleep(20);assert.equal(image(t),null);t.dom.window.close();
  }
  console.log('PASS hero startup: early single request, fresh refresh, high/eager first photo, reorder, missing/empty/disabled playlists, history/background cleanup, expired response, timeout/body/HTTP/JSON failures and late image cancellation');
}
run().catch(error=>{console.error(error);process.exit(1);});
