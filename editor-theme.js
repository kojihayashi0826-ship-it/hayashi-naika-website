/* The editor shares the public color model; changes stay in the draft until published. */
(() => {
  'use strict';
  const q = selector => document.querySelector(selector);
  const root = q('[data-theme-presets]'), accent = q('[data-theme-accent]'), tint = q('[data-theme-tint]');
  function preview(host, theme) {
    ClinicTheme.apply(theme,host);
    host.replaceChildren();
    const header = document.createElement('div'); header.className = 'theme-sample-header'; header.textContent = '林内科医院';
    const notice = document.createElement('div'); notice.className = 'theme-sample-notice'; notice.textContent = '重要なお知らせ';
    const main = document.createElement('div'); main.className = 'theme-sample-main';
    const h = document.createElement('h3'); h.textContent = '地域に寄り添う、かかりつけ医。';
    const p = document.createElement('p'); p.textContent = '白を基調に、見出しやボタンへやさしく色を添えます。';
    const button = document.createElement('span'); button.className = 'theme-sample-button'; button.textContent = '初診の方はこちら →';
    main.append(h,p,button);
    const cards = document.createElement('div'); cards.className = 'theme-sample-cards';
    ['診療案内','予防接種'].forEach(text => { const card = document.createElement('span'); card.textContent = text; cards.append(card); });
    host.append(header,notice,main,cards);
  }
  function refresh() {
    const theme = ClinicTheme.normalize(data.theme);
    root.querySelectorAll('[data-theme-preset]').forEach(button => {
      const preset = ClinicTheme.normalize({preset:button.dataset.themePreset});
      const selected = theme.preset === preset.preset && theme.accent === preset.accent && theme.tint === preset.tint;
      button.setAttribute('aria-pressed',String(selected));
    });
    q('[data-theme-accent-value]').textContent = theme.accent.toUpperCase();
    q('[data-theme-tint-value]').textContent = `${theme.tint}%`;
    q('[data-theme-summary]').textContent = `現在の配色：${theme.accent === ClinicTheme.presets[theme.preset].accent && theme.tint === ClinicTheme.presets[theme.preset].tint ? ClinicTheme.presets[theme.preset].label : 'カスタム'}`;
    preview(q('[data-theme-preview]'),theme);
  }
  function render() {
    data.theme = ClinicTheme.normalize(data.theme);
    accent.value = data.theme.accent; tint.value = String(data.theme.tint); refresh();
  }
  function collect() {
    data.theme = ClinicTheme.normalize({...data.theme,accent:accent.value,tint:Number(tint.value)});
  }
  Object.entries(ClinicTheme.presets).forEach(([key,preset]) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'theme-preset'; button.dataset.themePreset = key;
    ClinicTheme.apply({preset:key},button);
    const swatch = document.createElement('span'); swatch.className = 'theme-swatch'; swatch.setAttribute('aria-hidden','true');
    const title = document.createElement('strong'); title.textContent = preset.label;
    const hint = document.createElement('small'); hint.textContent = key === 'mint' ? 'おすすめ・明るい緑' : key === 'sky' ? 'さわやかな青' : key === 'peach' ? 'あたたかい雰囲気' : '穏やかな灰緑';
    button.append(swatch,title,hint);
    button.addEventListener('click',() => { data.theme = ClinicTheme.normalize({preset:key});render();markDirty(); });
    root.append(button);
  });
  [accent,tint].forEach(input => input.addEventListener('input',() => {collect();refresh();markDirty();}));
  q('[data-theme-reset]').addEventListener('click',() => {data.theme = ClinicTheme.normalize(null);render();markDirty();});
  window.ClinicEditorTheme = {render,collect,preview};
})();
