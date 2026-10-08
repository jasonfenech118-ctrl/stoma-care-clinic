const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const P='11111111-1111-4111-8111-111111111111',S='22222222-2222-4222-8222-222222222222';let db;
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261008211847_clinical_task_assignments.sql'),'utf8');
async function save({id=null,revision=0,text='Review peristomal skin',patient=P,stoma='stoma-one',nurse=S,due='2026-10-10'}={}){return (await db.query('select public.save_clinic_task($1,$2,$3,$4,$5,$6,$7) saved',[id,revision,text,patient,stoma,nurse,due])).rows[0].saved;}
async function complete(id,revision,done){return (await db.query('select public.set_clinic_task_completed($1,$2,$3) saved',[id,revision,done])).rows[0].saved;}
test.before(async()=>{
 db=new PGlite();await db.exec(`create schema auth;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql as $$select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
 create table patients(id uuid primary key);create table staff(id uuid primary key,full_name text,is_active boolean);
 create table clinic_pending_tasks(id uuid primary key default gen_random_uuid(),task_text text,is_completed boolean not null default false,created_at timestamptz default now(),created_by_email text,created_by_name text,completed_on date,completed_at timestamptz,completed_by_email text,completed_by_name text);
 create policy clinic_pending_tasks_all on clinic_pending_tasks for all to authenticated using(true) with check(true);
 grant usage on schema auth,public to authenticated,anon;grant select on patients,staff to authenticated;
 insert into patients values('${P}');insert into staff values('${S}','Lorraine Nurse',true);`);
 await db.exec(sql);await db.exec(sql);await db.exec('set role authenticated;');
});
test.after(async()=>db.close());test.beforeEach(async()=>{await db.exec('reset role;truncate clinic_pending_tasks;set role authenticated;');await db.query("select set_config('test.email','jason.fenech@gov.mt',false)");});
test('a task retains patient, stoma, responsible nurse and due date; completion records its actual signer',async()=>{
 const t=await save();assert.equal(t.patient_id,P);assert.equal(t.stoma_uid,'stoma-one');assert.equal(t.assigned_name,'Lorraine Nurse');assert.equal(t.created_by_name,'Jason Fenech');assert.equal(t.revision,1);
 await db.query("select set_config('test.email','jacqueline.sammut@gov.mt',false)");const done=await complete(t.id,1,true);
 assert.equal(done.is_completed,true);assert.equal(done.completed_by_name,'Jacqueline Sammut');assert.ok(done.completed_at);assert.equal(done.revision,2);
 const reopened=await complete(t.id,2,false);assert.equal(reopened.is_completed,false);assert.equal(reopened.completed_at,null);assert.equal(reopened.patient_id,P);
});
test('stale edits cannot undo another nurse’s task change',async()=>{
 const t=await save();await complete(t.id,1,true);
 await assert.rejects(save({id:t.id,revision:1,text:'Stale task'}),/Another nurse changed/);
 assert.equal((await db.query('select task_text,is_completed from clinic_pending_tasks')).rows[0].is_completed,true);
});
test('a linked task needs an available patient, active responsible nurse and due date; existing general tasks still complete',async()=>{
 await assert.rejects(save({nurse:null}),/responsible nurse/);await assert.rejects(save({due:null}),/due date/);
 await assert.rejects(save({patient:'99999999-9999-4999-8999-999999999999'}),/patient is not available/);
 const general=await save({patient:null,stoma:null,nurse:null,due:null,text:'Check clinic supplies'});assert.equal(general.task_kind,'general');assert.equal((await complete(general.id,1,true)).is_completed,true);
 await db.exec('set role anon;');await assert.rejects(save(),/permission denied/);await db.exec('set role authenticated;');
});
