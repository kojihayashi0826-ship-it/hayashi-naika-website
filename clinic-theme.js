/* Shared color model: presets and custom accents always retain readable text. */
(() => {
  'use strict';
  const presets = Object.freeze({
    mint: { label: 'ホワイト × ミント', accent: '#8fc9aa', tint: 25 },
    sky: { label: 'ホワイト × ブルー', accent: '#91bfd9', tint: 25 },
    peach: { label: 'ホワイト × ベージュ', accent: '#d4b58d', tint: 30 },
    sage: { label: 'ホワイト × セージ', accent: '#9fb5a2', tint: 40 }
  });
  function normalize(value) {
    const input = value && typeof value === 'object' ? value : {};
    const preset = Object.hasOwn(presets, input.preset) ? input.preset : 'mint';
    const fallback = presets[preset];
    return { preset,
      accent: /^#[0-9a-f]{6}$/i.test(input.accent) ? input.accent.toLowerCase() : fallback.accent,
      tint: typeof input.tint === 'number' && Number.isFinite(input.tint) ? Math.round(Math.min(100, Math.max(0, input.tint))) : fallback.tint
    };
  }
  const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i, i + 2), 16));
  function mix(a, b, amount) {
    const left = rgb(a), right = rgb(b);
    return '#' + left.map((v,i) => Math.round(v + (right[i] - v) * amount).toString(16).padStart(2,'0')).join('');
  }
  function luminance(color) {
    const c = rgb(color).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  }
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x,y) + .05) / (Math.min(x,y) + .05); }
  function colors(value) {
    const theme = normalize(value), white = '#ffffff';
    const surface = mix(white, theme.accent, theme.tint * .0012);
    const pale = mix(white, theme.accent, .12 + theme.tint * .001);
    const button = mix(white, theme.accent, .42);
    const hover = mix(white, theme.accent, .54);
    let link = theme.accent;
    // Text on the strongest tint must meet 4.5:1, even for yellow or white accents.
    while ([white,surface,pale,button,hover].some(bg => contrast(link,bg) < 4.5)) link = mix(link, '#000000', .08);
    const heading = mix(link, '#000000', .15);
    return {
      '--theme-accent': theme.accent, '--theme-surface': surface, '--theme-pale': pale,
      '--theme-button': button, '--theme-button-hover': hover, '--theme-link': link,
      '--theme-heading': heading, '--theme-border': mix(white, theme.accent, .32),
      '--green': link, '--green-dark': heading, '--green-light': pale, '--sage': link,
      '--cream': surface, '--beige': surface, '--paper': white,
      '--ink': '#293b34', '--text': '#293b34', '--muted': '#52645b',
      '--line': mix(white, theme.accent, .32), '--shadow': '0 8px 26px rgba(40,65,52,.045)'
    };
  }
  function apply(value, root = document.documentElement) {
    Object.entries(colors(value)).forEach(([key,color]) => root.style.setProperty(key,color));
    if (root === document.documentElement) document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#ffffff');
  }
  window.ClinicTheme = Object.freeze({presets,normalize,colors,contrast,apply});
})();
