/* Shared layout settings. Reorder real DOM blocks so reading and tab order agree. */
(() => {
  'use strict';
  const sections = Object.freeze({news:'お知らせ',visit:'受診案内・診療時間・カレンダー',links:'医院のご案内カード',access:'アクセス',recruitment:'スタッフ募集',faq:'よくある質問',contact:'お問い合わせ'});
  const order = Object.keys(sections);
  const defaults = Object.freeze({fontScale:100,headingScale:100,spacing:72,contentWidth:1120,heroHeight:520,heroLayout:'overlay',guideColumns:3,radius:12,shadow:'soft'});
  const ranges = {fontScale:[90,130],headingScale:[85,130],spacing:[24,120],contentWidth:[960,1360],heroHeight:[360,680],radius:[0,28]};
  const motionDefaults=Object.freeze({enabled:true,duration:520,distance:24,direction:'left',stagger:70,repeat:true});
  const motionRanges=Object.freeze({duration:[150,1500],distance:[0,80],stagger:[0,200]});
  function normalizeMotion(value){
    const input=value && typeof value==='object'?value:{},result={...motionDefaults};
    Object.entries(motionRanges).forEach(([key,[min,max]])=>{
      if(typeof input[key]==='number' && Number.isFinite(input[key]))result[key]=Math.round(Math.max(min,Math.min(max,input[key])));
    });
    ['enabled','repeat'].forEach(key=>{if(typeof input[key]==='boolean')result[key]=input[key];});
    if(['left','right','bottom','fade'].includes(input.direction))result.direction=input.direction;
    return result;
  }
  function applyMotion(value,host=document.documentElement){
    const m=normalizeMotion(value),x=m.direction==='left'?-m.distance:m.direction==='right'?m.distance:0,y=m.direction==='bottom'?m.distance:0;
    Object.entries({'--text-motion-duration':m.duration+'ms','--text-motion-reduced-duration':Math.min(400,m.duration)+'ms','--text-motion-x':x+'px','--text-motion-y':y+'px','--text-motion-mobile-x':x*.75+'px','--text-motion-mobile-y':y*.75+'px','--text-motion-stagger':m.stagger+'ms'}).forEach(([key,value])=>host.style.setProperty(key,value));
    host.dataset.motionEnabled=String(m.enabled);host.dataset.motionRepeat=String(m.repeat);
  }
  function normalize(value) {
    const input=value && typeof value==='object'?value:{};
    const result={...defaults};
    result.motion=normalizeMotion(input.motion);
    Object.entries(ranges).forEach(([key,[min,max]])=>{if(typeof input[key]==='number' && Number.isFinite(input[key]))result[key]=Math.round(Math.min(max,Math.max(min,input[key])));});
    if(['overlay','split','stacked','panorama'].includes(input.heroLayout))result.heroLayout=input.heroLayout;
    if([1,2,3].includes(input.guideColumns))result.guideColumns=input.guideColumns;
    if(['none','soft','strong'].includes(input.shadow))result.shadow=input.shadow;
    result.order=[...new Set([...(Array.isArray(input.order)?input.order.filter(id=>typeof id==='string' && Object.hasOwn(sections,id)):[]),...order])];
    result.sectionColors={};
    order.forEach(id=>{result.sectionColors[id]=ClinicTheme.isColor(input.sectionColors?.[id])?input.sectionColors[id].toLowerCase():null;});
    result.sectionSizes={};
    order.forEach(id=>{
      const size=input.sectionSizes?.[id];
      if(!size || typeof size!=='object')return;
      const safe={};
      Object.entries({width:[640,1360],padding:[16,160]}).forEach(([key,[min,max]])=>{
        if(typeof size[key]==='number' && Number.isFinite(size[key]))safe[key]=Math.round(Math.max(min,Math.min(max,size[key])));
      });
      if(Object.keys(safe).length)result.sectionSizes[id]=safe;
    });
    return result;
  }
  let preview=null;
  function apply(value,theme) {
    const design=normalize(preview?.design || value);
    const palette=ClinicTheme.normalize(preview?.theme || theme);
    ClinicTheme.apply(palette);
    const root=document.documentElement;
    Object.entries({'--design-font':design.fontScale/100,'--design-heading':design.headingScale/100,'--design-spacing':design.spacing+'px','--design-width':design.contentWidth+'px','--design-hero-height':design.heroHeight+'px','--design-columns':design.guideColumns,'--design-radius':design.radius+'px','--design-shadow':{none:'none',soft:'0 8px 26px rgba(40,65,52,.045)',strong:'0 12px 32px rgba(20,45,32,.16)'}[design.shadow]}).forEach(([key,val])=>root.style.setProperty(key,val));
    root.dataset.heroLayout=design.heroLayout;
    applyMotion(design.motion,root);
    const main=document.querySelector('[data-home-layout]');
    if(!main)return;
    const nodes=new Map([...main.children].filter(node=>node.dataset.designSection).map(node=>[node.dataset.designSection,node]));
    const current=[...nodes.keys()];
    if(current.join(',')!==design.order.filter(id=>nodes.has(id)).join(','))design.order.forEach(id=>{if(nodes.has(id))main.append(nodes.get(id));});
    nodes.forEach((node,id)=>{
      ['width','padding'].forEach(key=>{
        const token='--design-section-'+key,value=design.sectionSizes[id]?.[key];
        if(value!==undefined)node.style.setProperty(token,value+'px');else node.style.removeProperty(token);
      });
      node.style.removeProperty('background-color');
      ['--ink','--text','--muted','--theme-heading','--theme-link','--green','--green-dark','--line'].forEach(key=>node.style.removeProperty(key));
      const bg=design.sectionColors[id];
      if(bg){node.style.backgroundColor=bg;Object.entries(ClinicTheme.scope(palette,bg)).forEach(([key,val])=>node.style.setProperty(key,val));}
    });
  }
  // Only the trusted editor parent may supply unpublished design settings.
  const previewParams=new URLSearchParams(location.search);
  if(window.parent!==window && (previewParams.get('design-preview')==='1' || previewParams.get('motion-preview')==='1')){
    if(previewParams.get('motion-preview')!=='1')document.documentElement.dataset.designPreview='true';
    window.addEventListener('message',event=>{
      if(event.source!==window.parent || event.origin!==location.origin || event.data?.type!=='clinic-design-preview')return;
      preview={theme:ClinicTheme.normalize(event.data.theme),design:normalize(event.data.design)};
      apply(preview.design,preview.theme);
    });
    document.addEventListener('DOMContentLoaded',()=>{
      document.addEventListener('click',event=>{
        const link=event.target.closest('a');if(!link)return;
        if(previewParams.get('motion-preview')==='1' && link.origin===location.origin && link.pathname===location.pathname && link.hash)return;
        event.preventDefault();
      },true);
      window.parent.postMessage({type:'clinic-design-ready'},location.origin);
    });
  }
  window.ClinicDesign=Object.freeze({sections,defaults,ranges,normalize,apply,motionDefaults,motionRanges,normalizeMotion,applyMotion});
})();
