/* Additional editor panels. Upload bytes stay in the draft until Publish. */
(() => {
  'use strict';
  let pendingReads=0,disposePreview=null;
  const q=s=>document.querySelector(s);
  const mediaAccept='image/jpeg,image/png,image/webp,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.webm';
  function input(root,key,label,type,value,options={}) {
    const wrap=document.createElement('label');wrap.textContent=label;
    const el=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');
    el.dataset.contentField=key;
    if(type==='select')Object.entries(options.choices).forEach(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;el.append(o);});
    else if(type==='textarea'){el.rows=3;el.maxLength=options.maxLength || 1200;}
    else el.type=type;
    if(type==='checkbox'){el.checked=!!value;wrap.className='inline-check';wrap.prepend(el);}
    else {el.value=value ?? '';wrap.append(el);}
    for(const prop of ['min','max','step','maxLength'])if(options[prop]!=null)el[prop]=options[prop];
    root.append(wrap);return el;
  }
  function collectRows(root,items) {
    return [...root.querySelectorAll('[data-content-row]')].map(row=>{
      const item={...items.find(i=>i.id===row.dataset.id),id:row.dataset.id};
      row.querySelectorAll('[data-content-field]').forEach(el=>{item[el.dataset.contentField]=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?'':Number(el.value)):el.value.trim();});
      return item;
    });
  }
  function collectExtra() {
    data.faqs=collectRows(q('[data-faqs]'),data.faqs);
    data.highlights=collectRows(q('[data-highlights]'),data.highlights);
    data.hero.slides=collectRows(q('[data-slides]'),data.hero.slides);
    data.documents=collectRows(q('[data-documents]'),data.documents);
    q('[data-hero-settings]').querySelectorAll('[data-content-field]').forEach(el=>{data.hero[el.dataset.contentField]=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?'':Number(el.value)):el.value;});
    data.highlight=data.highlights[0]?{...data.highlights[0]}:{enabled:false,mode:'banner',title:'',body:'',linkText:'',linkUrl:''};
  }
  function card(root,kind,item,index,title) {
    const row=document.createElement('article');row.className='item-card content-row';row.dataset.contentRow=kind;row.dataset.id=item.id;
    const header=document.createElement('div');header.className='item-card-header';const h=document.createElement('strong');h.textContent=title;
    const actions=document.createElement('div');actions.className='item-actions';
    const list=()=>kind==='highlights'?data.highlights:kind==='slides'?data.hero.slides:kind==='faqs'?data.faqs:data.documents;
    const move=direction=>{collectExtra();const items=list();[items[index],items[index+direction]]=[items[index+direction],items[index]];renderExtra();markDirty();};
    const up=createButton('↑ 上へ','secondary compact',()=>move(-1));up.disabled=index===0;up.setAttribute('aria-label',title+'を上へ');
    const down=createButton('↓ 下へ','secondary compact',()=>move(1));down.disabled=index===list().length-1;down.setAttribute('aria-label',title+'を下へ');
    const remove=createButton('削除','danger-button',()=>{if(!confirm('この項目を削除しますか？公開するまではサイトは変わりません。'))return;collectExtra();list().splice(index,1);renderExtra();markDirty();});
    actions.append(up,down,remove);header.append(h,actions);row.append(header);root.append(row);return row;
  }
  function renderExtra() {
    const faqs=q('[data-faqs]');faqs.replaceChildren();
    if(!data.faqs.length)faqs.append(emptyState('質問は未登録です。「質問を追加」から作成できます。'));
    data.faqs.forEach((item,i)=>{
      const row=card(faqs,'faqs',item,i,`質問 ${i+1}`);
      input(row,'published','サイトに表示する','checkbox',item.published);
      input(row,'question','質問','text',item.question,{maxLength:200});
      input(row,'answer','回答','textarea',item.answer,{maxLength:3000});
    });
    const highlights=q('[data-highlights]');highlights.replaceChildren();
    if(!data.highlights.length)highlights.append(emptyState('重要なお知らせは未登録です。「追加」から作成できます。'));
    data.highlights.forEach((item,i)=>{
      const row=card(highlights,'highlights',item,i,`重要なお知らせ ${i+1}`);
      input(row,'enabled','表示する','checkbox',item.enabled);
      input(row,'mode','表示方法','select',item.mode,{choices:{banner:'ページ上部に表示',popup:'ページ上部 ＋ ポップアップ'}});
      input(row,'title','見出し','text',item.title,{maxLength:120});input(row,'body','本文','textarea',item.body);
      const links=document.createElement('div');links.className='two-columns';row.append(links);
      input(links,'linkText','リンクの文言（任意）','text',item.linkText,{maxLength:60});input(links,'linkUrl','リンク先（https://… または #news など）','text',item.linkUrl,{maxLength:500});
    });
    const settings=q('[data-hero-settings]');settings.replaceChildren();
    input(settings,'autoplay','写真の切り替え・動画の再生を自動で行う','checkbox',data.hero.autoplay);
    input(settings,'pauseOnHover','マウスを重ねたら切り替え・動画を一時停止','checkbox',data.hero.pauseOnHover);
    const times=document.createElement('div');times.className='two-columns';settings.append(times);
    input(times,'hold','写真1枚を表示する秒数（1〜120）','number',data.hero.hold,{min:1,max:120,step:.1});
    input(times,'fade','フェードにかける秒数（0〜10）','number',data.hero.fade,{min:0,max:10,step:.1});
    input(settings,'easing','フェードの変化','select',data.hero.easing,{choices:{'ease-in-out':'なめらか（標準）',linear:'一定の速さ',ease:'自然にゆっくり止まる','ease-in':'ゆっくり始まる','ease-out':'ゆっくり終わる'}});
    const slides=q('[data-slides]');slides.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load();});slides.replaceChildren();
    if(!data.hero.slides.length)slides.append(emptyState('写真・動画を追加してください。掲載するものがない間は、元の外観イラストを表示します。'));
    data.hero.slides.forEach((item,i)=>{
      const video=ClinicContent.videoAsset(item.src);
      const row=card(slides,'slides',item,i,`トップ ${video?'動画':'写真'} ${i+1}`);
      const image=document.createElement(video?'video':'img');image.className='editor-media-thumb';image.alt=item.alt || 'トップ画像';image.src=ClinicContent.assetURL(item,true);
      if(video){image.muted=true;image.defaultMuted=true;image.playsInline=true;image.controls=true;image.preload='none';image.poster=ClinicContent.posterURL(item,true);image.setAttribute('aria-label',item.alt || '動画の確認');}
      row.append(image);
      if(video){const info=document.createElement('p');info.className='field-help';info.textContent=`動画：${item.name || item.src.split('/').pop()}${Number.isFinite(item.duration)?'（'+Math.round(item.duration)+'秒）':''} — 公開サイトでは無音で再生します。`;row.append(info);}
      input(row,'enabled','スライドに含める','checkbox',item.enabled);input(row,'alt','写真・動画の説明（例：新医院の待合室）','text',item.alt,{maxLength:150});
      input(row,'fit','写真・動画の収め方','select',item.fit,{choices:{cover:'枠いっぱい（端を切り抜く）',contain:'全体を表示（余白あり）'}});
      const position=document.createElement('div');position.className='two-columns';row.append(position);
      input(position,'x','切り抜きの横位置：0=左／50=中央／100=右','number',item.x,{min:0,max:100,step:1});
      input(position,'y','切り抜きの縦位置：0=上／50=中央／100=下','number',item.y,{min:0,max:100,step:1});
      row.append(filePicker('写真・動画を差し替え',mediaAccept,false,async files=>{
        const result=await prepareFile(files[0],true);collectExtra();const current=data.hero.slides.find(v=>v.id===item.id);if(current)Object.assign(current,result);renderExtra();markDirty();
      }));
    });
    const docs=q('[data-documents]');docs.replaceChildren();
    if(!data.documents.length)docs.append(emptyState('掲示物は未登録です。「PDF・画像を追加」から選んでください。'));
    data.documents.forEach((item,i)=>{
      const row=card(docs,'documents',item,i,`院内掲示物 ${i+1}`);
      input(row,'published','一覧に掲載する','checkbox',item.published);input(row,'title','表題','text',item.title,{maxLength:150});input(row,'description','補足（任意）','textarea',item.description,{maxLength:500});
      const info=document.createElement('p');info.className='field-help';info.textContent=`${/\.pdf$/i.test(item.src)?'PDF':'画像'}：${item.name || item.src.split('/').pop()}${item.fileData?'（公開待ち）':''}`;row.append(info);
      if(!/\.pdf$/i.test(item.src)){const img=document.createElement('img');img.className='editor-media-thumb document-thumb';img.src=ClinicContent.assetURL(item,true);img.alt=item.title;row.append(img);}
      row.append(filePicker('ファイルを差し替え','.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp',false,async files=>{
        const result=await prepareFile(files[0],false);collectExtra();const current=data.documents.find(v=>v.id===item.id);if(current)Object.assign(current,result);renderExtra();markDirty();
      }));
    });
  }
  function filePicker(label,accept,multiple,action) {
    const wrap=document.createElement('label');wrap.className='file-button';wrap.append(document.createTextNode(label));
    const picker=document.createElement('input');picker.type='file';picker.accept=accept;picker.multiple=multiple;
    picker.addEventListener('change',()=>runFiles(picker,action));wrap.append(picker);return wrap;
  }
  async function runFiles(picker,action) {
    if(!picker.files.length)return;
    pendingReads++;markDirty();q('[data-media-status]').textContent='ファイルを読み込み中…';
    try{await action([...picker.files]);q('[data-media-status]').textContent='追加しました。プレビューで確認後、「公開する」を押してください。';}
    catch(error){q('[data-media-status]').textContent=error.message;setMessage(error.message,'error');}
    finally{pendingReads--;picker.value='';document.dispatchEvent(new CustomEvent('clinic-editor-changed'));}
  }
  async function dataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('ファイルを読み込めませんでした。'));reader.readAsDataURL(blob);});}
  async function prepareVideo(file,ext) {
    const video=document.createElement('video'),url=URL.createObjectURL(file);
    video.muted=true;video.defaultMuted=true;video.playsInline=true;video.preload='auto';
    try{
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>finish(Error('動画の読み込みが完了しませんでした。短いMP4（H.264）に変換して再度お試しください。')),15000);
        const finish=error=>{clearTimeout(timeout);video.onloadeddata=video.onerror=null;error?reject(error):resolve();};
        video.onloadeddata=()=>finish();video.onerror=()=>finish(Error('この動画を読み込めませんでした。MP4（H.264）に変換して再度お試しください。'));
        video.src=url;video.load();
      });
      if(!Number.isFinite(video.duration) || video.duration<=0 || video.duration>60)throw Error('トップ動画は60秒以内にしてください。5〜10秒程度の短い動画がおすすめです。');
      if(!video.videoWidth || !video.videoHeight)throw Error('映像のある動画を選択してください。');
      const canvas=document.createElement('canvas'),ratio=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);
      const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const poster=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!poster)throw Error('動画の先頭画像を作成できませんでした。');
      const blob=new Blob([await file.arrayBuffer()],{type:'video/'+ext});
      return {src:`assets/uploads/${crypto.randomUUID()}.${ext}`,fileData:await dataURL(blob),name:file.name,duration:video.duration,poster:`assets/uploads/${crypto.randomUUID()}.jpg`,posterData:await dataURL(poster)};
    }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  }
  async function prepareFile(file,photo) {
    if(!file || file.size>20*1024*1024)throw Error('1ファイル20MB以下で選択してください。');
    const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
    const pdf=String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
    const png=bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71;
    const jpeg=bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    const mp4=/\.mp4$/i.test(file.name) && String.fromCharCode(...bytes.slice(4,8))==='ftyp' && String.fromCharCode(...bytes.slice(8,12))!=='qt  ';
    const webm=/\.webm$/i.test(file.name) && bytes[0]===26 && bytes[1]===69 && bytes[2]===223 && bytes[3]===163;
    if(photo && (mp4 || webm))return prepareVideo(file,mp4?'mp4':'webm');
    if(!(pdf || png || jpeg || webp) || photo && pdf)throw Error('対応形式は写真：JPEG・PNG・WebP、動画：MP4・WebM、掲示物：PDF・JPEG・PNG・WebPです。HEIC写真はJPEG、MOV動画はMP4（H.264）に変換してください。');
    let blob=file,ext=pdf?'pdf':png?'png':jpeg?'jpg':'webp',mime=pdf?'application/pdf':png?'image/png':jpeg?'image/jpeg':'image/webp';
    if(photo){
      const url=URL.createObjectURL(file);const img=new Image();
      try{img.src=url;await img.decode();const ratio=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*ratio);canvas.height=Math.round(img.naturalHeight*ratio);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob)throw Error('画像を変換できませんでした。');ext='jpg';mime='image/jpeg';}
      catch {throw Error('画像を読み込めませんでした。JPEGまたはPNGで保存し直してください。');}
      finally{URL.revokeObjectURL(url);}
    } else {blob=new Blob([await file.arrayBuffer()],{type:mime});}
    return {src:`assets/uploads/${crypto.randomUUID()}.${ext}`,fileData:await dataURL(blob),name:file.name,...(photo?{poster:'',posterData:'',duration:null}:{})};
  }
  function validateExtra() {
    const errors=[];
    data.faqs.forEach((f,i)=>{
      if(f.published && (!f.question || !f.answer))errors.push(`質問 ${i+1} の質問と回答を両方入力してください。`);
      if(f.question.length>200 || f.answer.length>3000)errors.push(`質問 ${i+1} は質問200文字、回答3000文字以内で入力してください。`);
    });
    if(pendingReads)errors.push('ファイルの読み込み完了後に、もう一度操作してください。');
    data.highlights.forEach((h,i)=>{if(h.enabled && !h.title)errors.push(`重要なお知らせ ${i+1} の見出しを入力してください。`);if(!isSafeLink(h.linkUrl))errors.push(`重要なお知らせ ${i+1} のリンク先を確認してください。`);if(h.enabled && (!!h.linkUrl !== !!h.linkText))errors.push(`重要なお知らせ ${i+1} のリンク文言とリンク先を両方入力してください。`);});
    for(const [key,min,max] of [['hold',1,120],['fade',0,10]])if(data.hero[key]==='' || !Number.isFinite(data.hero[key]) || data.hero[key]<min || data.hero[key]>max)errors.push(`${key==='hold'?'静止表示':'フェード'}の秒数は${min}〜${max}で入力してください。`);
    const assets=[...data.hero.slides,...data.documents,...data.hero.slides.filter(s=>s.poster || s.posterData).map(s=>({src:s.poster,fileData:s.posterData}))];let total=0;
    for(const item of assets){
      if(!ClinicContent.safeAsset(item.src) && !ClinicContent.videoAsset(item.src))errors.push('写真・動画・掲示物のファイルが不正です。追加し直してください。');
      if(item.fileData){
        const match=/^data:(image\/(?:jpeg|png|webp)|video\/(?:mp4|webm)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(item.fileData);
        const ext=item.src.split('.').pop().toLowerCase(),mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm'}[ext];
        if(!match || match[1]!==mime || !/^assets\/uploads\/[a-f0-9-]+\.(jpg|jpeg|png|webp|pdf|mp4|webm)$/.test(item.src))errors.push('追加ファイルの形式が不正です。');
        else {const size=match[2].length*.75;total+=size;if(size>20*1024*1024+3)errors.push('1ファイル20MB以下にしてください。');}
      }
    }
    if(total>60*1024*1024)errors.push('今回追加するファイルの合計は60MB以下にしてください。何回かに分けて公開できます。');
    data.hero.slides.forEach((s,i)=>{if(s.enabled && !s.alt)errors.push(`トップ ${i+1} の写真・動画の説明を入力してください。`);if(!ClinicContent.slideAsset(s.src))errors.push('トップには写真・MP4・WebMのみ使用できます。');if(s.poster && !ClinicContent.imageAsset(s.poster))errors.push('動画の先頭画像が不正です。動画を追加し直してください。');if(ClinicContent.videoAsset(s.src) && s.duration!=null && (!Number.isFinite(s.duration) || s.duration<=0 || s.duration>60))errors.push('トップ動画は60秒以内にしてください。');for(const k of ['x','y'])if(s[k]==='' || !Number.isFinite(s[k]) || s[k]<0 || s[k]>100)errors.push(`トップ ${i+1} の位置は0〜100で入力してください。`);});
    data.documents.forEach((d,i)=>{if(d.published && !d.title)errors.push(`院内掲示物 ${i+1} の表題を入力してください。`);if(!ClinicContent.safeAsset(d.src))errors.push('院内掲示物にはPDF・画像のみ使用できます。');if(d.poster || d.posterData)errors.push('院内掲示物の形式が不正です。追加し直してください。');});
    return errors;
  }
  function preview(root,section) {
    disposePreview?.();
    const faq=section('よくある質問');const faqList=document.createElement('div');faqList.className='faq-list';faq.append(faqList);ClinicContent.renderFaq(faqList,data.faqs);
    const card=section('トップ画像・動画');const holder=document.createElement('div');card.append(holder);disposePreview=ClinicContent.slideshow(holder,data.hero,{preview:true});
    const docs=section('院内掲示物');const list=document.createElement('div');list.className='documents-list';docs.append(list);ClinicContent.documentList(list,data.documents,{preview:true});
  }
  // The same JSON backup contains unpublished bytes, making file imports portable.
  function publication(source){
    const next=JSON.parse(JSON.stringify(source)),files=new Map();
    next.hero.slides.forEach(item=>{if(item.posterData)files.set(item.poster,{path:item.poster,content:item.posterData.split(',')[1]});});
    [...next.hero.slides,...next.documents].forEach(item=>{
      if(item.fileData)files.set(item.src,{path:item.src,content:item.fileData.split(',')[1]});
      delete item.fileData;delete item.posterData;
    });
    return {data:next,files:[...files.values()]};
  }
  async function saveFiles(root,files) {
    for(const file of files){const parts=file.path.split('/');let dir=root;for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part,{create:true});const handle=await dir.getFileHandle(parts.at(-1),{create:true});const stream=await handle.createWritable();await stream.write(Uint8Array.from(atob(file.content),c=>c.charCodeAt(0)));await stream.close();}
  }
  q('[data-add-faq]').addEventListener('click',()=>{collectExtra();data.faqs.push({id:makeId('faq'),published:true,question:'',answer:''});renderExtra();markDirty();q('[data-faqs]').lastElementChild.querySelector('[data-content-field="question"]').focus();});
  q('[data-add-highlight]').addEventListener('click',()=>{collectExtra();data.highlights.push({id:makeId('important'),enabled:true,mode:'banner',title:'',body:'',linkText:'',linkUrl:''});renderExtra();markDirty();q('[data-highlights]').lastElementChild.querySelector('[data-content-field="title"]').focus();});
  q('[data-add-photos]').addEventListener('change',e=>runFiles(e.target,async files=>{
    for(const file of files){const result=await prepareFile(file,true);collectExtra();data.hero.slides.push({id:makeId('slide'),enabled:true,fit:'contain',x:100,y:50,alt:file.name.replace(/\.[^.]+$/,''),...result});renderExtra();markDirty();}
  }));
  q('[data-add-documents]').addEventListener('change',e=>runFiles(e.target,async files=>{
    for(const file of files){const result=await prepareFile(file,false);collectExtra();data.documents.push({id:makeId('document'),published:true,title:file.name.replace(/\.[^.]+$/,''),description:'',...result});renderExtra();markDirty();}
  }));
  q('[data-preview-dialog]').addEventListener('close',()=>{disposePreview?.();disposePreview=null;});
  window.ClinicEditorContent={render:renderExtra,collect:collectExtra,validate:validateExtra,preview,publication,saveFiles,isBusy:()=>pendingReads>0};
})();


