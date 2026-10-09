const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {boot}=require('./jason-encounters.fixture.cjs');
const script=fs.readFileSync(path.join(__dirname,'../../assets/jason-encounters.js'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(t){const dom=new JSDOM('<div id="app"><main class="main"><section id="page-handover" class="page active"><table><tr><td>All patients</td></tr></table></section></main></div>',{runScripts:'outside-only',url:'https://example.test'});t.after(()=>dom.window.close());boot(dom.window);dom.window.eval(script);return dom.window;}
function change(w,selector,value){const el=w.document.querySelector(selector);assert.ok(el,selector);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));}
function notes(w,text,box='jenc-notes-0'){const el=w.document.getElementById(box);el.value=text;el.dispatchEvent(new w.Event('input',{bubbles:true}));}
function click(w,action,extra=''){const el=w.document.querySelector('[data-action="'+action+'"]'+extra);assert.ok(el,action);el.click();}
function fastTimeouts(w){const timer=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>timer(fn,ms>=5000?10:ms,...args);}

test('every signed-in nurse can open the workspace; nobody signed in cannot',async t=>{const w=setup(t);w.fixture.email='';await w.JasonEncounters.open(w.fixture.patient.id);assert.equal(w.fixture.reads,0);assert.equal(w.JasonEncounters.state,null);w.fixture.enabled=false;w.fixture.email='jacqueline.sammut@gov.mt';await w.JasonEncounters.open(w.fixture.patient.id);assert.equal(w.fixture.reads,0);w.fixture.enabled=true;await w.JasonEncounters.open(w.fixture.patient.id);assert.ok(w.fixture.reads>0);assert.ok(w.JasonEncounters.state);});

test('opening preserves the full handover table and shows each appliance setup as it stands, with no dropdowns',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);assert.ok(w.document.querySelector('#page-handover table'));assert.ok(w.document.body.classList.contains('jenc-open'));const step=w.document.querySelector('[data-step="appliances"]');assert.equal(step.querySelectorAll('select').length,0);assert.equal(step.querySelector('[data-section^="appliances:"]'),null);const setups=step.querySelectorAll('.jenc-setup');assert.equal(setups.length,2);assert.match(setups[0].textContent,/Drainable pouch/);assert.match(setups[0].textContent,/Barrier ring/);assert.match(setups[0].textContent,/Same appliance as before — no change/);assert.match(setups[1].textContent,/Urostomy pouch/);const keep=step.querySelector('[data-action="keep-appliance"][data-uid="stoma-one"]');assert.ok(keep.classList.contains('is-kept'));assert.equal(keep.getAttribute('aria-pressed'),'true');assert.match(step.querySelector('[data-action="modify-appliance"][data-uid="stoma-one"]').textContent,/Modify appliance/);assert.ok(w.document.querySelector('#jenc-notes-0'));assert.doesNotMatch(w.document.querySelector('#page-jason-encounters').textContent,/Assigned nurse/);});

test('each stoma retains its own assessment, output and appliance selection',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);change(w,'[data-kind="stoma"][data-field="colour"][data-uid="stoma-one"]','Healthy pink');change(w,'[data-field="output"][data-uid="stoma-one"][value="Flatus present"]',true);change(w,'[data-kind="stoma"][data-field="colour"][data-uid="stoma-two"]','Dusky');change(w,'[data-field="output"][data-uid="stoma-two"][value="Hemoserous fluid"]',true);const s=w.JasonEncounters.state.draft.stomas;assert.equal(s[0].colour,'Healthy pink');assert.deepEqual(plain(s[0].output),['Flatus present']);assert.equal(s[1].colour,'Dusky');assert.deepEqual(plain(s[1].output),['Hemoserous fluid']);assert.deepEqual(plain(s[0].appliances),['Drainable pouch']);assert.deepEqual(plain(s[1].appliances),['Urostomy pouch']);assert.equal(w.document.querySelector('[data-kind="rod"][data-field="present"][data-uid="stoma-one"]').checked,true);assert.equal(w.document.querySelector('[data-kind="rod"][data-uid="stoma-two"]'),null);});

test('Nil is exclusive, other outputs can be combined, and the dropdown closes on each choice',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);change(w,'[data-field="output"][value="Liquid stools"]',true);change(w,'[data-field="output"][value="Flatus present"]',true);assert.deepEqual(plain(w.JasonEncounters.state.draft.stomas[0].output),['Liquid stools','Flatus present']);change(w,'[data-field="output"][value="Nil"]',true);assert.deepEqual(plain(w.JasonEncounters.state.draft.stomas[0].output),['Nil']);change(w,'[data-field="output"][value="Blood"]',true);assert.deepEqual(plain(w.JasonEncounters.state.draft.stomas[0].output),['Blood']);assert.equal(w.document.querySelector('[data-field="output"]').closest('details').open,false);});

