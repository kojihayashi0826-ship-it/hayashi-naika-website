/* Shared, dependency-free content helpers for the public site and editor. */
(() => {
  'use strict';
  const defaultSlide = {id:'original-illustration',src:'assets/clinic-illustration-new-building-v4.webp',alt:'林内科医院の外観イメージ（イラスト）',enabled:true,fit:'cover',x:50,y:50};
  const defaults = {autoplay:true,hold:6,fade:1.2,easing:'ease-in-out',edgeSoftness:3,pauseOnHover:true,slides:[defaultSlide]};
  const defaultFaqs = [{"id":"faq-1","published":true,"question":"初診はどのように受診すればよいですか？","answer":"通常診療は事前のお申し込み不要です。受付時間内に直接ご来院ください。インフルエンザ・新型コロナワクチンは原則予約不要です。それ以外のワクチン・健康診断は、事前にお電話ください。"},{"id":"faq-2","published":true,"question":"発熱がある場合はどうすればよいですか？","answer":"発熱のある方は来院前にお電話ください。発熱がなければ、咳やのどの痛みだけで事前電話は必要ありません。感染対策のため、一般診療とは別の時間・場所をご案内する場合があります。"},{"id":"faq-3","published":true,"question":"胃カメラ・大腸カメラは受けられますか？","answer":"上部内視鏡検査と下部内視鏡検査に対応しています。検査の必要性、前処置、鎮静薬の使用可否は診察時にご説明します。"},{"id":"faq-4","published":true,"question":"健康診断や予防接種はできますか？","answer":"特定健康診査、後期高齢者健康診査、雇入時・定期健康診断、大腸がん検診（便潜血検査）に対応しています。また、子宮頸がん予防（HPV）、二種混合（DT）、日本脳炎などの小児用ワクチンも事前の電話相談により対応します。種類・対象年齢・在庫状況によってはご用意できない場合があります。"},{"id":"faq-5","published":true,"question":"駐車場はありますか？","answer":"医院前に9台分の駐車場があります。小松空港、小松駅、小松IC方面からお車で来院しやすい立地です。"},{"id":"faq-6","published":true,"question":"受付時間はいつまでですか？","answer":"午前は12時まで、午後は18時30分まで受け付けています。"}];
  const number = (v,fallback,min,max) => v !== '' && v != null && Number.isFinite(Number(v)) ? Math.min(max,Math.max(min,Number(v))) : fallback;
  const text = v => typeof v === 'string' ? v : '';
  function safeAsset(path) { return typeof path === 'string' && /^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:pdf|jpe?g|png|webp)$/i.test(path); }
  function videoAsset(path) { return typeof path === 'string' && /^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:mp4|webm)$/i.test(path); }
  function imageAsset(path) { return safeAsset(path) && !/\.pdf$/i.test(path); }
  function slideAsset(path) { return imageAsset(path) || videoAsset(path); }
  function normalize(source) {
    const h = Array.isArray(source.highlights) ? source.highlights : source.highlight && (source.highlight.title || source.highlight.body) ? [{...source.highlight,id:'legacy-highlight'}] : [];
    const hero = source.hero || {};
    return {
      faqs: normalizeFaqs(source.faqs),
      theme: ClinicTheme.normalize(source.theme),
      design: ClinicDesign.normalize(source.design),
      highlights:h.filter(Boolean).map((v,i)=>({id:v.id || `highlight-${i}`,enabled:v.enabled !== false,mode:v.mode === 'popup' ? 'popup' : 'banner',title:text(v.title),body:text(v.body),linkText:text(v.linkText),linkUrl:text(v.linkUrl)})),
      hero:{autoplay:hero.autoplay !== false,hold:number(hero.hold,6,1,120),fade:number(hero.fade,1.2,0,10),edgeSoftness:number(hero.edgeSoftness,3,0,20),easing:['linear','ease','ease-in','ease-out','ease-in-out'].includes(hero.easing)?hero.easing:'ease-in-out',pauseOnHover:hero.pauseOnHover !== false,
        slides:(Array.isArray(hero.slides)?hero.slides:[defaultSlide]).filter(Boolean).map((v,i)=>({...v,id:v.id || `slide-${i}`,src:text(v.src),alt:text(v.alt),poster:text(v.poster),posterData:text(v.posterData),enabled:v.enabled !== false,fit:v.fit === 'contain'?'contain':'cover',x:number(v.x,50,0,100),y:number(v.y,50,0,100)}))},
      documents:(Array.isArray(source.documents)?source.documents:[]).filter(Boolean).map((v,i)=>({...v,id:v.id || `document-${i}`,title:text(v.title),description:text(v.description),src:text(v.src),name:text(v.name),published:v.published !== false}))
    };
  }
  function normalizeFaqs(items) {
    const seen=new Set();
    return (Array.isArray(items)?items:defaultFaqs).filter(v=>v && typeof v==='object').map((v,i)=>{
      let id=text(v.id) || `faq-${i+1}`;
      while(seen.has(id))id+='-copy';
      seen.add(id);
      return {id,published:v.published!==false,question:text(v.question).trim(),answer:text(v.answer).trim()};
    });
  }
  const escapeHTML=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function faqHTML(items) {
    const visible=normalizeFaqs(items).filter(v=>v.published && v.question && v.answer);
    return visible.length?visible.map(v=>`<details><summary>${escapeHTML(v.question)}</summary><p>${escapeHTML(v.answer)}</p></details>`).join('\n'):'<p class="faq-empty">受診についてのご質問は、診療時間内にお電話でお問い合わせください。</p>';
  }
  function renderFaq(root,items) {
    if(root)root.innerHTML=faqHTML(items); // All user text is escaped above.
  }
  function updateFaqHTML(html,items) {
    const start='<!-- clinic-faq:start -->',end='<!-- clinic-faq:end -->';
    const a=html.indexOf(start),b=html.indexOf(end);
    if(a<0 || b<a || html.indexOf(start,a+start.length)>=0 || html.indexOf(end,b+end.length)>=0)throw Error('トップページのFAQ更新欄が見つかりません。最新のサイト一式を使用してください。');
    return html.slice(0,a+start.length)+'\n'+faqHTML(items)+'\n'+html.slice(b);
  }
  function assetURL(item,preview=false) {
    if(preview && /^data:(?:image\/(?:jpeg|png|webp)|video\/(?:mp4|webm)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(item.fileData || '')) return item.fileData;
    return safeAsset(item.src) || videoAsset(item.src)?item.src:'';
  }
  function posterURL(item,preview=false) {
    if(preview && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(item.posterData || ''))return item.posterData;
    return imageAsset(item.poster)?item.poster:'';
  }
  function button(label,action) { const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b; }
  function slideshow(root,config,{preview=false}={}) {
    if(!root) return ()=>{};
    const doc=root.ownerDocument;
    const hero=normalize({hero:config}).hero;
    const slides=hero.slides.filter(s=>s.enabled && slideAsset(s.src) && assetURL(s,preview));
    if(!slides.length) slides.push(defaultSlide);
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const desktop=matchMedia('(min-width: 821px)');
    const hasVideo=slides.some(s=>videoAsset(s.src));
    let paused=!hero.autoplay,hover=false,focused=false,index=-1,timer=null,disposed=false,request=0,active=null,blocked=false,cancelPending=null,transitioning=false,motionOverride=false;
    const timers=new Set(),resources=new Set(),frames=new Set();
    const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;};
    const frame=fn=>{const id=requestAnimationFrame(()=>{frames.delete(id);fn();});frames.add(id);};
    root.replaceChildren();root.classList.add('clinic-slideshow');root.setAttribute('role','region');root.setAttribute('aria-label',hasVideo?'医院の写真・動画':'医院の写真');root.setAttribute('aria-roledescription','スライドショー');
    const stage=document.createElement('div');stage.className='slideshow-stage';
    const controls=document.createElement('div');controls.className='slideshow-controls';controls.hidden=slides.length<2;
    const state=document.createElement('span');state.className='slideshow-state';state.setAttribute('role','status');
    const clear=()=>{clearTimeout(timer);timers.delete(timer);};
    // Desktop photos still cycle with a gentle opacity-only fade. Keep reduced
    // motion on mobile and video autoplay opt-in; never latch an OS setting as
    // a user pause, otherwise turning that setting off cannot resume playback.
    const motionBlocked=()=>media.matches && (!desktop.matches || isVideo(active)) && !motionOverride;
    const playbackAllowed=()=>!disposed && !cancelPending && !paused && !hover && !focused && !doc.hidden && !motionBlocked();
    const canRun=()=>!transitioning && playbackAllowed();
    const isVideo=el=>el?.tagName==='VIDEO';
    // Feather the displayed media edges, including contained portrait photos.
    function soften(el){
      const width=stage.clientWidth,height=stage.clientHeight;
      if(!hero.edgeSoftness || !width || !height){el.style.maskImage=el.style.webkitMaskImage='none';return;}
      const nw=isVideo(el)?el.videoWidth:el.naturalWidth,nh=isVideo(el)?el.videoHeight:el.naturalHeight;
      const contain=el.style.objectFit==='contain' && nw>0 && nh>0;
      const scale=contain?Math.min(width/nw,height/nh):1;
      const w=contain?nw*scale:width,h=contain?nh*scale:height;
      const [x,y]=el.style.objectPosition.split(' ').map(parseFloat);
      const left=(width-w)*(x/100),top=(height-h)*(y/100),soft=Math.min(w,h)*hero.edgeSoftness/100;
      const gradient=(axis,start,end)=>`linear-gradient(to ${axis},transparent ${start}px,#000 ${start+soft}px,#000 ${end-soft}px,transparent ${end}px)`;
      el.style.maskImage=el.style.webkitMaskImage=gradient('right',left,left+w)+','+gradient('bottom',top,top+h);
      el.style.webkitMaskComposite='source-in';el.style.maskComposite='intersect';
    }
    const resize=()=>resources.forEach(soften);
    const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
    resizeObserver?.observe(stage);
    if(!resizeObserver)window.addEventListener('resize',resize);
    function release(el){
      el.onload=el.onerror=el.onloadedmetadata=el.onloadeddata=el.onended=null;
      if(isVideo(el)){el.pause();el.removeAttribute('src');el.load();}
      resources.delete(el);el.remove();
    }
    const videoToggle=button('',togglePlayback);videoToggle.className='slideshow-video-toggle';videoToggle.hidden=true;
    function schedule(){
      clear();
      if(isVideo(active)){
        if(canRun() && !blocked){
          if(active.ended && slides.length>1){show((index+1)%slides.length);return;}
          const el=active,ticket=request;
          Promise.resolve(el.play()).catch(()=>{if(!disposed && el===active && ticket===request && canRun()){blocked=true;sync();}});
        }else active.pause();
      }else if(canRun() && slides.length>1)timer=later(()=>show((index+1)%slides.length),hero.hold*1000);
      sync();
    }
    // Keep the image controls quiet; keyboard users can also pause/resume.
    root.tabIndex=slides.length>1 || hasVideo?0:-1;
    function sync(){
      root.setAttribute('aria-description',slides.length>1?'左右の矢印キーでスライドを切り替え。スペースキーで再生・一時停止できます。':hasVideo?'スペースキーまたは動画のボタンで再生・一時停止できます。':'');
      videoToggle.hidden=!isVideo(active);
      const playing=playbackAllowed() && !blocked;
      videoToggle.dataset.playing=String(playing);
      videoToggle.textContent=playing?'Ⅱ':'▶';
      videoToggle.setAttribute('aria-label',playing?'動画を一時停止':'動画を再生');
    }
    function togglePlayback(){
      if(!playbackAllowed() || blocked){paused=false;hover=false;focused=false;blocked=false;motionOverride=true;}
      else paused=true;
      schedule();
    }
    const step=direction=>show((Math.max(0,index)+direction+slides.length)%slides.length,true);
    function arrow(direction,label) {
      const b=button('',()=>step(direction));b.className='slideshow-arrow';b.setAttribute('aria-label',label);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 32');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',direction<0?'M15 6 6 16l9 10':'m9 6 9 10-9 10');svg.append(path);b.append(svg);return b;
    }
    controls.append(arrow(-1,hasVideo?'前のスライド':'前の写真'),arrow(1,hasVideo?'次のスライド':'次の写真'));sync();
    root.append(stage,controls,videoToggle,state);
    async function show(next,manual=false,failures=0) {
      clear();cancelPending?.();const ticket=++request;const item=slides[next];const video=videoAsset(item.src);const img=video?document.createElement('video'):new Image();resources.add(img);
      if(isVideo(active))active.pause();
      img.alt=item.alt || (video?'林内科医院の動画':'林内科医院の写真');img.className='slideshow-image';img.style.objectFit=item.fit;img.style.objectPosition=`${item.x}% ${item.y}%`;
      if(video){img.muted=true;img.defaultMuted=true;img.setAttribute('muted','');img.playsInline=true;img.setAttribute('playsinline','');img.preload='auto';img.loop=slides.length===1;img.setAttribute('aria-label',img.alt);const poster=posterURL(item,preview);if(poster)img.poster=poster;}
      else img.decoding='async';
      let cancel,markReady;
      const ready=new Promise(resolve=>{
        let settled=false;const timeout=later(()=>done(false),12000);
        const done=ok=>{if(settled)return;settled=true;clearTimeout(timeout);timers.delete(timeout);img.onload=img.onerror=img.onloadedmetadata=img.onloadeddata=null;resolve(ok);};
        markReady=done;cancel=()=>done(false);cancelPending=cancel;
        if(video)img.onloadeddata=()=>done(img.videoWidth>0 && img.videoHeight>0);
        else img.onload=()=>{if(typeof img.decode==='function')img.decode().then(()=>done(true),()=>done(true));else done(true);};
        img.onerror=()=>done(false);
      });
      img.src=assetURL(item,preview);
      if(video){img.load();if(posterURL(item,preview))markReady(true);}
      const ok=await ready;
      if(cancelPending===cancel)cancelPending=null;
      if(disposed || ticket!==request){release(img);return;}
      if(!ok){
        release(img);
        if(failures<slides.length-1){show((next+1)%slides.length,manual,failures+1);return;}
        state.textContent='写真・動画を読み込めませんでした。';paused=true;transitioning=false;sync();return;
      }
      state.textContent='';const previous=[...stage.children];
      const duration=media.matches ? (desktop.matches ? Math.min(hero.fade,.6)*1000 : 0) : hero.fade*1000;
      img.style.setProperty('--slideshow-fade-duration',`${duration}ms`);
      transitioning=true;
      img.style.opacity=duration?'0':'1';img.style.transition=`opacity ${duration}ms ${hero.easing}`;stage.append(img);
      soften(img);
      if(video)img.onloadedmetadata=()=>soften(img);
      previous.forEach(el=>{el.setAttribute('aria-hidden','true');el.style.setProperty('--slideshow-fade-duration',`${duration}ms`);el.style.transition=`opacity ${duration}ms ${hero.easing}`;});
      index=next;active=img;blocked=false;
      if(video){
        img.onended=()=>{if(img===active && canRun() && slides.length>1)show((index+1)%slides.length);};
        img.onerror=()=>{if(img!==active || disposed)return;blocked=true;img.pause();state.textContent='動画を再生できませんでした。';if(failures<slides.length-1 && playbackAllowed())show((index+1)%slides.length,false,failures+1);else sync();};
      }
      sync();
      if(manual)state.textContent=`${hasVideo?'スライド':'写真'} ${next+1}：${img.alt}`;
      // Paint the transparent incoming frame before the transition (also on Safari).
      // Keep the outgoing slide mounted until the fade has completed.
      const start=()=>{
        if(disposed || ticket!==request)return;
        img.style.opacity='1';previous.forEach(el=>el.style.opacity='0');
        const finish=()=>{previous.forEach(release);if(ticket===request){transitioning=false;schedule();}};
        if(duration)later(finish,duration);else finish();
      };
      if(duration)frame(()=>frame(start));else start();
    }
    const keyboard=e=>{
      if(e.altKey || e.ctrlKey || e.metaKey)return;
      if(slides.length>1 && (e.key==='ArrowLeft' || e.key==='ArrowRight')){e.preventDefault();step(e.key==='ArrowLeft'?-1:1);}
      else if(e.key===' ' && e.target===root){e.preventDefault();togglePlayback();}
    };
    root.addEventListener('keydown',keyboard);
    const visibility=()=>schedule();
    const motion=()=>{motionOverride=false;schedule();};
    const enter=e=>{if(hero.pauseOnHover && e.pointerType!=='touch'){hover=true;schedule();}};
    const leave=()=>{hover=false;schedule();};
    // Touch/mouse arrow clicks must not leave autoplay permanently focus-paused.
    const pointer=()=>{focused=false;schedule();};
    const focus=e=>{focused=e.target.matches(':focus-visible');schedule();};
    const blur=e=>{if(!root.contains(e.relatedTarget)){focused=false;schedule();}};
    root.addEventListener('pointerdown',pointer);root.addEventListener('pointerenter',enter);root.addEventListener('pointerleave',leave);root.addEventListener('focusin',focus);root.addEventListener('focusout',blur);
    document.addEventListener('visibilitychange',visibility);media.addEventListener('change',motion);desktop.addEventListener('change',motion);show(0);
    return ()=>{disposed=true;request++;cancelPending?.();resizeObserver?.disconnect();window.removeEventListener('resize',resize);frames.forEach(cancelAnimationFrame);frames.clear();resources.forEach(release);active=null;videoToggle.removeEventListener('click',togglePlayback);root.removeEventListener('keydown',keyboard);timers.forEach(clearTimeout);timers.clear();document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',motion);desktop.removeEventListener('change',motion);root.removeEventListener('pointerdown',pointer);root.removeEventListener('pointerenter',enter);root.removeEventListener('pointerleave',leave);root.removeEventListener('focusin',focus);root.removeEventListener('focusout',blur);};
  }
  function documentList(root,items,{preview=false}={}) {
    root.replaceChildren();const visible=items.filter(d=>d.published && d.title && safeAsset(d.src) && assetURL(d,preview));
    if(!visible.length){const p=document.createElement('p');p.className='documents-empty';p.textContent='現在、掲載中の資料はありません。';root.append(p);return;}
    visible.forEach((item,index)=>{
      const article=document.createElement('article');article.className='document-card';
      const h=document.createElement('h2'),a=document.createElement('a');a.href=assetURL(item,preview);a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.title;
      // Browsers block top-level data: navigation. Preview files open via a temporary Blob URL.
      if(preview && item.fileData)a.addEventListener('click',e=>{e.preventDefault();const [header,encoded]=item.fileData.split(',');const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:header.slice(5,header.indexOf(';'))}));window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);});
      h.append(a);const type=document.createElement('span');type.className='document-type';type.textContent=/\.pdf$/i.test(item.src)?'PDF':'画像';
      const num=document.createElement('span');num.className='document-number';num.textContent=String(index+1).padStart(2,'0');
      const body=document.createElement('div');body.append(type,h);
      if(item.description){const p=document.createElement('p');p.textContent=item.description;body.append(p);}
      const hint=document.createElement('span');hint.className='document-open';hint.textContent='資料を開く ↗';hint.setAttribute('aria-hidden','true');
      article.append(num,body,hint);root.append(article);
    });
  }
  window.ClinicContent=Object.freeze({defaults,defaultSlide,normalize,safeAsset,imageAsset,videoAsset,slideAsset,assetURL,posterURL,slideshow,documentList,normalizeFaqs,faqHTML,renderFaq,updateFaqHTML});
})();





