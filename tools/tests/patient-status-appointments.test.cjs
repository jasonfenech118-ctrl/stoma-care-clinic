const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const moduleSource=fs.readFileSync(path.join(root,'assets/cancellations.js'),'utf8');
const baseSQL=fs.readFileSync(path.join(root,'sql/add-appointment-cancellations.sql'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261028113205_patient_status_appointment_cancellations.sql'),'utf8');
const pid='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const aid=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const labels={deceased:'Deceased',reversed:'Reversed',discharged_gozo:'Discharged to Gozo',relocated_overseas:'Relocated Overseas'};
let db;
test.before(async()=>{
  db=new PGlite();
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;create schema clinic_private;
    create function auth.jwt() returns jsonb language sql as $$select '{"email":"nurse@example.invalid"}'::jsonb$$;
    create function auth.uid() returns uuid language sql as $$select '${pid}'::uuid$$;
    create function private.is_clinic_member() returns boolean language sql as $$select coalesce(current_setting('test.member',true),'false')='true'$$;
    create table patients(id uuid primary key,followup_status text default 'active',followup_paused boolean default true);
    create table appointments(id uuid primary key default gen_random_uuid(),patient_id uuid references patients(id),appt_date date,appt_slot text,status text,assigned_to uuid,bank_staff_id uuid);
    create unique index slot_unique on appointments(appt_date,appt_slot,(coalesce(assigned_to::text,bank_staff_id::text,'common'))) where status is distinct from 'cancelled';
    create function mdh_refresh_patient_dntu_pause(p_patient_id uuid) returns integer language plpgsql as $$begin update patients set followup_paused=false where id=p_patient_id;return 0;end$$;
    grant usage on schema auth,private to authenticated;grant select,update on patients,appointments to authenticated;
    alter table patients enable row level security;alter table appointments enable row level security;
    create policy clinic_member on patients to authenticated using(private.is_clinic_member()) with check(private.is_clinic_member());
    create policy clinic_member on appointments to authenticated using(private.is_clinic_member()) with check(private.is_clinic_member());`);
  await db.exec(baseSQL);
  await db.exec(migration);await db.exec(migration);
  await db.exec(`create trigger trg_mdh_appointment_dntu_pause after insert or delete or update of patient_id,status,appt_date,appt_slot on appointments for each row execute function mdh_appointment_dntu_pause_trigger();`);
});
test.after(async()=>{await db?.close();});
async function reset(){
  await db.exec(`reset role;truncate appointments,patients cascade;insert into patients(id) values('${pid}'),('${other}');`);
}
async function book(n,offset=1,status='booked',patient=pid){
  await db.query(`insert into appointments(id,patient_id,appt_date,appt_slot,status) values($1,$2,(current_timestamp at time zone 'Europe/Malta')::date+$3::int,$4,$5)`,
    [aid(n),patient,offset,String(8+n).padStart(2,'0')+':00',status]);
}
for(const [status,label] of Object.entries(labels))test(`database: ${label} cancels only today/future booked visits and keeps a signed reason`,async()=>{
  await reset();
  await book(1,0);await book(2,2);await book(3,-1);await book(4,1,'attended');await book(5,-2,'did_not_attend');await book(6,1,'booked',other);await book(7,3);
  await db.query(`update appointments set status='cancelled',cancellation_source='patient',cancellation_reason='unavailable',cancellation_date=(current_timestamp at time zone 'Europe/Malta')::date where id=$1`,[aid(7)]);
  await db.query('update patients set followup_paused=true where id=$1',[pid]);
  await db.query('update patients set followup_status=$1 where id=$2',[status,pid]);
  const rows=(await db.query('select * from appointments order by id')).rows;
  assert.deepEqual(rows.map(r=>r.status),['cancelled','cancelled','booked','attended','did_not_attend','booked','cancelled']);
  for(const r of rows.slice(0,2)){
    assert.equal(r.cancellation_reason,status);assert.equal(r.cancellation_source,'clinic');assert.match(r.cancellation_note,new RegExp(label));
    assert.equal(r.cancellation_revision,1);assert.equal(r.cancellation_history.length,1);
    assert.equal(r.cancellation_history[0].recorded_by,'nurse@example.invalid');assert.equal(r.cancellation_history[0].cancellation_reason,status);
  }
  assert.equal(rows[6].cancellation_reason,'unavailable');
  assert.equal((await db.query('select followup_paused from patients where id=$1',[pid])).rows[0].followup_paused,true,'automatic cancellations do not reset the DNTU flag');
});
test('database: unchanged outcome, active, paused and awaiting-feedback edits keep their bookings',async()=>{
  await reset();await book(1);
  for(const status of ['paused','awaiting_feedback','active'])await db.query('update patients set followup_status=$1 where id=$2',[status,pid]);
  assert.equal((await db.query('select status from appointments')).rows[0].status,'booked');
  await db.query('update patients set followup_status=$1 where id=$2',['deceased',pid]);
  await book(2);
  await db.query('update patients set followup_status=$1 where id=$2',['deceased',pid]);
  assert.equal((await db.query('select status from appointments where id=$1',[aid(2)])).rows[0].status,'booked');
});
test('database: a failed cancellation rolls back the patient status and every appointment',async()=>{
  await reset();await book(1);await book(2);
  await db.exec(`create function reject_test_cancel() returns trigger language plpgsql as $$begin raise exception 'Test cancellation failure';end$$;
    create trigger reject_test_cancel before update on appointments for each row when(new.id='${aid(2)}') execute function reject_test_cancel();`);
  try{
    await assert.rejects(db.query("update patients set followup_status='reversed' where id=$1",[pid]),/Test cancellation failure/);
    assert.equal((await db.query('select followup_status from patients where id=$1',[pid])).rows[0].followup_status,'active');
    assert.deepEqual((await db.query('select status,cancellation_revision from appointments order by id')).rows,[{status:'booked',cancellation_revision:0},{status:'booked',cancellation_revision:0}]);
  }finally{await db.exec('drop trigger reject_test_cancel on appointments;drop function reject_test_cancel();');}
});
test('database: a cancelled slot can be rebooked while retaining the original booking',async()=>{
  await reset();await book(1);
  await db.query("update patients set followup_status='discharged_gozo' where id=$1",[pid]);
  await db.query(`insert into appointments(id,patient_id,appt_date,appt_slot,status) select $1,$2,appt_date,appt_slot,'booked' from appointments where id=$3`,[aid(2),other,aid(1)]);
  assert.deepEqual((await db.query('select status from appointments order by id')).rows.map(r=>r.status),['cancelled','booked']);
});
test('database: clinic members retain RLS protection and cancellation uses their own permissions',async()=>{
  await reset();await book(1);
  try{
    await db.exec("set role authenticated;set test.member='false';");
    await db.query("update patients set followup_status='deceased' where id=$1",[pid]);
    await db.exec("reset role;");
    assert.equal((await db.query('select followup_status from patients where id=$1',[pid])).rows[0].followup_status,'active');
    await db.exec("set role authenticated;set test.member='true';");
    await db.query("update patients set followup_status='deceased' where id=$1",[pid]);
    await db.exec('reset role;');
    assert.equal((await db.query('select status from appointments')).rows[0].status,'cancelled');
  }finally{await db.exec('reset role;');}
});
test('database: missing appointment write access cannot partially save a patient status',async()=>{
  await reset();await book(1);
  await db.exec('revoke update on appointments from authenticated;');
  try{
    await db.exec("set role authenticated;set test.member='true';");
    await assert.rejects(db.query("update patients set followup_status='deceased' where id=$1",[pid]),/permission denied/);
  }finally{await db.exec('reset role;grant update on appointments to authenticated;');}
  assert.equal((await db.query('select followup_status from patients where id=$1',[pid])).rows[0].followup_status,'active');
  assert.equal((await db.query('select status from appointments')).rows[0].status,'booked');
});

function fn(name){const start=html.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);const end=html.indexOf('\n}',start);return html.slice(start,end+2);}
function browser(t,options={}){
  const dom=new JSDOM('<body><select id="ao-status-p1"><option value="deceased">Deceased</option></select><section id="page-appointments"><input id="appt-date" type="date"><div id="slots-container"></div></section></body>',{url:'https://clinic.example/',runScripts:'dangerously'});
  t.after(()=>dom.window.close());const w=dom.window;
  const booked=options.bookings||[{id:'a1',appt_date:'2026-10-29',appt_slot:'09:00'},{id:'a2',appt_date:'2026-11-05',appt_slot:'10:30'}];
  const calls=[],confirmations=[],writes=[],sequence=[];
  w.TODAY='2026-10-28';w.console=console;w.htmlSafe=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');w.fmtShortDate=v=>v;
  w.confirm=message=>{confirmations.push(message);return options.confirm!==false;};w.auditPatientWrite=()=>{};w.missingColumnFromError=()=>null;
  w.closeModal=()=>{};w.refreshAppointmentViews=async()=>sequence.push('refresh');w.loadAppointmentOutcomes=()=>{};
  w.loadAppts=()=>sequence.push('load');w.switchTab=tab=>sequence.push(tab);w.alert=message=>sequence.push('alert:'+message);
  w.SB={from(table){const q={table,filters:[],select(){return q;},eq(k,v){q.filters.push([k,v]);return q;},gte(k,v){q.filters.push([k,'gte',v]);return q;},order(){return q;},in(k,v){q.filters.push([k,'in',v]);return q;},
    single:async()=>({data:{id:'p1',first_name:'Example',surname:'Patient',id_card:'TEST-ID',followup_status:options.oldStatus||'active'},error:options.patientError||null}),
    update(body){q.body=body;return q;},then(resolve,reject){writes.push(q.body);sequence.push('write');return Promise.resolve({data:options.staleWrite?[]:[{id:'p1'}],error:options.writeError||null}).then(resolve,reject);}};return q;}};
  w.fetchAllRows=async build=>{const q=build();calls.push(q);return options.readError?{rows:[],error:{message:'offline'}}:{rows:q.filters.some(f=>f[0]==='status'&&f[1]==='cancelled')?(options.confirmedRows||booked):booked,error:null};};
  w.eval(moduleSource);w.eval(fn('updatePatientTolerant'));w.eval(fn('saveAppointmentOutcomeFollowupStatus'));
  return {w,calls,confirmations,writes,sequence};
}
test('notice identifies the booked dates, patient and proposed cancellation before any write',async t=>{
  const f=browser(t,{confirm:false});const result=await f.w.updatePatientTolerant('p1',{followup_status:'deceased'});
  assert.equal(result.error.code,'STATUS_CHANGE_CANCELLED');assert.equal(f.writes.length,0);
  assert.match(f.confirmations[0],/Example Patient \(TEST-ID\).*2026-10-29 at 09:00.*2026-11-05 at 10:30/s);
  assert.match(f.confirmations[0],/Cancelled — Deceased.*Appointments page/s);
  assert.deepEqual(f.calls[0].filters,[['patient_id','p1'],['status','booked'],['appt_date','gte','2026-10-28']]);
});
test('an unreadable booking list blocks the status save instead of hiding its effect',async t=>{
  const f=browser(t,{readError:true});const result=await f.w.updatePatientTolerant('p1',{followup_status:'reversed'});
  assert.match(result.error.message,/Could not check booked/);assert.equal(f.writes.length,0);assert.equal(f.sequence.length,0);
});
test('failed status writes never navigate or claim an appointment was cancelled',async t=>{
  const f=browser(t,{writeError:{message:'save denied'}});await f.w.saveAppointmentOutcomeFollowupStatus('p1');
  assert.equal(f.sequence.includes('appointments'),false);assert.equal(f.sequence.includes('refresh'),false);
});
test('saving opens Appointments on the earliest cancelled date and provides the other dates',async t=>{
  const f=browser(t);await f.w.saveAppointmentOutcomeFollowupStatus('p1');
  assert.equal(f.w.document.getElementById('appt-date').value,'2026-10-29');assert.equal(f.sequence.at(-1),'appointments');
  assert.ok(f.sequence.indexOf('write')<f.sequence.indexOf('appointments'));
  const notice=f.w.document.getElementById('status-appointment-notice');assert.match(notice.textContent,/automatically marked “Cancelled — Deceased”/);
  assert.equal(notice.querySelectorAll('button').length,2);
  assert.match(f.w.statusCancellationClass({id:'a1',status:'cancelled',cancellation_source:'clinic',cancellation_reason:'deceased'}),/status-appointment-focus/);
  notice.querySelectorAll('button')[1].click();assert.equal(f.w.document.getElementById('appt-date').value,'2026-11-05');assert.equal(f.sequence.at(-1),'load');
});
test('a booking completed by another nurse is not shown as a status cancellation',async t=>{
  const f=browser(t,{confirmedRows:[]});await f.w.saveAppointmentOutcomeFollowupStatus('p1');
  assert.equal(f.sequence.includes('appointments'),false);assert.equal(f.w.document.getElementById('status-appointment-notice'),null);
});
test('a stale status save leaves the current record untouched and does not navigate',async t=>{
  const f=browser(t,{staleWrite:true});await f.w.saveAppointmentOutcomeFollowupStatus('p1');
  assert.equal(f.sequence.includes('appointments'),false);assert.equal(f.sequence.includes('refresh'),false);
  assert.match(f.sequence.at(-1),/record changed/);
});
test('the highlighted cancellation is visible even when a slot has many older cancellations',t=>{
  const f=browser(t);f.w.eval(fn('cancelledSlotHistoryHTML'));
  const target={id:'affected',status:'cancelled',cancellation_source:'clinic',cancellation_reason:'deceased',appt_date:'2026-10-29',patients:{first_name:'Affected',surname:'Patient'}};
  f.w.finishStatusAppointmentChange({status:'deceased',appointments:[target]});
  const old=Array.from({length:6},(_,i)=>({...target,id:'old-'+i,patients:{first_name:'Earlier',surname:String(i)}}));
  const rendered=f.w.cancelledSlotHistoryHTML([...old,target]);assert.match(rendered,/Affected Patient/);assert.match(rendered,/status-appointment-focus/);
});
test('ordinary edits and a partial reversal which leaves the patient active do not warn or cancel',async t=>{
  const f=browser(t);await f.w.updatePatientTolerant('p1',{followup_status:'active'});
  assert.equal(f.confirmations.length,0);assert.equal(f.calls.length,0);
  const same=browser(t,{oldStatus:'deceased'});await same.w.updatePatientTolerant('p1',{followup_status:'deceased'});assert.equal(same.confirmations.length,0);assert.equal(same.calls.length,0);
});
test('status cancellation labels and colour classes retain the original recorded reason',t=>{
  const f=browser(t);
  for(const [status,label] of Object.entries(labels)){
    const row={id:'a',status:'cancelled',cancellation_source:'clinic',cancellation_reason:status,patients:{followup_status:'active'}};
    assert.equal(f.w.cancellationSourceLabel(row),'Cancelled — '+label);assert.match(f.w.statusCancellationClass(row),new RegExp('status-cancelled-'+status));
  }
  assert.equal(f.w.statusCancellationClass({status:'attended',cancellation_source:'clinic',cancellation_reason:'deceased'}),'');
  assert.equal(f.w.statusCancellationClass({status:'cancelled',cancellation_source:'patient',cancellation_reason:'other'}),'');
});
