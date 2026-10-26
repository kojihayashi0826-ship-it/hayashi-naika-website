// Dependency-free regression tests for stalled requests and public fallback UI.
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const run = (source, context, tail = '') => new Function(...Object.keys(context), source + '\n' + tail)(...Object.values(context));
class Element {
  constructor() {
    this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; this._text = '';
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
      toggle: (value, on) => on ? classes.add(value) : classes.delete(value)
    };
    this.style = { setProperty() {} };
  }
  get textContent() { return this._text + this.children.map(v => typeof v === 'string' ? v : v.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this._text = ''; this.children = nodes; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(k, callback) { this.events[k] = callback; }
  getBoundingClientRect() { return { top: -200, bottom: -100 }; }
}
function harness({ documents = false, controller = true } = {}) {
  let now = 0, nextId = 1, transport = () => new Promise(() => {});
  const timers = new Map(), nodes = {};
  const add = selector => nodes[selector] = new Element();
  const badge = add('.mobile-clinic-status');
  const label = add('[data-mobile-status-label]'), detail = add('[data-mobile-status-detail]');
  label.textContent = '診療状況'; detail.textContent = 'お電話でご確認ください';
  badge.querySelector = selector => nodes[selector] || null;
  const root = documents ? add('[data-public-documents]') : null;
  if (!documents) {
    for (const s of ['.today-panel', '.today-floating', '#today-date', '#today-label', '#today-detail',
      '#today-reception-current', '#floating-today-label', '#floating-today-detail', '#floating-today-reception-current',
      '[data-reception-heading]', '[data-reception-am]', '[data-reception-pm]']) add(s);
  }
  const document = {
    hidden: false, documentElement: new Element(),
    querySelector: s => nodes[s] || null,
    querySelectorAll: s => s.split(',').map(v => nodes[v.trim()]).filter(Boolean),
    getElementById: id => nodes['#' + id] || null,
    createElement: () => new Element(), addEventListener() {}
  };
  const window = { location: { protocol: 'https:' }, innerHeight: 900, scrollY: 0, addEventListener() {} };
  const context = {
    window, document,
    fetch: (...args) => transport(...args),
    setTimeout: (fn, delay) => { const id = nextId++; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => 0,
    console: { warn() {} },
    AbortController: controller ? class {
      constructor() { this.signal = { aborted: false }; }
      abort() { this.signal.aborted = true; }
    } : undefined,
    ClinicTheme: { normalize: v => v || {} },
    ClinicDesign: { normalize: v => v || {}, apply() {} }
  };
  run(read('clinic-content.js'), context);
  context.ClinicContent = window.ClinicContent;
  const scheduleModule = { exports: {} };
  run(read('clinic-schedule.js'), { module: scheduleModule });
  context.ClinicSchedule = scheduleModule.exports;
  context.ClinicPublicContent = { apply() {} };
  return {
    context, nodes, root, timers, setTransport: fn => { transport = fn; },
    async advance(ms) {
      await flush(); now += ms;
      for (const [id, task] of [...timers]) if (task.at <= now) { timers.delete(id); task.fn(); }
      await flush();
    },
    start() { return run(read(documents ? 'clinic-documents.js' : 'script.js'), context, documents ? '' : 'return { refreshManagedContent, updateTodayStatus };'); }
  };
}
const response = data => ({ ok: true, status: 200, json: async () => data });
const content = () => ({ closures: [], news: [], documents: [] });

module.exports = (async () => {
  for (const controller of [true, false]) {
    // Fetch may never settle, and older browsers may have no AbortController.
    const h = harness({ controller });
    let failed = false, signal;
    h.setTransport((url, options) => { signal = options.signal; return new Promise(() => {}); });
    const pending = h.context.ClinicContent.fetchJSON('test').catch(() => { failed = true; });
    await h.advance(7999); assert(!failed, 'request timed out before deadline');
    await h.advance(1); await pending; assert(failed, 'stalled fetch did not time out');
    if (controller) assert(signal.aborted, 'timed-out request was not aborted');
    assert(h.timers.size === 0, 'timeout timer leaked');

    // Headers can arrive while the response body stalls.
    h.setTransport(() => Promise.resolve({ ok: true, json: () => new Promise(() => {}) }));
    failed = false;
    const body = h.context.ClinicContent.fetchJSON('body').catch(() => { failed = true; });
    await h.advance(8000); await body; assert(failed, 'stalled body did not time out');

    // A later success clears its timer; HTTP and malformed JSON reject promptly.
    h.setTransport(async () => response(content()));
    assert(Array.isArray((await h.context.ClinicContent.fetchJSON('ok')).news), 'successful fetch failed');
    assert(h.timers.size === 0, 'success timer leaked');
    for (const fetcher of [
      async () => ({ ok: false, status: 503 }),
      async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } }),
      () => { throw new Error('network failure'); }
    ]) {
      h.setTransport(fetcher); failed = false;
      await h.context.ClinicContent.fetchJSON('bad').catch(() => { failed = true; });
      assert(failed && h.timers.size === 0, 'failure was not handled');
    }
  }

  // A response arriving after timeout cannot replace the telephone fallback.
  const delayed = harness({ documents: true });
  let resolveRequest;
  delayed.setTransport(() => new Promise(resolve => { resolveRequest = resolve; }));
  delayed.start();
  await delayed.advance(8000);
  assert(delayed.root.textContent.includes('お電話でご確認ください'), 'documents timeout message missing');
  resolveRequest(response(content())); await flush();
  assert(delayed.root.textContent.includes('お電話でご確認ください'), 'late response replaced failure UI');
  assert(delayed.root.children[0].children.some(n => n.href === 'tel:0761246288'), 'telephone link missing');
  assert(delayed.root.getAttribute('aria-busy') === 'false', 'documents stayed busy');
  delayed.setTransport(async () => response(content()));
  await delayed.root.children[1].events.click();
  assert(delayed.root.textContent.includes('現在、掲載中の資料はありません'), 'documents retry did not recover');

  // Documents still show the fallback if a dependency is absent or JSON has the wrong shape.
  for (const missing of [false, true]) {
    const h = harness({ documents: true });
    if (missing) h.context.ClinicContent = undefined;
    h.setTransport(async () => response({}));
    h.start(); await flush();
    assert(h.root.textContent.includes('お電話でご確認ください'), 'documents dependency/data failure left loading text');
  }

  const status = harness();
  const api = status.start();
  assert(status.nodes['[data-mobile-status-detail]'].textContent === '確認中', 'status did not begin loading');
  await status.advance(8000);
  assert(status.nodes['[data-mobile-status-detail]'].textContent === 'お電話でご確認ください', 'mobile status timeout failed');
  assert(status.nodes['#today-label'].textContent.includes('お電話でご確認ください'), 'desktop status timeout failed');
  assert(status.nodes['#floating-today-label'].textContent.includes('お電話でご確認ください'), 'fixed status timeout failed');
  status.setTransport(async () => response(content()));
  await api.refreshManagedContent();
  assert(status.nodes['.mobile-clinic-status'].dataset.state !== 'unknown', 'status did not recover');
  assert(status.nodes['[data-reception-am]'].textContent === '午前 9:00–12:00', 'morning hours incorrect');
  assert(status.nodes['[data-reception-pm]'].textContent === '午後 13:30–18:30', 'afternoon hours incorrect');

  // A rendering dependency failure must also release the guard and permit recovery.
  status.context.ClinicPublicContent.apply = () => { throw new Error('render failed'); };
  status.setTransport(async () => response({ ...content(), news: [{ published: false }] }));
  await api.refreshManagedContent();
  assert(status.nodes['[data-mobile-status-detail]'].textContent.includes('お電話でご確認ください'), 'render failure left stale status');
  status.context.ClinicPublicContent.apply = () => {};
  await api.refreshManagedContent();
  assert(status.nodes['.mobile-clinic-status'].dataset.state !== 'unknown', 'render failure blocked retry');

  // With all scripts blocked, the source HTML itself must be useful.
  for (const name of ['index.html', 'care.html', 'tests.html', 'doctor.html', 'first-visit.html', 'vaccines.html', 'checkups.html']) {
    const html = read(name);
    assert(!html.includes('data-mobile-status-detail>確認中'), name + ': static loading placeholder');
    assert(html.includes('data-mobile-status-detail>お電話でご確認ください'), name + ': no static fallback');
  }
  const docs = read('clinic-documents.html');
  assert(!docs.includes('資料を読み込んでいます'), 'static documents loading placeholder');
  assert(docs.includes('資料についてはお電話でご確認ください'), 'no static documents fallback');
  console.log('PASS request timeouts, body stalls, old browsers, HTTP/JSON errors, late responses, retry recovery, status fallbacks and no-JS HTML');
})().catch(error => { console.error(error); process.exitCode = 1; throw error; });
