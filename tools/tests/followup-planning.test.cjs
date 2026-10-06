const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){
  const match=html.match(new RegExp('(?:async )?function '+name+'\\('));
  assert.ok(match,name+' not found');
  return html.slice(match.index,html.indexOf('\n}',match.index)+2);
}
const patient=extra=>({id:'added-patient',first_name:'Alex',surname:'Example',followup_owner:'Lorraine',followup_due_month:1,followup_year:2027,followup_status:'active',...extra});
const booking=(date,status='booked')=>({patient_id:'added-patient',appt_date:date,status});
function context({patients=[patient()],future=[],owner='Lorraine'}={}){
  const elements={'bookcal-root':{innerHTML:''},'followup-year':{value:'2027'},'followup-month':{value:'1'},'adm-save-btn':{disabled:false,textContent:'Save'}};
  const c=vm.createContext({
    TODAY:'2026-09-30',Date,Map,Set,selectedFollowupOwner:owner,
    admFormBusy:false,admFormSelection:null,admFormLookupVersion:0,admFormSchedule:null,
    window:{confirm:()=>true},localStorage:{getItem:()=>null},
    LATE_BOOKING_GRACE_MONTHS:1,PLAN_MONTHS_AHEAD:12,
    REMINDER_BUCKETS:['overdue','current','next','nodue','misbooked'].map(key=>({key})),
    bookCalState:{},staffList:[{id:'nurse'}],
    document:{getElementById:id=>elements[id]||null,querySelector:()=>null,querySelectorAll:()=>[]},
    dim:(year,monthIndex)=>new Date(year,monthIndex+1,0).getDate(),
    monthKeyOffset:n=>{const d=new Date(2026,8+n,1);return{key:d.getFullYear()*100+d.getMonth()+1};},
    normaliseFollowupStatus:v=>v||'active',normaliseFollowupOwner:v=>v||'Common',
    htmlSafe:v=>String(v),loadClinicStaffingIndex:async()=>({}),bcOwnerStaff:()=>null,
    renderBookingCalendar:()=>{},getAppointmentHistoryLite:async()=>({}),calculateCurrentDntuStreak:()=>0
  });
  c.SB={from(table){return{table,select(cols){this.cols=cols;return this;},gte(){return this;},lte(){return this;},neq(){return this;}};}};
  c.fetchAllRows=async builder=>{
    const q=builder();
    if(q.table==='patients')return{rows:patients,error:null};
    return{rows:q.cols==='patient_id,appt_date,status'?future:[],error:null};
  };
  vm.runInContext("const ADMIN_WORKLIST_KEY='admin_worklist_v2';",c);
  for(const name of ['adminWorklistLoad','followupMonthName','monthKeyToEndDate','addMonthsToKey','futureBookingDatesByPatient','bookingDateForDueMonth','monthsBetweenKeys','overdueLabel','isUpcomingFollowupBooking','bcLastFollowupAppointment','bcDuePatientsFor','loadBookingCalendar','getReminderData'])vm.runInContext(source(name),c);
  return c;
}
const ids=c=>Array.from(c.bookCalState.duePatients,p=>p.id);

test('saving My patients assigns the selected month but an upcoming booking keeps them out of the booking list',async()=>{
  const p=patient({followup_owner:'Common',followup_due_month:10,followup_year:2026});
  const c=context({patients:[p],future:[booking('2026-10-04')]});
  let added,reload;
  c.admFormPatient=p;
  c.adminCurrentSelection=()=>({owner:'Lorraine',year:2027,month:1});
  c.updatePatientTolerant=async(id,patch)=>{assert.equal(id,p.id);Object.assign(p,patch);return{error:null};};
  c.adminWorklistUpsert=entry=>{added=entry;};c.closeModal=()=>{};c.renderAdminWorklist=()=>{};
  c.refreshAppointmentViews=()=>{reload=c.loadBookingCalendar();};
  vm.runInContext(source('admSavePatient'),c);
  await c.admSavePatient();await reload;
  assert.equal(added.owner,'Lorraine');assert.equal(added.year,2027);assert.equal(added.month,1);
  assert.deepEqual(ids(c),[]);
  const reminders=await c.getReminderData();
  assert.deepEqual(Array.from(reminders.all,p=>p.id),['added-patient']);
  assert.equal(reminders.buckets.misbooked.length,0);
});

