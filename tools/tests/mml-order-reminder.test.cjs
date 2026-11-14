// The Saturday stores-order reminder now delegates to the Ordering module, which
// owns the schedule and the shared sent-state. getMmlOrderReminder is a thin
// wrapper over window.ClinicOrdering.dueReminder.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

function reminderFunction(){
  const start=html.indexOf('async function getMmlOrderReminder()');
  const end=html.indexOf('/* Siting sessions whose surgery day has come',start);
  assert.ok(start>=0&&end>start,'MML reminder function not found');
  return html.slice(start,end);
}

function contextFor(ordering){
  const context=vm.createContext({TODAY:'2026-11-14',window:{ClinicOrdering:ordering}});
  vm.runInContext(reminderFunction(),context);
  return context;
}

test('the reminder passes through the Ordering module’s due item',async()=>{
  const due=await contextFor({dueReminder:async t=>[{kind:'mml-order',eff:t,weekEnding:'2026-11-14'}]}).getMmlOrderReminder();
  assert.equal(due.length,1);
  assert.equal(due[0].kind,'mml-order');
  assert.equal(due[0].eff,'2026-11-14');
});

test('a sent (or not-due) week yields no reminder',async()=>{
  const none=await contextFor({dueReminder:async()=>[]}).getMmlOrderReminder();
  assert.deepEqual(Array.from(none),[]);
});

test('a missing module or an error degrades to no reminder',async()=>{
  assert.deepEqual(Array.from(await contextFor(undefined).getMmlOrderReminder()),[]);
  const boom=await contextFor({dueReminder:async()=>{throw new Error('x');}}).getMmlOrderReminder();
  assert.deepEqual(Array.from(boom),[]);
});

test('the clinic bell and daily prompt still surface the order reminder',()=>{
  assert.match(html,/const mmlItems=await getMmlOrderReminder\(\)/);
  assert.match(html,/Send the weekly stores order/);
  assert.match(html,/nMml=todayItems\.filter\(r=>r\.kind==='mml-order'\)/);
  // The order prompt overrides the once-a-day dismissal so it keeps appearing.
  assert.match(html,/hasOrder=todayItems\.some\(r=>r\.kind==='mml-order'\)/);
});