test('each stoma keeps its own notes, saved with the episode and every stoma, with automatic signature and no appliance writes',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Patient comfortable.\nTeaching given <today>.');notes(w,'Urine clear.','jenc-notes-1');await w.JasonEncounters.save();const args=w.fixture.calls[0].args;assert.equal(args.p_episode_id,w.fixture.episode.id);assert.deepEqual(args.p_snapshot.scope,['stoma-one','stoma-two']);assert.equal(args.p_snapshot.stomas[0].notes,'Patient comfortable.\nTeaching given <today>.');assert.equal(args.p_snapshot.stomas[1].notes,'Urine clear.');assert.match(args.p_report,/Loop Ileostomy notes: Patient comfortable/);assert.match(args.p_report,/Urostomy notes: Urine clear\./);assert.doesNotMatch(args.p_report,/\bS[12]\b/);assert.deepEqual(args.p_impact.appliances,[]);assert.deepEqual(args.p_impact.patient_patch,{});assert.equal(w.JasonEncounters.state.editable,false);assert.match(w.document.querySelector('.jenc-signature').textContent,/Signed by: Jason Fenech/);assert.equal(w.document.querySelector('#jenc-report today'),null);});

test('editing saved wording and a dropdown makes V2 on the same encounter with only changes red',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);change(w,'[data-field="colour"]','Healthy pink');notes(w,'Patient comfotable today.');await w.JasonEncounters.save();const id=w.JasonEncounters.state.record.id;click(w,'edit');notes(w,'Patient comfortable today.');change(w,'[data-field="colour"]','Dusky');assert.equal(w.document.querySelector('.jenc-note-mirror .jenc-change').textContent,'comfortable');assert.ok(w.document.querySelector('[data-field="colour"]').classList.contains('jenc-changed'));assert.match(w.document.querySelector('.jenc-note-diff del').textContent,/comfotable/);await w.JasonEncounters.save();const state=w.JasonEncounters.state;assert.equal(state.record.id,id);assert.equal(state.record.assessment.versions.length,2);assert.equal(state.record.assessment.versions[0].snapshot.stomas[0].notes,'Patient comfotable today.');assert.equal(state.record.assessment.versions[0].snapshot.stomas[0].colour,'Healthy pink');assert.equal(w.fixture.calls[1].args.p_encounter_id,id);assert.equal(w.fixture.calls[1].args.p_expected_version,1);assert.equal(state.expectedVersion,2);click(w,'version','[data-index="0"]');assert.equal(w.document.getElementById('jenc-notes-0').value,'Patient comfotable today.');assert.equal(w.document.querySelector('[data-field="colour"]').value,'Healthy pink');assert.equal(w.document.querySelector('.jenc-note-mirror .jenc-change'),null);click(w,'version','[data-index="1"]');assert.equal(w.document.querySelector('.jenc-note-mirror .jenc-change').textContent,'comfortable');assert.equal(w.document.querySelectorAll('#jenc-report .jenc-change').length>0,true);});

test('a failed save keeps the editable draft and leaves appliances untouched for retry',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Keep this draft.');w.fixture.failSave=true;await w.JasonEncounters.save();assert.equal(w.JasonEncounters.state.editable,true);assert.equal(w.document.getElementById('jenc-notes-0').value,'Keep this draft.');assert.match(w.document.querySelector('[role="alert"]').textContent,/changes remain/);assert.equal(w.document.getElementById('jenc-save').disabled,false);assert.equal(w.fixture.records.length,0);assert.deepEqual(w.fixture.calls[0].args.p_impact.appliances,[]);});
test('a hanging save is cancelled, restores every form control and retries the same request',async t=>{
  const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Keep the interrupted report.');fastTimeouts(w);
  const rpc=w.SB.rpc;let signal,retry,first;
  w.SB.rpc=(name,payload)=>{first=plain(payload);const q={retry(v){retry=v;return q},abortSignal(s){signal=s;return q},then(){return new Promise(()=>{})}};return q};
  await w.JasonEncounters.save();assert.equal(signal.aborted,true);assert.equal(retry,false);assert.equal(w.JasonEncounters.state.saving,false);
  assert.equal(w.document.getElementById('jenc-save').disabled,false);assert.equal(w.document.getElementById('jenc-save').textContent,'Save encounter');assert.equal(w.document.getElementById('jenc-notes-0').disabled,false);assert.equal(w.document.getElementById('jenc-notes-0').value,'Keep the interrupted report.');
  assert.match(w.document.querySelector('[role="alert"]').textContent,/not been confirmed/);
  w.SB.rpc=rpc;await w.JasonEncounters.save();assert.deepEqual(w.fixture.calls[0].args,first);assert.equal(w.fixture.records.length,1);assert.equal(w.JasonEncounters.state.editable,false);
});
test('a committed save with a lost response is confirmed from its request ID and shown as saved',async t=>{
  const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Saved despite the lost response.');
  const rpc=w.SB.rpc;w.SB.rpc=async(name,args)=>{await rpc(name,args);return {data:null,error:{message:'upstream request timeout',code:'504'}}};
  await w.JasonEncounters.save();assert.equal(w.fixture.records.length,1);assert.equal(w.JasonEncounters.state.editable,false);assert.equal(w.JasonEncounters.state.pendingSave,null);assert.equal(w.document.getElementById('jenc-save'),null);assert.match(w.document.querySelector('[role="status"]').textContent,/saved · V1/);assert.equal(w.document.querySelector('[role="alert"]'),null);
});
test('an unavailable confirmation service leaves the draft available and an explicit unconfirmed result',async t=>{
  const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Do not lose this report.');fastTimeouts(w);w.SB.rpc=async()=>({error:{message:'upstream request timeout'}});w.SB.from=()=>{const q={select:()=>q,eq:()=>q,contains:()=>q,order:()=>q,limit:()=>q,then:()=>new Promise(()=>{})};return q};
  await w.JasonEncounters.save();assert.equal(w.JasonEncounters.state.editable,true);assert.equal(w.document.getElementById('jenc-notes-0').value,'Do not lose this report.');assert.equal(w.document.getElementById('jenc-save').disabled,false);assert.ok(w.JasonEncounters.state.pendingSave);
});
test('a hanging sign-in check also releases Save without submitting an encounter',async t=>{
  const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Sign-in service unavailable.');fastTimeouts(w);w.SB.auth.getUser=()=>new Promise(()=>{});
  await w.JasonEncounters.save();assert.equal(w.fixture.calls.length,0);assert.equal(w.JasonEncounters.state.saving,false);assert.equal(w.document.getElementById('jenc-save').disabled,false);assert.equal(w.document.getElementById('jenc-notes-0').value,'Sign-in service unavailable.');
});
test('rapid Save clicks submit once because the lock starts before checking sign-in',async t=>{
  const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'One submission.');let resolve,reads=0;
  w.SB.auth.getUser=()=>{reads++;return new Promise(r=>resolve=r)};
  const first=w.JasonEncounters.save(),second=w.JasonEncounters.save();await tick();assert.equal(reads,1);resolve({data:{user:{email:w.fixture.email}}});await Promise.all([first,second]);assert.equal(w.fixture.calls.length,1);assert.equal(w.fixture.records.length,1);
});
test('confirmed saves are displayed before an optional patient refresh finishes',async t=>{
  const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Confirmed immediately.');fastTimeouts(w);w.fetchPatientById=()=>new Promise(()=>{});
  const save=w.JasonEncounters.save();await tick();assert.equal(w.document.getElementById('jenc-save'),null);assert.match(w.document.querySelector('[role="status"]').textContent,/saved · V1/);await save;assert.equal(w.JasonEncounters.state.saving,false);
});
test('edits made after an interrupted save remain available for the next revision',async t=>{
  const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Original submission.');w.fixture.failSave=true;await w.JasonEncounters.save();
  notes(w,'Later correction.');w.fixture.failSave=false;await w.JasonEncounters.save();
  assert.equal(w.fixture.records[0].assessment.current_version,1);assert.equal(w.fixture.records[0].assessment.snapshot.stomas[0].notes,'Original submission.');assert.equal(w.JasonEncounters.state.editable,true);assert.equal(w.document.getElementById('jenc-notes-0').value,'Later correction.');assert.match(w.document.querySelector('[role="status"]').textContent,/later changes remain unsaved/);
  await w.JasonEncounters.save();assert.equal(w.fixture.records.length,1);assert.equal(w.fixture.records[0].assessment.current_version,2);assert.equal(w.fixture.records[0].assessment.snapshot.stomas[0].notes,'Later correction.');assert.notEqual(w.fixture.calls[1].args.p_snapshot.save_request_id,w.fixture.calls[2].args.p_snapshot.save_request_id);
});