test('adding an existing patient writes only allocation and needs no clinical answers',async()=>{
  const p=patient({followup_status:'paused',appliances:['Saved pouch'],complications:[{text:'Saved complication'}],flange_due:'2026-10-04'});
  const before=JSON.stringify(p),c=context();let written,added=0,closed=0;
  c.admFormPatient=p;c.admFormSelection={owner:'Jason',year:2027,month:1};
  c.SB={from(){throw Error('Assignment must not write to appointments or clinical records.');}};
  c.selectedAppliances=()=>{throw Error('No appliance input is needed.');};
  c.addComplicationToPatient=()=>{throw Error('No complication review is needed.');};
  c.updatePatientTolerant=async(id,patch)=>{assert.equal(id,p.id);written=patch;return{error:null};};
  c.adminWorklistUpsert=entry=>{added++;assert.equal(entry.owner,'Jason');assert.equal(entry.month,1);};
  c.closeModal=()=>closed++;c.renderAdminWorklist=()=>{};c.refreshAppointmentViews=()=>{};
  vm.runInContext(source('admSavePatient'),c);await c.admSavePatient();
  assert.deepEqual(JSON.parse(JSON.stringify(written)),{followup_due_month:1,followup_year:2027,followup_owner:'Jason'});
  assert.equal(added,1);assert.equal(closed,1);assert.equal(JSON.stringify(p),before);
});

test('failed allocation leaves the dialog open for retry and does not add a local entry',async()=>{
  const c=context(),note={hidden:true,textContent:''};let added=0,closed=0;
  const original=c.document.getElementById;c.document.getElementById=id=>id==='adm-save-note'?note:original(id);
  c.admFormPatient=patient();c.adminCurrentSelection=()=>({owner:'Jason',year:2027,month:1});
  c.updatePatientTolerant=async()=>({error:{message:'Connection lost'}});
  c.adminWorklistUpsert=()=>added++;c.closeModal=()=>closed++;c.renderAdminWorklist=()=>{};c.refreshAppointmentViews=()=>{};
  vm.runInContext(source('admSavePatient'),c);await c.admSavePatient();
  assert.equal(added,0);assert.equal(closed,0);assert.equal(note.hidden,false);assert.match(note.textContent,/Connection lost/);
  assert.equal(c.admFormBusy,false);assert.equal(c.document.getElementById('adm-save-btn').disabled,false);
});

test('repeated Add to list taps save once and keep the nurse and month shown in the dialog',async()=>{
  const c=context();let release,writes=0,added=0;
  c.admFormPatient=patient();c.admFormSelection={owner:'Jason',year:2027,month:1};
  c.adminCurrentSelection=()=>({owner:'Common',year:2026,month:10});
  c.updatePatientTolerant=async(id,patch)=>{writes++;assert.equal(patch.followup_owner,'Jason');assert.equal(patch.followup_year,2027);assert.equal(patch.followup_due_month,1);await new Promise(resolve=>release=resolve);return{error:null};};
  c.adminWorklistUpsert=()=>added++;c.closeModal=()=>{};c.renderAdminWorklist=()=>{};c.refreshAppointmentViews=()=>{};
  vm.runInContext(source('admSavePatient'),c);const first=c.admSavePatient();await c.admSavePatient();release();await first;
  assert.equal(writes,1);assert.equal(added,1);
});

