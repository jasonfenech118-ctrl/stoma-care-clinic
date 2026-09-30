const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
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
  for(const name of ['monthKeyToEndDate','addMonthsToKey','futureBookingDatesByPatient','bookingDateForDueMonth','monthsBetweenKeys','overdueLabel','loadBookingCalendar','getReminderData'])vm.runInContext(source(name),c);
  return c;
}
const ids=c=>Array.from(c.bookCalState.duePatients,p=>p.id);

test('saving My patients puts the patient in the selected due-month list despite an earlier appointment',async()=>{
  const p=patient({followup_owner:'Common',followup_due_month:10,followup_year:2026});
  const c=context({patients:[p],future:[booking('2026-10-04')]});
  let added,reload;
  c.admFormPatient=p;c.admFormApptId=null;
  c.patientStomaList=()=>[];c.selectedAppliances=()=>[];c.applianceValues=()=>[];
  c.adminCurrentSelection=()=>({owner:'Lorraine',year:2027,month:1});
  c.updatePatientTolerant=async(id,patch)=>{assert.equal(id,p.id);Object.assign(p,patch);return{error:null};};
  c.adminWorklistUpsert=entry=>{added=entry;};c.closeModal=()=>{};c.renderAdminWorklist=()=>{};
  c.refreshAppointmentViews=()=>{reload=c.loadBookingCalendar();};
  vm.runInContext(source('admSavePatient'),c);
  await c.admSavePatient();await reload;
  assert.equal(added.owner,'Lorraine');assert.equal(added.year,2027);assert.equal(added.month,1);
  assert.deepEqual(ids(c),['added-patient']);
  const reminders=await c.getReminderData();
  assert.deepEqual(Array.from(reminders.all,p=>p.id),['added-patient']);
  assert.equal(reminders.buckets.misbooked.length,0);
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

test('a booking beyond the grace month keeps the patient available and reports the late booking',async()=>{
  const c=context({future:[booking('2026-10-04'),booking('2027-03-07')]});
  await c.loadBookingCalendar();assert.deepEqual(ids(c),['added-patient']);
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
