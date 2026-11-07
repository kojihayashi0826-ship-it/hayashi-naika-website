#!/usr/bin/env node
'use strict';
// Build-time only. Public HTML remains ordinary static GitHub Pages content.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {JSDOM} = require('jsdom');
const ORIGIN = 'https://asset-audit.invalid';
const EXCLUDED = new Set(['node_modules', 'tests', 'tools', 'dist', 'coverage']);
// This is the one runtime-injected CSS reference in the current application.
// Register future dynamic JS/CSS dependencies here; HTML references are discovered.
const DYNAMIC = [{source: 'editor-canvas.js', target: 'editor-canvas.css'}];
const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
function htmlFiles(root, directory = root) {
  return fs.readdirSync(directory, {withFileTypes: true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.name.startsWith('.') || EXCLUDED.has(entry.name)) return [];
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error('Symlinks are not supported: ' + full);
    return entry.isDirectory() ? htmlFiles(root, full) : /\.html?$/i.test(entry.name) ? [path.relative(root, full).split(path.sep).join('/')] : [];
  });
}
function replaceVersion(url, version) {
  const [beforeFragment, ...fragment] = url.split('#');
  const index = beforeFragment.indexOf('?');
  const pathname = index < 0 ? beforeFragment : beforeFragment.slice(0, index);
  const params = new URLSearchParams(index < 0 ? '' : beforeFragment.slice(index + 1));
  params.set('v', version);
  return pathname + '?' + params.toString() + (fragment.length ? '#' + fragment.join('#') : '');
}
function audit(root) {
  root = path.resolve(root);
  const changes = new Map(), references = [], errors = [], cache = new Map();
  function bytes(file) {
    if (changes.has(file)) return Buffer.from(changes.get(file));
    if (!cache.has(file)) cache.set(file, fs.readFileSync(path.join(root, file)));
    return cache.get(file);
  }
  // Update children before hashing their parent scripts. The current graph has one edge.
  for (const {source, target} of DYNAMIC) {
    if (!fs.existsSync(path.join(root, source))) continue;
    try {
      const sourceText = bytes(source).toString('utf8');
      const pattern = /\bcss\.href\s*=\s*(['"])(editor-canvas\.css(?:\?[^'"\r\n]*)?)\1/g;
      const matches = [...sourceText.matchAll(pattern)];
      if (matches.length !== 1) throw Error(source + ': expected exactly one registered dynamic CSS reference');
      const match = matches[0], current = match[2], expected = replaceVersion(current, hash(bytes(target)));
      references.push({page: source, asset: target, current, expected, dynamic: true});
      if (current !== expected) {
        const start = match.index + match[0].indexOf(current);
        changes.set(source, sourceText.slice(0, start) + expected + sourceText.slice(start + current.length));
      }
    } catch (error) { errors.push(error.message); }
  }
  const pages = htmlFiles(root);
  for (const page of pages) {
    const html = bytes(page).toString('utf8');
    const dom = new JSDOM(html, {includeNodeLocations: true});
    const edits = [];
    try {
      if (dom.window.document.querySelector('base[href]')) throw Error(page + ': base[href] needs explicit support before versioning');
      for (const element of dom.window.document.querySelectorAll('script[src], link[href]')) {
        const rel = (element.getAttribute('rel') || '').toLowerCase().split(/\s+/);
        const as = (element.getAttribute('as') || '').toLowerCase();
        if (element.localName === 'link' && !rel.includes('stylesheet') && !rel.includes('modulepreload') && !(rel.includes('preload') && ['script','style'].includes(as))) continue;
        const attribute = element.localName === 'script' ? 'src' : 'href';
        const current = element.getAttribute(attribute);
        const url = new URL(current, ORIGIN + '/' + page);
        if (url.origin !== ORIGIN) continue;
        const asset = decodeURIComponent(url.pathname.slice(1));
        const absolute = path.resolve(root, asset);
        if (!absolute.startsWith(root + path.sep)) throw Error(page + ': asset escapes repository: ' + current);
        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw Error(page + ': missing local asset: ' + current);
        const expected = replaceVersion(current, hash(bytes(asset)));
        references.push({page, asset, current, expected, dynamic: false});
        if (current === expected) continue;
        const location = dom.nodeLocation(element)?.attrs?.[attribute];
        if (!location) throw Error(page + ': cannot safely locate ' + attribute);
        const original = html.slice(location.startOffset, location.endOffset);
        const match = original.match(/^([^\s=]+\s*=\s*)(?:"[\s\S]*"|'[\s\S]*'|[^\s]+)$/);
        if (!match) throw Error(page + ': unsupported attribute: ' + original);
        const quote = original.slice(match[1].length, match[1].length + 1) === "'" ? "'" : '"';
        const escaped = expected.replace(/&/g, '&amp;').replace(quote === '"' ? /"/g : /'/g, quote === '"' ? '&quot;' : '&#39;');
        edits.push({start: location.startOffset, end: location.endOffset, text: match[1] + quote + escaped + quote});
      }
      let updated = html;
      for (const edit of edits.sort((a,b)=>b.start-a.start)) updated = updated.slice(0,edit.start) + edit.text + updated.slice(edit.end);
      if (updated !== html) changes.set(page, updated);
    } catch (error) { errors.push(error.message); }
    finally { dom.window.close(); }
  }
  return {pages, references, errors, changes};
}
function synchronize(root, write = false) {
  const result = audit(root);
  // Never partially rewrite when a dependency is missing or unsupported.
  if (write && !result.errors.length) for (const [file, content] of result.changes) fs.writeFileSync(path.join(root, file), content);
  return result;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--check','--write'].includes(arg)) || (args.includes('--check') && args.includes('--write'))) {
    console.error('Usage: node tools/asset-versions.cjs [--check|--write]'); process.exit(2);
  }
  const root = path.resolve(__dirname, '..'), write = args.includes('--write');
  const result = synchronize(root, write);
  for (const error of result.errors) console.error(error);
  if (!write) for (const ref of result.references.filter(ref=>ref.current!==ref.expected)) console.error(`${ref.page}: ${ref.current} -> ${ref.expected}`);
  console.log(`${result.pages.length} HTML pages, ${result.references.length} references, ${result.changes.size} files ${write ? 'updated' : 'needing update'}, ${result.errors.length} errors`);
  process.exitCode = result.errors.length || (!write && result.changes.size) ? 1 : 0;
}
module.exports = {audit, synchronize, replaceVersion, hash};
