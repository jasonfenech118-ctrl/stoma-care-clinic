const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {PGlite}=require('@electric-sql/pglite');
const root=path.join(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'assets/leave-hours.js'),'utf8');
const attendance=fs.readFileSync(path.join(root,'assets/daily-attendance.js'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261028154013_vacation_leave_hours.sql'),'utf8');
const nurse='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const day='2026-11-04';
let db;
function fn(name){const match=html.match(new RegExp('(?:async )?function '+name+'\\('));assert.ok(match,name);const a=match.index,b=html.indexOf('\n',a);return html.slice(a,html.slice(a,b).trim().endsWith('}')?b:html.indexOf('\n}',a)+2);}
test.before(async()=>{
  db=new PGlite();
  await db.exec(`create role authenticated;create schema private;create schema clinic_private;
    create function private.is_clinic_member() returns boolean language sql as $$select coalesce(current_setting('test.member',true),'false')='true'$$;
    create table staff(id uuid primary key,full_name text);create table bank_staff(id uuid primary key,full_name text);
    create table roster(id uuid primary key default gen_random_uuid(),staff_id uuid references staff(id),roster_date date,status text,notes text,unique(staff_id,roster_date));
    create table leave_records(id uuid primary key default gen_random_uuid(),staff_id uuid references staff(id),leave_type text,start_date date,end_date date,total_days numeric default 1,notes text);
    create table appointments(id uuid primary key default gen_random_uuid(),patient_id uuid,assigned_to uuid,bank_staff_id uuid,appt_date date,appt_slot time,status text,notes text);
    grant usage on schema private to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;
    alter table roster enable row level security;alter table leave_records enable row level security;alter table appointments enable row level security;
    create policy member on roster to authenticated using(private.is_clinic_member()) with check(private.is_clinic_member());
    create policy member on leave_records to authenticated using(private.is_clinic_member()) with check(private.is_clinic_member());
    create policy member on appointments to authenticated using(private.is_clinic_member()) with check(private.is_clinic_member());
    insert into staff values('${nurse}','Example Nurse'),('${other}','Other Nurse');insert into bank_staff values('${nurse}','Example Nurse');`);
  await db.exec(sql);await db.exec(sql);
});
test.after(async()=>db?.close());
async function reset(){await db.exec('reset role;truncate appointments,leave_records,roster;');}
async function shift(hours=2,start='10:00',status='working'){
  return db.query(`insert into roster(staff_id,roster_date,status,leave_hours,leave_start_time) values($1,$2,$3,$4,$5)
    on conflict(staff_id,roster_date) do update set status=excluded.status,leave_hours=excluded.leave_hours,leave_start_time=excluded.leave_start_time returning *`,[nurse,day,status,hours,start]);
}
async function book(slot,id=nurse,status='booked',bank=false){return db.query(`insert into appointments(assigned_to,bank_staff_id,appt_date,appt_slot,status) values($1,$2,$3,$4,$5) returning id`,[bank?null:id,bank?id:null,day,slot,status]);}
test('hours save as hours with zero days, while full-day vacation remains one day',async()=>{
  await reset();await shift(2.5,'09:45');let rows=(await db.query('select * from leave_records')).rows;
  assert.equal(rows.length,1);assert.equal(Number(rows[0].total_days),0);assert.equal(Number(rows[0].leave_hours),2.5);assert.equal(rows[0].leave_start_time,'09:45:00');
  assert.equal((await db.query('select status from roster')).rows[0].status,'working');
  await shift(null,null,'annual_leave');rows=(await db.query('select * from leave_records')).rows;
  assert.equal(rows.length,1);assert.equal(Number(rows[0].total_days),1);assert.equal(rows[0].leave_hours,null);
});
test('edits and removals replace only automatic leave records and preserve manually entered leave',async()=>{
  await reset();await db.query(`insert into leave_records(staff_id,leave_type,start_date,end_date,notes) values($1,'study_leave',$2,$2,'Manual record')`,[nurse,day]);
  await shift();await shift(1,'13:00');let rows=(await db.query('select * from leave_records order by notes')).rows;
  assert.equal(rows.length,2);assert.equal(Number(rows.find(r=>r.leave_type==='annual_leave').leave_hours),1);
  await shift(null,null);rows=(await db.query('select * from leave_records')).rows;assert.equal(rows.length,1);assert.equal(rows[0].notes,'Manual record');
});
test('a direct sick or off update clears earlier vacation hours and keeps leave records aligned',async()=>{
  await reset();await shift();await db.query("update roster set status='sick_leave' where staff_id=$1",[nurse]);
  let row=(await db.query('select * from roster')).rows[0];assert.equal(row.leave_hours,null);assert.equal(row.leave_start_time,null);
  const leave=(await db.query('select * from leave_records')).rows;assert.equal(leave.length,1);assert.equal(leave[0].leave_type,'sick_leave');
  await db.query("update roster set status='off' where staff_id=$1",[nurse]);assert.equal((await db.query('select * from leave_records')).rows.length,0);
});
test('invalid hours, fractions, missing start times and overnight windows roll back',async()=>{
  for(const [hours,start] of [[0,'10:00'],[-1,'10:00'],[0.1,'10:00'],[25,'00:00'],[3,'22:00'],[2,'10:00:30'],[2,null],[null,'10:00']]){
    await reset();await assert.rejects(shift(hours,start),/check constraint/);assert.equal((await db.query('select * from roster')).rows.length,0);assert.equal((await db.query('select * from leave_records')).rows.length,0);
  }
});
test('failure to save the automatic leave record cannot partially update the roster',async()=>{
  await reset();await shift();await db.exec(`create function reject_test_leave() returns trigger language plpgsql as $$begin raise exception 'Test leave failure';end$$;
    create trigger reject_test_leave before insert on leave_records for each row execute function reject_test_leave();`);
  try{await assert.rejects(shift(1,'13:00'),/Test leave failure/);assert.equal(Number((await db.query('select leave_hours from roster')).rows[0].leave_hours),2);assert.equal(Number((await db.query('select leave_hours from leave_records')).rows[0].leave_hours),2);}
  finally{await db.exec('drop trigger reject_test_leave on leave_records;drop function reject_test_leave();');}
});
test('only overlapping new or moved appointments are blocked, including a matching core nurse bank entry',async()=>{
  await reset();await shift();
  for(const slot of ['09:30','12:00'])await book(slot);
  for(const slot of ['09:45','10:00','11:30'])await assert.rejects(book(slot),/vacation leave/);
  await assert.rejects(book('10:30',nurse,'booked',true),/vacation leave/);
  await book('10:00',other);await book('10:00',nurse,'cancelled');await book('10:00',nurse,'attended');
  const move=(await book('13:00')).rows[0].id;
  await assert.rejects(db.query("update appointments set appt_slot='11:00' where id=$1",[move]),/vacation leave/);
  assert.equal((await db.query('select appt_slot from appointments where id=$1',[move])).rows[0].appt_slot,'13:00:00');
});
test('existing bookings are retained and can be reviewed, completed or cancelled after leave is added',async()=>{
  await reset();const id=(await book('10:00')).rows[0].id;await shift();
  assert.equal((await db.query('select status from appointments where id=$1',[id])).rows[0].status,'booked');
  await db.query("update appointments set notes='Review required' where id=$1",[id]);
  await db.query("update appointments set status='cancelled' where id=$1",[id]);
  await assert.rejects(db.query("update appointments set status='booked' where id=$1",[id]),/vacation leave/);
  await db.query("update appointments set status='attended' where id=$1",[id]);
});
test('clinic membership and caller permissions still govern roster and leave writes',async()=>{
  await reset();
  try{
    await db.exec("set role authenticated;set test.member='false';");await assert.rejects(shift(),/row-level security/);
    await db.exec("set test.member='true';");await shift();
    await db.exec('reset role;revoke insert on leave_records from authenticated;set role authenticated;');
    await assert.rejects(shift(1,'13:00'),/permission denied/);
  }finally{await db.exec('reset role;grant insert on leave_records to authenticated;');}
  assert.equal(Number((await db.query('select leave_hours from roster')).rows[0].leave_hours),2);
  const functions=(await db.query("select prosecdef from pg_proc where proname in ('prepare_roster_vacation_hours','sync_roster_leave_record','check_appointment_vacation_hours')")).rows;
  assert.equal(functions.length,3);assert.ok(functions.every(f=>!f.prosecdef));
});

function app(t,entry){
  const dom=new JSDOM('<body><div id="mb"></div></body>');t.after(()=>dom.window.close());
  const writes=[],alerts=[],logs=[];let saved=false,refreshes=0;
  const c={console,document:dom.window.document,staffList:[{id:nurse,full_name:'Example Nurse'}],rCache:entry?{[nurse+'_'+day]:entry}:{},selCode:'working',
    isHol:()=>false,defaultCode:()=> 'working',htmlSafe:v=>String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),fmtShortDate:v=>v,
    openMo:()=>{},closeModal:()=>{saved=true;},renderRoster:()=>refreshes++,loadStaffAudit:()=>{},invalidateAvailabilityCaches:()=>{},alert:m=>alerts.push(m),logRoster:(...args)=>logs.push(args),
    SB:{from:table=>({upsert:body=>({select:async()=>{writes.push({table,body});return c.saveError?{error:c.saveError}:{data:[{id:'saved'}],error:null};}})})}};
  vm.createContext(c);vm.runInContext(source,c);vm.runInContext(html.match(/const CODES=\[[\s\S]*?\n\];/)[0],c);
  for(const name of ['openShift','pickCode','saveShift','attMarksFor'])vm.runInContext(fn(name),c);
  c.openShift(nurse,'Example Nurse',day);
  return {c,writes,alerts,logs,dom,get saved(){return saved;},get refreshes(){return refreshes;}};
}
function chooseHours(f,hours='2.5',start='09:45'){
  const c=f.c;c.pickCode('annual_leave',c.document.querySelector('.sp-btn.dc-L'));
  c.document.getElementById('s-leave-unit').value='hours';c.LeaveHours.toggle('s','annual_leave');
  c.document.getElementById('s-leave-hours').value=hours;c.document.getElementById('s-leave-from').value=start;c.LeaveHours.preview('s');
}
test('the shift form saves hours and time, reopens with the saved duration, and keeps full-day mode',async t=>{
  const f=app(t);chooseHours(f);await f.c.saveShift(nurse,day);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].body.status,'working');assert.equal(f.writes[0].body.leave_hours,2.5);assert.equal(f.writes[0].body.leave_start_time,'09:45');assert.equal(f.saved,true);assert.match(f.logs[0][2],/2.5h.*09:45–12:15/);
  const reopened=app(t,f.writes[0].body);assert.equal(reopened.c.selCode,'annual_leave');assert.equal(reopened.c.document.getElementById('s-leave-hours').value,'2.5');
  reopened.c.document.getElementById('s-leave-unit').value='days';await reopened.c.saveShift(nurse,day);
  assert.equal(reopened.writes[0].body.status,'annual_leave');assert.equal(reopened.writes[0].body.leave_hours,null);assert.equal(reopened.writes[0].body.leave_start_time,null);
});
test('start and end times calculate duration, save and reopen including midnight',async t=>{
  const f=app(t);chooseHours(f);
  assert.equal(f.c.document.getElementById('s-leave-to').value,'12:15');
  f.c.document.getElementById('s-leave-to').value='13:00';f.c.LeaveHours.preview('s','end');
  assert.equal(f.c.document.getElementById('s-leave-hours').value,'3.25');
  await f.c.saveShift(nurse,day);assert.equal(f.writes[0].body.leave_hours,3.25);
  const reopened=app(t,f.writes[0].body);assert.equal(reopened.c.document.getElementById('s-leave-to').value,'13:00');
  chooseHours(f,'2','22:00');assert.equal(f.c.document.getElementById('s-leave-to').value,'00:00');
  f.c.document.getElementById('s-leave-to').value='21:00';f.c.LeaveHours.preview('s','end');
  assert.throws(()=>f.c.LeaveHours.readForm('s','annual_leave'),/valid start and end/);
});
test('invalid input or a failed save retains the form and does not report success',async t=>{
  const f=app(t);chooseHours(f,'0.1');await f.c.saveShift(nurse,day);assert.equal(f.writes.length,0);assert.equal(f.saved,false);
  chooseHours(f,'2','23:00');await f.c.saveShift(nurse,day);assert.equal(f.writes.length,0);
  chooseHours(f);f.c.saveError={message:'Save denied'};await f.c.saveShift(nurse,day);assert.equal(f.saved,false);assert.equal(f.refreshes,0);assert.equal(f.logs.length,0);assert.match(f.alerts.at(-1),/Save denied/);
});
test('switching to day duty clears hours, and duplicate Save clicks produce one write',async t=>{
  const f=app(t,{status:'working',leave_hours:2,leave_start_time:'10:00'});
  f.c.pickCode('working',f.c.document.querySelector('.sp-btn.dc-D'));
  await Promise.all([f.c.saveShift(nurse,day),f.c.saveShift(nurse,day)]);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].body.status,'working');assert.equal(f.writes[0].body.leave_hours,null);
});
test('attendance remains on duty, de-duplicates the roster mirror and prints both Present and vacation hours',t=>{
  const f=app(t),c=f.c;c.window=c;vm.runInContext(attendance,c);
  const row={staff_id:nurse,roster_date:day,status:'working',leave_hours:2,leave_start_time:'10:00'};
  const planned=c.DailyAttendance.buildPlannedRows({date:day,staff:c.staffList,roster:[row],leave:[{...row,leave_type:'annual_leave',start_date:day,end_date:day}],bank:[]},()=> 'working')[0];
  assert.equal(planned.working,true);assert.equal(planned.planned_code,'working');assert.match(planned.planned_source,/2h.*10:00–12:00/);
  assert.equal((planned.roster_notes.match(/Vacation leave:/g)||[]).length,1);
  const marks=c.attMarksFor({...planned,attendance_status:'present'});assert.equal(marks.P,'P');assert.equal(marks.VL,'2h 10:00–12:00');assert.equal(marks.duty,'B');
  assert.equal(c.LeaveHours.printed({roster_notes:c.LeaveHours.stripPrinted(planned.roster_notes)}),'');
});
test('slot overlap and capacity exclude exactly the leave period, with open boundary times',t=>{
  const f=app(t),api=f.c.LeaveHours,leave={staff_id:nurse,leave_hours:2,leave_start_time:'10:00'};
  assert.equal(api.blocked(leave,'09:30'),false);assert.equal(api.blocked(leave,'09:45'),true);assert.equal(api.blocked(leave,'10:00'),true);assert.equal(api.blocked(leave,'12:00'),false);
  assert.equal(api.blocked(leave,'09:30',60),true);
  const slots=['09:00','09:30','10:00','10:30','11:00','11:30','12:00'];
  const index={rosterByKey:{[nurse+'_'+day]:leave},bankByDate:{}};
  assert.equal(api.capacity(day,index,{id:nurse},[{id:nurse},{id:other}],slots,()=>true,()=>null),3);
  assert.equal(api.capacity(day,index,null,[{id:nurse},{id:other}],slots,()=>true,()=>null),10);
  assert.equal(api.capacity(day,index,false,[{id:nurse}],slots,()=>true,()=>null),0);
});
test('the daily capacity calculation deducts vacation slots without removing the nurse for the day',async t=>{
  const f=app(t),c=f.c;
  c.staffList.push({id:other,full_name:'Other Nurse'});c.SLOTS=['09:00','09:30','10:00','10:30','11:00','11:30','12:00'];
  c.fetchAllRows=async()=>({rows:[]});c.normaliseFollowupOwner=x=>x;c.ownerStaffForCapacity=()=>c.staffList[0];
  c.isNurseWorkingClinicDay=()=>true;
  c.findCoreStaffByName=()=>null;
  c.loadClinicStaffingIndex=async()=>({rosterByKey:{[nurse+'_'+day]:{leave_hours:2,leave_start_time:'10:00'}},bankByDate:{}});
  vm.runInContext(fn('getClinicDayAvailability'),c);const result=await c.getClinicDayAvailability([day],'Example Nurse');
  assert.equal(result[day].capacity,10);assert.equal(result[day].ownerWorking,true);
});
function picker(t){
  const f=app(t),c=f.c;
  c.document.body.insertAdjacentHTML('beforeend',`<input id="pb-date" value="${day}"><div id="pb-slots"></div><input id="sit-date" value="${day}"><div id="sit-slot-avail"></div>`);
  c.SLOTS=['09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00'];
  c.nurseListForDate=async()=>[{id:nurse,name:'Example Nurse',type:'core',vacationLeave:{leave_hours:2,leave_start_time:'10:00'}}];
  c.SB={from:()=>({select:()=>({eq:async()=>({data:[]})})})};
  c.firstNameOf=name=>name.split(' ')[0];c.pickerNurseTag=()=>'';c.jsSafe=x=>x;c.sitingSlotLabel=x=>x;
  return f;
}
test('postop booking keeps the nurse column but blocks leave cells and clears a stale selection',async t=>{
  const f=picker(t),c=f.c;c.postopBookCtx={slot:'10:00',nurseId:nurse,nurseName:'Example Nurse'};
  vm.runInContext(fn('refreshPostopSlots'),c);await c.refreshPostopSlots();
  const rows=[...c.document.querySelectorAll('#pb-slots tr')];
  const blocked=rows.find(row=>row.firstElementChild.textContent==='10:00');
  const free=rows.find(row=>row.firstElementChild.textContent==='12:00');
  assert.match(blocked.textContent,/Vacation leave/);assert.equal(blocked.querySelector('button'),null);assert.ok(free.querySelector('button'));
  assert.equal(c.postopBookCtx.slot,null);
});
test('siting needs a nurse free for the whole hour, including when leave starts halfway through',async t=>{
  const f=picker(t),c=f.c;c.sitingEditId=null;c.sitingChosenSlot='09:30';
  vm.runInContext(fn('refreshSitingSlotAvail'),c);await c.refreshSitingSlotAvail();
  const rows=[...c.document.querySelectorAll('#sit-slot-avail tr')];
  const blocked=rows.find(row=>row.firstElementChild.textContent==='09:30');
  const free=rows.find(row=>row.firstElementChild.textContent==='12:30');
  assert.equal(blocked.querySelector('button'),null);assert.ok(free.querySelector('button'));assert.equal(c.sitingChosenSlot,'');
  c.nurseListForDate=async()=>[];c.sitingChosenSlot='12:30';await c.refreshSitingSlotAvail();
  assert.equal(c.document.querySelectorAll('#sit-slot-avail button').length,0);assert.equal(c.sitingChosenSlot,'');
});