test('Modify appliance opens the appointment picker for that stoma only, and its pick is saved with the encounter',async t=>{const w=setup(t);const opened=[];w.openEncounterApplianceWizard=o=>opened.push(o);await w.JasonEncounters.open(w.fixture.patient.id);
  click(w,'modify-appliance','[data-uid="stoma-one"]');assert.equal(opened.length,1);assert.equal(opened[0].uid,'stoma-one');assert.equal(opened[0].patient.id,w.fixture.patient.id);assert.deepEqual(plain(opened[0].current),{appliances:['Drainable pouch'],accessories:['Barrier ring'],flange_due:''});
  opened[0].onDone({appliances:['Convex drainable pouch'],accessories:['Paste'],flange_due:'',system:'one'});
  const s=w.JasonEncounters.state.draft.stomas;assert.deepEqual(plain(s[0].appliances),['Convex drainable pouch']);assert.deepEqual(plain(s[0].accessories),['Paste']);assert.equal(s[0].system,'one');assert.equal(s[0].pouch,'Convex drainable pouch');assert.deepEqual(plain(s[1].appliances),['Urostomy pouch']);
  const box=w.document.querySelector('[data-step="appliances"] .jenc-setup');assert.match(box.textContent,/Changed in this encounter/);assert.ok(box.classList.contains('jenc-setup-changed'));assert.equal(box.querySelector('.jenc-change').textContent,'Convex drainable pouch');assert.match(box.querySelector('.jenc-previous').textContent,/Previously: Drainable pouch · Barrier ring/);assert.equal(box.querySelector('[data-action="keep-appliance"]').classList.contains('is-kept'),false);
  await w.JasonEncounters.save();const a=w.fixture.calls[0].args;assert.equal(a.p_impact.appliances.length,1);assert.deepEqual(plain(a.p_impact.appliances[0]),{stoma_uid:'stoma-one',stoma_code:'S1',stoma_short:'Ileo',stoma_type:'Loop ileostomy',appliances:['Convex drainable pouch'],accessories:['Paste'],flange_due:''});assert.deepEqual(a.p_snapshot.stomas[1].appliances,['Urostomy pouch']);assert.match(a.p_report,/appliance: Convex drainable pouch; accessories: Paste/);
  assert.equal(w.document.querySelector('[data-action="modify-appliance"]'),null);assert.match(w.document.querySelector('[data-step="appliances"] .jenc-setup').textContent,/Saved setup/);});

test('a two-piece pick carries its flange date; Keep same appliance puts the recorded setup back',async t=>{const w=setup(t);const opened=[];w.openEncounterApplianceWizard=o=>opened.push(o);await w.JasonEncounters.open(w.fixture.patient.id);
  click(w,'modify-appliance','[data-uid="stoma-one"]');opened[0].onDone({appliances:['Baseplate 57 mm','Two-piece pouch 57 mm'],accessories:['None'],flange_due:'2026-10-08',system:'two'});
  const st=()=>w.JasonEncounters.state.draft.stomas[0];assert.equal(st().system,'two');assert.equal(st().baseplate,'Baseplate 57 mm');assert.equal(st().pouch,'Two-piece pouch 57 mm');assert.equal(st().flange_due,'2026-10-08');assert.match(w.document.querySelector('[data-step="appliances"] .jenc-setup').textContent,/Flange due2026-10-08/);
  click(w,'keep-appliance','[data-uid="stoma-one"]');assert.deepEqual(plain(st().appliances),['Drainable pouch']);assert.deepEqual(plain(st().accessories),['Barrier ring']);assert.equal(st().flange_due,'');assert.equal(st().system,'one');
  assert.ok(w.document.querySelector('[data-action="keep-appliance"][data-uid="stoma-one"]').classList.contains('is-kept'));await w.JasonEncounters.save();assert.equal(w.fixture.calls.length,0);assert.match(w.document.querySelector('[role="alert"]').textContent,/Record a finding/);
  // A pick that comes back after the encounter was left changes nothing.
  click(w,'modify-appliance','[data-uid="stoma-one"]');w.JasonEncounters.dismiss(true);opened[1].onDone({appliances:['Convex drainable pouch'],accessories:['None'],flange_due:'',system:'one'});assert.equal(w.JasonEncounters.state,null);});

test('a stoma with no appliance on record offers Set appliance only, with no Keep same',async t=>{const w=setup(t);w.fixture.episode.appliances=w.fixture.episode.appliances.filter(r=>r.stoma_uid!=='stoma-two');await w.JasonEncounters.open(w.fixture.patient.id);
  assert.equal(w.document.querySelector('[data-action="keep-appliance"][data-uid="stoma-two"]'),null);assert.match(w.document.querySelector('[data-action="modify-appliance"][data-uid="stoma-two"]').textContent,/Set appliance/);assert.match(w.document.querySelectorAll('[data-step="appliances"] .jenc-setup')[1].textContent,/No appliance recorded.*No appliance set yet/);});

