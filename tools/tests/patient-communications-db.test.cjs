const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname, '../../sql/add-patient-communications.sql'), 'utf8');
const PAT = '11111111-1111-4111-8111-111111111111';
const HIDDEN = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const RID = '44444444-4444-4444-8444-444444444444';
let db;
const payload = () => ({communication_date:'2026-10-09',communication_time:'13:45',method:'Email',direction:'Outgoing',contact_name:'Community nurse',service:'Community nursing',subject:'Appliance advice',notes:'Original advice.',status:'Awaiting response',followup_action:'Check response',followup_date:'2026-10-12'});
async function save(p = payload(), kind = 'community', id = RID, version = 0, patient = PAT) {
  return (await db.query('select public.save_patient_communication($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb) saved', [patient,id,version,kind,JSON.stringify(p)])).rows[0].saved;
}
async function stored() {return (await db.query('select * from public.patient_communications')).rows;}
test.before(async () => {
  db = new PGlite();
  await db.exec(`create schema auth;create role anon;create role authenticated;
    grant usage on schema auth to anon,authenticated;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true),'is_anonymous',coalesce(nullif(current_setting('test.anonymous',true),''),'false')::boolean)$$;
    create table public.patients(id uuid primary key,visible boolean not null default true,is_inpatient boolean not null default false);
    alter table public.patients enable row level security;
    create policy test_patient_visibility on public.patients for select to authenticated using(visible);
    grant select on public.patients to authenticated;`);
  await db.exec(sql);await db.exec(sql);
});
test.beforeEach(async () => {
  await db.exec('reset role;truncate patient_communications,patients;');
  await db.query('insert into patients(id,visible) values($1,true),($2,false)', [PAT,HIDDEN]);
  await db.query("select set_config('test.uid',$1,false),set_config('test.email','jason.fenech@gov.mt',false),set_config('test.anonymous','false',false)", [ACTOR]);
  await db.exec('set role authenticated');
});
test.after(async () => db.close());

test('community and patient records save, signed and versioned, without admitting the patient', async () => {
  const one = await save();
  const p = {...payload(),contact_name:'Alex Sample',service:'',method:'Telephone',communication_time:'',followup_date:''};
  const two = await save(p,'patient','55555555-5555-4555-8555-555555555555');
  assert.equal(one.kind,'community');assert.equal(two.kind,'patient');assert.equal(two.communication_time,null);assert.equal(two.followup_date,null);
  assert.equal(one.created_by,ACTOR);assert.equal(one.created_by_name,'Jason Fenech');assert.equal(one.version,1);assert.equal(one.versions[0].snapshot.notes,'Original advice.');
  assert.equal((await db.query('select is_inpatient from patients where id=$1',[PAT])).rows[0].is_inpatient,false);
});
test('another nurse can correct a visible patient record, keeping its original author and wording', async () => {
  const one = await save();
  await db.query("select set_config('test.email','jacqueline.sammut@gov.mt',false),set_config('test.uid','66666666-6666-4666-8666-666666666666',false)");
  const two = await save({...payload(),notes:'Corrected advice.',status:'Completed'},'community',RID,1);
  assert.equal(two.created_by_name,'Jason Fenech');assert.equal(two.created_at,one.created_at);assert.equal(two.updated_by_name,'Jacqueline Sammut');assert.equal(two.version,2);
  assert.equal(two.versions.length,2);assert.equal(two.versions[0].snapshot.notes,'Original advice.');assert.equal(two.versions[1].snapshot.notes,'Corrected advice.');assert.equal(two.versions[1].author_name,'Jacqueline Sammut');
});
test('a stale version is refused without replacing a newer correction', async () => {
  await save();await save({...payload(),notes:'Saved on another device.'},'community',RID,1);
  await assert.rejects(save({...payload(),notes:'Stale correction.'},'community',RID,1),/newer saved version/);
  assert.equal((await stored())[0].notes,'Saved on another device.');assert.equal((await stored())[0].version,2);
});
test('a retry after a lost response and an unchanged edit do not duplicate records or versions', async () => {
  const one = await save(), again = await save(), unchanged = await save(payload(),'community',RID,1);
  assert.equal(one.id,again.id);assert.equal(unchanged.version,1);assert.equal((await stored()).length,1);
});
test('patient/category mismatches and an inaccessible patient are refused', async () => {
  await save();await assert.rejects(save(payload(),'patient',RID,1),/patient and category/);
  await assert.rejects(save(payload(),'community',RID,1,HIDDEN),/patient could not be found/);
  await assert.rejects(save(payload(),'community','77777777-7777-4777-8777-777777777777',1),/could not be found/);
  assert.equal((await stored()).length,1);
});
test('invalid fields, blank community service, invalid method and earlier follow-up dates never save', async () => {
  await assert.rejects(save({...payload(),service:'  '}),/Complete the date/);
  await assert.rejects(save({...payload(),method:'Unsupported'}),/check constraint/);
  await assert.rejects(save({...payload(),followup_date:'2026-10-08'}),/check constraint/);
  await assert.rejects(save({...payload(),created_by:ACTOR}),/Unsupported communication field/);
  await assert.rejects(save({...payload(),notes:'   '}),/Complete the date/);
  assert.equal((await stored()).length,0);
});
test('anonymous roles cannot read/write records or invoke the saving function', async () => {
  await save();await db.exec('reset role;set role anon');
  await assert.rejects(stored(),/permission denied/);await assert.rejects(save(),/permission denied/);
  await db.exec('reset role;set role authenticated');await db.query("select set_config('test.anonymous','true',false)");
  assert.equal((await stored()).length,0);await assert.rejects(save(),/Sign in/);
});
test('the server protects audit data and patient identity even on direct API updates', async () => {
  await save();await db.query("update patient_communications set notes='Direct correction.',versions='[]',version=99,created_by_name='Fake signer' where id=$1",[RID]);
  const r = (await stored())[0];assert.equal(r.created_by_name,'Jason Fenech');assert.equal(r.version,2);assert.equal(r.versions.length,2);assert.equal(r.versions[0].snapshot.notes,'Original advice.');
  await assert.rejects(db.query('update patient_communications set patient_id=$1 where id=$2',[HIDDEN,RID]),/cannot be moved/);
  await assert.rejects(db.query('delete from patient_communications where id=$1',[RID]),/permission denied/);
});
