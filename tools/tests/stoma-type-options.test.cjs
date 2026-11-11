// Generic "Colostomy" / "Ileostomy" are not offered or kept as a stoma type —
// editing a stoma that holds one forces a specific type to be chosen.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function fn(name){const m=html.match(new RegExp('function '+name+'\\('));assert(m,name);const s=m.index;return html.slice(s,html.indexOf('\n}',s)+2);}
function constBlock(name){const i=html.indexOf('const '+name+'=');assert(i>=0,name);return html.slice(i,html.indexOf('];',i)+2);}
function ctx(){
  const c=vm.createContext({htmlSafe:s=>String(s??'')});
  vm.runInContext(constBlock('STOMA_TYPE_OPTIONS'),c);
  ['stomaTypeKey','isGenericStomaUmbrella','stomaTypeOptions','initialStomaTypeOptions'].forEach(n=>vm.runInContext(fn(n),c));
  return c;
}

test('generic Colostomy / Ileostomy are not kept or offered in the stoma type dropdown',()=>{
  const c=ctx();
  const col=c.stomaTypeOptions('Colostomy');
  assert.doesNotMatch(col,/\(as recorded\)/);
  assert.doesNotMatch(col,/selected/,'a bare "Colostomy" must not be a kept/selected value');
  assert.match(col,/End colostomy/,'specific options are still offered');
  assert.doesNotMatch(c.stomaTypeOptions('Ileostomy'),/selected/);
  // A specific stored type still selects its own option.
  assert.match(c.stomaTypeOptions('End colostomy'),/selected>End colostomy/);
  // A genuine free-text type is still preserved so nothing is lost.
  assert.match(c.stomaTypeOptions('Appendicostomy'),/value="Appendicostomy" selected/);
});

test('the initial-stomas dropdown uses the specific list and drops generic umbrellas',()=>{
  const c=ctx();
  const col=c.initialStomaTypeOptions('Colostomy');
  assert.doesNotMatch(col,/selected/);
  assert.match(col,/End colostomy/);
  assert.match(col,/Mucus fistula/);
  assert.match(c.initialStomaTypeOptions('Loop ileostomy'),/selected>Loop ileostomy/);
});