test('patient infection, episode support and per-stoma complications all enter the saved report',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);change(w,'[data-kind="infection"][data-field="status"]','Infection');change(w,'[data-kind="infection"][data-field="organism"]','CRE');click(w,'add-referral');change(w,'[data-kind="referral"][data-field="profession"]','Psychologist');click(w,'add-comp');change(w,'[data-kind="comp"][data-field="text"]','Retraction');await w.JasonEncounters.save();const a=w.fixture.calls[0].args;assert.match(a.p_report,/CRE · Infection/);assert.match(a.p_report,/Referred to Psychologist on 2026-10-05\./);assert.match(a.p_report,/Retraction: active/);const comps=JSON.parse(a.p_impact.patient_patch.complications);assert.equal(comps[0].stoma_uid,'stoma-one');assert.equal(a.p_snapshot.stomas[1].complications.length,0);});

test('unchanged edits create no extra version and read-only history still allows filtering',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Assessment complete.');await w.JasonEncounters.save();click(w,'edit');await w.JasonEncounters.save();assert.equal(w.fixture.calls.length,1);assert.match(w.document.querySelector('[role="alert"]').textContent,/no changes/);click(w,'cancel');click(w,'history');const filter=w.document.querySelector('[data-kind="history"]');assert.equal(filter.disabled,false);change(w,'[data-kind="history"]','all');assert.equal(w.document.querySelectorAll('[data-action="view"]').length,1);});

test('Jason handover retains status summaries and print values with only the Encounter care action',t=>{const w=setup(t);w.applianceLineIsTwoPiece=()=>true;w.handoverComplicationLine=()=> 'Retraction';w.fixture.patient.flange_due='2026-10-07';w.fixture.patient.inpatient_nurse_notes='CRE · Infection';const cell=w.JasonEncounters.handoverCell(w.fixture.patient,'Two-piece pouch');const el=w.document.createElement('div');el.innerHTML=cell;assert.equal(el.querySelectorAll('button').length,1);assert.match(el.querySelector('button').textContent,/Encounter/);assert.equal(el.querySelector('.hv-appl').tagName,'SPAN');assert.equal(el.querySelector('.hv-appl').getAttribute('onclick'),null);assert.equal(el.querySelector('.hv-flange-date').type,'hidden');assert.equal(el.querySelector('.hv-flange-date').value,'2026-10-07');assert.equal(el.querySelector('.hv-note').value,'CRE · Infection');assert.equal(el.querySelector('.hv-cmp-line').textContent,'Retraction');});

test('a discharged patient can still open, read and correct saved encounter history',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Before discharge.');await w.JasonEncounters.save();w.fixture.episode.is_current=false;w.fixture.episode.discharge_date='2026-10-05';await w.JasonEncounters.open(w.fixture.patient.id);assert.equal(w.JasonEncounters.state.mode,'history');assert.equal(w.document.querySelector('[data-action="new"]'),null);click(w,'view');assert.equal(w.document.getElementById('jenc-notes-0').value,'Before discharge.');click(w,'edit');notes(w,'Corrected before discharge.');await w.JasonEncounters.save();assert.equal(w.JasonEncounters.state.record.assessment.versions.length,2);assert.equal(w.JasonEncounters.state.rows.length,1);});

test('infection status is two-state — Resolved kept, unrelated notes stay blank, legacy wording folds to Infection',async t=>{const w=setup(t);w.fixture.patient.inpatient_nurse_notes='Infection status: Resolved';await w.JasonEncounters.open(w.fixture.patient.id);assert.deepEqual(plain(w.JasonEncounters.state.draft.infection),{status:'Resolved',organism:''});w.fixture.patient.inpatient_nurse_notes='Serous secretion, other accessories discussed.';await w.JasonEncounters.open(w.fixture.patient.id);assert.deepEqual(plain(w.JasonEncounters.state.draft.infection),{status:'',organism:''});w.fixture.patient.inpatient_nurse_notes='CRE · Colonisation';await w.JasonEncounters.open(w.fixture.patient.id);assert.deepEqual(plain(w.JasonEncounters.state.draft.infection),{status:'Infection',organism:'CRE'});});

test('the infection Status dropdown offers only Infection and Resolved, blank by default',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);const sel=w.document.querySelector('[data-kind="infection"][data-field="status"]');assert.ok(sel,'status select');assert.deepEqual([...sel.options].map(o=>o.value),['','Infection','Resolved']);assert.equal(sel.value,'');assert.match([...sel.options][0].textContent,/choose/);});

test('every stoma has its own column named by type, with no S-numbers, tabs or notes dropdown',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);const page=w.document.querySelector('#page-jason-encounters');
  const titles=sel=>Array.from(page.querySelectorAll('[data-step="'+sel+'"] .jenc-stoma-title'),h=>h.textContent);
  assert.deepEqual(titles('review'),['Loop Ileostomy','Urostomy']);assert.deepEqual(titles('appliances'),['Loop Ileostomy','Urostomy']);
  assert.deepEqual(Array.from(page.querySelectorAll('[data-step="report"] .jenc-notes-label'),l=>l.textContent),['Loop Ileostomy — clinical notes','Urostomy — clinical notes']);
  assert.equal(page.querySelectorAll('[data-kind="stoma"][data-field="colour"]').length,2);assert.equal(page.querySelectorAll('[data-section^="complications:"]').length,2);
  assert.equal(page.querySelector('[data-action="stoma"]'),null);assert.equal(page.querySelector('[data-kind="global"]'),null);assert.equal(page.querySelector('#jenc-notes'),null);
  assert.doesNotMatch(page.textContent,/\bS[12]\b/);
  click(w,'add-comp','[data-uid="stoma-two"]');change(w,'[data-kind="comp"][data-uid="stoma-two"][data-field="text"]','Retraction');const s=w.JasonEncounters.state.draft.stomas;assert.equal(s[0].complications.length,0);assert.equal(s[1].complications[0].text,'Retraction');});

