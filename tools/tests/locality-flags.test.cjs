'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const match=source.match(/const LOCALITY_FLAG_TITLES=Object\.freeze\((\{[\s\S]*?\})\);/);
if(!match)throw Error('Locality flag mapping is missing from index.html');
const context=vm.createContext({normaliseLocality:v=>v,htmlSafe:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
vm.runInContext(match[0],context);
for(const name of ['localityFlagFileName','localityInitials','localityPlaceholderUri','localityFlagHTML']){
  const start=source.indexOf('function '+name+'(');vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
}
const flags=vm.runInContext('LOCALITY_FLAG_TITLES',context);
test('all 68 Malta and Gozo councils have flag mappings and cached local assets match their council',()=>{
  assert.equal(Object.keys(flags).length,68);assert.equal(flags.Kalkara,'Flag of Kalkara (2009-).svg');
  assert.equal(flags['Żebbuġ (Malta)'],'Flag of Zebbug, Malta.svg');assert.equal(flags['Żebbuġ (Gozo)'],'Flag of Żebbuġ, Gozo.svg');assert.equal(flags.Paola,'Flag of Paola, Malta.svg');
  const folder=path.join(__dirname,'../../assets/locality-flags');
  const mappedFiles=new Set(Object.keys(flags).map(name=>context.localityFlagFileName(name)));
  for(const file of fs.readdirSync(folder).filter(file=>file.endsWith('.svg'))){
    assert.ok(mappedFiles.has(file),file);assert.match(fs.readFileSync(path.join(folder,file),'utf8'),/<svg\b/);
  }
  for(const file of ['paola.svg','kalkara.svg'])assert.ok(fs.existsSync(path.join(folder,file)),file);
});
test('flag links to its source and falls back from local file to Commons to a stable initials marker',()=>{
  const dom=new JSDOM(context.localityFlagHTML('Paola'),{runScripts:'dangerously',url:'https://clinic.test/'});
  const link=dom.window.document.querySelector('a'),img=link.querySelector('img');
  assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener');assert.match(link.href,/wiki\/File:Flag_of_Paola/);assert.match(img.src,/assets\/locality-flags\/paola.svg$/);
  img.dispatchEvent(new dom.window.Event('error'));assert.match(img.src,/Special:FilePath/);assert.equal(img.hasAttribute('data-fallback'),false);
  img.dispatchEvent(new dom.window.Event('error'));assert.match(img.src,/^data:image\/svg\+xml,/);assert.equal(img.hasAttribute('data-ph'),false);
  const marker=img.src;img.dispatchEvent(new dom.window.Event('error'));assert.equal(img.src,marker);dom.window.close();
});
test('an unmapped locality has an escaped initials marker and an empty locality renders nothing',()=>{
  assert.equal(context.localityFlagHTML(''),'');const html=context.localityFlagHTML('<Unknown>');assert.doesNotMatch(html,/<Unknown>/);assert.match(html,/data:image\/svg\+xml,/);
});
