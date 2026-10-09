const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const PAT='11111111-1111-4111-8111-111111111111',EP='22222222-2222-4222-8222-222222222222';
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261005212220_jason_encounter_workspace.sql'),'utf8');
// Encounters are now for every signed-in nurse; the later migration replaces the function.
const openSql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261006190000_encounters_for_all_nurses.sql'),'utf8');
let db;
const original=[{stoma_uid:'base',appliances:['Old pouch'],accessories:['Powder'],changed_on:'2026-10-01'},{stoma_uid:'second',appliances:['Uro pouch'],accessories:[],changed_on:'2026-10-01'}];
const snapshot=(notes='Patient recieved guidance.')=>({stomas:[{uid:'base',number:'S1',type:'Loop ileostomy',colour:'Healthy pink',output:['Liquid','Gas'],appliances:['Old pouch'],accessories:['Powder'],complications:[],rod:{status:'Not recorded'}},{uid:'second',number:'S2',type:'Urostomy',colour:'',output:[],appliances:['Uro pouch'],accessories:[],complications:[],rod:{status:'Not recorded'}}],scope:['base','second'],notes,infection:{status:'',organism:''},referrals:[]});
const impact=()=>({appliances:[],expected_appliances:original,patient_patch:{},expected_patient:{},ward_note:'Ward setup',flange_due:null});
async function save(s=snapshot(),id=null,v=0,changes=impact(),episode=EP){return (await db.query('select public.save_jason_encounter($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::jsonb,$6::text,$7::jsonb) saved',[PAT,episode,id,v,JSON.stringify(s),s.notes,JSON.stringify(changes)])).rows[0].saved;}
async function state(){return (await db.query('select (select count(*) from encounters)::int count,(select appliances from clinical_records where id=$1) appliances,(select inpatient_notes from patients where id=$2) note',[EP,PAT])).rows[0];}
test.before(async()=>{
  db=new PGlite();await db.exec(`create schema auth;create role anon;create role authenticated;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
    create table patients(id uuid primary key,inpatient_ward text,inpatient_bed text,inpatient_notes text,inpatient_nurse_notes text,flange_due date,complications text,rod_stoma_uid text,rod_removal_date date,rod_removed_date date);
    create table clinical_records(id uuid primary key,patient_id uuid,kind text,record_date date,is_current boolean,discharge_date date,episode_ref text,appliances jsonb);
    create table encounters(id uuid primary key default gen_random_uuid(),patient_id text,episode_id text,episode_ref text,encounter_date date default current_date,assessment jsonb default '{}'::jsonb,nursing_report text,created_by_email text,created_by_name text,created_at timestamptz default now());`);
  await db.exec(sql);await db.exec(sql);await db.exec(openSql);await db.exec(openSql);
});
test.beforeEach(async()=>{
  await db.exec('truncate encounters,clinical_records,patients;');
  await db.query("select set_config('test.email','jason.fenech@gov.mt',false),set_config('test.uid','33333333-3333-4333-8333-333333333333',false)");
  await db.query("insert into patients(id,inpatient_ward,inpatient_bed,inpatient_notes,complications) values($1,'SW1','10','Original setup','[]')",[PAT]);
  await db.query("insert into clinical_records values($1,$2,'episode',current_date,true,null,'E03',$3::jsonb)",[EP,PAT,JSON.stringify(original)]);
});
test.after(async()=>db.close());
test('any signed-in nurse can save, signed with her own name; no sign-in is refused before storing anything',async()=>{
  await db.query("select set_config('test.uid','',false)");await assert.rejects(save(),/Sign in to record an encounter/);assert.equal((await state()).count,0);
  await db.query("select set_config('test.uid','44444444-4444-4444-8444-444444444444',false),set_config('test.email','jacqueline.sammut@gov.mt',false)");
  const e=await save();assert.equal(e.created_by_name,'Jacqueline Sammut');assert.equal(e.created_by_email,'jacqueline.sammut@gov.mt');assert.equal(e.assessment.versions[0].author_name,'Jacqueline Sammut');
  await db.query("select set_config('test.email','lorraine.marie.stivala@gov.mt',false)");
  const two=await save(snapshot('Lorraine corrected the notes.'),e.id,1);assert.equal(two.assessment.versions[1].author_name,'Lorraine Marie Stivala');assert.equal(two.assessment.versions[0].author_name,'Jacqueline Sammut');
});
test('a note-only encounter records episode, stomas, automatic author and V1 without replacing appliances',async()=>{
  const e=await save();assert.equal(e.patient_id,PAT);assert.equal(e.episode_id,EP);assert.equal(e.episode_ref,'E03');assert.equal(e.created_by_name,'Jason Fenech');assert.equal(e.assessment.current_version,1);assert.deepEqual(e.assessment.snapshot.scope,['base','second']);
  assert.deepEqual((await state()).appliances,original);assert.equal((await state()).note,'Original setup');
});
test('a correction keeps the same encounter ID and preserves the exact original notes and findings',async()=>{
  const one=await save(),s=snapshot('Patient received guidance.');s.stomas[0].colour='Dusky';const two=await save(s,one.id,1);
  assert.equal(two.id,one.id);assert.equal(two.created_at,one.created_at);assert.equal((await state()).count,1);assert.equal(two.assessment.current_version,2);
  assert.equal(two.assessment.versions[0].snapshot.notes,'Patient recieved guidance.');assert.equal(two.assessment.versions[0].snapshot.stomas[0].colour,'Healthy pink');
  assert.equal(two.assessment.versions[1].snapshot.notes,'Patient received guidance.');assert.equal(two.assessment.versions[1].author_name,'Jason Fenech');assert.equal(two.assessment.snapshot.stomas[1].appliances[0],'Uro pouch');
});
test('stale edits are rejected and unchanged saves do not create an extra version',async()=>{
  const one=await save(),two=await save(snapshot('Changed.'),one.id,1);
  await assert.rejects(save(snapshot('Stale.'),one.id,1),/newer saved version/);
  const unchanged=await save(snapshot('Changed.'),one.id,2);assert.equal(unchanged.assessment.current_version,2);assert.equal(two.id,unchanged.id);
});
test('changed appliances update only their own stoma and preserve the other stoma setup',async()=>{
  const s=snapshot(),i=impact();s.stomas[0].appliances=['New pouch'];i.appliances=[{stoma_uid:'base',appliances:['New pouch'],accessories:['Powder'],stoma_type:'Loop ileostomy'}];
  const e=await save(s,null,0,i);let ep=(await state()).appliances;
  assert.equal(ep.filter(r=>r.stoma_uid==='base').at(-1).appliances[0],'New pouch');assert.equal(ep.find(r=>r.stoma_uid==='second').appliances[0],'Uro pouch');assert.equal((await state()).note,'Ward setup');
  const amended=snapshot('Corrected product.');amended.stomas[0].appliances=['Corrected pouch'];const next=impact();next.expected_appliances=ep;next.appliances=[{stoma_uid:'base',appliances:['Corrected pouch'],accessories:[]}];
  await save(amended,e.id,1,next);ep=(await state()).appliances;assert.equal(ep.length,3);assert.equal(ep.at(-1).appliances[0],'Corrected pouch');assert.equal(ep.at(-1).encounter_version,2);
});
test('a concurrent appliance update rolls the entire encounter transaction back',async()=>{
  const i=impact();i.expected_appliances=[];i.appliances=[{stoma_uid:'base',appliances:['New pouch'],accessories:[]}];
  await assert.rejects(save(snapshot(),null,0,i),/setup changed/);assert.equal((await state()).count,0);assert.deepEqual((await state()).appliances,original);
});
test('a clinical conflict also rolls back the encounter and any appliance writes',async()=>{
  const i=impact();i.appliances=[{stoma_uid:'base',appliances:['New pouch'],accessories:[]}];i.patient_patch={complications:'[]'};i.expected_patient={complications:'stale'};
  await assert.rejects(save(snapshot(),null,0,i),/care record changed/);assert.equal((await state()).count,0);assert.deepEqual((await state()).appliances,original);
});
test('earlier encounter corrections never replace a newer current care setup',async()=>{
  const early=await save();await db.query("update encounters set created_at=now()-interval '1 hour' where id=$1",[early.id]);await save(snapshot('Later encounter.'));
  const i=impact();i.appliances=[{stoma_uid:'base',appliances:['Historical correction'],accessories:[]}];i.patient_patch={inpatient_nurse_notes:'Historical infection'};
  const v=await save(snapshot('Earlier wording corrected.'),early.id,1,i);assert.equal(v.assessment.current_version,2);assert.equal(v.assessment.versions[1].published_current_care,false);assert.deepEqual((await state()).appliances,original);
});
test('closed episodes remain amendable but cannot receive a new encounter or current care changes',async()=>{
  const e=await save();await db.query('update clinical_records set is_current=false,discharge_date=current_date where id=$1',[EP]);
  await assert.rejects(save(),/admission has closed/);await save(snapshot('Historical amendment.'),e.id,1);assert.equal((await state()).count,1);
});
test('a legacy free-text encounter becomes V1 plus V2 with its original assessment and report intact',async()=>{
  const old={notes:'Old assessment',custom:'retain this field'};
  const r=(await db.query('insert into encounters(patient_id,episode_id,assessment,nursing_report,created_by_name) values($1,$2,$3::jsonb,$4,$5) returning id',[PAT,EP,JSON.stringify(old),'Old nursing report','Original signer'])).rows[0];
  const revised=await save(snapshot('Corrected notes.'),r.id,1);assert.deepEqual(revised.assessment.versions[0].legacy_assessment,old);assert.equal(revised.assessment.versions[0].report,'Old nursing report');assert.equal(revised.assessment.versions[0].author_name,'Original signer');assert.equal(revised.assessment.versions[1].author_name,'Jason Fenech');
});
test('patient/episode and stoma-report mismatches are rejected',async()=>{
  await assert.rejects(save(snapshot(),null,0,impact(),'44444444-4444-4444-8444-444444444444'),/episode could not be found/);
  const invalid=snapshot();invalid.scope=['another-patient-stoma'];await assert.rejects(save(invalid),/not in the encounter/);assert.equal((await state()).count,0);
});