test('an older encounter with one set of episode notes still shows them as General notes',async t=>{const w=setup(t);
  const snap={stomas:[{uid:'stoma-one',number:'S1',type:'Loop ileostomy',colour:'',output:['Gas'],appliances:['Drainable pouch'],accessories:[],complications:[],rod:{status:'Not recorded'}},{uid:'stoma-two',number:'S2',type:'Urostomy',colour:'',output:[],appliances:['Urostomy pouch'],accessories:[],complications:[],rod:{status:'Not recorded'}}],scope:['stoma-one'],notes:'Old episode notes.',infection:{status:'',organism:''},referrals:[]};
  w.fixture.records.push({id:'44444444-4444-4444-8444-444444444444',patient_id:w.fixture.patient.id,episode_id:w.fixture.episode.id,episode_ref:'EP-DEMO',encounter_date:'2026-10-05',created_at:'2026-10-05T08:00:00Z',created_by_name:'Jason Fenech',assessment:{schema:2,current_version:1,snapshot:snap,versions:[{version:1,saved_at:'2026-10-04T10:00:00Z',author_name:'Jason Fenech',snapshot:snap,report:'S1 — Loop ileostomy: function / output: Gas.\nNotes: Old episode notes.'}]}});
  await w.JasonEncounters.open(w.fixture.patient.id);click(w,'history');click(w,'view');
  assert.equal(w.document.getElementById('jenc-notes').value,'Old episode notes.');assert.match(w.document.querySelector('label[for="jenc-notes"]').textContent,/General notes/);
  assert.match(w.document.getElementById('jenc-report').textContent,/S1 — Loop ileostomy/);assert.match(w.document.querySelector('[data-field="output"][data-uid="stoma-one"]').closest('details').textContent,/Gas/);
  click(w,'edit');assert.deepEqual(plain(w.JasonEncounters.state.draft.scope),['stoma-one','stoma-two']);await w.JasonEncounters.save();assert.match(w.document.querySelector('[role="alert"]').textContent,/no changes/);});

test('an encounter is coded ENC-ID-date, and reopening it the same day continues it as V2',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);notes(w,'Morning review.');await w.JasonEncounters.save();
  assert.match(w.document.querySelector('.jenc-version strong').textContent,/^ENC-DEMO-001-051026 · V1$/);assert.match(w.document.querySelector('[role="status"]').textContent,/ENC-DEMO-001-051026 saved · V1/);
  await w.JasonEncounters.open(w.fixture.patient.id);const s=w.JasonEncounters.state;assert.equal(s.editable,true);assert.equal(s.record.id,w.fixture.records[0].id);assert.equal(w.document.getElementById('jenc-notes-0').value,'Morning review.');
  assert.match(w.document.querySelector('[role="status"]').textContent,/already saved — your changes will be saved as V2/);
  notes(w,'Morning review. Afternoon: output increased.');await w.JasonEncounters.save();assert.equal(w.fixture.records.length,1);assert.equal(w.fixture.calls[1].args.p_encounter_id,w.fixture.records[0].id);assert.equal(w.JasonEncounters.state.record.assessment.versions.length,2);
  assert.equal(w.JasonEncounters.code({id:'b',encounter_date:'2026-10-05',created_at:'2026-10-05T12:00:00Z'},w.fixture.patient,[{id:'a',encounter_date:'2026-10-05',created_at:'2026-10-05T09:00:00Z'},{id:'b',encounter_date:'2026-10-05',created_at:'2026-10-05T12:00:00Z'}]),'ENC-DEMO-001-051026-2');
  await w.JasonEncounters.open(w.fixture.patient.id,w.fixture.records[0].id);assert.equal(w.JasonEncounters.state.editable,false);assert.equal(w.JasonEncounters.state.viewVersion.version,2);});

test('only a loop stoma offers the Rod present tick; it shows the removal date and unticking records removal',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);const q=x=>w.document.querySelector(x);
  assert.equal(q('[data-kind="rod"][data-uid="stoma-two"]'),null);assert.equal(q('[data-kind="rod"][data-field="present"][data-uid="stoma-one"]').checked,true);
  assert.equal(q('[data-kind="rod"][data-field="due"][data-uid="stoma-one"]').value,'2026-10-07');
  assert.doesNotMatch(q('[data-section="complications:stoma-one"] summary').textContent,/rod/i);
  change(w,'[data-kind="rod"][data-field="due"][data-uid="stoma-one"]','');await w.JasonEncounters.save();assert.match(q('[role="alert"]').textContent,/planned rod removal date/);assert.equal(w.fixture.calls.length,0);
  change(w,'[data-kind="rod"][data-field="due"][data-uid="stoma-one"]','2026-10-07');
  change(w,'[data-kind="rod"][data-field="present"][data-uid="stoma-one"]',false);assert.equal(w.JasonEncounters.state.draft.stomas[0].rod.status,'Removed');assert.equal(q('[data-kind="rod"][data-field="removed"][data-uid="stoma-one"]').value,'2026-10-05');
  await w.JasonEncounters.save();const a=w.fixture.calls[0].args;assert.deepEqual(plain(a.p_impact.patient_patch),{rod_stoma_uid:'stoma-one',rod_removal_date:'2026-10-07',rod_removed_date:'2026-10-05'});assert.match(a.p_report,/Loop Ileostomy — .*rod removed 2026-10-05/);
  for(const type of ['End colostomy','End ileostomy','Urostomy'])assert.equal(w.JasonEncounters.rodCapable(type),false,type);});

