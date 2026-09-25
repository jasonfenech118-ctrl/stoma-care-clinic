const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const code=html.slice(html.indexOf('function dueDatedReminderItems('),html.indexOf('/* Snapshot of the current Follow-up Planning view'));
async function prompt({pending=[],dated=[],clinical=[],seen=false,pinned=false}={}){
  let opened=0;const modal={innerHTML:''};
  const ctx=vm.createContext({TODAY:'2026-09-25',sitingReminders:{items:clinical},pendingReminderTasks:{items:pending},datedClinicReminders:{items:dated},
    pendingReminderOpenCount:()=>pending.filter(t=>!t.is_completed).length,
    pendingReminderSectionHTML:(s,add)=>{assert.equal(add,false);return s.items.map(t=>t.task_text).join(',');},
    datedReminderSectionHTML:(s,add)=>{assert.equal(add,false);return s.items.map(t=>t.reminder_text).join(',');},
    document:{body:{classList:{contains:()=>pinned}},getElementById:()=>modal},
    reminderSeenToday:async()=>seen,htmlSafe:s=>s,fmtLabel:s=>s,renderSitingReminderList:()=> 'clinical',openMo:()=>opened++});
  vm.runInContext(code,ctx);await ctx.openDailyReminderModal(false);return {opened,html:modal.innerHTML};
}
test('pending to-do alone opens the daily reminder with completion controls renderer',async()=>{
  const r=await prompt({pending:[{task_text:'Call supplier',is_completed:false}]});
  assert.equal(r.opened,1);assert.match(r.html,/Call supplier/);assert.match(r.html,/Dismiss for today/);assert.doesNotMatch(r.html,/Open appointments/);
});
test('dated reminders include today and overdue, excluding future and completed',async()=>{
  const r=await prompt({dated:[{reminder_text:'Today',reminder_date:'2026-09-25'},{reminder_text:'Overdue',reminder_date:'2026-09-24'},{reminder_text:'Future',reminder_date:'2026-09-26'},{reminder_text:'Finished',reminder_date:'2026-09-24',is_completed:true}]});
  assert.equal(r.opened,1);assert.match(r.html,/Today/);assert.match(r.html,/Overdue/);assert.doesNotMatch(r.html,/Future|Finished/);
});
test('empty/completed lists, dismissed days and pinned views do not open',async()=>{
  assert.equal((await prompt()).opened,0);
  assert.equal((await prompt({pending:[{is_completed:true}]})).opened,0);
  assert.equal((await prompt({pending:[{}],seen:true})).opened,0);
  assert.equal((await prompt({pending:[{}],pinned:true})).opened,0);
});
