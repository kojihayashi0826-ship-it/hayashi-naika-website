/* Visual editing runs only inside the trusted editor, never on public pages. */
(() => {
  'use strict';
  const q=s=>document.querySelector(s),frame=q('[data-design-frame]'),wrap=q('[data-design-frame-wrap]');
  const api=()=>window.ClinicEditorTheme,copy=v=>JSON.parse(JSON.stringify(v));
  const undo=[],redo=[];
  let doc=null,win=null,overlay=null,selected={kind:'hero',id:'top'},target=null,gesture=null,lastState=null,raf=0;
  const status=text=>q('[data-visual-status]').textContent=text;
  function remember(before,after){
    if(JSON.stringify(before)!==JSON.stringify(after)){undo.push(copy(before));if(undo.length>40)undo.shift();redo.length=0;}
    lastState=copy(after);historyButtons();
  }
  function historyButtons(){q('[data-visual-undo]').disabled=!undo.length;q('[data-visual-redo]').disabled=!redo.length;}
  function change(next,label){const before=api().getDesign();lastState=ClinicDesign.normalize(next);api().setDesign(next);remember(before,api().getDesign());status(label);}
  function history(from,to){if(gesture)finish(true);if(!from.length)return;to.push(copy(api().getDesign()));const next=from.pop();lastState=copy(next);api().setDesign(next);historyButtons();status('操作を'+(from===undo?'取り消しました':'やり直しました'));}
  q('[data-visual-undo]').addEventListener('click',()=>history(undo,redo));
  q('[data-visual-redo]').addEventListener('click',()=>history(redo,undo));
  function label(){return selected.kind==='hero'?'トップ画像':selected.kind==='heading'?'見出しの文字':selected.kind==='text'?'本文の文字':ClinicDesign.sections[selected.id];}
  function fit(){
    if(!wrap.clientWidth)return;
    const width=wrap.dataset.width==='mobile'?390:1120,scale=Math.min(1,wrap.clientWidth/width);
    frame.style.width=width+'px';frame.style.height=(wrap.clientHeight/scale)+'px';frame.style.transform='scale('+scale+')';
    doc?.documentElement.style.setProperty('--canvas-handle-scale',String(1/scale));
    frame.style.marginLeft=Math.max(0,(wrap.clientWidth-width*scale)/2)+'px';
  }
  if(matchMedia('(max-width:700px)').matches)q('[data-design-width="mobile"]').click();
  if(window.ResizeObserver)new ResizeObserver(fit).observe(wrap);
  window.addEventListener('resize',fit);document.querySelectorAll('[data-design-width]').forEach(b=>b.addEventListener('click',()=>{fit();schedule();}));
  function nodeFor(id){return doc?.querySelector(id==='top'?'#top':`[data-home-layout] > [data-design-section="${id}"]`);}
  function select(kind,id,node,jump=false){
    selected={kind,id};target=node||nodeFor(id);renderOutline();inspector();schedule();
    if(jump && target && !target.getBoundingClientRect().height)status('この項目は現在、非掲載です。掲載をONにするとページに表示されます。');
    if(jump && target){const y=target.getBoundingClientRect().top+win.scrollY-64;win.scrollTo({top:Math.max(0,y),behavior:'instant'});}
  }
  function button(text,fn,pressed){const b=document.createElement('button');b.type='button';b.className='secondary compact';b.textContent=text;if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));b.addEventListener('click',fn);return b;}
  function inspector(){
    q('[data-visual-selection]').textContent=label();
    q('[data-visual-help]').textContent=selected.kind==='section'?'↔ で横幅、↕ で上下の余白を調整。横幅はPC表示で調整します。文字を選ぶと文字サイズを変えられます。':selected.kind==='hero'?'↕ を上下に引っ張ると写真の高さが変わります。配置は下の絵から選べます。':'↘ を右下に引っ張ると文字が大きくなります。同じ種類の文字にも反映します。';
    const host=q('[data-visual-options]');host.replaceChildren();const d=api().getDesign();
    if(selected.kind==='hero'){
      [['overlay','▣ 画像に文字'],['split','▤ ▧ 横並び'],['stacked','▧ / ▤ 縦並び']].forEach(([value,text])=>host.append(button(text,()=>{change({...api().getDesign(),heroLayout:value},'トップ画像の配置を変更しました');inspector();},d.heroLayout===value)));
    }else if(selected.kind==='heading'||selected.kind==='text'){
      const key=selected.kind==='heading'?'headingScale':'fontScale';[-5,5].forEach(delta=>host.append(button(delta<0?'A− 小さく':'A＋ 大きく',()=>change({...api().getDesign(),[key]:api().getDesign()[key]+delta},'文字サイズを変更しました'))));
    }else if(selected.id==='links'){
      [1,2,3].forEach(n=>host.append(button('▥'.repeat(n)+' '+n+'列',()=>{change({...api().getDesign(),guideColumns:n},'PCのカードの並びを変更しました');inspector();},d.guideColumns===n)));
    }
  }
  function renderOutline(){
    const host=q('[data-visual-outline]');host.replaceChildren();
    ['top',...api().getDesign().order].forEach(id=>{
      const row=document.createElement('div');row.className='visual-outline-row';row.dataset.visualId=id;
      if(id===selected.id)row.dataset.selected='true';
      if(id!=='top'){
        const handle=button('⠿',()=>{});handle.classList.add('visual-drag');handle.dataset.visualDrag=id;handle.setAttribute('aria-label',(ClinicDesign.sections[id])+'をドラッグで移動（上下キーでも移動）');
        handle.addEventListener('pointerdown',e=>begin(e,'reorder',id,'outline'));
        handle.addEventListener('keydown',e=>{
          if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
          const d=api().getDesign(),at=d.order.indexOf(id),to=at+(e.key==='ArrowUp'?-1:1);if(to<0||to>=d.order.length)return;
          d.order.splice(at,1);d.order.splice(to,0,id);change(d,'並び順を変更しました');q(`[data-visual-drag="${id}"]`)?.focus();
        });row.append(handle);
      }
      const name=button(id==='top'?'▧ トップ画像（先頭固定）':ClinicDesign.sections[id],()=>select(id==='top'?'hero':'section',id,null,true));name.dataset.visualSelect=id;row.append(name);host.append(row);
    });
  }
  q('[data-visual-reset]').addEventListener('click',()=>{
    const d=api().getDesign();if(selected.kind==='hero')d.heroHeight=ClinicDesign.defaults.heroHeight;
    else if(selected.kind==='heading')d.headingScale=100;else if(selected.kind==='text')d.fontScale=100;else delete d.sectionSizes[selected.id];
    change(d,'選択した部分のサイズを標準に戻しました');
  });
  function schedule(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw();});}
  function rect(){
    if(!target?.isConnected)target=nodeFor(selected.id);if(!target)return null;
    const r=target.getBoundingClientRect();
    if(selected.kind==='section'){
      const container=target.matches('.container')?target:target.querySelector('.container');const inner=container?.getBoundingClientRect();
      if(inner)return {left:inner.left,width:inner.width,top:r.top,bottom:r.bottom,height:r.height};
    }
    if(selected.kind==='hero')return (doc.querySelector(win.innerWidth<=820?'.hero-visual':'.hero-grid')||target).getBoundingClientRect();
    return r;
  }
  function draw(){
    if(!overlay||!target)return;const r=rect();
    if(!r||r.height===0||r.bottom<0||r.top>win.innerHeight){overlay.hidden=true;return;}overlay.hidden=false;
    const top=Math.max(3,r.top),bottom=Math.min(win.innerHeight-4,r.bottom);
    overlay.style.left=Math.max(3,r.left)+'px';overlay.style.top=top+'px';overlay.style.width=Math.max(30,Math.min(r.width,win.innerWidth-r.left-4))+'px';overlay.style.height=Math.max(40,bottom-top)+'px';
    overlay.querySelector('[data-canvas-label]').textContent=label();
    overlay.querySelector('[data-canvas-action="reorder"]').hidden=selected.kind!=='section';
    overlay.querySelector('[data-canvas-action="width"]').hidden=selected.kind!=='section'||win.innerWidth<=820;
    overlay.querySelector('[data-canvas-action="height"]').hidden=!['hero','section'].includes(selected.kind);
    overlay.querySelector('[data-canvas-action="type"]').hidden=!['heading','text'].includes(selected.kind);
  }
  function attach(){
    try{doc=frame.contentDocument;win=frame.contentWindow;if(!doc?.querySelector('[data-home-layout]'))return;}catch{return;}
    if(doc.querySelector('[data-canvas-overlay]'))return;
    const css=doc.createElement('link');css.rel='stylesheet';css.href='editor-canvas.css?v=20261024-gui1';doc.head.append(css);doc.documentElement.dataset.visualEditing='true';
    overlay=doc.createElement('div');overlay.dataset.canvasOverlay='';overlay.className='canvas-overlay';
    const name=doc.createElement('span');name.dataset.canvasLabel='';name.className='canvas-label';overlay.append(name);
    [['reorder','⠿ 移動','つかんで上下に移動'],['width','↔','横幅を変える'],['height','↕','高さ・上下の余白を変える'],['type','↘','文字を拡大・縮小']].forEach(([action,text,title])=>{
      const b=doc.createElement('button');b.type='button';b.textContent=text;b.title=title;b.setAttribute('aria-label',title);b.dataset.canvasAction=action;
      b.addEventListener('pointerdown',e=>begin(e,action,selected.id,'canvas'));overlay.append(b);
    });doc.body.append(overlay);
    doc.addEventListener('click',e=>{
      if(e.target.closest('[data-canvas-overlay]'))return;
      // No preview navigation, form submission or accidental banner dismissal while editing.
      e.preventDefault();e.stopImmediatePropagation();
      const section=e.target.closest('[data-design-section],#top');if(!section)return;
      const id=section.dataset.designSection||'top';
      const text=e.target.closest('.hero-copy h1,.section-heading h2,.guide-card h3,.care-card h3,.page-link-card h3,.news-content h3,.important-notice h2,.hero-lead,.guide-card p,.news-content p,.section-heading > p:not(.eyebrow),.faq-list p,.contact-details p');
      if(text && !text.classList.contains('eyebrow'))select(/^H/.test(text.tagName)?'heading':'text',id,text);
      else select(id==='top'?'hero':'section',id,section);
    },true);
    win.addEventListener('scroll',schedule);win.addEventListener('resize',schedule);
    new win.ResizeObserver(schedule).observe(doc.body);
    doc.addEventListener('keydown',key);select('hero','top',nodeFor('top'));fit();
  }
  function key(e){
    if(e.key==='Escape'&&gesture){e.preventDefault();finish(true);return;}
    if(e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey?redo:undo,e.shiftKey?undo:redo);}
  }
  document.addEventListener('keydown',key);
  function begin(e,action,id,surface){
    if(e.button!==0||gesture)return;e.preventDefault();e.stopPropagation();
    const source=e.currentTarget,owner=source.ownerDocument;
    // Do not rebuild a focused/captured handle until the gesture is finished.
    if(action==='reorder'){selected={kind:'section',id};target=nodeFor(id);inspector();schedule();}
    gesture={action,id,surface,source,owner,pointer:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,before:copy(api().getDesign()),widthBase:rect()?.width,paddingBase:target?(parseFloat(win.getComputedStyle(target).paddingTop)+parseFloat(win.getComputedStyle(target).paddingBottom))/2/(win.innerWidth<=820?.65:1):72,order:null,moved:false};
    source.setPointerCapture?.(e.pointerId);
    owner.addEventListener('pointermove',move);owner.addEventListener('pointerup',up);owner.addEventListener('pointercancel',cancel);source.addEventListener('lostpointercapture',cancel);
    owner.documentElement.classList.add('visual-dragging');status(action==='reorder'?'移動先で指・マウスを離してください。Escで取り消し':'引っ張って調整。Escで取り消し');
    gesture.tick=requestAnimationFrame(tick);
  }
  function tick(){
    if(!gesture)return;
    const g=gesture;
    if(g.action==='reorder'){
      const viewport=g.surface==='canvas'?win:window;
      const speed=g.lastY<65?-18:g.lastY>viewport.innerHeight-65?18:0;
      if(speed){viewport.scrollBy(0,speed);dropOrder(g);}
    }
    g.tick=requestAnimationFrame(tick);
  }
  function clearDrop(){document.querySelectorAll('[data-drop]').forEach(e=>delete e.dataset.drop);doc?.querySelectorAll('[data-drop]').forEach(e=>delete e.dataset.drop);}
  function dropOrder(g){
    clearDrop();
    const ids=g.before.order.filter(id=>id!==g.id);
    const entries=ids.map(id=>({id,node:g.surface==='outline'?q(`[data-visual-id="${id}"]`):nodeFor(id)})).filter(x=>x.node && x.node.getBoundingClientRect().height);
    if(!entries.length)return;
    let before=entries.find(x=>g.lastY<x.node.getBoundingClientRect().top+x.node.getBoundingClientRect().height/2);
    const anchor=before||entries.at(-1);anchor.node.dataset.drop=before?'before':'after';
    const at=before?ids.indexOf(before.id):ids.indexOf(anchor.id)+1;ids.splice(at,0,g.id);g.order=ids;
  }
  function move(e){
    const g=gesture;if(!g||e.pointerId!==g.pointer)return;e.preventDefault();g.lastX=e.clientX;g.lastY=e.clientY;
    const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.abs(dx)+Math.abs(dy)<4&&!g.moved)return;g.moved=true;
    if(g.action==='reorder'){dropOrder(g);return;}
    const d=copy(g.before);
    if(g.action==='type'){
      const key=selected.kind==='heading'?'headingScale':'fontScale';d[key]=g.before[key]+Math.round((dx+dy)/4);
    }else if(g.action==='height'&&selected.kind==='hero'){
      d.heroHeight=g.before.heroHeight+Math.round(dy/(win.innerWidth<=820?.48:1));
    }else{
      const size=d.sectionSizes[g.id]||{},original=g.before.sectionSizes[g.id]||{};
      if(g.action==='width')size.width=(g.widthBase||original.width||g.before.contentWidth)+Math.round(dx*2);
      else size.padding=(g.paddingBase??original.padding??g.before.spacing)+Math.round(dy/(win.innerWidth<=820?1.3:2));
      d.sectionSizes[g.id]=size;
    }
    lastState=ClinicDesign.normalize(d);api().setDesign(d,false);schedule();
  }
  function up(e){if(gesture&&e.pointerId===gesture.pointer)finish(false);}
  function cancel(){if(gesture)finish(true);}
  function finish(cancelled){
    const g=gesture;if(!g)return;gesture=null;cancelAnimationFrame(g.tick);
    g.owner.removeEventListener('pointermove',move);g.owner.removeEventListener('pointerup',up);g.owner.removeEventListener('pointercancel',cancel);g.source.removeEventListener('lostpointercapture',cancel);g.source.releasePointerCapture?.(g.pointer);
    g.owner.documentElement.classList.remove('visual-dragging');clearDrop();
    const next=cancelled?g.before:g.action==='reorder'?{...g.before,order:g.order||g.before.order}:api().getDesign();
    lastState=copy(next);api().setDesign(next,!cancelled&&g.moved);
    if(!cancelled)remember(g.before,api().getDesign());
    renderOutline();inspector();schedule();status(cancelled?'操作を取り消しました':g.moved?'変更しました。公開前に確認できます':'つまみをつかんで動かしてください');
  }
  frame.addEventListener('load',attach);
  window.addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.origin===location.origin&&e.data?.type==='clinic-design-ready')attach();});
  window.addEventListener('clinic-editor-design-change',()=>{
    const next=api().getDesign();
    if(!gesture){if(lastState)remember(lastState,next);else lastState=copy(next);renderOutline();if(target)inspector();}
    schedule();
  });
  document.addEventListener('clinic-editor-loaded',()=>{undo.length=redo.length=0;lastState=copy(api().getDesign());historyButtons();});
  q('[data-tab="design"]').addEventListener('click',()=>{fit();attach();});
})();
