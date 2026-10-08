const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{boot}=require('./jason-encounters.fixture.cjs');
const load=n=>fs.readFileSync(path.join(__dirname,'../../assets/'+n),'utf8');
async function setup(t,saved=null,recoveryFailure=false){
 const dom=new JSDOM('<!doctype html><body><div id="app"><main class="main"><section class="page active" id="page-handover"></section></main></div><div id="mo"></div></body>',{runScripts:'outside-only',url:'https://clinic.test'});t.after(()=>dom.window.close());const w=dom.window;boot(w);
 w.ClinicWorkspace={esc:x=>String(x).replace(/</g,'&lt;'),saveStatus(){},beginSave(){},endSave(){},navigation(){},contextHTML(){return '';},loadContext:async()=>''};
 w.SB.auth.getUser=async()=>({data:{user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'jason.fenech@gov.mt'}}});
 const original=w.SB.from,rpc=w.SB.rpc,store={row:saved,fail:false,recoveryFailure};
 w.SB.from=table=>{if(table!=='clinic_encounter_drafts')return original(table);const q={deleting:false,select(){return q;},eq(){return q;},delete(){q.deleting=true;return q;},async maybeSingle(){return {data:store.row,error:store.recoveryFailure?{message:'Offline'}:null};},then(ok,no){if(q.deleting)store.row=null;return Promise.resolve({error:null}).then(ok,no);}};return q;};
 w.SB.rpc=async(n,args)=>{if(n!=='save_clinic_encounter_draft')return rpc(n,args);if(store.fail)return {error:{message:'Offline'}};store.row={snapshot:JSON.parse(JSON.stringify(args.p_snapshot)),baseline:JSON.parse(JSON.stringify(args.p_baseline)),baseline_version:args.p_baseline_version,revision:(store.row?.revision||0)+1,updated_at:'2026-10-05T10:00:00Z'};return {data:store.row};};
 w.eval(load('clinic-drafts.js'));w.eval(load('jason-encounters.js'));await w.JasonEncounters.open(w.fixture.patient.id);await w.ClinicDrafts.session.ready;
 return {w,store};
}
function write(w,text){const el=w.document.getElementById('jenc-notes-0');el.value=text;el.dispatchEvent(new w.Event('input',{bubbles:true}));}
test('protecting a draft never signs an encounter, and final saving clears its recovery data',async t=>{
 const {w,store}=await setup(t);write(w,'Recoverable nursing observations');await w.ClinicDrafts.flush();
 assert.equal(store.row.snapshot.stomas[0].notes,'Recoverable nursing observations');assert.equal(w.fixture.calls.length,0);
 await w.JasonEncounters.save();assert.equal(w.fixture.calls.length,1);assert.equal(store.row,null);
});
test('a reload offers explicit recovery and restores wording only when the nurse chooses it',async t=>{
 const first=await setup(t);write(first.w,'Unfinished exact wording');await first.w.ClinicDrafts.flush();
 const next=await setup(t,first.store.row);assert.match(next.w.document.getElementById('jenc-recovery').textContent,/Unfinished draft/);
 assert.notEqual(next.w.JasonEncounters.state.draft.stomas[0].notes,'Unfinished exact wording');
 await next.w.ClinicDrafts.action('restore');assert.equal(next.w.JasonEncounters.state.draft.stomas[0].notes,'Unfinished exact wording');assert.equal(next.w.fixture.calls.length,0);
});
test('failed draft protection keeps the wording on screen and does not claim it is saved',async t=>{
 const {w,store}=await setup(t);store.fail=true;write(w,'Keep during outage');await w.ClinicDrafts.flush();
 assert.equal(w.JasonEncounters.state.draft.stomas[0].notes,'Keep during outage');assert.match(w.document.getElementById('jenc-draft-state').textContent,/not protected/);assert.equal(store.row,null);
});
test('a failed recovery read stays visibly unavailable while typing and retries after reconnecting',async t=>{
 const {w,store}=await setup(t,null,true);write(w,'Written during outage');
 assert.match(w.document.getElementById('jenc-draft-state').textContent,/unavailable/);assert.doesNotMatch(w.document.getElementById('jenc-draft-state').textContent,/loading/);
 store.recoveryFailure=false;w.dispatchEvent(new w.Event('online'));await w.ClinicDrafts.session.ready;await w.ClinicDrafts.flush();
 assert.equal(store.row.snapshot.stomas[0].notes,'Written during outage');assert.match(w.document.getElementById('jenc-draft-state').textContent,/Draft protected/);
});
test('opening a patient directly from a reminder cannot bypass the encounter discard or saving guard',async t=>{
 const {w}=await setup(t);const app=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8'),start=app.indexOf('async function openPatientRecord(');w.eval(app.slice(start,app.indexOf('\n}',start)+2));
 write(w,'Keep these unsaved notes');w.confirm=()=>false;const reads=w.fixture.reads;
 await w.openPatientRecord('another-patient');assert.equal(w.fixture.reads,reads);assert.equal(w.document.getElementById('jenc-notes-0').value,'Keep these unsaved notes');assert.ok(w.document.body.classList.contains('jenc-open'));
 w.JasonEncounters.state.saving=true;w.confirm=()=>true;await w.openPatientRecord('another-patient');assert.equal(w.fixture.reads,reads);assert.ok(w.document.body.classList.contains('jenc-open'));
});
