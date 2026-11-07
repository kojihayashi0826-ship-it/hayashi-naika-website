'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {audit, synchronize, hash} = require('../tools/asset-versions.cjs');
function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-assets-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
    fs.writeFileSync(path.join(root,file),text);
  }
  return root;
}
test('all repository HTML and dynamic CSS references match current file bytes',()=>{
  const result = audit(path.resolve(__dirname,'..'));
  assert.deepEqual(result.errors,[]);
  assert.equal(result.changes.size,0,[...result.changes.keys()].join(', '));
  assert.ok(result.pages.includes('site-editor.html'));
  assert.ok(result.pages.includes('digikar-lab-panel-privacy/index.html'));
  assert.ok(result.references.some(ref=>ref.dynamic));
});
test('detects missing and inconsistent versions in nested and newly added HTML',t=>{
  const root=fixture(t,{'a.js':'console.log(1);','main.css':'body{}','index.html':'<script defer src="a.js?v=old"></script>', 'nested/page.html':"<script src='../a.js'></script><link rel=stylesheet href=/main.css>"});
  assert.equal(audit(root).changes.size,2);
  synchronize(root,true);
  assert.equal(audit(root).changes.size,0);
  fs.writeFileSync(path.join(root,'new.html'),'<script src="./a.js?v=forgotten"></script>');
  assert.ok(audit(root).changes.has('new.html'));
});
test('detects content changes even when all pages use the same stale version',t=>{
  const root=fixture(t,{'a.js':'one','a.html':'<script src="a.js"></script>','b.html':'<script src="a.js"></script>'});
  synchronize(root,true);
  fs.writeFileSync(path.join(root,'a.js'),'two');
  const result=audit(root);
  assert.equal(result.changes.size,2);
  assert.ok(result.references.every(ref=>ref.expected.endsWith('v='+hash(Buffer.from('two')))));
});
test('check is read-only; sync preserves surrounding HTML, order, defer, queries and fragments',t=>{
  const initial='<!doctype html>\r\n<script defer src="a.js?mode=x&amp;v=old#part"></script>\r\n<link rel="stylesheet" href="a.css?v=old">\r\n';
  const root=fixture(t,{'a.js':'one','a.css':'body{}','index.html':initial});
  synchronize(root,false);
  assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),initial);
  synchronize(root,true);
  assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),initial.replace('v=old#part','v='+hash(Buffer.from('one'))+'#part').replace('a.css?v=old','a.css?v='+hash(Buffer.from('body{}'))));
  assert.equal(synchronize(root,true).changes.size,0);
});
test('missing local dependency aborts all writes',t=>{
  const initial='<script src="a.js?v=old"></script><link rel="stylesheet" href="missing.css">';
  const root=fixture(t,{'a.js':'one','index.html':initial});
  const result=synchronize(root,true);
  assert.equal(result.errors.length,1);
  assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),initial);
});
test('ignores external URLs, inline scripts, comments and template-like strings in scripts',t=>{
  const initial='<link rel="stylesheet" href="https://fonts.example/style.css"><script src="//cdn.example/a.js"></script><!-- <script src="missing.js"></script> --><script>const text=`<script src="missing.js">`;</script>';
  const root=fixture(t,{'index.html':initial});
  const result=synchronize(root,true);
  assert.deepEqual(result.errors,[]);assert.equal(result.references.length,0);
  assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),initial);
});
test('preload and actual load share a hash; duplicate v values normalize',t=>{
  const root=fixture(t,{'a.js':'one','index.html':'<link rel="preload" as="script" href="a.js?v=x&v=y"><script src="a.js?v=z"></script>'});
  synchronize(root,true);
  const result=audit(root);
  assert.equal(result.changes.size,0);assert.equal(result.references.length,2);
  assert.equal(result.references[0].current,result.references[1].current);
});
test('dynamic canvas CSS updates parent JS hash and editor HTML together',t=>{
  const root=fixture(t,{'editor-canvas.css':'one','editor-canvas.js':"css.href='editor-canvas.css?v=old';",'site-editor.html':'<link rel="stylesheet" href="editor-canvas.css"><script defer src="editor-canvas.js"></script>'});
  synchronize(root,true);
  fs.writeFileSync(path.join(root,'editor-canvas.css'),'two');
  assert.deepEqual([...audit(root).changes.keys()].sort(),['editor-canvas.js','site-editor.html']);
  synchronize(root,true);
  const result=audit(root);assert.equal(result.changes.size,0);
  const js=fs.readFileSync(path.join(root,'editor-canvas.js'));
  assert.ok(result.references.some(ref=>ref.asset==='editor-canvas.js' && ref.current.endsWith('v='+hash(js))));
});
test('changed dynamic loader and base URLs fail explicitly rather than silently skip',t=>{
  const root=fixture(t,{'editor-canvas.css':'one','editor-canvas.js':"css.href=dynamicURL;",'index.html':'<base href="/other/"><script src="a.js"></script>'});
  assert.equal(audit(root).errors.length,2);
});
