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

function contextFor(date,working){
  let staffingLoads=0;
  const context=vm.createContext({
    TODAY:date,
    Date,Number,
    ownerStaffForCapacity:()=>({id:'jason-id',full_name:'Jason Fenech'}),
    findCoreStaffByName:()=>null,
    loadClinicStaffingIndex:async()=>{staffingLoads++;return{};},
    isNurseWorkingClinicDay:()=>working
  });
  vm.runInContext(reminderFunction(),context);
  return {context,staffingLoads:()=>staffingLoads};
}

test('MML order appears only on a Saturday when Jason is rostered working',async()=>{
  const saturdayOn=contextFor('2026-09-26',true);
  const onItems=await saturdayOn.context.getMmlOrderReminder();
  assert.equal(onItems.length,1);
  assert.equal(onItems[0].kind,'mml-order');
  assert.equal(onItems[0].eff,'2026-09-26');

  const saturdayOff=contextFor('2026-09-26',false);
  assert.deepEqual(Array.from(await saturdayOff.context.getMmlOrderReminder()),[]);

  const friday=contextFor('2026-09-25',true);
  assert.deepEqual(Array.from(await friday.context.getMmlOrderReminder()),[]);
  assert.equal(friday.staffingLoads(),0,'non-Saturdays must not query or display Jason’s roster reminder');
});

test('the clinic bell and daily prompt include the MML order reminder',()=>{
  assert.match(html,/items\.push\(\.\.\.await getMmlOrderReminder\(\)\)|const mmlItems=await getMmlOrderReminder\(\)/);
  assert.match(html,/Send MML order/);
  assert.match(html,/nMml=todayItems\.filter\(r=>r\.kind==='mml-order'\)/);
  assert.match(html,/Clinic Reminders/);
});