function savedRecordContext({records=[],appointments=[]}={}){
  const c=context(),dom=new JSDOM('<body><div id="adm-find-note"></div><div id="adm-form-body"></div></body>');
  c.document=dom.window.document;c.admFormSelection={owner:'Jason',year:2027,month:1};c.enrichAppointments=async rows=>rows;
  c.parseNameList=v=>Array.isArray(v)?v:(v?[v]:[]);c.prettyStomaType=s=>s;c.fmtShortDate=s=>s;c.STOMA_KINDS={};c.fixText=s=>s;c.recCode=()=>'';
  c.stomaShortType=s=>s;c.stomaQuadrant=()=>'';c.initialStomaCode=s=>s;
  c.SB={from(table){const filters=[];return{select(){return this;},eq(key,value){filters.push(r=>r[key]===value);return this;},gte(key,value){filters.push(r=>r[key]>=value);return this;},order(){return this;},then(resolve){const rows=table==='clinical_records'?records:appointments;resolve({data:rows.filter(r=>filters.every(f=>f({...r,patient_id:r.patient_id||'added-patient'}))),error:null});}};}};
  vm.runInContext("const _normType=t=>String(t||'').trim().toLowerCase();",c);
  for(const name of ['parseStomas','parseRefashionings','parseInitialStomas','stomaOperationHistory','patientStomaList','stomaTimeline','applianceStomaUid','parseEpisodeApplianceRows','stomaApplianceHistory','stomaTitle','appliancePillsHTML','admSavedAppliancesHTML','admScheduleNoteHTML','admRenderPatientForm','admBeginPatientLookup','admLoadPatientById'])vm.runInContext(source(name),c);
  return c;
}
const stomaPatient=extra=>patient({stoma_type:'End colostomy',surgery_date:'2026-01-01',initial_stomas:[],extra_stomas:[],extra_refashionings:[],stoma_operation_history:[],...extra});

test('Add patient shows the latest saved appliance per stoma from ward and attended clinic records',async()=>{
  const p=stomaPatient({initial_stomas:[{uid:'second-id',type:'End ileostomy'}]});
  const c=savedRecordContext({records:[{kind:'episode',record_date:'2026-09-28',appliances:[{stoma_uid:'base',appliances:['Ward pouch'],changed_on:'2026-09-28'}]}],appointments:[
    {status:'attended',appt_date:'2026-09-20',stoma_appliances:[{uid:'base',appliances:['Old pouch']},{uid:'second-id',appliances:['Other stoma pouch'],accessories:['Belt']}]},
    {status:'booked',appt_date:'2027-01-03',appliances:['Future booking pouch']}
  ]});
  await c.admRenderPatientForm(p);const d=c.document,summary=d.getElementById('adm-saved-appliances').textContent;
  assert.match(summary,/Ward pouch/);assert.match(summary,/Other stoma pouch/);assert.match(summary,/Belt/);assert.doesNotMatch(summary,/Old pouch|Future booking pouch/);
  assert.equal(d.getElementById('adm-save-btn').disabled,false);assert.equal(d.getElementById('adm-stoma'),null);
  assert.equal(d.querySelector('[name="adm-cmp-review"]'),null);assert.equal(d.getElementById('of-appliance-search'),null);
});

test('an empty latest selection or a new refashioned ID does not reuse an old appliance',()=>{
  const c=savedRecordContext(),p=stomaPatient();
  const records=[{kind:'episode',record_date:'2026-09-28',appliances:[{stoma_uid:'base',appliances:['Old pouch'],changed_on:'2026-09-20'},{stoma_uid:'base',appliances:[],accessories:[],changed_on:'2026-09-28'}]}];
  assert.doesNotMatch(c.admSavedAppliancesHTML(p,records,[]),/Old pouch/);
  const refashioned={...p,extra_refashionings:[{uid:'new-id',type:'End colostomy',target_uid:'base',formed_date:'2026-09-25'}]};
  assert.doesNotMatch(c.admSavedAppliancesHTML(refashioned,records,[]),/Old pouch/);
});