test('peristomal skin is one list: Healthy skin stands alone, every finding becomes a complication of that stoma, Healthy resolves it',async t=>{const w=setup(t);await w.JasonEncounters.open(w.fixture.patient.id);const q=x=>w.document.querySelector(x);
  const pick=(uid,value,on)=>change(w,'[data-kind="skin"][data-field="pick"][data-uid="'+uid+'"][value="'+value+'"]',on);
  assert.deepEqual([...w.document.querySelectorAll('[data-kind="skin"][data-uid="stoma-one"]')].map(x=>x.value),['Healthy skin','Irritation','Excoriation','Fungal infection','Psoriasis','Eczema','Dermatitis','Metaplasia','Ulcerated','Varices','Bluish discolouration','Not assessed — flange in situ']);
  pick('stoma-two','Excoriation',true);pick('stoma-two','Ulcerated',true);
  assert.equal(q('[data-kind="skin"][data-field="pick"][data-uid="stoma-two"]').closest('details').open,false);
  const st=w.JasonEncounters.state.draft.stomas;assert.deepEqual(plain(st[1].complications.map(c=>[c.text,c.status])),[['Excoriation','open'],['Ulcerated','open']]);assert.equal(st[0].complications.length,0);
  pick('stoma-two','Ulcerated',false);assert.deepEqual(plain(st[1].complications.map(c=>c.text)),['Excoriation']);
  assert.match(q('[data-section="complications:stoma-two"] summary').textContent,/Excoriation · active/);
  pick('stoma-one','Healthy skin',true);pick('stoma-one','Irritation',true);assert.deepEqual(plain(st[0].skin),{status:'Not healthy',problems:['Irritation']});
  pick('stoma-one','Healthy skin',true);assert.deepEqual(plain(st[0].skin),{status:'Healthy',problems:[]});assert.equal(st[0].complications.length,0);
  await w.JasonEncounters.save();const a=w.fixture.calls[0].args;assert.match(a.p_report,/Urostomy — .*peristomal skin: not healthy \(Excoriation\)/);assert.match(a.p_report,/Loop Ileostomy — .*peristomal skin: healthy/);
  const comps=JSON.parse(a.p_impact.patient_patch.complications);assert.deepEqual(comps.map(c=>[c.text,c.stoma_uid,c.status]),[['Excoriation','stoma-two','open']]);
  click(w,'edit');pick('stoma-two','Healthy skin',true);assert.equal(w.JasonEncounters.state.draft.stomas[1].complications[0].status,'resolved');
  await w.JasonEncounters.save();assert.equal(JSON.parse(w.fixture.calls[1].args.p_impact.patient_patch.complications)[0].status,'resolved');});

test('"Not assessed — flange in situ" records no finding, stands alone, and leaves an existing skin complication open',async t=>{
  const w=setup(t);
  w.fixture.patient.complications=JSON.stringify([{id:'c1',text:'Irritation',stoma_uid:'stoma-one',status:'open',events:[]}]);
  await w.JasonEncounters.open(w.fixture.patient.id);
  const pick=(uid,value,on)=>change(w,'[data-kind="skin"][data-field="pick"][data-uid="'+uid+'"][value="'+value+'"]',on);
  const st=()=>w.JasonEncounters.state.draft.stomas[0];
  assert.deepEqual(plain(st().skin),{status:'Not healthy',problems:['Irritation']});   // seeded from the open complication
  pick('stoma-one','Not assessed — flange in situ',true);
  assert.deepEqual(plain(st().skin),{status:'Not assessed',problems:[]});               // stands alone, no finding recorded
  assert.equal(st().complications.find(c=>c.id==='c1').status,'open');                  // not resolved — the skin was not seen
  pick('stoma-one','Excoriation',true);                                                 // a finding switches away from it
  assert.deepEqual(plain(st().skin),{status:'Not healthy',problems:['Excoriation']});
  pick('stoma-one','Not assessed — flange in situ',true);                               // and ticking it again clears the finding
  assert.equal(st().skin.status,'Not assessed');
  notes(w,'Flange left in situ, skin not seen.');
  await w.JasonEncounters.save();
  assert.match(w.fixture.calls[0].args.p_report,/Loop Ileostomy — .*peristomal skin: not assessed \(flange in situ\)/);
});

test('"+ Add other…" adds a new skin finding, output or colour to the list for good and picks it',async t=>{const w=setup(t);const answers=['Contact allergy','Mucus','Pale pink'];w.prompt=()=>answers.shift();w.alert=()=>{};
  await w.JasonEncounters.open(w.fixture.patient.id);const q=x=>w.document.querySelector(x);
  click(w,'add-option','[data-option="skin"][data-uid="stoma-two"]');await new Promise(r=>setTimeout(r,0));
  const st=w.JasonEncounters.state.draft.stomas;assert.deepEqual(plain(st[1].skin),{status:'Not healthy',problems:['Contact allergy']});assert.deepEqual(plain(st[1].complications.map(c=>c.text)),['Contact allergy']);
  assert.ok(q('[data-kind="skin"][data-uid="stoma-one"][value="Contact allergy"]'),'it joins every stoma’s list');
  click(w,'add-option','[data-option="output"][data-uid="stoma-one"]');await new Promise(r=>setTimeout(r,0));assert.deepEqual(plain(st[0].output),['Mucus']);
  change(w,'[data-kind="stoma"][data-field="colour"][data-uid="stoma-one"]','__add__');await new Promise(r=>setTimeout(r,0));assert.equal(st[0].colour,'Pale pink');
  assert.equal(q('[data-kind="stoma"][data-field="colour"][data-uid="stoma-two"] option[value="Pale pink"]')?.textContent,'Pale pink');
  assert.deepEqual(plain(w.JasonEncounters.options('output')).slice(-1),['Mucus']);assert.equal(w.JasonEncounters.isSkinProblem('contact allergy'),true);assert.equal(w.JasonEncounters.isSkinProblem('Healthy skin'),false);
  const kept=JSON.parse(w.localStorage.getItem('jenc-assessment-options'));assert.deepEqual(kept,{colour:['Pale pink'],output:['Mucus'],skin:['Contact allergy']});});

test('the rod question is asked only at the first encounter for a stoma, not at later ones',async t=>{const w=setup(t);
  const snap={stomas:[{uid:'stoma-one',type:'Loop ileostomy',rod:{status:'In place',due:'2026-10-07',removed:''},complications:[],appliances:[],accessories:[]}],scope:['stoma-one'],notes:'',infection:{status:'',organism:''},referrals:[]};
  w.fixture.records.push({id:'55555555-5555-4555-8555-555555555555',patient_id:w.fixture.patient.id,episode_id:w.fixture.episode.id,encounter_date:'2026-10-03',created_at:'2026-10-03T10:00:00Z',assessment:{schema:2,current_version:1,snapshot:snap,versions:[{version:1,snapshot:snap,report:'r'}]}});
  await w.JasonEncounters.open(w.fixture.patient.id);const q=x=>w.document.querySelector(x);
  assert.equal(w.JasonEncounters.state.record,null);assert.equal(q('[data-kind="rod"]'),null,'second encounter: no rod question');
  notes(w,'Second review.');await w.JasonEncounters.save();assert.doesNotMatch(w.fixture.calls[0].args.p_report,/rod/);assert.deepEqual(plain(w.fixture.calls[0].args.p_impact.patient_patch),{});
  click(w,'history');[...w.document.querySelectorAll('[data-action="view"]')].find(b=>b.dataset.id==='55555555-5555-4555-8555-555555555555').click();
  assert.ok(q('[data-kind="rod"][data-uid="stoma-one"]'),'the first encounter still shows its rod answer');});
