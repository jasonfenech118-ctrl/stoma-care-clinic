// Cancelling a siting session records WHY — due to the patient, or a hospital
// complication — and still cancels (warning) if the SQL migration is not yet run.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
// The whole siting-cancellation block (reasons, tolerant update, open + save).
const block=html.slice(html.indexOf('const SITING_CANCEL_REASONS='),html.indexOf('\n}',html.indexOf('async function saveSitingCancellation('))+2);

function win(extra={}){
  const dom=new JSDOM('<div id="mb"></div>',{runScripts:'outside-only'});
  const w=dom.window;
  Object.assign(w,{htmlSafe:esc,openMo(){w.__open=true;},closeModal(){w.__closed=true;},
    attDisplayName:()=>'Jason Fenech',getCurrentUserForAudit:async()=>({email:'x'}),
    refreshReminders(){w.__reminders=true;},refreshSitingViews(){w.__refreshed=true;},alert:m=>{w.__alert=m;},
    sitingLocalPatches:{},...extra});
  w.eval((fn('missingColumnFromError')+'\n'+block+'\n'+fn('sitingStatusLabel'))
    .replace('const SITING_CANCEL_REASONS=','var SITING_CANCEL_REASONS=')
    .replace('let siteCancelState=null','var siteCancelState=null'));
  return w;
}
// A Supabase stub whose update() rejects while any still-missing column is in the
// body (naming it the Postgres way), and records the last body it was given.
function sb(missing=[]){
  const calls=[];
  return {calls,SB:{from:()=>({update(body){calls.push({...body});return {eq:async()=>{
    for(const col of missing)if(col in body)return {error:{message:`column "${col}" of relation "siting_sessions" does not exist`}};
    return {error:null};
  }};}})}};
}

test('a cancelled siting session is labelled with its reason', ()=>{
  const w=win();
  assert.equal(w.sitingStatusLabel({status:'cancelled',cancellation_reason:'patient'}),'Cancelled — due to patient');
  assert.equal(w.sitingStatusLabel({status:'cancelled',cancellation_reason:'hospital'}),'Cancelled — hospital complication');
  assert.equal(w.sitingStatusLabel({status:'cancelled'}),'Cancelled');          // older record, no reason
  assert.equal(w.sitingStatusLabel({status:'booked'}),'Booked');                 // unchanged for live sessions
});

test('the cancel dialog offers both reasons — patient and hospital', ()=>{
  const w=win();
  w.cancelSitingSession('s1','Mary Borg');
  assert.equal(w.__open,true);
  const vals=[...w.document.querySelectorAll('input[name="siting-cancel-reason"]')].map(i=>i.value);
  assert.deepEqual(vals,['patient','hospital']);
  assert.match(w.document.getElementById('mb').textContent,/Mary Borg/);
});

test('a reason must be chosen before the session cancels', async ()=>{
  const {SB,calls}=sb();const w=win({SB});
  w.cancelSitingSession('s1','Mary Borg');
  await w.saveSitingCancellation();                 // nothing selected
  assert.equal(calls.length,0);                     // no write attempted
  assert.equal(w.document.getElementById('siting-cancel-error').hidden,false);
});

test('choosing a reason saves the cancellation with that reason', async ()=>{
  const {SB,calls}=sb();const w=win({SB});
  w.cancelSitingSession('s1','Mary Borg');
  w.document.querySelector('input[value="hospital"]').checked=true;
  w.document.getElementById('siting-cancel-note').value='Theatre list pulled.';
  await w.saveSitingCancellation();
  assert.equal(calls.length,1);
  assert.equal(calls[0].status,'cancelled');
  assert.equal(calls[0].cancellation_reason,'hospital');
  assert.equal(calls[0].cancellation_note,'Theatre list pulled.');
  assert.equal(calls[0].cancelled_by,'Jason Fenech');
  assert.equal(w.__closed,true);assert.equal(w.__refreshed,true);
  assert.deepEqual(plain(w.sitingLocalPatches.s1),{status:'cancelled',cancellation_reason:'hospital',cancellation_note:'Theatre list pulled.'});
  assert.equal(w.__alert,undefined);                // the reason saved, so no warning
});

test('without the migration the session still cancels, the reason is dropped, and the nurse is told', async ()=>{
  const {SB,calls}=sb(['cancellation_reason','cancellation_note','cancelled_by','cancelled_at']);const w=win({SB});
  w.cancelSitingSession('s1','Mary Borg');
  w.document.querySelector('input[value="patient"]').checked=true;
  await w.saveSitingCancellation();
  // It kept retrying, shedding each missing column, until the bare status update took.
  assert.equal(calls.at(-1).status,'cancelled');
  assert.equal('cancellation_reason' in calls.at(-1),false);
  assert.deepEqual(plain(w.sitingLocalPatches.s1),{status:'cancelled'});
  assert.match(w.__alert,/add-siting-cancellation\.sql/);
});

test('updateSitingTolerant drops only the missing columns and reports them', async ()=>{
  const {SB,calls}=sb(['cancellation_note']);const w=win({SB});
  const res=await w.updateSitingTolerant('s1',{status:'cancelled',cancellation_reason:'patient',cancellation_note:'x',cancelled_by:'N'});
  assert.equal(res.error,null);
  assert.deepEqual(plain(res.dropped),['cancellation_note']);   // note gone, reason kept
  assert.equal(calls.at(-1).cancellation_reason,'patient');
  assert.equal('cancellation_note' in calls.at(-1),false);
});

 test('operation date cancellation defaults to yes and can be kept explicitly', async()=>{
  for(const cancel of [true,false]){
    const {SB,calls}=sb();const w=win({SB});
    w.cancelSitingSession('s1','Mary Borg');
    w.document.querySelector('input[value="patient"]').checked=true;
    if(!cancel)w.document.querySelector('input[name="siting-cancel-operation"][value="no"]').checked=true;
    await w.saveSitingCancellation();
    assert.equal('surgery_date' in calls[0],cancel);
    if(cancel)assert.equal(calls[0].surgery_date,null);
    assert.equal(w.__reminders,true);
    assert.equal('first_name' in calls[0],false);
  }
 });