test('a slower earlier patient lookup cannot replace the patient now selected',async()=>{
  const c=savedRecordContext(),first=stomaPatient({id:'first'}),second=stomaPatient({id:'second'});let release;
  c.fetchPatientById=id=>id==='first'?new Promise(resolve=>release=resolve):Promise.resolve({data:second,error:null});
  const pending=c.admLoadPatientById('first');await c.admLoadPatientById('second');release({data:first,error:null});await pending;
  assert.equal(c.admFormPatient.id,'second');
});

test('assignment remains available when saved appliance reads fail',async()=>{
  const c=savedRecordContext();
  c.SB={from(){return{select(){return this;},eq(){return this;},gte(){return this;},order(){return this;},then(resolve){resolve({data:null,error:{message:'Unavailable'}});}};}};
  await c.admRenderPatientForm(stomaPatient());
  assert.equal(c.document.getElementById('adm-save-btn').disabled,false);
  assert.match(c.document.getElementById('adm-saved-appliances').textContent,/You can still add this patient/);
});

test('a slower appliance summary cannot replace the details of another patient',async()=>{
  const c=savedRecordContext(),pending=[];
  c.SB={from(table){return{select(){return this;},eq(key,value){if(key==='patient_id')this.patientId=value;return this;},gte(){return this;},order(){return this;},then(resolve){
    const result={data:table==='clinical_records'?[{kind:'episode',record_date:'2026-09-28',appliances:[{stoma_uid:'base',appliances:[this.patientId+' pouch'],changed_on:'2026-09-28'}]}]:[],error:null};
    if(this.patientId==='first')pending.push(()=>resolve(result));else resolve(result);
  }};}};
  const first=c.admRenderPatientForm(stomaPatient({id:'first'}));await Promise.resolve();
  await c.admRenderPatientForm(stomaPatient({id:'second'}));pending.forEach(release=>release());await first;
  const text=c.document.getElementById('adm-saved-appliances').textContent;assert.match(text,/second pouch/);assert.doesNotMatch(text,/first pouch/);
});

test('a booking in the due month or following grace month removes the patient from both worklists',async()=>{
  for(const date of ['2027-01-01','2027-01-24','2027-02-28']){
    const c=context({future:[booking(date)]});await c.loadBookingCalendar();
    assert.deepEqual(ids(c),[]);const reminders=await c.getReminderData();
    assert.equal(reminders.all.length,0);assert.equal(reminders.buckets.misbooked.length,0);
  }
});

test('a separate earlier appointment cannot mask a later booking that covers the selected follow-up',async()=>{
  const c=context({future:[booking('2026-10-04'),booking('2027-01-17')]});
  await c.loadBookingCalendar();assert.deepEqual(ids(c),[]);
  const reminders=await c.getReminderData();assert.equal(reminders.all.length,0);assert.equal(reminders.buckets.misbooked.length,0);
});

test('a booking outside the due-month window removes the patient from booking while reminders still report it',async()=>{
  const c=context({future:[booking('2026-10-04'),booking('2027-03-07')]});
  await c.loadBookingCalendar();assert.deepEqual(ids(c),[]);
  const reminders=await c.getReminderData();assert.equal(reminders.buckets.misbooked.length,1);
  assert.equal(reminders.buckets.misbooked[0].bookedFor,'2027-03-07');
});

test('cancelled or completed appointments cannot remove a patient needing a new booking',async()=>{
  const c=context({future:[booking('2027-01-10','cancelled'),booking('2027-01-17','did_not_attend'),booking('2027-01-24','attended')]});
  await c.loadBookingCalendar();assert.deepEqual(ids(c),['added-patient']);
  assert.deepEqual(Array.from((await c.getReminderData()).all,p=>p.id),['added-patient']);
});

