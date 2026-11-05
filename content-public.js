(() => {
  'use strict';
  let disposeHero=null,heroSignature='',disposeNotices=null;
  const noticeSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
  function noticeText(element, text) {
    // Preserve the editor's text/newlines while choosing sensible wrap points.
    // Dates, medical terms and common endings stay together before segmentation.
    const fixed = /(\d{1,4}年\d{1,2}月\d{1,2}日(?:[（(][月火水木金土日][）)])?|\d{1,2}月\d{1,2}日(?:[（(][月火水木金土日][）)])?|\d{1,2}日[（(][月火水木金土日][）)]|レントゲン(?:撮影|装置|検査)?|よろしくお願い申し上げます|させていただきます|おかけいたします|しております)/g;
    const units = [];
    text.split(fixed).filter(Boolean).forEach(part => {
      fixed.lastIndex = 0;
      if (fixed.test(part)) units.push(part);
      else if (noticeSegmenter) units.push(...Array.from(noticeSegmenter.segment(part), item => item.segment));
      else units.push(...(part.match(/\s+|[ァ-ヺー]+|[一-龯々]+[ぁ-ゖ]*|[ぁ-ゖ]+|[A-Za-z0-9]+|./gu) || []));
    });
    const phrases = [];
    units.forEach(unit => {
      const last = phrases.length - 1;
      const previous = phrases[last] || '';
      const join = previous && !/\s/.test(previous) && !/\s/.test(unit) && (
        /^[、。，．！？!?）」』】・]+$/.test(unit) ||
        /[（(「『【]$/.test(previous) ||
        (/^(?:[ぁ-ゖ]+|様|伴う|伴)$/.test(unit) && !/[、。！？!?・]$/.test(previous) && previous.length + unit.length <= 18) ||
        (previous === 'ご' || previous === 'お') ||
        (/^[一-龯々]+$/.test(previous) && /^[一-龯々]+$/.test(unit) && previous.length + unit.length <= 12)
      );
      // ご／お starts the next phrase when it is a standalone prefix.
      if (join && unit !== 'ご' && unit !== 'お') phrases[last] += unit;
      else phrases.push(unit);
    });
    phrases.forEach(phrase => {
      if (/\s/.test(phrase)) element.append(document.createTextNode(phrase));
      else {
        const span = document.createElement('span');
        span.className = 'notice-phrase'; span.textContent = phrase;
        element.append(span);
      }
    });
  }
  function noticeContent(item,headingTag) {
    const fragment=document.createDocumentFragment();
    const h=document.createElement(headingTag);noticeText(h,item.title);fragment.append(h);
    if(item.body){const p=document.createElement('p');noticeText(p,item.body);fragment.append(p);}
    if(item.linkText && /^(https?:\/\/|tel:|#)/.test(item.linkUrl)){const a=document.createElement('a');a.href=item.linkUrl;a.textContent=item.linkText;if(/^https?:/.test(item.linkUrl)){a.target='_blank';a.rel='noopener noreferrer';}fragment.append(a);}
    return fragment;
  }
  function clearNotices() {
    disposeNotices?.();disposeNotices=null;
    const root=document.querySelector('[data-important-notices]');
    if(root){root.hidden=true;root.replaceChildren();}
  }
  function notices(items) {
    clearNotices();
    const root=document.querySelector('[data-important-notices]');if(!root)return;
    const active=items.filter(h=>h.enabled && h.title);
    // All notices remain available in the page, including dismissed popup notices.
    active.forEach(item=>{const article=document.createElement('article');article.className='important-notice';const inner=document.createElement('div');inner.className='container';inner.append(noticeContent(item,'h2'));const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',item.title+'を閉じる');close.onclick=()=>article.remove();inner.append(close);article.append(inner);root.append(article);});
    root.hidden=active.length===0;
    const key=item=>'hayashi-notice-v2:'+JSON.stringify([item.id,item.title,item.body,item.linkUrl,item.linkText]);
    const popups=active.filter(h=>{if(h.mode!=='popup')return false;try{return sessionStorage.getItem(key(h))!=='closed';}catch{return true;}});
    if(!popups.length){disposeNotices=null;return;}
    const dialog=document.createElement('dialog');dialog.className='notice-dialog';dialog.setAttribute('aria-labelledby','important-dialog-title');
    const h=document.createElement('h2');h.id='important-dialog-title';h.textContent='重要なお知らせ';
    const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.onclick=()=>dialog.close();dialog.append(h,close);
    popups.forEach(item=>{const article=document.createElement('article');article.append(noticeContent(item,'h3'));dialog.append(article);});
    dialog.addEventListener('close',()=>{popups.forEach(item=>{try{sessionStorage.setItem(key(item),'closed');}catch{}});});
    document.body.append(dialog);dialog.showModal();disposeNotices=()=>dialog.remove();
  }
  const photoCaptions = new Map([
    ['assets/uploads/72a41a40-b6ab-492e-8845-af60e08c4a21.jpg', ['医院の入口','正面の入口からお入りください。']],
    ['assets/uploads/b88140ee-ca86-402f-8ab6-28c320fd767e.jpg', ['外観と駐車場','医院前に9台分の駐車場があります。']],
    ['assets/uploads/a477cf6c-2850-462d-a110-63beacb3fe7d.jpg', ['待合室','木のぬくもりを感じる待合スペースです。']],
    ['assets/uploads/64696cd1-a21b-4b69-94f2-654603f53a83.jpg', ['院内の様子','待合室から診察室へつながる院内です。']]
  ]);
  let photoDialog = null;
  function clearClinicPhotos() {
    document.querySelector('[data-clinic-photos]')?.replaceChildren();
    const note = document.querySelector('[data-clinic-photos-note]');
    if (note) { note.hidden=false; note.textContent='写真を表示できません。しばらくしてから再度ご確認ください。'; }
    if (photoDialog) { photoDialog.close(); photoDialog.remove(); photoDialog=null; }
  }
  function openClinicPhoto(image) {
    if (!photoDialog) {
      photoDialog=document.createElement('dialog');photoDialog.className='seo-photo-dialog';
      photoDialog.setAttribute('aria-label','医院の写真');
      const close=document.createElement('button');close.type='button';close.textContent='閉じる ×';
      close.addEventListener('click',()=>photoDialog.close());
      photoDialog.append(close,document.createElement('img'),document.createElement('p'));
      photoDialog.addEventListener('click',event=>{if(event.target===photoDialog)photoDialog.close();});
      document.body.append(photoDialog);
    }
    const enlarged=photoDialog.querySelector('img');enlarged.src=image.src;enlarged.alt=image.alt;
    photoDialog.querySelector('p').textContent=image.alt;
    photoDialog.showModal();
  }
  function renderClinicPhotos(hero) {
    const grid=document.querySelector('[data-clinic-photos]');
    if (!grid) return;
    clearClinicPhotos();
    const images=(hero.slides || []).filter(item=>item.enabled!==false && ClinicContent.imageAsset(item.src));
    const preferred=[...photoCaptions.keys()].map(src=>images.find(item=>item.src===src)).filter(Boolean);
    const selected=[...new Map([...preferred,...images].map(item=>[item.src,item])).values()].slice(0,4);
    for (const item of selected) {
      const caption=photoCaptions.get(item.src) || [item.alt || '医院の写真',''];
      const figure=document.createElement('figure');
      const button=document.createElement('button');button.type='button';button.className='seo-photo-button';button.setAttribute('aria-label',caption[0]+'の写真を拡大');
      const img=document.createElement('img');img.src=item.src;img.alt=caption[0];img.loading='lazy';img.decoding='async';
      button.append(img);button.addEventListener('click',()=>openClinicPhoto(img));
      const text=document.createElement('figcaption');text.textContent=caption[0];
      if(caption[1]){const small=document.createElement('small');small.textContent=caption[1];text.append(small);}
      figure.append(button,text);grid.append(figure);
    }
    const note=document.querySelector('[data-clinic-photos-note]');
    if(note){note.hidden=selected.length>0;note.textContent='医院の写真は準備中です。';}
  }

  function clearHero() {
    clearClinicPhotos();
    disposeHero?.();disposeHero=null;heroSignature='';
    ClinicContent.slideshow(document.querySelector('[data-hero-slideshow]'),{slides:[]});
  }
  function applyHero(source) {
    if(source.loadError){clearHero();return;}
    const hero={...source.hero,slides:Array.isArray(source.hero?.slides)?source.hero.slides:[]};
    const signature=JSON.stringify(hero);
    if(signature!==heroSignature){heroSignature=signature;disposeHero?.();disposeHero=ClinicContent.slideshow(document.querySelector('[data-hero-slideshow]'),hero);renderClinicPhotos(hero);}
  }
  clearNotices();
  window.ClinicPublicContent={clearNotices,clearHero,applyHero,apply(source){
    // Start image loading before theme, notices and FAQ rendering.
    applyHero(source);
    const content=ClinicContent.normalize(source);ClinicDesign.apply(content.design,content.theme);notices(source.loadError?[]:ClinicContent.visibleHighlights(source));
    // A failed JSON request must not overwrite the last published HTML with old defaults.
    if(!source.loadError)ClinicContent.renderFaq(document.querySelector('#faq .faq-list'),content.faqs);
  }};
})();
