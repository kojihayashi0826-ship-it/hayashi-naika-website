/* Shared, dependency-free content helpers for the public site and editor. */
(() => {
  'use strict';
  const defaultSlide = {id:'original-illustration',src:'assets/clinic-illustration-new-building-v4.webp',alt:'林内科医院の外観イメージ（イラスト）',enabled:true,fit:'cover',x:50,y:50};
  const defaults = {autoplay:true,hold:6,fade:1.2,easing:'ease-in-out',pauseOnHover:true,slides:[defaultSlide]};
  const number = (v,fallback,min,max) => v !== '' && v != null && Number.isFinite(Number(v)) ? Math.min(max,Math.max(min,Number(v))) : fallback;
  const text = v => typeof v === 'string' ? v : '';
  function safeAsset(path) { return typeof path === 'string' && /^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:pdf|jpe?g|png|webp)$/i.test(path); }
  function normalize(source) {
    const h = Array.isArray(source.highlights) ? source.highlights : source.highlight && (source.highlight.title || source.highlight.body) ? [{...source.highlight,id:'legacy-highlight'}] : [];
    const hero = source.hero || {};
    return {
      theme: ClinicTheme.normalize(source.theme),
      highlights:h.filter(Boolean).map((v,i)=>({id:v.id || `highlight-${i}`,enabled:v.enabled !== false,mode:v.mode === 'popup' ? 'popup' : 'banner',title:text(v.title),body:text(v.body),linkText:text(v.linkText),linkUrl:text(v.linkUrl)})),
      hero:{autoplay:hero.autoplay !== false,hold:number(hero.hold,6,1,120),fade:number(hero.fade,1.2,0,10),easing:['linear','ease','ease-in','ease-out','ease-in-out'].includes(hero.easing)?hero.easing:'ease-in-out',pauseOnHover:hero.pauseOnHover !== false,
        slides:(Array.isArray(hero.slides)?hero.slides:[defaultSlide]).filter(Boolean).map((v,i)=>({...v,id:v.id || `slide-${i}`,src:text(v.src),alt:text(v.alt),enabled:v.enabled !== false,fit:v.fit === 'contain'?'contain':'cover',x:number(v.x,50,0,100),y:number(v.y,50,0,100)}))},
      documents:(Array.isArray(source.documents)?source.documents:[]).filter(Boolean).map((v,i)=>({...v,id:v.id || `document-${i}`,title:text(v.title),description:text(v.description),src:text(v.src),name:text(v.name),published:v.published !== false}))
    };
  }
  function assetURL(item,preview=false) {
    if(preview && /^data:(?:image\/(?:jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(item.fileData || '')) return item.fileData;
    return safeAsset(item.src)?item.src:'';
  }
  function button(label,action) { const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b; }
  function slideshow(root,config,{preview=false}={}) {
    if(!root) return ()=>{};
    const hero=normalize({hero:config}).hero;
    const slides=hero.slides.filter(s=>s.enabled && assetURL(s,preview) && !/\.pdf$/i.test(s.src));
    if(!slides.length) slides.push(defaultSlide);
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    let paused=!hero.autoplay || media.matches,hover=false,focused=false,index=-1,timer=null,disposed=false,request=0;
    const timers=new Set();
    const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;};
    root.replaceChildren();root.classList.add('clinic-slideshow');root.setAttribute('role','region');root.setAttribute('aria-label','医院の写真');root.setAttribute('aria-roledescription','スライドショー');
    const stage=document.createElement('div');stage.className='slideshow-stage';
    const controls=document.createElement('div');controls.className='slideshow-controls';controls.hidden=slides.length<2;
    const count=document.createElement('span');count.className='slideshow-count';
    const state=document.createElement('span');state.className='slideshow-state';state.setAttribute('role','status');
    const clear=()=>{clearTimeout(timer);timers.delete(timer);};
    const schedule=()=>{clear();if(!disposed && !paused && !hover && !focused && !document.hidden && slides.length>1)timer=later(()=>show((index+1)%slides.length),hero.hold*1000);};
    const play=button(paused?'再生':'一時停止',()=>{paused=!paused;if(!paused){focused=false;hover=false;}sync();schedule();});
    function sync(){play.textContent=paused?'再生':'一時停止';play.setAttribute('aria-label',paused?'写真の自動切り替えを再生':'写真の自動切り替えを一時停止');}
    const step=direction=>{paused=true;sync();show((Math.max(0,index)+direction+slides.length)%slides.length,true);};
    controls.append(button('前へ',()=>step(-1)),count,button('次へ',()=>step(1)),play);
    root.append(stage,controls,state);
    async function show(next,manual=false,failures=0) {
      clear();const ticket=++request;const item=slides[next];const img=new Image();
      img.alt=item.alt || '林内科医院の写真';img.className='slideshow-image';img.style.objectFit=item.fit;img.style.objectPosition=`${item.x}% ${item.y}%`;img.decoding='async';
      const ready=new Promise(resolve=>{const timeout=later(()=>resolve(false),12000);const done=ok=>{clearTimeout(timeout);timers.delete(timeout);resolve(ok);};img.onload=()=>done(true);img.onerror=()=>done(false);});
      img.src=assetURL(item,preview);
      const ok=await ready;
      if(disposed || ticket!==request)return;
      if(!ok){
        if(failures<slides.length-1){show((next+1)%slides.length,manual,failures+1);return;}
        state.textContent='写真を読み込めませんでした。';paused=true;sync();return;
      }
      state.textContent='';const previous=[...stage.children];
      const duration=index<0 || media.matches ? 0 : hero.fade*1000;
      img.style.opacity=duration?'0':'1';img.style.transition=`opacity ${duration}ms ${hero.easing}`;stage.append(img);
      previous.forEach(el=>{el.setAttribute('aria-hidden','true');el.style.transition=`opacity ${duration}ms ${hero.easing}`;});
      // Flush the initial opacity before starting a crossfade; no blank frame.
      void img.offsetWidth;img.style.opacity='1';previous.forEach(el=>el.style.opacity='0');
      index=next;count.textContent=`${next+1} / ${slides.length}`;
      if(manual)state.textContent=`写真 ${next+1}：${img.alt}`;
      later(()=>{previous.forEach(el=>el.remove());if(ticket===request)schedule();},duration);
    }
    const visibility=()=>{if(document.hidden)clear();else schedule();};
    const motion=()=>{if(media.matches){paused=true;sync();clear();}};
    const enter=()=>{if(hero.pauseOnHover){hover=true;clear();}};
    const leave=()=>{hover=false;schedule();};
    const focus=()=>{focused=true;clear();};
    const blur=e=>{if(!root.contains(e.relatedTarget)){focused=false;schedule();}};
    root.addEventListener('pointerenter',enter);root.addEventListener('pointerleave',leave);root.addEventListener('focusin',focus);root.addEventListener('focusout',blur);
    document.addEventListener('visibilitychange',visibility);media.addEventListener('change',motion);show(0);
    return ()=>{disposed=true;request++;timers.forEach(clearTimeout);timers.clear();document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',motion);root.removeEventListener('pointerenter',enter);root.removeEventListener('pointerleave',leave);root.removeEventListener('focusin',focus);root.removeEventListener('focusout',blur);};
  }
  function documentList(root,items,{preview=false}={}) {
    root.replaceChildren();const visible=items.filter(d=>d.published && d.title && assetURL(d,preview));
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
  window.ClinicContent=Object.freeze({defaults,defaultSlide,normalize,safeAsset,assetURL,slideshow,documentList});
})();