test('the selected nurse, month, year and active status still govern the due list',async()=>{
  const patients=[patient(),patient({id:'other-nurse',followup_owner:'Other'}),patient({id:'other-month',followup_due_month:12}),patient({id:'other-year',followup_year:2028}),patient({id:'paused',followup_status:'paused'})];
  const c=context({patients});await c.loadBookingCalendar();assert.deepEqual(ids(c),['added-patient']);
  const all=context({patients,owner:'All Patients'});await all.loadBookingCalendar();
  assert.deepEqual(ids(all),['added-patient','other-nurse']);
});

test('due-month boundaries retain the following grace month across years and leap February',()=>{
  const c=context();
  assert.equal(c.bookingDateForDueMonth(['2026-11-30'],202612),'');
  assert.equal(c.bookingDateForDueMonth(['2027-01-31'],202612),'2027-01-31');
  assert.equal(c.bookingDateForDueMonth(['2027-02-01'],202612),'');
  assert.equal(c.bookingDateForDueMonth(['2028-02-29'],202801),'2028-02-29');
  assert.equal(c.bookingDateForDueMonth(['2028-03-01'],202801),'');
});

test('delayed booking enrichment cannot write an earlier patient into the current scheduling banner',async()=>{
  const c=savedRecordContext();let releaseFirst,startFirst;
  const started=new Promise(resolve=>startFirst=resolve);let call=0;
  c.enrichAppointments=()=>++call===1?new Promise(resolve=>{releaseFirst=resolve;startFirst();}):Promise.resolve([{appt_date:'2027-01-20',appt_slot:'10:00',staff:{full_name:'Second nurse'}}]);
  const first=c.admRenderPatientForm(stomaPatient({id:'first',first_name:'First'}));await started;
  await c.admRenderPatientForm(stomaPatient({id:'second',first_name:'Second'}));
  releaseFirst([{appt_date:'2027-02-10',appt_slot:'09:00',staff:{full_name:'First nurse'}}]);await first;
  assert.equal(c.admFormPatient.id,'second');assert.equal(c.admFormSchedule.bookings[0].date,'2027-01-20');
  const banner=c.document.getElementById('adm-sched-note').textContent;assert.match(banner,/Second nurse/);assert.doesNotMatch(banner,/First nurse|2027-02-10/);
});

test('duplicate list entries and matching ID cards are refused before allocation is written',async()=>{
  for(const dueList of [false,true]){
    const c=context(),note={hidden:true,textContent:''};const get=c.document.getElementById;
    c.document.getElementById=id=>id==='adm-save-note'?note:get(id);
    c.admFormPatient=patient({id_card:'123M'});c.admFormSelection={owner:'Jason',year:2027,month:1};
    if(dueList)c.bookCalState.duePatients=[{id:'other-db-id',id_card:' 123m '}];
    else c.localStorage.getItem=()=>JSON.stringify([{id:'added-patient',owner:'Jason',year:2027,month:1}]);
    c.updatePatientTolerant=async()=>assert.fail('Duplicate must not write');c.closeModal=()=>assert.fail('Keep the explanation open');
    vm.runInContext(source('admSavePatient'),c);await c.admSavePatient();assert.match(note.textContent,/already on/);assert.equal(c.admFormBusy,false);
  }
});

test('declining an existing due-month move keeps the allocation and list unchanged',async()=>{
  const c=context();c.admFormPatient=patient();c.admFormSelection={owner:'Jason',year:2027,month:1};
  c.admFormSchedule={hasDue:true,dueM:2,dueY:2027,dueText:'February 2027',bookings:[]};
  c.window.confirm=message=>{assert.match(message,/February 2027/);return false;};
  c.updatePatientTolerant=async()=>assert.fail('Declined move must not write');c.closeModal=()=>assert.fail('Declined move keeps the form open');
  vm.runInContext(source('admSavePatient'),c);await c.admSavePatient();assert.equal(c.admFormBusy,false);assert.equal(c.document.getElementById('adm-save-btn').disabled,false);
});
