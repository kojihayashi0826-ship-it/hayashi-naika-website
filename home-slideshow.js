/* Opt-in homepage slideshow. Other pages and the editor retain clinic-content.js. */
(() => {
  'use strict';
  const base = window.ClinicContent;
  const choices = new WeakMap();
  const {normalize, slideAsset, assetURL, videoAsset, posterURL} = base;
  const publicHero = config => ({...config, slides:Array.isArray(config?.slides) ? config.slides : []});
  function button(label,action) { const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b; }
  function slideshow(root,config,{preview=false}={}) {
    if(!root) return ()=>{};
    const doc=root.ownerDocument;
    const hero=normalize({hero:preview ? config : publicHero(config)}).hero;
    const slides=hero.slides.filter(s=>s.enabled && slideAsset(s.src) && assetURL(s,preview));
    // An empty/disabled playlist is intentional; never restore a deleted image.
    if(!slides.length){
      root.replaceChildren();root.classList.add('clinic-slideshow');root.tabIndex=-1;
      ['role','aria-label','aria-roledescription','aria-description'].forEach(name=>root.removeAttribute(name));
      const stage=doc.createElement('div');stage.className='slideshow-stage';stage.setAttribute('aria-hidden','true');root.append(stage);
      return ()=>{};
    }
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const hasVideo=slides.some(s=>videoAsset(s.src));
    let paused=!hero.autoplay,hover=false,focused=false,index=-1,timer=null,disposed=false,request=0,active=null,blocked=false,cancelPending=null,transitioning=false,motionOverride=false;
    const saved = choices.get(root);
    if (saved) { paused=saved.paused; motionOverride=saved.motionOverride; }
    const timers=new Set(),resources=new Set(),frames=new Set();
    const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;};
    const frame=fn=>{const id=requestAnimationFrame(()=>{frames.delete(id);fn();});frames.add(id);};
    root.replaceChildren();root.classList.add('clinic-slideshow');root.setAttribute('role','region');root.setAttribute('aria-label',hasVideo?'医院の写真・動画':'医院の写真');root.setAttribute('aria-roledescription','スライドショー');
    const stage=document.createElement('div');stage.className='slideshow-stage';
    const controls=document.createElement('div');controls.className='slideshow-controls';controls.hidden=slides.length<2;
    const state=document.createElement('span');state.className='slideshow-state';state.setAttribute('role','status');
    const clear=()=>{clearTimeout(timer);timers.delete(timer);};
    // Respect reduced motion on every screen until playback is requested.
    const motionBlocked=()=>media.matches && !motionOverride;
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
    const photoToggle=button('',togglePlayback);photoToggle.className='slideshow-photo-toggle';
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
      photoToggle.hidden=isVideo(active) || slides.length<2;
      photoToggle.textContent=paused || motionBlocked() ? '写真の切り替えを再開' : '写真の切り替えを停止';
      const playing=playbackAllowed() && !blocked;
      videoToggle.dataset.playing=String(playing);
      videoToggle.textContent=playing?'Ⅱ':'▶';
      videoToggle.setAttribute('aria-label',playing?'動画を一時停止':'動画を再生');
    }
    function togglePlayback(){
      if(paused || motionBlocked() || blocked){paused=false;hover=false;focused=false;blocked=false;motionOverride=true;}
      else paused=true;
      choices.set(root,{paused,motionOverride});
      schedule();
    }
    const step=direction=>show((Math.max(0,index)+direction+slides.length)%slides.length,true);
    function arrow(direction,label) {
      const b=button('',()=>step(direction));b.className='slideshow-arrow';b.setAttribute('aria-label',label);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 32');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',direction<0?'M15 6 6 16l9 10':'m9 6 9 10-9 10');svg.append(path);b.append(svg);return b;
    }
    controls.append(arrow(-1,hasVideo?'前のスライド':'前の写真'),arrow(1,hasVideo?'次のスライド':'次の写真'));sync();
    root.append(stage,controls,photoToggle,videoToggle,state);
    async function show(next,manual=false,failures=0) {
      clear();cancelPending?.();const ticket=++request;const item=slides[next];const video=videoAsset(item.src);const img=video?document.createElement('video'):new Image();resources.add(img);
      if(isVideo(active))active.pause();
      img.alt=item.alt || (video?'林内科医院の動画':'林内科医院の写真');img.className='slideshow-image';img.style.objectFit=item.fit;img.style.objectPosition=`${item.x}% ${item.y}%`;
      if(video){img.muted=true;img.defaultMuted=true;img.setAttribute('muted','');img.playsInline=true;img.setAttribute('playsinline','');img.preload='auto';img.loop=slides.length===1;img.setAttribute('aria-label',img.alt);const poster=posterURL(item,preview);if(poster)img.poster=poster;}
      else {img.decoding='async';img.loading='eager';if(index<0)img.fetchPriority='high';}
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
      const duration=!previous.length || media.matches ? 0 : hero.fade*1000;
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
        img.style.opacity='1'; // Keep the outgoing photo opaque until the incoming photo covers it.
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
    const motion=()=>{motionOverride=false;choices.set(root,{paused,motionOverride});schedule();};
    const enter=e=>{if(hero.pauseOnHover && e.pointerType!=='touch'){hover=true;schedule();}};
    const leave=()=>{hover=false;schedule();};
    // Touch/mouse arrow clicks must not leave autoplay permanently focus-paused.
    const pointer=()=>{focused=false;schedule();};
    const focus=e=>{focused=e.target.matches(':focus-visible');schedule();};
    const blur=e=>{if(!root.contains(e.relatedTarget)){focused=false;schedule();}};
    root.addEventListener('pointerdown',pointer);root.addEventListener('pointerenter',enter);root.addEventListener('pointerleave',leave);root.addEventListener('focusin',focus);root.addEventListener('focusout',blur);
    document.addEventListener('visibilitychange',visibility);media.addEventListener('change',motion);show(0);
    return ()=>{disposed=true;request++;cancelPending?.();resizeObserver?.disconnect();window.removeEventListener('resize',resize);frames.forEach(cancelAnimationFrame);frames.clear();resources.forEach(release);active=null;videoToggle.removeEventListener('click',togglePlayback);photoToggle.removeEventListener('click',togglePlayback);root.removeEventListener('keydown',keyboard);timers.forEach(clearTimeout);timers.clear();document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',motion);root.removeEventListener('pointerdown',pointer);root.removeEventListener('pointerenter',enter);root.removeEventListener('pointerleave',leave);root.removeEventListener('focusin',focus);root.removeEventListener('focusout',blur);};
  }
  window.ClinicContent = Object.freeze({...base, slideshow});
})();
