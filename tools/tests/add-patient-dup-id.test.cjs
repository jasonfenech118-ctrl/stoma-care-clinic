// Add Patient flags an ID card already on the registry as it is typed:
// checkNewPatientIdDuplicate highlights the field and shows an "Open that
// patient" note, clears when there is no match, and ignores a stale response
// from an earlier keystroke.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};

function setup(t,lookup){
  const dom=new JSDOM(`<div class="fg"><input id="ap-idcard"/><div id="ap-dup-note" class="registry-lookup-note" hidden></div></div>`,{runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window;
  w.eval(fn('normaliseIdCard'));
  w.htmlSafe=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  w.jsSafe=s=>String(s??'');
  w.findRegistryPatientsByIdCard=lookup;
  w.eval('var apDupTimer=null,apDupSeq=0;');
  w.eval(fn('checkNewPatientIdDuplicate'));
  return w;
}

test('flags an ID card already on the registry',async t=>{
  const w=setup(t,async()=>({matches:[{id:'p9',first_name:'Teddy',surname:'Xerri',id_card:'0029957G'}],error:null}));
  w.document.getElementById('ap-idcard').value='0029957g';
  await w.checkNewPatientIdDuplicate();
  const el=w.document.getElementById('ap-idcard'),note=w.document.getElementById('ap-dup-note');
  assert.ok(el.classList.contains('pf-dup-idcard'));
  assert.equal(note.hidden,false);
  assert.match(note.innerHTML,/Already in the registry as/);
  assert.match(note.innerHTML,/Teddy Xerri/);
  assert.match(note.innerHTML,/openPatientDatesModal\('p9'\)/);
});

test('clears the flag when no patient matches',async t=>{
  const w=setup(t,async()=>({matches:[],error:null}));
  const el=w.document.getElementById('ap-idcard'),note=w.document.getElementById('ap-dup-note');
  el.classList.add('pf-dup-idcard');note.hidden=false;note.innerHTML='stale';
  el.value='404261M';
  await w.checkNewPatientIdDuplicate();
  assert.ok(!el.classList.contains('pf-dup-idcard'));
  assert.equal(note.hidden,true);
});

test('an empty ID clears the flag without a lookup',async t=>{
  let called=0;
  const w=setup(t,async()=>{called++;return {matches:[],error:null};});
  w.document.getElementById('ap-idcard').value='   ';
  await w.checkNewPatientIdDuplicate();
  assert.equal(called,0);
  assert.equal(w.document.getElementById('ap-dup-note').hidden,true);
});

test('a stale response from an earlier keystroke does not overwrite the field',async t=>{
  // The lookup resolves after the field value has already changed; the guard
  // must drop it.
  const w=setup(t,async()=>({matches:[{id:'old',first_name:'Old',surname:'Match',id_card:'111111M'}],error:null}));
  const el=w.document.getElementById('ap-idcard');
  el.value='111111M';
  const p=w.checkNewPatientIdDuplicate();   // in-flight
  el.value='222222M';                        // user kept typing
  w.apDupSeq++;                              // a newer check claimed the latest seq
  await p;
  assert.ok(!el.classList.contains('pf-dup-idcard'));  // stale result ignored
});
