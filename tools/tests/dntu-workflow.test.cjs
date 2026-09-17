const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../assets/dntu-workflow.js'),'utf8');
const context=vm.createContext({TODAY:'2026-09-16',isClosedFollowupStatus:s=>['deceased','reversed','discharged_gozo','relocated_overseas'].includes(s)});
vm.runInContext(source,context);
const appt=(id,date,status='did_not_attend',slot='09:00')=>({id,patient_id:'demo',appt_date:date,appt_slot:slot,status,assigned_to:null,bank_staff_id:null});
function state(rows=[],status='booked'){
  const selected=appt('current','2026-09-16',status);
  return {appt:selected,p:{followup_status:'active'},history:[...rows,selected],date:selected.appt_date,slot:selected.appt_slot,
    nurse:'common',mode:'record',targets:{record:1,history:1},drafts:{record:[],history:[]},changeFollowup:false};
}
const earlier=(date,slot='09:00')=>({appt_date:date,appt_slot:slot,nurse:'common'});
const plan=s=>context.dntuBuildSavePlan(s,'2026-09-16');

test('a first DNTU updates exactly the selected appointment without inventing history or a follow-up month',()=>{
  const p=plan(state());assert.equal(p.current.status,'did_not_attend');assert.equal(p.rows.length,0);assert.equal(p.streak,1);assert.equal(p.patientUpdate,null);
});
test('one missing earlier event plus the selected appointment produces the second DNTU',()=>{
  const s=state();s.targets.record=2;s.drafts.record=[earlier('2026-09-02')];
  const p=plan(s);assert.equal(p.rows.length,1);assert.equal(p.streak,2);assert.equal(p.patientUpdate,null);
});
test('existing history is counted once when reopening an already recorded DNTU',()=>{
  const s=state([appt('past','2026-09-01')],'did_not_attend');s.targets.record=2;
  const p=plan(s);assert.equal(p.rows.length,0);assert.equal(p.streak,2);
});
test('the third DNTU pauses follow-up only after a valid sequence is prepared',()=>{
  const s=state([appt('past','2026-08-01')]);s.targets.record=3;s.drafts.record=[earlier('2026-09-01')];
  assert.equal(plan(s).patientUpdate.followup_status,'paused');
});
test('history-only can be saved alongside a future booking and never updates that appointment',()=>{
  const s=state();s.appt.appt_date=s.date='2026-10-01';s.mode='history';s.targets.history=2;
  s.drafts.history=[earlier('2026-08-01'),earlier('2026-09-01')];
  const p=plan(s);assert.equal(p.current,null);assert.equal(p.rows.length,2);assert.equal(p.streak,2);assert.equal(p.patientUpdate,null);assert.equal(s.appt.status,'booked');
});
test('history-only uses all known current DNTUs, including the selected already missed appointment',()=>{
  const s=state([],'did_not_attend');s.mode='history';s.targets.history=2;s.drafts.history=[earlier('2026-09-01')];
  const p=plan(s);assert.equal(p.current,null);assert.equal(p.rows.length,1);assert.equal(p.streak,2);
});
test('Seen resets the sequence; dates across a reset cannot satisfy a higher count',()=>{
  const s=state([appt('reset','2026-09-10','attended')]);s.targets.record=2;s.drafts.record=[earlier('2026-09-01')];
  assert.throws(()=>plan(s),/breaks this sequence/);
});
test('patient, clinic and legacy cancellations never increment or reset a DNTU sequence',()=>{
  for(const source of ['patient','clinic',null]){
    const s=state([appt('past','2026-09-01'),{...appt('cancel','2026-09-10','cancelled'),cancellation_source:source}]);s.targets.record=2;
    const p=plan(s);assert.equal(p.streak,2);assert.equal(p.rows.length,0);
  }
});
test('correcting an older appointment does not pause a patient who attended later',()=>{
  const s=state([appt('later','2026-09-16','attended','12:00')]);s.targets.record=3;
  s.drafts.record=[earlier('2026-08-01'),earlier('2026-09-01')];
  const p=plan(s);assert.equal(p.streak,0);assert.equal(p.patientUpdate,null);
});
test('future events, impossible dates and duplicate event dates are refused',()=>{
  const future=state();future.appt.appt_date=future.date='2026-10-01';assert.throws(()=>plan(future),/future/);
  const invalid=state();invalid.targets.record=2;invalid.drafts.record=[earlier('2026-02-31')];assert.throws(()=>plan(invalid),/date and time/);
  const duplicate=state([appt('booked','2026-09-01','booked')]);duplicate.targets.record=2;duplicate.drafts.record=[earlier('2026-09-01')];assert.throws(()=>plan(duplicate),/already exists/);
  const equal=state();equal.targets.record=2;equal.drafts.record=[earlier('2026-09-16')];assert.throws(()=>plan(equal),/must be before/);
});
test('saved history cannot be silently reduced and missing dates cannot be omitted',()=>{
  const s=state([appt('past','2026-09-01')]);assert.throws(()=>plan(s),/Choose which/);
  s.targets.record=3;assert.throws(()=>plan(s),/date and time/);
});
test('closed follow-up statuses are preserved when a DNTU count reaches three',()=>{
  const s=state([appt('one','2026-08-01'),appt('two','2026-09-01')]);s.targets.record=3;s.p.followup_status='deceased';
  assert.equal(plan(s).patientUpdate,null);
});
test('history-only ignores any follow-up edits retained from the other tab',()=>{
  const s=state();s.mode='history';s.changeFollowup=true;s.month='12';s.year='2027';s.owner='Other';s.followupStatus='paused';s.drafts.history=[earlier('2026-09-01')];
  assert.equal(plan(s).patientUpdate,null);
});

