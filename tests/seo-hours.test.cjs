const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {setup, load, sleep} = require('./content.test.cjs');
const S = require('../clinic-schedule.js');
const live = JSON.parse(load('data/site-updates.json'));
const holiday = live.closures.find(c => c.id === 'closure-year-end-2026');
function clinic(html) {
  const d = new JSDOM(html);
  try {
    return [...d.window.document.querySelectorAll('script[type="application/ld+json"]')]
      .flatMap(s => JSON.parse(s.textContent)['@graph'] || [])
      .find(n => n['@type'] === 'MedicalClinic');
  } finally { d.window.close(); }
}
async function run() {
  assert.deepEqual(S.specialHours([holiday]), [
    {'@type':'OpeningHoursSpecification', validFrom:'2026-12-30', validThrough:'2026-12-30', opens:'09:00', closes:'12:00'},
    {'@type':'OpeningHoursSpecification', validFrom:'2026-12-31', validThrough:'2027-01-03', opens:'00:00', closes:'00:00'}
  ]);
  const overlap = {start:'2026-12-30', end:'2026-12-30', period:'am'};
  assert.equal(S.specialHours([holiday, overlap]).length, 1);
  assert.equal(S.specialHours([holiday, overlap])[0].opens, '00:00');
  assert.deepEqual(S.specialHours([{...holiday, published:false}]), []);
  const am = {...overlap, start:'2026-12-29', end:'2026-12-29'};
  assert.equal(S.specialHours([am])[0].opens, '13:30');
  assert.equal(S.specialHours([am])[0].closes, '18:30');
  const html = load('index.html');
  assert.deepEqual(clinic(html).specialOpeningHoursSpecification, S.specialHours(live.closures));
  assert.equal(clinic(S.updateStructuredHoursHTML(html, [])).specialOpeningHoursSpecification, undefined);
  assert.throws(() => S.updateStructuredHoursHTML('<html></html>', []));
  const page = setup('site-editor.html', {source:live});
  const w = page.w;
  try {
    await w.editorReady;
    w.document.querySelector('[data-token]').value = 'github_pat_TESTONLY';
    w.document.querySelector('[data-connect]').click();
    await sleep(20);
    assert.equal(w.ClinicPublisher.isConnected(), true);
    const edited = w.qa.get();
    edited.closures = [am];
    edited.faqs[0].answer += ' 変更確認。';
    w.qa.set(edited); w.qa.mark();
    await w.ClinicPublisher.publish();
    assert.equal(w.qa.dirty(), false);
    assert.deepEqual(page.getTree().map(e=>e.path).sort(), ['data/site-updates.json','index.html']);
    assert.deepEqual(clinic(page.getRemoteHTML()).specialOpeningHoursSpecification, S.specialHours([am]));
    assert.match(page.getRemoteHTML(), /変更確認。/);
    const cleared = w.qa.get(); cleared.closures = [];
    w.qa.set(cleared); w.qa.mark();
    await w.ClinicPublisher.publish();
    assert.equal(w.qa.dirty(), false);
    assert.equal(clinic(page.getRemoteHTML()).specialOpeningHoursSpecification, undefined);
    await sleep(80); // Let the publisher finish its in-flight public verification before teardown.
    assert.deepEqual(page.errors, []);
  } finally { page.dom.window.close(); }
  const doc = new JSDOM(html);
  S.syncStructuredHours(doc.window.document, [am]);
  assert.deepEqual(clinic(doc.serialize()).specialOpeningHoursSpecification, S.specialHours([am]));
  S.syncStructuredHours(doc.window.document, []);
  assert.equal(clinic(doc.serialize()).specialOpeningHoursSpecification, undefined);
  doc.window.close();
  // Dedicated page metadata, breadcrumbs and static entry links must survive without JS.
  const p = new JSDOM(load('endoscopy.html')), d = p.window.document;
  assert.equal(d.querySelectorAll('h1').length, 1);
  assert.equal(d.querySelector('meta[property="og:title"]').content, d.title);
  assert.equal(d.querySelector('link[rel="canonical"]').href, 'https://www.hayashinaika.clinic/endoscopy.html');
  const graph = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
  assert.equal(graph.find(n=>n['@type']==='WebPage').name, d.title);
  assert.deepEqual(graph.find(n=>n['@type']==='BreadcrumbList').itemListElement.map(n=>n.name), ['ホーム','検査案内','胃カメラ・大腸カメラ']);
  for (const a of d.querySelectorAll('a[href^="#"]')) assert.ok(d.querySelector(a.getAttribute('href')), a.href);
  p.window.close();
  for (const name of ['index.html','tests.html']) assert.match(load(name), /href="endoscopy.html"/);
  assert.match(load('sitemap.xml'), /https:\/\/www.hayashinaika.clinic\/endoscopy.html/);
  console.log('PASS SEO hours: half days, overlap, withdrawal, static/runtime parity, atomic FAQ + closure publishing, dedicated page links/metadata');
}
run().catch(error => {console.error(error); process.exitCode=1;});
