// Schedule 5 permit gains a "Collected from pharmacy" step (with its own date)
// before the black "archived" state, and every meaningful step is auto-logged to
// the patient's encounters so it shows in the profile history.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{let i=html.indexOf('async function '+name+'(');if(i<0)i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};
const docsConst=(()=>{const i=html.indexOf('const HANDOVER_DOCS=');return html.slice(i,html.indexOf('\n};',i)+3);})();
const labelsConst=html.match(/const SCHEDULE_FIVE_LOG_LABELS=\{[^}]*\};/)[0];

function ctx(extra={}){
  return vm.createContext({console,Date,Object,Array,String,JSON,TODAY:'2026-11-01',fmtShortDate:d=>d,...extra});
}

test('the Schedule 5 button cycles Left in ward → Signed → Collected → black, then back',()=>{
  const c=ctx();
  vm.runInContext(docsConst+'\n'+fn('handoverDocState')+fn('handoverDocNext'),c);
  const order=['','in_ward','signed','collected','archived'];
  let v='';
  for(const expect of order){assert.equal(v,expect);v=c.handoverDocNext('schedule_five_permit',v);}
  assert.equal(v,'');   // wraps back to Not done
});

test('each step stamps its own date once; "Not done" clears all three, archived keeps them',()=>{
  const c=ctx();vm.runInContext(fn('docDateUpdates'),c);
  const upd=(v,cur)=>JSON.parse(JSON.stringify(c.docDateUpdates('schedule_five_permit',v,cur)));   // normalise across realms
  assert.deepEqual(upd('in_ward'),{schedule_five_left_date:'2026-11-01'});
  assert.deepEqual(upd('signed'),{schedule_five_signed_date:'2026-11-01'});
  assert.deepEqual(upd('collected'),{schedule_five_collected_date:'2026-11-01'});
  // A date already recorded is left alone — cycling the button never resets it.
  assert.deepEqual(upd('in_ward',{schedule_five_left_date:'2026-10-01'}),{});
  assert.deepEqual(upd('signed',{schedule_five_signed_date:'2026-10-02'}),{});
  // The black "archived" state keeps every date; only "Not done" clears the lot.
  assert.deepEqual(upd('archived',{schedule_five_left_date:'2026-10-01',schedule_five_collected_date:'2026-10-03'}),{});
  assert.deepEqual(upd(''),{schedule_five_left_date:null,schedule_five_signed_date:null,schedule_five_collected_date:null});
});

test('discharge gate: only Collected or the black archived state passes',()=>{
  const c=ctx();vm.runInContext(fn('scheduleFiveCollected'),c);
  const ok=v=>c.scheduleFiveCollected({schedule_five_permit:v});
  assert.equal(ok(''),false);          // Not done — blocked
  assert.equal(ok('in_ward'),false);   // Left in ward — blocked
  assert.equal(ok('signed'),false);    // Signed — blocked
  assert.equal(ok('collected'),true);  // Collected — allowed
  assert.equal(ok('archived'),true);   // black box of a previous admission — allowed
  // A recorded collected date alone also passes; a missing record never does.
  assert.equal(c.scheduleFiveCollected({schedule_five_collected_date:'2026-10-03'}),true);
  assert.equal(c.scheduleFiveCollected(null),false);
});

function logCtx(opts={}){
  const inserts=[];
  const c=ctx({
    isEncounterUser:()=>opts.encounterUser!==false,
    getCurrentUserForAudit:async()=>({name:'Nurse X'}),
    SB:{from(table){
      if(table==='clinical_records')return {select(){return this;},eq(){return this;},order(){return Promise.resolve({data:opts.episodes||[]});}};
      if(table==='encounters')return {insert(row){inserts.push(row);return opts.insertThrows?Promise.reject(new Error('rls')):Promise.resolve({error:null});}};
      return {};
    }}
  });
  vm.runInContext(labelsConst+'\n'+fn('logScheduleFiveEncounter'),c);
  return {c,inserts};
}

test('a Collected step logs an encounter note attached to the open admission',async()=>{
  const {c,inserts}=logCtx({episodes:[{id:'ep1',episode_ref:'EP-1',is_current:true,discharge_date:null,created_at:'2026-10-01'}]});
  await c.logScheduleFiveEncounter('p1','collected');
  assert.equal(inserts.length,1);
  assert.equal(inserts[0].patient_id,'p1');
  assert.equal(inserts[0].episode_id,'ep1');
  assert.equal(inserts[0].episode_ref,'EP-1');
  assert.match(inserts[0].nursing_report,/Schedule 5 permit — Collected from pharmacy/);
  assert.equal(inserts[0].created_by_name,'Nurse X');
});

test('with no open admission the note is a standalone encounter (no episode)',async()=>{
  const {c,inserts}=logCtx({episodes:[{id:'old',is_current:false,discharge_date:'2026-09-01'}]});
  await c.logScheduleFiveEncounter('p1','signed');
  assert.equal(inserts.length,1);
  assert.equal(inserts[0].episode_id,null);
  assert.match(inserts[0].nursing_report,/Signed/);
});

test('blank and archived steps are not logged',async()=>{
  const {c,inserts}=logCtx();
  await c.logScheduleFiveEncounter('p1','');
  await c.logScheduleFiveEncounter('p1','archived');
  assert.equal(inserts.length,0);
});

test('a non-encounter user logs nothing, and an insert failure never throws',async()=>{
  const off=logCtx({encounterUser:false});
  await off.c.logScheduleFiveEncounter('p1','collected');
  assert.equal(off.inserts.length,0);
  const boom=logCtx({insertThrows:true});
  await boom.c.logScheduleFiveEncounter('p1','collected');   // must not throw
  assert.equal(boom.inserts.length,1);
});
