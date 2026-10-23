(() => {
  'use strict';
  let disposeHero=null,heroSignature='',disposeNotices=null;
  function noticeContent(item,headingTag) {
    const fragment=document.createDocumentFragment();
    const h=document.createElement(headingTag);h.textContent=item.title;fragment.append(h);
    if(item.body){const p=document.createElement('p');p.textContent=item.body;fragment.append(p);}
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
    const content=ClinicContent.normalize(source);notices(content.highlights);
    const signature=JSON.stringify(content.hero);
    if(signature!==heroSignature){heroSignature=signature;disposeHero?.();disposeHero=ClinicContent.slideshow(document.querySelector('[data-hero-slideshow]'),content.hero);}
  }};
})();
