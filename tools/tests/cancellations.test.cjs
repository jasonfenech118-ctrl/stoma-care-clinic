const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'assets/cancellations.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'sql/add-appointment-cancellations.sql'),'utf8');
const pid='00000000-0000-0000-0000-000000000001';
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let db;
test.before(async()=>{
  db=new PGlite();
  await db.exec(`CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"email":"nurse@example.invalid"}'::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${pid}'::uuid $$;
    CREATE TABLE public.patients(id uuid PRIMARY KEY,followup_status text,followup_due_month int,followup_year int);
    INSERT INTO patients VALUES ('${pid}','active',12,2026);
    CREATE TABLE public.appointments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),patient_id uuid REFERENCES patients(id),appt_date date,appt_slot text,status text,assigned_to uuid,bank_staff_id uuid,appliances jsonb DEFAULT '[]');
    CREATE UNIQUE INDEX appointments_active_slot_uniq ON appointments(appt_date,appt_slot,(coalesce(assigned_to::text,bank_staff_id::text,'common'))) WHERE status IS DISTINCT FROM 'cancelled';
    INSERT INTO appointments(id,patient_id,appt_date,appt_slot,status) VALUES ('${id(1)}','${pid}','2025-01-01','09:00','cancelled');`);
  await db.exec(migration);await db.exec(migration);
});
test.after(async()=>{await db?.close();});
async function add(n,status='booked'){
  const r=await db.query(`INSERT INTO appointments(id,patient_id,appt_date,appt_slot,status,appliances) VALUES ($1,$2,'2025-02-01',$3,$4,'["kept"]') RETURNING *`,[id(n),pid,`${String(n).padStart(2,'0')}:00`,status]);return r.rows[0];
}
async function row(n){return (await db.query('SELECT * FROM appointments WHERE id=$1',[id(n)])).rows[0];}
async function cancel(n,source='clinic',reason='availability'){
  await db.query("UPDATE appointments SET status='cancelled',cancellation_source=$2,cancellation_reason=$3,cancellation_date='2025-01-15' WHERE id=$1",[id(n),source,reason]);return row(n);
}
function unitContext(extra={}){
  const env=vm.createContext({TODAY:'2026-09-17',...extra});vm.runInContext(source,env);return env;
}
test('migration is repeatable and leaves legacy cancellations unclassified with unknown dates',async()=>{
  const a=await row(1);assert.equal(a.status,'cancelled');assert.equal(a.cancellation_source,null);assert.equal(a.cancellation_date,null);assert.equal(a.cancellation_recorded_at,null);assert.equal(a.cancellation_revision,0);assert.equal(a.cancellation_history.length,0);
});
test('database cancellation saves source, reason and staff atomically without changing patient or clinical details',async()=>{
  await add(2);const a=await cancel(2);assert.equal(a.status,'cancelled');assert.equal(a.cancellation_source,'clinic');assert.equal(a.cancellation_recorded_by,'nurse@example.invalid');assert.equal(a.cancellation_history[0].action,'cancelled');assert.equal(a.cancellation_revision,1);assert.deepEqual(a.appliances,['kept']);
  const p=(await db.query('SELECT * FROM patients')).rows[0];assert.equal(p.followup_status,'active');assert.equal(p.followup_due_month,12);
});
test('database refuses missing source, mismatched reasons, empty other reasons and future dates without cancelling',async()=>{
  await add(3);
  for(const fields of ["",",cancellation_source='patient',cancellation_reason='availability'",",cancellation_source='clinic',cancellation_reason='other'",",cancellation_source='clinic',cancellation_reason='availability',cancellation_date='2999-01-01'"]){
    await assert.rejects(db.query(`UPDATE appointments SET status='cancelled'${fields} WHERE id=$1`,[id(3)]));assert.equal((await row(3)).status,'booked');
  }
});
test('legacy classification preserves an unknown actual cancellation date and identifies when it was entered',async()=>{
  await db.query("UPDATE appointments SET cancellation_source='patient',cancellation_reason='not_given' WHERE id=$1",[id(1)]);
  const a=await row(1);assert.equal(a.cancellation_date,null);assert.ok(a.cancellation_recorded_at);assert.equal(a.cancellation_history[0].action,'classified');
});
test('corrections append to the audit and a stale revision cannot overwrite newer details',async()=>{
  await add(4);await cancel(4);
  await db.query("UPDATE appointments SET cancellation_reason='staff_unavailable' WHERE id=$1 AND cancellation_revision=1",[id(4)]);
  const stale=await db.query("UPDATE appointments SET cancellation_reason='clinic_closed' WHERE id=$1 AND cancellation_revision=1 RETURNING id",[id(4)]);
  assert.equal(stale.rows.length,0);const a=await row(4);assert.equal(a.cancellation_history.length,2);assert.equal(a.cancellation_history[0].cancellation_reason,'availability');assert.equal(a.cancellation_history[1].cancellation_reason,'staff_unavailable');
  await db.query("UPDATE appointments SET cancellation_history='[]',cancellation_revision=0,cancellation_recorded_by='fake' WHERE id=$1",[id(4)]);
  assert.equal((await row(4)).cancellation_history.length,2);assert.equal((await row(4)).cancellation_recorded_by,'nurse@example.invalid');
});
test('linked rebooking preserves the original, prevents duplicate replacements and prevents restoring over a replacement',async()=>{
  await add(5);await cancel(5);
  await db.query("INSERT INTO appointments(id,patient_id,appt_date,appt_slot,status,rebooked_from_appointment_id) VALUES ($1,$2,'2025-03-01','09:00','booked',$3)",[id(6),pid,id(5)]);
  assert.equal((await row(5)).status,'cancelled');assert.equal((await row(6)).rebooked_from_appointment_id,id(5));
  await assert.rejects(db.query("INSERT INTO appointments(id,patient_id,appt_date,appt_slot,status,rebooked_from_appointment_id) VALUES ($1,$2,'2025-04-01','09:00','booked',$3)",[id(7),pid,id(5)]),/unique/);
  await assert.rejects(db.query("UPDATE appointments SET status='booked' WHERE id=$1",[id(5)]),/replacement/);
});
test('rebooking validates original patient and cancelled status',async()=>{
  await add(8);
  await assert.rejects(db.query("INSERT INTO appointments(id,patient_id,appt_date,appt_slot,status,rebooked_from_appointment_id) VALUES ($1,$2,'2025-05-01','09:00','booked',$3)",[id(9),pid,id(8)]),/same patient and a cancelled/);
  await assert.rejects(db.query("INSERT INTO appointments(id,patient_id,appt_date,appt_slot,status,rebooked_from_appointment_id) VALUES ($1,NULL,'2025-05-01','09:00','booked',$2)",[id(9),id(5)]),/same patient and a cancelled/);
});
test('undo is audited, cancellation history cannot be deleted, and cancelled dates cannot be overwritten',async()=>{
  await add(10);await cancel(10,'patient','transport');
  await assert.rejects(db.query("UPDATE appointments SET appt_date='2025-06-01' WHERE id=$1",[id(10)]),/original cancelled/);
  await assert.rejects(db.query("UPDATE appointments SET status='did_not_attend' WHERE id=$1",[id(10)]),/Undo/);
  await db.query("UPDATE appointments SET status='booked' WHERE id=$1",[id(10)]);
  const a=await row(10);assert.equal(a.cancellation_history[1].action,'restored');assert.equal(a.cancellation_source,'patient');
  await assert.rejects(db.query('DELETE FROM appointments WHERE id=$1',[id(10)]),/retained/);
});
test('cancellation releases its slot and undo respects an existing replacement patient in that slot',async()=>{
  await add(11);await cancel(11);
  await db.query("INSERT INTO appointments(id,patient_id,appt_date,appt_slot,status) VALUES ($1,$2,'2025-02-01','11:00','booked')",[id(12),pid]);
  await assert.rejects(db.query("UPDATE appointments SET status='booked' WHERE id=$1",[id(11)]),/unique/);assert.equal((await row(11)).status,'cancelled');
});
test('completed DNTU or Seen outcomes cannot be silently reclassified as cancellations',async()=>{
  await add(13,'did_not_attend');await assert.rejects(cancel(13),/Only a booked/);assert.equal((await row(13)).status,'did_not_attend');
});
test('cancellation trigger respects existing row-level update permissions',async()=>{
  const before=await row(1);
  await db.exec(`CREATE ROLE test_nurse; GRANT USAGE ON SCHEMA auth TO test_nurse;
    GRANT SELECT,UPDATE ON appointments TO test_nurse;
    ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY test_read ON appointments FOR SELECT TO test_nurse USING (true);
    CREATE POLICY test_no_update ON appointments FOR UPDATE TO test_nurse USING (true) WITH CHECK (false);
    SET ROLE test_nurse;`);
  try{await assert.rejects(db.query("UPDATE appointments SET cancellation_note='Must not save' WHERE id=$1",[id(1)]),/row-level security/);}
  finally{await db.exec('RESET ROLE; ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;');}
  const after=await row(1);assert.deepEqual(after.cancellation_history,before.cancellation_history);assert.equal(after.cancellation_note,before.cancellation_note);
});
test('form validation and reporting separate clinic, patient and unknown cancellations from DNTU',()=>{
  const c=unitContext(),appt={status:'booked'},valid={source:'patient',reason:'transport',date:'2026-09-16',note:''};
  assert.equal(c.cancellationPayload(appt,valid).status,'cancelled');
  for(const patch of [{source:''},{reason:'availability'},{date:'2026-02-30'},{date:'2026-09-18'},{reason:'other',note:''}])assert.throws(()=>c.cancellationPayload(appt,{...valid,...patch}));
  const rows=[{status:'cancelled',cancellation_source:'patient',cancellation_reason:'transport'},{status:'cancelled',cancellation_source:'clinic',cancellation_reason:'availability'},{status:'cancelled'},{status:'did_not_attend',cancellation_source:'patient'}];
  assert.deepEqual(JSON.parse(JSON.stringify(c.cancellationCounts(rows))),{total:3,patient:1,clinic:1,unknown:1});
  assert.equal(c.cancellationFilteredRows(rows,'clinic','clinic:availability').length,1);assert.equal(c.cancellationFilteredRows(rows,'unknown').length,1);
  const csv=c.cancellationCSV([{...rows[0],patients:{first_name:'=FORMULA()',surname:'Example'},cancellation_note:'line1\n"line2"'}],[]);
  assert.match(csv,/'=FORMULA/);assert.match(csv,/""line2""/);assert.match(csv,/Cancelled by patient/);
});

// DOM interaction tests use synthetic markup/data, without a browser or network.
function domFixture(appt,{saveError=null,stale=false}={}){
  const dom=new JSDOM('<div id="mb"></div>',{runScripts:'outside-only'}),w=dom.window,writes=[],alerts=[];
  Object.assign(w,{TODAY:'2026-09-17',esState:null,htmlSafe:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'),jsSafe:String,
    alert:m=>alerts.push(m),openMo:()=>{},closeModal:()=>{},refreshAppointmentViews:()=>{},enrichAppointments:async rows=>rows.map(a=>({...a,patients:{first_name:'Example',surname:'Patient',id_card:'DEMO'}})),
    SB:{from(table){let body=null;const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},single(){return Promise.resolve({data:appt,error:null});},update(v){body=v;return q;},then(resolve){writes.push({table,body,filters});return Promise.resolve(resolve({data:stale?[]:[{id:appt.id}],error:saveError}));}};return q;}}
  });w.eval(source);w.openCancelledAppointmentModal=async()=>{};return {dom,w,writes,alerts};
}
test('nurse form has no default source, source-specific reasons, and guards double-clicks',async()=>{
  const f=domFixture({id:id(20),patient_id:pid,status:'booked',appt_date:'2026-09-20',appt_slot:'09:00',cancellation_revision:0});
  await f.w.openCancellationForm(id(20));const d=f.w.document;
  assert.equal(d.querySelector('input[name="cancel-source"]:checked'),null);assert.equal(d.querySelectorAll('fieldset').length,1);
  d.querySelector('input[value="clinic"]').checked=true;f.w.cancellationChangeSource();assert.match(d.getElementById('cancel-reason').textContent,/Staff unavailable/);assert.doesNotMatch(d.getElementById('cancel-reason').textContent,/Transport/);
  d.getElementById('cancel-reason').value='availability';await Promise.all([f.w.saveCancellationForm(),f.w.saveCancellationForm()]);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].table,'appointments');assert.equal(f.writes[0].body.cancellation_source,'clinic');assert.deepEqual(f.writes[0].filters.find(([k])=>k==='cancellation_revision'),['cancellation_revision',0]);f.dom.window.close();
});
test('form keeps input after save failure and never retries without cancellation details',async()=>{
  for(const mode of ['error','stale']){
    const f=domFixture({id:id(21),patient_id:pid,status:'booked',appt_date:'2026-09-20',appt_slot:'09:00',cancellation_revision:0},mode==='error'?{saveError:{message:'Update failed'}}:{stale:true});
    await f.w.openCancellationForm(id(21));const d=f.w.document;d.querySelector('input[value="patient"]').checked=true;f.w.cancellationChangeSource();d.getElementById('cancel-reason').value='not_given';
    await f.w.saveCancellationForm();assert.equal(f.writes.length,1);assert.equal(d.getElementById('cancel-error').hidden,false);assert.equal(d.getElementById('cancel-save').disabled,false);assert.equal(d.getElementById('cancel-reason').value,'not_given');f.dom.window.close();
  }
});
test('old schema blocks new recording, while existing unknown cancellations remain readable',async()=>{
  const f=domFixture({id:id(22),status:'booked'});await f.w.openCancellationForm(id(22));assert.match(f.alerts[0],/not been enabled/);assert.equal(f.writes.length,0);assert.equal(f.w.cancellationSourceLabel({status:'cancelled'}),'Cancellation source not recorded');f.dom.window.close();
});
test('all application DNTU counters ignore both kinds of cancellation and still reset on Seen',async()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),env=vm.createContext({TODAY:'2026-09-17'});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/dntu-workflow.js'),'utf8'),env);
  for(const name of ['currentDntuStreakForPatientAppointments','calculateCurrentDntuStreak']){
    const start=html.indexOf(`function ${name}(`),end=html.indexOf('\n}',start)+2;vm.runInContext(html.slice(start,end),env);
    const rows=[{status:'did_not_attend',appt_date:'2025-01-01'},{status:'cancelled',cancellation_source:'patient',appt_date:'2025-02-01'},{status:'did_not_attend',appt_date:'2025-03-01'},{status:'cancelled',cancellation_source:'clinic',appt_date:'2025-04-01'}];
    assert.equal(env[name](rows),2);assert.equal(env[name]([...rows,{status:'attended',appt_date:'2025-05-01'}]),0);
  }
});
