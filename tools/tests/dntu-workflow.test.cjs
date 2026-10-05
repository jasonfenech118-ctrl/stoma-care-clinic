const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../../assets/dntu-workflow.js'),'utf8');
const closed=s=>['deceased','reversed'].includes(s);
const context=vm.createContext({TODAY:'2026-09-16',isClosedFollowupStatus:closed});
vm.runInContext(source,context);
const appt=(id,date,status='did_not_attend',slot='09:00')=>({id,patient_id:'demo',appt_date:date,appt_slot:slot,status,assigned_to:null,bank_staff_id:null});
function state(rows=[],status='booked'){
  const selected=appt('current','2026-09-16',status);
  return {appt:selected,p:{followup_status:'active',followup_owner:'Common'},history:[...rows,selected],date:selected.appt_date,slot:selected.appt_slot,
    owner:'Common',year:2026,pastEvents:[],saving:false,followupPending:false};
}
const plan=s=>context.dntuBuildSavePlan(s,{month:10,year:2026});
const copy=v=>JSON.parse(JSON.stringify(v));
test('first DNTU updates the selected appointment and sets the availability month without inventing history',()=>{
  const p=plan(state());assert.equal(p.current.status,'did_not_attend');assert.equal(p.rows.length,0);assert.equal(p.streak,1);
  assert.deepEqual(copy(p.patientUpdate),{followup_due_month:10,followup_year:2026,followup_flexible:true});
});
test('one explicitly dated earlier event produces a second DNTU with no invented time',()=>{
  const s=state();s.pastEvents=['2026-09-02'];const p=plan(s);assert.equal(p.rows.length,1);assert.equal(p.rows[0].appt_slot,'00:00');assert.equal(p.streak,2);
});
test('reopening a recorded DNTU counts existing history once and does not rewrite it',()=>{
  const p=plan(state([appt('past','2026-09-01')],'did_not_attend'));assert.equal(p.current,null);assert.equal(p.rows.length,0);assert.equal(p.streak,2);assert.equal(p.patientUpdate,null);
});
test('third consecutive miss pauses follow-up instead of rescheduling it',()=>{
  const s=state([appt('past','2026-08-01')]);s.pastEvents=['2026-09-01'];const p=plan(s);assert.deepEqual(copy(p.patientUpdate),{followup_status:'paused'});assert.equal(p.streak,3);
});
test('previous events can be added to a saved DNTU without changing a separate future booking',()=>{
  const s=state([appt('future','2026-10-01','booked')],'did_not_attend');s.pastEvents=['2026-09-01'];const p=plan(s);
  assert.equal(p.current,null);assert.equal(p.rows.length,1);assert.equal(p.streak,2);assert.equal(p.patientUpdate,null);assert.equal(s.history[0].status,'booked');
});
test('Seen breaks the run and prevents importing an earlier miss into the current streak',()=>{
  const s=state([appt('reset','2026-09-10','attended')]);s.pastEvents=['2026-09-01'];assert.throws(()=>plan(s),/breaks this run/);
});
test('patient, clinic and legacy cancellations neither increment nor reset a DNTU sequence',()=>{
  for(const cancellation_source of ['patient','clinic',null]){const s=state([appt('past','2026-09-01'),{...appt('cancel','2026-09-10','cancelled'),cancellation_source}]);assert.equal(plan(s).streak,2);assert.equal(plan(s).rows.length,0);}
});
test('recording an older miss preserves follow-up after a later Seen appointment',()=>{
  const s=state([appt('later','2026-09-16','attended','12:00')]);s.pastEvents=['2026-08-01','2026-09-01'];const p=plan(s);
  assert.equal(p.streak,0);assert.equal(p.patientUpdate,null);assert.equal(p.willSchedule,false);
});
test('future, impossible, blank, unordered and duplicate date-only events are refused',()=>{
  const future=state();future.appt.appt_date=future.date='2026-10-01';assert.throws(()=>plan(future),/future/);
  for(const dates of [['2026-02-31'],[''],['2026-09-16'],['2026-09-02','2026-09-01'],['2026-09-01','2026-09-01']]){const s=state();s.pastEvents=dates;assert.throws(()=>plan(s),/valid date|before the appointment|date order/);}
  const duplicate=state([appt('booked','2026-09-01','booked','14:30')]);duplicate.pastEvents=['2026-09-01'];assert.throws(()=>plan(duplicate),/appointment is already recorded/);
});
test('saved history cannot be reduced by an editable count because the count is calculated from records',()=>{
  const s=state([appt('past','2026-09-01')]);assert.equal(plan(s).streak,2);assert.equal(s.history.length,2);
});
test('closed follow-up remains closed at one or three misses',()=>{
  for(const status of ['deceased','reversed'])for(const rows of [[],[appt('one','2026-08-01'),appt('two','2026-09-01')]]){const s=state(rows);s.p.followup_status=status;assert.equal(plan(s).patientUpdate,null);}
});
test('reviewing a saved DNTU saves only an explicit owner change',()=>{
  const s=state([],'did_not_attend');s.owner='Jason';assert.deepEqual(copy(plan(s).patientUpdate),{followup_owner:'Jason'});
});
// Real source filters operate on synthetic rows; no live clinical data is used.
async function saveFixture(s,options={},document){
  const writes=[],errors=[];let history=s.history.map(a=>({...a})),closedCount=0,resolves=0;
  const doc=document||{getElementById:()=>null,querySelectorAll:()=>[]};
  const env=vm.createContext({TODAY:'2026-09-16',document:doc,isClosedFollowupStatus:closed,missingColumnFromError:()=>'',
    htmlSafe:v=>String(v??''),dntuOrdinal:n=>n+'th',followupOwnerOptions:v=>`<option selected>${v}</option>`,
    closeModal:()=>closedCount++,refreshAppointmentViews:()=>{},getCurrentUserForAudit:async()=>({email:'demo@example.invalid',name:'Test user'}),
    SB:{from(table){let kind,body;const filters=[];const query={
      insert(v){kind='insert';body=v;return query;},update(v){kind='update';body={...v};return query;},eq(k,v){filters.push([k,v]);return query;},select(){return query;},
      then(resolve){
        writes.push({table,kind,body});
        if(table==='patients')return Promise.resolve(resolve({error:options.failPatient?{message:'Follow-up offline'}:null}));
        if(kind==='insert'){if(options.failHistory)return Promise.resolve(resolve({error:{message:'Insert blocked'}}));const data=body.map((r,i)=>({...r,id:`new-${history.length+i}`}));history.push(...data);return Promise.resolve(resolve({data,error:null}));}
        if(options.failCurrent)return Promise.resolve(resolve({data:null,error:{message:'Update blocked'}}));
        if(options.changedCurrent)history=history.map(a=>a.id===s.appt.id?{...a,status:'attended'}:a);
        const data=[];history=history.map(a=>{if(!filters.every(([k,v])=>a[k]===v))return a;data.push({id:a.id});return{...a,...body};});return Promise.resolve(resolve({data,error:null}));
      }
    };return query;}}
  });
  vm.runInContext(source,env);env.fixtureState=s;env.historyRead=async()=>options.stale?[...history,appt('concurrent','2026-08-20')]:history;
  env.resolveMonth=async()=>{resolves++;await Promise.resolve();if(options.failAvailability)throw Error('Availability offline');return{month:10,year:2026};};env.showError=m=>errors.push(m);
  vm.runInContext('dntuNurseState=fixtureState;dntuLoadHistory=historyRead;dntuResolveDueMonth=resolveMonth;',env);
  if(document)env.dntuRenderForm();else vm.runInContext('dntuRenderForm=()=>{};dntuFormError=showError;',env);
  await Promise.all([env.saveDntuNurseForm(),env.saveDntuNurseForm()]);return {writes,errors,closed:()=>closedCount,resolves:()=>resolves,s,env};
}
test('rapid saves during asynchronous availability lookup perform one appointment and follow-up write',async()=>{
  const r=await saveFixture(state());assert.equal(r.resolves(),1);assert.equal(r.writes.length,2);assert.equal(r.closed(),1);
});
test('adding history to a saved DNTU performs no current appointment update and resists double-clicks',async()=>{
  const s=state([],'did_not_attend');s.pastEvents=['2026-09-01'];const r=await saveFixture(s);assert.equal(r.writes.length,1);assert.equal(r.writes[0].kind,'insert');assert.equal(r.closed(),1);
});
test('another nurse changing the history blocks every write',async()=>{
  const r=await saveFixture(state(),{stale:true});assert.equal(r.writes.length,0);assert.match(r.errors[0],/history has changed/);
});
test('failed availability resolution leaves the appointment unsaved and available for retry',async()=>{
  const s=state(),r=await saveFixture(s,{failAvailability:true});assert.equal(r.writes.length,0);assert.match(r.errors[0],/Availability offline/);assert.equal(s.saving,false);
});
test('failed history insertion never marks the appointment or pauses follow-up',async()=>{
  const s=state();s.pastEvents=['2026-08-01','2026-09-01'];const r=await saveFixture(s,{failHistory:true});assert.equal(r.writes.length,1);assert.equal(r.writes[0].kind,'insert');assert.equal(r.closed(),0);
});
test('retry after a partial history save never inserts the same earlier events twice',async()=>{
  const s=state();s.pastEvents=['2026-08-01','2026-09-01'];const opts={failCurrent:true},r=await saveFixture(s,opts);
  assert.equal(r.writes.filter(w=>w.table==='patients').length,0);assert.match(r.errors[0],/Some changes were saved/);assert.equal(s.history.length,3);
  opts.failCurrent=false;await r.env.saveDntuNurseForm();assert.equal(r.writes.filter(w=>w.kind==='insert').length,1);assert.equal(r.closed(),1);assert.equal(r.writes.at(-1).body.followup_status,'paused');
});
test('retry after patient update failure retains the auto month without rewriting the missed appointment',async()=>{
  const s=state(),opts={failPatient:true},r=await saveFixture(s,opts);assert.equal(s.followupPending,true);assert.equal(r.closed(),0);assert.match(r.errors[0],/follow-up could not be updated/);
  opts.failPatient=false;await r.env.saveDntuNurseForm();assert.equal(r.closed(),1);assert.equal(s.followupPending,false);assert.equal(r.writes.filter(w=>w.table==='appointments').length,1);assert.equal(r.writes.at(-1).body.followup_due_month,10);
});
test('outcome changed after preflight is not overwritten and does not update follow-up',async()=>{
  const r=await saveFixture(state(),{changedCurrent:true});assert.equal(r.writes.length,1);assert.match(r.errors[0],/appointment has changed/);assert.equal(r.closed(),0);
});
test('blank added date shows an error, retains the row and enables correction without writes',async()=>{
  const dom=new JSDOM('<div id="mb"></div>');dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  const s=state();s.pastEvents=[''];const r=await saveFixture(s,{},dom.window.document);assert.equal(r.writes.length,0);assert.match(dom.window.document.getElementById('dw-error').textContent,/valid date/);
  assert.equal(dom.window.document.querySelectorAll('.dw-past-date').length,1);assert.equal(dom.window.document.getElementById('dw-save').disabled,false);dom.window.close();
});