// Exercise actual persistence branches with an in-memory database. No real
// Supabase client or patient data is used in these tests.
async function saveFixture(s,{stale=false,failCurrent=false,failPatient=false,failHistory=false}={}){
  const writes=[],errors=[];
  let history=s.history.map(a=>({...a})),closed=0;
  const doc={getElementById:()=>null,querySelectorAll:()=>[]};
  const env=vm.createContext({TODAY:'2026-09-16',document:doc,AUTO_AVAILABILITY_VALUE:'auto',
    isClosedFollowupStatus:()=>false,missingColumnFromError:()=>'',
    closeModal:()=>closed++,refreshAppointmentViews:()=>{},getCurrentUserForAudit:async()=>({email:'demo@example.invalid',name:'Test user'}),
    SB:{from(table){let kind,body;const query={
      insert(v){kind='insert';body=v;return query;},update(v){kind='update';body=v;return query;},eq(){return query;},select(){return query;},
      then(resolve){
        writes.push({table,kind,body});
        if(table==='patients')return Promise.resolve(resolve({error:failPatient?{message:'Follow-up offline'}:null}));
        if(kind==='insert'){
          if(failHistory)return Promise.resolve(resolve({error:{message:'Insert blocked'}}));
          const data=body.map((r,i)=>({...r,id:`new-${i}`}));history.push(...data);return Promise.resolve(resolve({data,error:null}));
        }
        if(failCurrent)return Promise.resolve(resolve({data:null,error:{message:'Update blocked'}}));
        history=history.map(a=>a.id===s.appt.id?{...a,...body}:a);return Promise.resolve(resolve({data:[{id:s.appt.id}],error:null}));
      }
    };return query;}}
  });
  vm.runInContext(source,env);
  env.fixtureState=s;env.historyRead=async()=>stale?[...history,appt('concurrent','2026-08-20')]:history;
  env.showError=m=>errors.push(m);
  vm.runInContext('dntuNurseState=fixtureState;dntuLoadHistory=historyRead;dntuRenderForm=()=>{};dntuFormError=showError;',env);
  await Promise.all([env.saveDntuNurseForm(),env.saveDntuNurseForm()]);
  return {writes,errors,closed,s,env};
}
test('history-only persistence performs no current appointment update and resists double-clicks',async()=>{
  const s=state();s.mode='history';s.drafts.history=[earlier('2026-09-01')];
  const result=await saveFixture(s);assert.equal(result.writes.length,1);assert.equal(result.writes[0].kind,'insert');assert.equal(result.closed,1);
});
test('a history read changed by another nurse blocks every write',async()=>{
  const s=state();const result=await saveFixture(s,{stale:true});assert.equal(result.writes.length,0);assert.match(result.errors[0],/history has changed/);
});
test('an empty requested follow-up month is not silently replaced with the current month',async()=>{
  const s=state();s.changeFollowup=true;s.month='';s.year='2026';
  const result=await saveFixture(s);assert.equal(result.writes.length,0);assert.match(result.errors[0],/Choose a follow-up month/);
});
test('failed history inserts never mark the current appointment or pause follow-up',async()=>{
  const s=state();s.targets.record=3;s.drafts.record=[earlier('2026-08-01'),earlier('2026-09-01')];
  const result=await saveFixture(s,{failHistory:true});assert.equal(result.writes.length,1);assert.equal(result.writes[0].kind,'insert');assert.equal(result.closed,0);
});
test('a partial save reports saved history and does not falsely pause follow-up',async()=>{
  const s=state();s.targets.record=3;s.drafts.record=[earlier('2026-08-01'),earlier('2026-09-01')];
  const result=await saveFixture(s,{failCurrent:true});assert.equal(result.writes.filter(w=>w.table==='patients').length,0);assert.match(result.errors[0],/Some changes were saved/);assert.equal(result.s.history.length,3);
});
test('failure to update follow-up leaves a retry action after history was saved',async()=>{
  const s=state();s.mode='history';s.targets.history=3;s.drafts.history=[earlier('2026-07-01'),earlier('2026-08-01'),earlier('2026-09-01')];
  const result=await saveFixture(s,{failPatient:true});assert.equal(s.followupPending,true);assert.equal(result.closed,0);assert.match(result.errors[0],/follow-up could not be updated/);
});
