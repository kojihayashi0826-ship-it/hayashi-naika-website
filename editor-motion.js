/* Text motion uses the same settings in the sample, page preview and publication. */
(() => {
  'use strict';
  const q=s=>document.querySelector(s),panel=q('[data-motion-settings]'),sample=q('[data-motion-sample]');
  const dialog=q('[data-motion-dialog]'),frame=q('[data-motion-frame]'),wrap=q('[data-motion-frame-wrap]');
  const api=()=>window.ClinicEditorTheme;
  let replayId=0,previewWidth='desktop';
  const seconds=n=>(n/1000).toFixed(2).replace(/0$/,'')+'秒';
  function sendPreview(){
    if(frame.getAttribute('src'))frame.contentWindow?.postMessage({type:'clinic-design-preview',theme:ClinicTheme.normalize(data.theme),design:api().getDesign()},location.origin);
  }
  function replay(){
    cancelAnimationFrame(replayId);
    sample.classList.add('is-restarting');sample.classList.remove('is-playing');
    void sample.offsetWidth;
    replayId=requestAnimationFrame(()=>{sample.classList.remove('is-restarting');sample.classList.add('is-playing');});
  }
  function render(){
    const motion=api().getDesign().motion;
    panel.querySelectorAll('[data-motion-field]').forEach(input=>{
      const value=motion[input.dataset.motionField];
      if(input.type==='checkbox')input.checked=value;else input.value=String(value);
      input.disabled=input.dataset.motionField!=='enabled' && !motion.enabled;
    });
    ['duration','distance','stagger'].forEach(key=>q(`[data-motion-output="${key}"]`).textContent=key==='distance'?motion[key]+'px':seconds(motion[key]));
    ClinicDesign.applyMotion(motion,sample);
    q('[data-motion-summary]').textContent=motion.enabled?`${seconds(motion.duration)}で表示・${{left:'左から',right:'右から',bottom:'下から',fade:'移動せずフェード'}[motion.direction]}・${motion.repeat?'画面に戻るたびに再生':'最初の1回だけ再生'}`:'文字アニメーションはOFFです。文字は最初から表示されます。';
    replay();sendPreview();
  }
  panel.addEventListener('input',event=>{
    const input=event.target.closest('[data-motion-field]');if(!input)return;
    const design=api().getDesign(),key=input.dataset.motionField;
    design.motion[key]=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;
    api().setDesign(design);
  });
  q('[data-motion-reset]').addEventListener('click',()=>api().setDesign({...api().getDesign(),motion:ClinicDesign.motionDefaults}));
  q('[data-motion-replay]').addEventListener('click',replay);
  window.addEventListener('clinic-editor-design-change',render);
  q('[data-tab="design"]').addEventListener('click',replay);
  function fit(){
    if(!dialog.open || !wrap.clientWidth)return;
    const width=previewWidth==='mobile'?390:1120,scale=Math.min(1,wrap.clientWidth/width);
    frame.style.width=width+'px';frame.style.height=wrap.clientHeight/scale+'px';frame.style.transform=`scale(${scale})`;
    frame.style.marginLeft=Math.max(0,(wrap.clientWidth-width*scale)/2)+'px';
  }
  q('[data-motion-open]').addEventListener('click',()=>{
    dialog.showModal();fit();
    // A fresh page starts at the top and replays once-only settings as well.
    frame.src='index.html?motion-preview=1';
  });
  q('[data-motion-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>frame.removeAttribute('src'));
  document.querySelectorAll('[data-motion-width]').forEach(button=>button.addEventListener('click',()=>{
    previewWidth=button.dataset.motionWidth;
    document.querySelectorAll('[data-motion-width]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    fit();
  }));
  frame.addEventListener('load',sendPreview);
  window.addEventListener('message',event=>{
    if(event.source===frame.contentWindow && event.origin===location.origin && event.data?.type==='clinic-design-ready')sendPreview();
  });
  if(window.ResizeObserver)new ResizeObserver(fit).observe(wrap);
  window.addEventListener('resize',fit);
})();
