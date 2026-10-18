const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'../..');
test('restored session records opening; activity is throttled, hidden/idle app does not heartbeat, logout stops',async()=>{
  const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;let calls=0,clock=100000;
  Object.defineProperty(w.document,'visibilityState',{value:'visible',configurable:true});w.Date.now=()=>clock;
  w.eval(fs.readFileSync(path.join(root,'assets/app-access.js'),'utf8'));
  const client={rpc:async name=>{assert.equal(name,'record_clinic_app_access');calls++;return {};}};
  await w.ClinicAccess.start(client,'nurse');assert.equal(calls,1);
  await w.ClinicAccess.touch();assert.equal(calls,1);
  clock+=60001;await w.ClinicAccess.touch();assert.equal(calls,2);
  clock+=16*60000;assert.equal(calls,2); // No timer writes while idle.
  Object.defineProperty(w.document,'visibilityState',{value:'hidden',configurable:true});
  await w.ClinicAccess.touch();assert.equal(calls,2);
  Object.defineProperty(w.document,'visibilityState',{value:'visible',configurable:true});
  await w.ClinicAccess.touch();assert.equal(calls,3);
  w.ClinicAccess.stop();clock+=60001;await w.ClinicAccess.touch();assert.equal(calls,3);w.close();
});
test('server groups visits for 15 minutes, derives identity, rejects invalid sessions, restricts audit to Jason',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role authenticated;create role anon;create schema auth;create schema clinic_private;create schema cron;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('session_id',current_setting('test.sid',true))$$;
      create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
      grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key,email text);
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      insert into auth.users values('11111111-1111-4111-8111-111111111111','test.nurse@example.test');
      insert into auth.sessions values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',null);
      select set_config('test.uid','11111111-1111-4111-8111-111111111111',false),set_config('test.sid','22222222-2222-4222-8222-222222222222',false);`);
    const sql=fs.readFileSync(path.join(root,'sql/add-app-access-audit.sql'),'utf8');await db.exec(sql);await db.exec(sql);
    await db.exec('set role authenticated;select public.record_clinic_app_access();select public.record_clinic_app_access();');
    assert.equal((await db.query('select * from public.clinic_app_access')).rows.length,0);
    await assert.rejects(db.exec('delete from public.clinic_app_access'),/permission denied/);
    await db.exec('reset role');let rows=(await db.query('select * from public.clinic_app_access')).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].email,'test.nurse@example.test');assert.equal(rows[0].nurse_name,'Test Nurse');
    await db.exec("update public.clinic_app_access set last_activity_at=now()-interval '16 minutes';set role authenticated;select public.record_clinic_app_access();reset role;");
    assert.equal((await db.query('select * from public.clinic_app_access')).rows.length,2);
    await db.exec("select set_config('test.uid','dd084e24-e851-4243-883d-f6404299585c',false);set role authenticated;");
    assert.equal((await db.query('select * from public.clinic_app_access')).rows.length,2);
    await assert.rejects(db.exec('select public.record_clinic_app_access()'),/valid signed-in session/);
    await assert.rejects(db.exec("update public.clinic_app_access set email='spoofed'"),/permission denied/);
    await db.exec('reset role;set role anon');await assert.rejects(db.exec('select public.record_clinic_app_access()'),/permission denied/);
  }finally{await db.close();}
});
