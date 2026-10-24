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
  function notices(items) {
    disposeNotices?.();
    const root=document.querySelector('[data-important-notices]');if(!root)return;
    root.replaceChildren();
    const active=items.filter(h=>h.enabled && h.title);
    // All notices remain available in the page, including dismissed popup notices.
    active.forEach(item=>{const article=document.createElement('article');article.className='important-notice';const inner=document.createElement('div');inner.className='container';inner.append(noticeContent(item,'h2'));const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',item.title+'を閉じる');close.onclick=()=>article.remove();inner.append(close);article.append(inner);root.append(article);});
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
  window.ClinicPublicContent={apply(source){
    const content=ClinicContent.normalize(source);ClinicDesign.apply(content.design,content.theme);notices(content.highlights);
    // A failed JSON request must not overwrite the last published HTML with old defaults.
    if(!source.loadError)ClinicContent.renderFaq(document.querySelector('#faq .faq-list'),content.faqs);
    const signature=JSON.stringify(content.hero);
    if(signature!==heroSignature){heroSignature=signature;disposeHero?.();disposeHero=ClinicContent.slideshow(document.querySelector('[data-hero-slideshow]'),content.hero);}
  }};
})();

