const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../../assets/documentation-status.js'),'utf8');
function setup(t){const dom=new JSDOM('',{runScripts:'outside-only'});t.after(()=>dom.window.close());dom.window.eval(script);return dom.window;}
const complete={patient_id:'p',surgery_date:'2026-10-10',first_episode_date:'2026-10-09',first_encounter_date:'2026-10-10',first_episode_entered_date:'2026-10-09',first_encounter_entered_date:'2026-10-10'};
test('automatic chronology handles coverage, late entry, missing and preoperative dates',t=>{const w=setup(t),c=w.DocumentationStatus.classify;assert.equal(c(complete).status,'electronic');assert.equal(c({...complete,first_encounter_date:'2026-10-11'}).status,'earlier_history');assert.equal(c({...complete,first_encounter_entered_date:'2026-10-11'}).status,'earlier_history');assert.equal(c({...complete,first_episode_entered_date:'2026-10-11'}).status,'earlier_history');assert.equal(c({...complete,first_episode_date:null}).status,'pending');assert.equal(c({...complete,surgery_date:null}).status,'unconfirmed');assert.equal(c(null).status,'unconfirmed');assert.equal(c(complete,'2026-10-09').status,'pending');assert.equal(c({...complete,first_encounter_date:'2026-10-09'}).status,'electronic');});
test('patient batches use one lookup, preserve unrelated data and fail safely',async t=>{const w=setup(t),D=w.DocumentationStatus;let calls=0;const result={rows:[{id:'p',surname:'Sample'},{id:'p2'}],error:null};await D.enrich(result,{rpc:async(name,args)=>{calls++;assert.equal(name,'patient_documentation_dates');assert.deepEqual(Array.from(args.p_patient_ids),['p','p2']);return{data:[complete],error:null};}});assert.equal(calls,1);assert.equal(result.rows[0].surname,'Sample');assert.equal(D.classify(result.rows[0].documentation_dates).status,'electronic');assert.equal(D.classify(result.rows[1].documentation_dates).status,'unconfirmed');await D.enrich(result,{rpc:async()=>({error:{message:'offline'}})});assert.equal(result.rows[0].documentation_dates,null);});
test('single-patient reads and fresh dates update badges without saving a flag',async t=>{const w=setup(t),D=w.DocumentationStatus;const result={data:{id:'p'}};await D.enrich(result,{rpc:async()=>({data:[complete]})});assert.match(D.badgeHTML(result.data),/Electronic notes from surgery/);await D.enrich(result,{rpc:async()=>({data:[{...complete,surgery_date:'2025-01-01'}]})});assert.match(D.badgeHTML(result.data),/Check for earlier paper notes/);const el=w.document.createElement('div');el.innerHTML=D.cardHTML(result.data);assert.match(el.textContent,/checked from dates/);assert.equal(el.querySelectorAll('dt').length,5);assert.match(el.textContent,/paper file/);});
test('a large registry is looked up in bounded chunks, not one huge call',async t=>{
  const w=setup(t),D=w.DocumentationStatus;
  const rows=Array.from({length:450},(_,i)=>({id:'p'+i}));
  let calls=0,maxChunk=0;
  await D.enrich({rows,error:null},{rpc:async(name,args)=>{
    calls++;maxChunk=Math.max(maxChunk,args.p_patient_ids.length);
    return{data:args.p_patient_ids.map(id=>({...complete,patient_id:id})),error:null};
  }});
  assert.equal(calls,3,'450 ids split into 200 + 200 + 50');
  assert.ok(maxChunk<=200,'no chunk exceeds the bound');
  assert.equal(D.classify(rows[0].documentation_dates).status,'electronic');
  assert.equal(D.classify(rows[449].documentation_dates).status,'electronic');
});

test('one failing chunk only leaves its own patients unconfirmed',async t=>{
  const w=setup(t),D=w.DocumentationStatus;
  const rows=Array.from({length:250},(_,i)=>({id:'p'+i}));   // 200 + 50 → two chunks
  await D.enrich({rows,error:null},{rpc:async(name,args)=>{
    if(args.p_patient_ids.includes('p0'))throw Error('first chunk offline');  // fail the 0..199 chunk
    return{data:args.p_patient_ids.map(id=>({...complete,patient_id:id})),error:null};
  }});
  assert.equal(rows[0].documentation_dates,null,'failed chunk patient stays unconfirmed');
  assert.equal(D.classify(rows[249].documentation_dates).status,'electronic','other chunk still resolves');
});

test('automatic status lives in the registry and patient profile only',t=>{const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');const encounter=fs.readFileSync(path.join(__dirname,'../../assets/jason-encounters.js'),'utf8');assert.match(html,/DocumentationStatus\.enrich\(res,SB\)/);assert.match(html,/docStatusCardHTML\(pat\)/);assert.doesNotMatch(html,/DocumentationStatus\.cardHTML\(clrState.patient\)/);assert.match(html,/docStatusBadgeHTML\(p\)/);assert.match(html,/id="pd-documentation"/);assert.doesNotMatch(encounter,/DocumentationStatus\.cardHTML\(p\)/);});
