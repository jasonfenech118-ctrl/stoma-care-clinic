const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'../..');
function setup(id='other'){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{runScripts:'outside-only'});
  let user={id,email:'nurse@example.test',user_metadata:{}},updates=[],queries=0;
  const w=dom.window;
  w.SB={auth:{getUser:async()=>({data:{user}}),updateUser:async changes=>{updates.push(changes);return {data:{user}};}},from:()=>{queries++;return {select(){return this;},order(){return this;},range:async()=>({data:[{email:'<script>bad()</script>',logged_in_at:'2026-10-18T03:00:00Z'}]})};}};
  w.eval(fs.readFileSync(path.join(root,'assets/account.js'),'utf8'));
  return {w,dom,updates,queries:()=>queries,setUser:u=>user=u,$:id=>w.document.getElementById(id)};
}
test('only fixed Jason ID sees or queries login audit, regardless of name/email',async()=>{
  const s=setup();await s.w.ClinicAccount.sync();assert.equal(s.$('login-audit-button').hidden,true);
  await s.w.ClinicAccount.audit();assert.equal(s.queries(),0);
  s.setUser({id:'another-id',email:'jason.fenech@gov.mt',user_metadata:{full_name:'Jason Fenech'}});
  await s.w.ClinicAccount.sync();assert.equal(s.$('login-audit-button').hidden,true);s.dom.window.close();
});
test('Jason audit safely renders text and clears on sign out',async()=>{
  const s=setup('dd084e24-e851-4243-883d-f6404299585c');await s.w.ClinicAccount.sync();
  assert.equal(s.$('login-audit-button').hidden,false);await s.w.ClinicAccount.audit();
  assert.equal(s.$('login-audit-rows').querySelector('script'),null);
  assert.match(s.$('login-audit-rows').textContent,/05:00:00/);
  s.w.ClinicAccount.clear();assert.equal(s.$('login-audit-rows').textContent,'');assert.equal(s.$('login-audit-button').hidden,true);s.dom.window.close();
});
test('profile rejects mismatches and uses updateUser for own password; clears secrets',async()=>{
  const s=setup();await s.w.ClinicAccount.sync();
  s.$('profile-password').value='new-password';s.$('profile-confirm').value='different';
  await s.w.ClinicAccount.save({preventDefault(){}});assert.equal(s.updates.length,0);
  s.$('profile-confirm').value='new-password';await s.w.ClinicAccount.save({preventDefault(){}});
  assert.equal(s.updates[0].password,'new-password');assert.equal(s.$('profile-password').value,'');
  await s.w.ClinicAccount.save({preventDefault(){}});assert.equal('password' in s.updates[1],false);s.dom.window.close();
});
test('server trigger records each session once, RLS rejects other nurses and audit tampering',async()=>{
  const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema cron;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
      create table auth.users(id uuid primary key,email text);
      create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now());`);
    const sql=fs.readFileSync(path.join(root,'sql/add-login-audit.sql'),'utf8');
    await db.exec(sql);await db.exec(sql);
    await db.exec(`insert into auth.users values('11111111-1111-4111-8111-111111111111','nurse@example.test');
      insert into auth.sessions(id,user_id) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
      update auth.sessions set created_at=now();
      select set_config('test.uid','33333333-3333-4333-8333-333333333333',false);set role authenticated;`);
    assert.equal((await db.query('select * from public.clinic_login_audit')).rows.length,0);
    await assert.rejects(db.exec('delete from public.clinic_login_audit'),/permission denied/);
    await assert.rejects(db.exec("insert into public.clinic_login_audit default values"),/permission denied/);
    await db.exec("select set_config('test.uid','dd084e24-e851-4243-883d-f6404299585c',false)");
    assert.equal((await db.query('select * from public.clinic_login_audit')).rows.length,1);
    await assert.rejects(db.exec('update public.clinic_login_audit set email=\'forged\''),/permission denied/);
    await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.clinic_login_audit'),/permission denied/);
  }finally{await db.close();}
});