test('an open skin complication on record pre-fills the peristomal skin as Not healthy',async t=>{const w=setup(t);w.fixture.patient.complications=JSON.stringify([{id:'c1',text:'Mucocutaneous separation',stoma_uid:'stoma-one',status:'open'},{id:'c2',text:'Retraction',stoma_uid:'stoma-one',status:'open'}]);
  await w.JasonEncounters.open(w.fixture.patient.id);const k=w.JasonEncounters.state.draft.stomas[0].skin;assert.deepEqual(plain(k),{status:'Not healthy',problems:['Mucocutaneous separation']});
  assert.deepEqual(plain(w.JasonEncounters.state.draft.stomas[1].skin),{status:'',problems:[]});});

test('an encounter can be edited only on the day it was recorded; later it is read-only and locked',async t=>{const w=setup(t);
  const snap={stomas:[{uid:'stoma-one',type:'Loop ileostomy',colour:'Dusky',output:[],appliances:['Drainable pouch'],accessories:[],complications:[],rod:{status:'Not recorded'},notes:'Yesterday.'}],scope:['stoma-one'],notes:'',infection:{status:'',organism:''},referrals:[]};
  w.fixture.records.push({id:'66666666-6666-4666-8666-666666666666',patient_id:w.fixture.patient.id,episode_id:w.fixture.episode.id,encounter_date:'2026-10-04',created_at:'2026-10-04T10:00:00Z',assessment:{schema:2,current_version:1,snapshot:snap,versions:[{version:1,author_name:'Jason Fenech',snapshot:snap,report:'r'}]}});
  await w.JasonEncounters.open(w.fixture.patient.id);assert.equal(w.JasonEncounters.state.record,null,'a new day starts a new encounter');
  click(w,'history');click(w,'view');const page=w.document.querySelector('#page-jason-encounters');
  assert.equal(page.querySelector('[data-action="edit"]'),null);assert.match(page.querySelector('.jenc-locked').textContent,/Recorded 2026-10-04 — an encounter can be edited only on the day it was recorded/);
  assert.equal(w.JasonEncounters.state.editable,false);assert.match(page.querySelector('.jenc-signature').textContent,/Signed by: Jason Fenech/);});

test('referrals belong to the patient: referred with date and signer, ticked Seen later, shown at the top and carried to the next encounter',async t=>{const w=setup(t);
  const patches=[];w.updatePatientTolerant=async(id,patch)=>{patches.push(JSON.parse(JSON.stringify(patch)));Object.assign(w.fixture.patient,patch);return {error:null,dropped:[]};};
  await w.JasonEncounters.open(w.fixture.patient.id);const q=x=>w.document.querySelector(x);
  assert.equal(q('[data-kind="referral"][data-field="status"]'),null,'no status dropdown');
  click(w,'add-referral');change(w,'[data-kind="referral"][data-field="profession"]','Dietitian');
  assert.match(q('.jenc-head .jenc-ref-chips').textContent,/Referred to Dietitian/);
  await w.JasonEncounters.save();
  assert.equal(patches.length,1);const saved=patches[0].support_referrals;assert.equal(saved.length,1);
  assert.deepEqual({p:saved[0].profession,on:saved[0].referred_on,by:saved[0].referred_by,seen:saved[0].seen},{p:'Dietitian',on:'2026-10-05',by:'Jason Fenech',seen:false});
  assert.match(w.fixture.calls[0].args.p_report,/Referred to Dietitian on 2026-10-05\./);
  // Next day: a new encounter (another episode would behave the same) starts from the patient's list.
  w.TODAY='2026-10-08';await w.JasonEncounters.open(w.fixture.patient.id);
  assert.equal(w.JasonEncounters.state.record,null);assert.equal(w.JasonEncounters.state.draft.referrals[0].profession,'Dietitian');
  assert.ok(q('.jenc-ref-name'),'an existing referral shows by name, not as a dropdown');assert.equal(q('[data-action="remove-referral"]'),null,'an earlier referral is not removed here');
  change(w,'[data-kind="referral"][data-field="seen"]',true);assert.equal(q('[data-kind="referral"][data-field="seen_on"]').value,'2026-10-08');
  assert.match(q('.jenc-head .jenc-ref-chips').textContent,/Seen by Dietitian/);
  await w.JasonEncounters.save();const last=patches[patches.length-1].support_referrals;assert.equal(last.length,1);
  assert.deepEqual({seen:last[0].seen,on:last[0].seen_on,by:last[0].seen_by,id:last[0].id},{seen:true,on:'2026-10-08',by:'Jason Fenech',id:saved[0].id});
  assert.match(w.fixture.calls[1].args.p_report,/Seen by Dietitian on 2026-10-08\./);});

test('older encounters with a referral status still read: Seen/Completed count as seen, Declined is dropped',t=>{const w=setup(t);
  const n=w.JasonEncounters.normReferral;assert.equal(n({profession:'Psychologist',status:'Completed'}).seen,true);assert.equal(n({profession:'Dietitian',status:'Needed'}).seen,false);assert.equal(n({profession:'Social worker',status:'Declined'}),null);
  const merged=w.JasonEncounters.mergedReferrals([{id:'a',profession:'Dietitian'},{id:'b',profession:'Psychologist'}],[{id:'b',profession:'Psychologist'}],[{id:'c',profession:'Social worker'}]);
  assert.deepEqual(merged.map(r=>r.id),['a','c'],'removed in this encounter goes; others stay; new ones join');});

test('options added on this computer are still there after the page reloads',t=>{
  const dom=new JSDOM('<div id="app"><main class="main"></main></div>',{runScripts:'outside-only',url:'https://example.test'});t.after(()=>dom.window.close());const w=dom.window;boot(w);
  w.localStorage.setItem('jenc-assessment-options',JSON.stringify({colour:['Pale pink'],output:['Mucus'],skin:['Granuloma']}));
  w.eval(script);
  assert.ok(w.JasonEncounters.options('skin').includes('Granuloma'));assert.ok(w.JasonEncounters.options('output').includes('Mucus'));assert.ok(w.JasonEncounters.options('colour').includes('Pale pink'));
  assert.equal(w.JasonEncounters.isSkinProblem('granuloma'),true);
});

