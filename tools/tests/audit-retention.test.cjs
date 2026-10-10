const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../../sql/add-audit-retention-90-days.sql'),'utf8');
// pg_cron runs outside the WASM engine. Stub only its scheduling interface;
// exercise the real PostgreSQL retention function and role permissions below.
const executable=migration.replace('CREATE EXTENSION IF NOT EXISTS pg_cron;','');
async function setup(t){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table public.audit_log(id text primary key,at timestamptz not null);
    create table public.patients(id text primary key,notes text);
    create table public.encounters(id text primary key,assessment jsonb);
    insert into patients values('p1','Restored patient value');
    insert into encounters values('e1','{"versions":[1,2]}');
    create schema cron;
    create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text);
    create table cron.job_run_details(runid bigint generated always as identity primary key,jobid bigint,end_time timestamptz);
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values($1,$2,$3)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid;
    $$;`);
  return db;
}

test('retention deletes only expired audit entries, keeps the exact 90-day boundary and leaves clinical data intact',async t=>{
  const db=await setup(t);await db.exec('begin');
  await db.exec(`insert into audit_log values
    ('expired',now()-interval '90 days'-interval '1 microsecond'),
    ('boundary',now()-interval '90 days'),
    ('recent',now()-interval '1 day'),('future',now()+interval '1 day');`);
  await db.exec(executable);
  assert.deepEqual((await db.query('select id from audit_log order by id')).rows.map(r=>r.id),['boundary','future','recent']);
  assert.equal((await db.query('select notes from patients')).rows[0].notes,'Restored patient value');
  assert.deepEqual((await db.query('select assessment from encounters')).rows[0].assessment,{versions:[1,2]});
  assert.equal(Number((await db.query('select public.prune_audit_log_90_days() as n')).rows[0].n),0);
  await db.exec('commit');
});

test('retention installation is idempotent and cleans only its own completed cron history older than seven days',async t=>{
  const db=await setup(t);await db.exec(executable);await db.exec(executable);
  const jobs=(await db.query('select * from cron.job')).rows;
  assert.equal(jobs.length,1);assert.equal(jobs[0].jobname,'stoma-audit-retention-90-days');assert.equal(jobs[0].schedule,'15 2 * * *');
  assert.equal(jobs[0].command,'SELECT public.prune_audit_log_90_days();');
  await db.exec(`begin;insert into cron.job_run_details(jobid,end_time) values
    (${jobs[0].jobid},now()-interval '8 days'),(${jobs[0].jobid},now()-interval '7 days'),
    (${jobs[0].jobid},now()),(${jobs[0].jobid},null),(999,now()-interval '30 days');
    select public.prune_audit_log_90_days();`);
  const runs=(await db.query('select jobid,end_time from cron.job_run_details')).rows;
  assert.equal(runs.length,4);assert.equal(runs.filter(r=>Number(r.jobid)===999).length,1);
  assert.equal(runs.filter(r=>r.end_time===null).length,1);await db.exec('commit');
});

test('maintenance runs with scheduler permissions and cannot be invoked by app, anonymous or service roles',async t=>{
  const db=await setup(t);await db.exec(executable);
  const properties=(await db.query(`select prosecdef,proconfig from pg_proc where oid='public.prune_audit_log_90_days()'::regprocedure`)).rows[0];
  assert.equal(properties.prosecdef,false);assert.deepEqual(properties.proconfig,['search_path=pg_catalog']);
  for(const role of ['anon','authenticated','service_role']){
    assert.equal((await db.query(`select has_function_privilege('${role}','public.prune_audit_log_90_days()','execute') as allowed`)).rows[0].allowed,false);
    await db.exec('set role '+role);
    await assert.rejects(db.query('select public.prune_audit_log_90_days()'),/permission denied/i);
    await db.exec('reset role');
  }
});
