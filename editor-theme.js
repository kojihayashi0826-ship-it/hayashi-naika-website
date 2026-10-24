/* Color and layout edits use the existing draft/backup/atomic publication path. */
(() => {
  'use strict';
  const q=s=>document.querySelector(s),root=q('[data-theme-presets]'),accent=q('[data-theme-accent]'),tint=q('[data-theme-tint]');
  const frame=q('[data-design-frame]');
  const colorLabels={background:'ページ全体の背景',surface:'区切り部分の背景',card:'カードの背景',heading:'見出しの文字',text:'本文の文字',button:'ボタンの背景',notice:'重要なお知らせの背景'};
  const colorTokens={background:'--theme-page',surface:'--theme-surface',card:'--theme-card',heading:'--theme-heading',text:'--ink',button:'--theme-button',notice:'--theme-notice'};
  const specs={fontScale:['本文の大きさ','%',5],headingScale:['見出しの大きさ','%',5],spacing:['項目間の余白','px',4],contentWidth:['ページの横幅（PC）','px',40],heroHeight:['トップ画像の高さ（PC）','px',20],radius:['カードの角の丸み','px',2]};
  function preview(host,theme) {
    ClinicTheme.apply(theme,host);host.replaceChildren();
    const add=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
    const main=add('div','theme-sample-main','');main.append(add('h3','','地域に寄り添う、かかりつけ医。'),add('p','','背景・文字・ボタンの色を確認できます。'),add('span','theme-sample-button','初診の方はこちら →'));
    const cards=add('div','theme-sample-cards','');['診療案内','予防接種'].forEach(text=>cards.append(add('span','',text)));
    host.append(add('div','theme-sample-header','林内科医院'),add('div','theme-sample-notice','重要なお知らせ'),main,cards);
  }
  function sendPreview(){
    if(!frame.getAttribute('src'))return;
    frame.contentWindow?.postMessage({type:'clinic-design-preview',theme:ClinicTheme.normalize(data.theme),design:ClinicDesign.normalize(data.design)},location.origin);
  }
  function startPreview(){if(!frame.getAttribute('src'))frame.src='index.html?design-preview=1';else sendPreview();}
  frame.addEventListener('load',sendPreview);
  window.addEventListener('message',event=>{if(event.source===frame.contentWindow && event.origin===location.origin && event.data?.type==='clinic-design-ready')sendPreview();});
  q('[data-tab="design"]').addEventListener('click',startPreview);
  document.querySelectorAll('[data-design-width]').forEach(button=>button.addEventListener('click',()=>{
    q('[data-design-frame-wrap]').dataset.width=button.dataset.designWidth;
    document.querySelectorAll('[data-design-width]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  }));
  function refresh(){
    const theme=ClinicTheme.normalize(data.theme);
    root.querySelectorAll('[data-theme-preset]').forEach(button=>{
      const preset=ClinicTheme.normalize({preset:button.dataset.themePreset});
      button.setAttribute('aria-pressed',String(theme.preset===preset.preset && theme.accent===preset.accent && theme.tint===preset.tint && !Object.values(theme.custom).some(Boolean)));
    });
    q('[data-theme-accent-value]').textContent=theme.accent.toUpperCase();q('[data-theme-tint-value]').textContent=theme.tint+'%';
    q('[data-theme-summary]').textContent='現在の配色：'+(!Object.values(theme.custom).some(Boolean) && theme.accent===ClinicTheme.presets[theme.preset].accent && theme.tint===ClinicTheme.presets[theme.preset].tint?ClinicTheme.presets[theme.preset].label:'カスタム');
    Object.entries(specs).forEach(([key,[,unit]])=>{q(`[data-design-output="${key}"]`).textContent=data.design[key]+unit;});
    preview(q('[data-theme-preview]'),theme);sendPreview();
    window.dispatchEvent(new CustomEvent('clinic-editor-design-change'));
  }
  function colorControl(key,label,value,onChange){
    const row=document.createElement('div');row.className='design-color-control';
    const title=document.createElement('strong');title.textContent=label;
    const flag=document.createElement('label');flag.className='inline-check';const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=!!value;enabled.dataset.customEnabled=key;flag.append(enabled,document.createTextNode('自分で指定'));
    const input=document.createElement('input');input.type='color';input.value=value||'#ffffff';input.disabled=!value;input.dataset.customColor=key;input.setAttribute('aria-label',label+'の色');
    enabled.addEventListener('input',()=>{input.disabled=!enabled.checked;onChange();});input.addEventListener('input',onChange);
    row.append(title,flag,input);return row;
  }
  function renderColors(){
    const colors=ClinicTheme.colors(data.theme),host=q('[data-custom-colors]');host.replaceChildren();
    ClinicTheme.customKeys.forEach(key=>{
      const row=colorControl(key,colorLabels[key],data.theme.custom[key],()=>{collect();refresh();markDirty();});
      if(!data.theme.custom[key])row.querySelector('input[type="color"]').value=colors[colorTokens[key]];
      host.append(row);
    });
  }
  function renderOrder(){
    const host=q('[data-design-order]');host.replaceChildren();
    data.design.order.forEach((id,index)=>{
      const row=document.createElement('div');row.className='design-order-row';row.dataset.designSection=id;
      const name=document.createElement('strong');name.textContent=(index+1)+'. '+ClinicDesign.sections[id];
      const actions=document.createElement('div');actions.className='design-order-actions';
      [-1,1].forEach(delta=>{
        const b=document.createElement('button');b.type='button';b.className='secondary compact';b.textContent=delta<0?'↑':'↓';b.dataset.move=String(delta);b.setAttribute('aria-label',ClinicDesign.sections[id]+(delta<0?'を上へ':'を下へ'));b.disabled=index+delta<0 || index+delta>=data.design.order.length;
        b.addEventListener('click',()=>{collect();const order=data.design.order;[order[index],order[index+delta]]=[order[index+delta],order[index]];renderOrder();refresh();markDirty();q('[data-design-message]').textContent=ClinicDesign.sections[id]+'を'+(index+delta+1)+'番目に移動しました。';const focus=q(`[data-design-order] [data-design-section="${id}"] button[data-move="${delta}"]`);(focus.disabled?focus.parentElement.querySelector('button:not(:disabled)'):focus)?.focus();});actions.append(b);
      });
      const color=colorControl(id,'この項目の背景',data.design.sectionColors[id],()=>{collect();refresh();markDirty();});color.classList.add('design-section-color');
      row.append(name,actions,color);host.append(row);
    });
  }
  function render(){
    data.theme=ClinicTheme.normalize(data.theme);data.design=ClinicDesign.normalize(data.design);
    accent.value=data.theme.accent;tint.value=String(data.theme.tint);
    document.querySelectorAll('[data-design-field]').forEach(input=>input.value=String(data.design[input.dataset.designField]));
    renderColors();renderOrder();refresh();
  }
  function collect(){
    const custom={};q('[data-custom-colors]').querySelectorAll('[data-custom-color]').forEach(input=>{const key=input.dataset.customColor;custom[key]=q(`[data-custom-colors] [data-custom-enabled="${key}"]`).checked?input.value:null;});
    data.theme=ClinicTheme.normalize({...data.theme,accent:accent.value,tint:Number(tint.value),custom});
    const next={...data.design,sectionColors:{}};
    document.querySelectorAll('[data-design-field]').forEach(input=>{next[input.dataset.designField]=input.dataset.numeric==='true'?Number(input.value):input.value;});
    q('[data-design-order]').querySelectorAll('[data-custom-color]').forEach(input=>{const key=input.dataset.customColor;next.sectionColors[key]=q(`[data-design-order] [data-custom-enabled="${key}"]`).checked?input.value:null;});
    data.design=ClinicDesign.normalize(next);
  }
  Object.entries(ClinicTheme.presets).forEach(([key,preset])=>{
    const button=document.createElement('button');button.type='button';button.className='theme-preset';button.dataset.themePreset=key;ClinicTheme.apply({preset:key},button);
    const swatch=document.createElement('span');swatch.className='theme-swatch';swatch.setAttribute('aria-hidden','true');const title=document.createElement('strong');title.textContent=preset.label;const hint=document.createElement('small');hint.textContent=key==='mint'?'おすすめ・明るい緑':key==='sky'?'さわやかな青':key==='peach'?'あたたかい雰囲気':'穏やかな灰緑';button.append(swatch,title,hint);
    button.addEventListener('click',()=>{collect();data.theme=ClinicTheme.normalize({preset:key});render();markDirty();});root.append(button);
  });
  const controls=q('[data-design-controls]');
  Object.entries(specs).forEach(([key,[label,unit,step]])=>{
    const wrap=document.createElement('label');wrap.textContent=label;const out=document.createElement('output');out.dataset.designOutput=key;
    const input=document.createElement('input');input.type='range';input.min=ClinicDesign.ranges[key][0];input.max=ClinicDesign.ranges[key][1];input.step=step;input.dataset.designField=key;input.dataset.numeric='true';input.setAttribute('aria-label',label);wrap.append(out,input);controls.append(wrap);
  });
  [['heroLayout','トップ画像の配置',[['overlay','画像に文字を重ねる'],['split','文章と画像を左右に並べる'],['stacked','画像を上・文章を下にする']]],['guideColumns','案内カードの列数（PC）',[[1,'1列'],[2,'2列'],[3,'3列']]],['shadow','カードの影',[['none','なし'],['soft','控えめ'],['strong','はっきり']]]].forEach(([key,label,options])=>{
    const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('select');input.dataset.designField=key;if(key==='guideColumns')input.dataset.numeric='true';options.forEach(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);});wrap.append(input);controls.append(wrap);
  });
  controls.addEventListener('input',()=>{collect();refresh();markDirty();});
  [accent,tint].forEach(input=>input.addEventListener('input',()=>{collect();renderColors();refresh();markDirty();}));
  q('[data-theme-reset]').addEventListener('click',()=>{collect();data.theme=ClinicTheme.normalize(null);render();markDirty();});
  q('[data-design-reset]').addEventListener('click',()=>{collect();data.design=ClinicDesign.normalize(null);render();markDirty();q('[data-design-message]').textContent='配置・大きさを標準に戻しました。';});
  window.ClinicEditorTheme={render,collect,preview,getDesign:()=>ClinicDesign.normalize(data.design),setDesign:(value,commit=true)=>{
    data.design=ClinicDesign.normalize(value);
    document.querySelectorAll('[data-design-field]').forEach(input=>input.value=String(data.design[input.dataset.designField]));
    if(commit)renderOrder();refresh();if(commit)markDirty();
  }};
})();