test('an added option is signed with the nurse who added it, not Jason',async t=>{const w=setup(t);
  w.fixture.email='jacqueline.sammut@gov.mt';w.attDisplayName=()=> 'Jacqueline Sammut';
  const inserts=[];const from=w.SB.from;w.SB.from=table=>table==='assessment_options'?{select:()=>({order:async()=>({data:[],error:null})}),insert:async row=>{inserts.push(JSON.parse(JSON.stringify(row)));return {error:null};}}:from(table);
  await w.JasonEncounters.open(w.fixture.patient.id);w.prompt=()=> 'Contact allergy';
  click(w,'add-option','[data-option="skin"][data-uid="stoma-two"]');await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(inserts,[{field:'skin',name:'Contact allergy',created_by:'Jacqueline Sammut'}]);
});

test('a referral saved without an id keeps one stable id, so it is matched rather than duplicated',t=>{const w=setup(t);
  const n=w.JasonEncounters.normReferral,r={profession:'Dietitian',referred_on:'2026-10-01'};
  assert.equal(n(r).id,n(r).id);assert.equal(n(r).id,'ref-dietitian-2026-10-01');
  assert.deepEqual(w.JasonEncounters.mergedReferrals([n(r)],[r],[{...r,seen:true,seen_on:'2026-10-05'}]).map(x=>[x.id,x.seen]),[['ref-dietitian-2026-10-01',true]]);
});

test('correcting today’s encounter keeps a referral ticked Seen elsewhere since',async t=>{const w=setup(t);
  const patches=[];w.updatePatientTolerant=async(id,patch)=>{patches.push(JSON.parse(JSON.stringify(patch)));Object.assign(w.fixture.patient,patch);return {error:null,dropped:[]};};
  await w.JasonEncounters.open(w.fixture.patient.id);click(w,'add-referral');change(w,'[data-kind="referral"][data-field="profession"]','Psychologist');await w.JasonEncounters.save();
  const id=patches[0].support_referrals[0].id;
  // Later the same day, the Psychologist referral is ticked Seen somewhere else.
  w.fixture.patient.support_referrals=[{...patches[0].support_referrals[0],seen:true,seen_on:'2026-10-05',seen_by:'Lorraine Marie Stivala'}];
  await w.JasonEncounters.open(w.fixture.patient.id);assert.equal(w.JasonEncounters.state.editable,true);
  assert.equal(w.JasonEncounters.state.draft.referrals[0].seen,true,'the correction starts from the patient’s current list');
  notes(w,'Afternoon review.');await w.JasonEncounters.save();
  assert.equal(patches.length,1,'nothing changed in the referrals, so the patient list is not rewritten');
  const last=w.fixture.patient.support_referrals;
  assert.equal(last.find(r=>r.id===id).seen,true);assert.equal(last.find(r=>r.id===id).seen_by,'Lorraine Marie Stivala');
});

test('a handover patient with no admission record yet gets one opened, so the encounter works',async t=>{const w=setup(t);
  w.fixture.episode.is_current=false;w.fixture.episode.discharge_date='2026-09-01';w.fixture.patient.is_inpatient=true;w.fixture.patient.inpatient_since='2026-10-04';
  const made=[];w.createInpatientEpisodeFor=async(pid,date)=>{made.push([pid,date]);return {data:{...JSON.parse(JSON.stringify(w.fixture.episode)),id:'99999999-9999-4999-8999-999999999999',episode_ref:'EP-NEW',is_current:true,discharge_date:null,record_date:date},error:null};};
  await w.JasonEncounters.open(w.fixture.patient.id);
  assert.deepEqual(made,[[w.fixture.patient.id,'2026-10-04']]);assert.equal(w.JasonEncounters.state.mode,'form');assert.equal(w.JasonEncounters.state.editable,true);
  assert.equal(w.JasonEncounters.state.episode.episode_ref,'EP-NEW');
});

test('a fistula patient’s encounter has one Fistula column: output, skin around the fistula and appliance — no colour, no rod',async t=>{const w=setup(t);
  const fis=[{uid:'fistula',code:'F1',type:'Fistula',typeLabel:'Fistula',shortLabel:'Fistula',origin:'fistula'}];
  w.stomaTimeline=()=>JSON.parse(JSON.stringify(fis));w.stomasPresentOn=()=>JSON.parse(JSON.stringify(fis));w.patientStomaList=()=>[];
  w.fixture.patient.patient_kind='fistula';w.fixture.patient.rod_stoma_uid=null;w.fixture.patient.rod_removal_date=null;
  w.fixture.episode.appliances=[{stoma_uid:'fistula',changed_on:'2026-10-02',appliances:['Wound manager (large)'],accessories:['Stoma Seals']}];
  await w.JasonEncounters.open(w.fixture.patient.id);const page=w.document.querySelector('#page-jason-encounters');
  assert.match(page.querySelector('#jenc-review-heading').textContent,/Fistula review/);
  assert.deepEqual([...page.querySelectorAll('[data-step="review"] .jenc-stoma-title')].map(h=>h.textContent),['Fistula']);
  assert.equal(page.querySelector('[data-kind="stoma"][data-field="colour"]'),null);assert.equal(page.querySelector('[data-kind="rod"]'),null);
  assert.ok([...page.querySelectorAll('.jenc-field > label')].some(l=>l.textContent==='Skin around the fistula'));
  assert.ok([...page.querySelectorAll('.jenc-field > label')].some(l=>l.textContent==='Output'));
  assert.match(page.querySelector('[data-step="appliances"] .jenc-setup').textContent,/Wound manager \(large\)/);
  change(w,'[data-field="output"][value="Bilious effluent"]',true);change(w,'[data-kind="skin"][data-field="pick"][value="Excoriation"]',true);
  await w.JasonEncounters.save();const a=w.fixture.calls[0].args;
  assert.match(a.p_report,/^Fistula — output: Bilious effluent; skin around the fistula: not healthy \(Excoriation\); appliance: Wound manager \(large\)/);
  assert.equal(JSON.parse(a.p_impact.patient_patch.complications)[0].stoma_uid,'fistula');});
