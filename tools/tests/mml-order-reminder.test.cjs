// The weekly stores order is no longer surfaced as a reminder: when it is due
// the Ordering tab opens automatically on app launch. getMmlOrderReminder is a
// no-op so the reminder pipeline (bell + daily pop-up) carries nothing for it.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

function reminderFunction(){
  const start=html.indexOf('async function getMmlOrderReminder()');
  const end=html.indexOf('async function maybeOpenWeeklyOrder()',start);
  assert.ok(start>=0&&end>start,'MML reminder function not found');
  return html.slice(start,end);
}

test('getMmlOrderReminder carries nothing (the order is not a reminder)',async()=>{
  const context=vm.createContext({});
  vm.runInContext(reminderFunction(),context);
  assert.deepEqual(Array.from(await context.getMmlOrderReminder()),[]);
});

test('the app opens the Ordering tab automatically when the order is due',()=>{
  // The launch sequence calls maybeOpenWeeklyOrder, which switches to the tab.
  assert.match(html,/maybeOpenWeeklyOrder\(\)/);
  const start=html.indexOf('async function maybeOpenWeeklyOrder()');
  const body=html.slice(start,start+400);
  assert.match(body,/ClinicOrdering\.isDue\(\)/,'checks the shared due/sent state');
  assert.match(body,/switchTab\('ordering'\)/,'opens the Ordering tab');
  // And it is wired into startApp’s normal launch branch.
  assert.match(html,/openDailyReminderModal\(false\);maybeOpenWeeklyOrder\(\)/);
});

test('the order no longer appears in the daily reminder pop-up',()=>{
  assert.doesNotMatch(html,/bits\.push\('the MML order'\)/);
  assert.doesNotMatch(html,/📦 Send the weekly stores order/);
});
