const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',P='11111111-1111-4111-8111-111111111111',E='22222222-2222-4222-8222-222222222222';
let db;const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261008211243_private_encounter_drafts.sql'),'utf8');
async function user(id){await db.query("select set_config('test.uid',$1,false)",[id]);}
async function save(revision=0,notes='Draft only'){return (await db.query('select public.save_clinic_encounter_draft($1,$2,null,0,$3::jsonb,$4::jsonb,$5) saved',[P,E,'{}',JSON.stringify({notes}),revision])).rows[0].saved;}
test.before(async()=>{
 db=new PGlite();await db.exec(`create schema auth;create role anon;create role authenticated;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email','nurse@example.test')$$;
 create table public.patients(id uuid primary key);create table public.clinical_records(id uuid primary key,patient_id uuid,kind text,is_current boolean,discharge_date date);
 create table public.encounters(id uuid primary key,patient_id text,episode_id text,encounter_date date);
 grant usage on schema auth,public to authenticated;grant select on public.patients,public.clinical_records,public.encounters to authenticated;
 insert into auth.users values('${A}'),('${B}');insert into patients values('${P}');insert into clinical_records values('${E}','${P}','episode',true,null);`);
 await db.exec(sql);await db.exec(sql);
});
test.after(async()=>db.close());
test.beforeEach(async()=>{await db.exec('reset role;truncate clinic_encounter_drafts;');await db.exec('set role authenticated;');await user(A);});
test('draft RPC stores only private recovery data and rejects another device’s stale revision',async()=>{
 const one=await save();assert.equal(one.revision,1);assert.equal(one.user_id,A);assert.equal(one.snapshot.notes,'Draft only');
 assert.equal((await db.query('select count(*)::int n from encounters')).rows[0].n,0);
 const two=await save(1,'Newer wording');assert.equal(two.revision,2);
 await assert.rejects(save(1,'Stale wording'),/changed on another device/);
 assert.equal((await db.query('select snapshot from clinic_encounter_drafts')).rows[0].snapshot.notes,'Newer wording');
});
test('RLS prevents another nurse reading, changing or deleting private drafts',async()=>{
 await save();await user(B);assert.equal((await db.query('select * from clinic_encounter_drafts')).rows.length,0);
 assert.equal((await db.query('delete from clinic_encounter_drafts returning *')).rows.length,0);
 assert.equal((await db.query("update clinic_encounter_drafts set snapshot='{}' returning *")).rows.length,0);
 await save();await user(A);assert.equal((await db.query('select * from clinic_encounter_drafts')).rows.length,1);
 await assert.rejects(db.query('update clinic_encounter_drafts set user_id=$1',[B]),/row-level security/);
});
test('discarded drafts cannot be resurrected by an in-flight stale save; closed admissions and unsigned users cannot save',async()=>{
 await save();await db.query('delete from clinic_encounter_drafts');await assert.rejects(save(1),/discarded on another device/);
 await user('');await assert.rejects(save(),/Sign in/);await user(A);
 await db.exec('reset role;update clinical_records set is_current=false;set role authenticated;');
 await assert.rejects(save(),/no longer open/);await db.exec('reset role;update clinical_records set is_current=true;set role authenticated;');
});
