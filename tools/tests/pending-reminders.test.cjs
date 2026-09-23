const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'sql/add-pending-reminder-tasks.sql'),'utf8');

function visibilityHelper(){
  const start=html.indexOf('function pendingTaskVisibleOnDate(');
  const end=html.indexOf('function pendingReminderOpenCount(',start);
  assert.ok(start>=0&&end>start,'pending-task visibility helper not found');
  const context=vm.createContext({String});
  vm.runInContext(html.slice(start,end),context);
  return context.pendingTaskVisibleOnDate;
}

test('unfinished tasks carry forward while completed tasks show only on completion day',()=>{
  const visible=visibilityHelper();
  assert.equal(visible({is_completed:false,completed_on:null},'2026-09-23'),true);
  assert.equal(visible({is_completed:true,completed_on:'2026-09-23'},'2026-09-23'),true);
  assert.equal(visible({is_completed:true,completed_on:'2026-09-22'},'2026-09-23'),false);
});

test('bell UI adds tasks and crosses checked tasks out without deleting them',()=>{
  const start=html.indexOf('let pendingReminderTasks=');
  const end=html.indexOf('/* Every Saturday Jason is rostered on duty',start);
  assert.ok(start>=0&&end>start,'pending reminder block not found');
  const block=html.slice(start,end);
  assert.match(block,/type="checkbox"/);
  assert.match(html,/\.pending-task-row\.done \.pending-task-text\{text-decoration:line-through/);
  assert.match(block,/completed_on:TODAY/);
  assert.match(block,/is_completed\.eq\.false,completed_on\.eq\.\$\{TODAY\}/);
  assert.doesNotMatch(block,/\.delete\s*\(/);
});

test('database migration retains completed tasks and grants no delete access',()=>{
  const statements=migration.replace(/^--.*$/gm,'');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.clinic_pending_tasks/);
  assert.match(migration,/GRANT SELECT, INSERT, UPDATE ON public\.clinic_pending_tasks TO authenticated/);
  assert.doesNotMatch(statements,/GRANT[^;]*DELETE/i);
  assert.doesNotMatch(statements,/DELETE FROM public\.clinic_pending_tasks/i);
});
