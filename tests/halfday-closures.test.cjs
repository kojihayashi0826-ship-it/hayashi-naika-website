const assert = require('node:assert/strict');
const {setup,load,sleep} = require('./content.test.cjs');
const S = require('../clinic-schedule.js');
const live = JSON.parse(load('data/site-updates.json'));
const holiday = {id:'test-year-end',season:'yearEnd',start:'2026-12-30',end:'2027-01-03',startSession:'pm',endSession:'pm',period:'all',label:'年末年始休診',published:true,announce:true,noticeDate:'2026-11-07',body:'1月4日（月）より通常どおり診療いたします。'};
live.closures = [holiday];

async function run() {
  const state = key => S.dayState(key, [holiday]);
  assert.equal(state('2026-12-29').status, '診療日');
  assert.equal(state('2026-12-30').status, '午後休診');
  assert.deepEqual(state('2026-12-30').sessions, [['09:00','12:00']]);
  for (const key of ['2026-12-31','2027-01-01','2027-01-02','2027-01-03']) assert.equal(state(key).closed, true, key);
  assert.equal(state('2027-01-04').status, '診療日');
  assert.deepEqual(S.nextOpening(new Date('2026-12-30T12:00:00+09:00'),[holiday]), {key:'2027-01-04',time:'09:00'});
  const news=S.closureNews([holiday])[0];
  assert.equal(news.title,'年末年始の診療日程について');
  assert.match(news.body,/2026年12月30日（水）午後から2027年1月3日（日）まで/);
  assert.match(news.body,/午前は通常どおり診療.*12:00まで/);
  assert.match(news.body,/1月4日（月）より通常どおり/);

  for (const [startSession,endSession,status] of [['am','am','午前休診'],['pm','pm','午後休診'],['am','pm','終日休診']]) {
    const c={...holiday,start:'2026-12-30',end:'2026-12-30',startSession,endSession,body:''};
    assert.equal(S.dayState(c.start,[c]).status,status);
    assert.match(S.closureNews([c])[0].body,new RegExp(status));
  }
  const invalid={...holiday,end:holiday.start,startSession:'pm',endSession:'am'};
  assert.equal(S.validSessionRange(invalid),false);
  assert.equal(S.active([invalid]).length,0);
  const endedAM={...holiday,end:'2027-01-04',endSession:'am'};
  assert.deepEqual(S.dayState(endedAM.end,[endedAM]).sessions,[['13:30','18:30']]);
  assert.match(S.closureNews([endedAM])[0].body,/1月4日（月）午前まで/);
  const overlap={start:holiday.start,period:'am'};
  assert.equal(S.dayState(holiday.start,[holiday,overlap]).closed,true);
  assert.equal(S.dayState(holiday.start,[{...holiday,published:false}]).partial,false);
  for(const period of ['am','pm']) {
    const old={season:'yearEnd',start:'2026-12-28',end:'2026-12-30',period};
    for(const day of ['28','29','30']) assert.equal(S.dayState('2026-12-'+day,[old]).status,S.periods[period]);
    assert.match(S.closureNews([old])[0].body,new RegExp(S.periods[period]));
  }

  const editor=setup('site-editor.html',{source:{...live,closures:[]}}), w=editor.w;
  await w.editorReady;
  const q=s=>w.document.querySelector(s);
  const set=(key,value)=>{const el=q(`[data-closure-field="${key}"]`);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  q('[data-add-season="yearEnd"]').click();
  set('start','2026-12-30'); set('end','2027-01-03'); set('startSession','pm');
  const saved=w.qa.prepare();
  assert.equal(saved.closures[0].startSession,'pm');
  assert.equal(saved.closures[0].endSession,'pm');
  assert.equal(w.qa.validate().length,0);
  assert.match(q('[data-closure-notice-preview]').textContent,/午後から/);
  const cell=q('[data-editor-calendar] [data-date="2026-12-30"]');
  assert.equal(cell.querySelector('.day-status').textContent,'午後休診');
  assert.ok(cell.classList.contains('is-pm-closed'));
  assert.ok(!cell.classList.contains('is-closed'));
  assert.match(cell.getAttribute('aria-label'),/午後休診/);
  w.qa.set(saved); assert.equal(q('[data-closure-field="startSession"]').value,'pm');
  const publication=w.ClinicEditorContent.publication(w.qa.prepare()).data;
  assert.equal(publication.closures[0].startSession,'pm');
  assert.equal(publication.closures[0].endSession,'pm');
  set('end','2026-12-30');set('endSession','am');
  assert.ok(w.qa.validate().some(x=>x.includes('終了時間帯')));
  set('startSession','am');assert.equal(w.qa.validate().length,0);
  assert.equal(q('[data-date="2026-12-30"] .day-status').textContent,'午前休診');
  assert.ok(q('[data-date="2026-12-30"]').classList.contains('is-am-closed'));
  for (const period of ['am','pm']) {
    w.qa.set({...live,closures:[{...holiday,startSession:undefined,endSession:undefined,period}]});
    assert.equal(w.qa.prepare().closures[0].period,period,'Preserve legacy seasonal half days on edit/save');
    assert.equal(w.qa.prepare().closures[0].startSession,undefined);
  }
  q('[data-add-season="obon"]').click();
  assert.ok(w.document.querySelector('.closure-row:last-child [data-closure-field="startSession"]'));
  await sleep(650);assert.equal(editor.errors.length,0); editor.dom.window.close();

  for(const mobile of [false,true]) {
    const page=setup('index.html',{source:live,mobile}),pw=page.w;
    await sleep(40);
    const RealDate=pw.Date;let instant='2026-12-30T09:00:00+09:00';
    pw.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[instant]));}static now(){return new RealDate(instant).getTime();}};
    pw.applyManagedContent(live);
    assert.match(pw.document.querySelector('#today-label').textContent,/診療中.*午後休診/);
    assert.equal(pw.document.querySelector('[data-reception-pm]').textContent,'午後 休診');
    instant='2026-12-30T12:00:00+09:00';pw.applyManagedContent(live);
    assert.match(pw.document.querySelector('#today-detail').textContent,/1月4日（月） 09:00/);
    assert.match(pw.document.querySelector('.mobile-clinic-status').textContent,/1\/4|1月4/);
    assert.equal(page.errors.length,0);page.dom.window.close();
  }
  console.log('PASS half-day closures: endpoints, year boundary, single days, legacy entries, overlap, validation, editor reload/publication, accessible calendar, desktop/mobile today status');
}
run().catch(e=>{console.error(e);process.exit(1);});
