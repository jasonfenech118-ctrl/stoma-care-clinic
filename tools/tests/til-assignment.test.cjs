const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'sql/fix-bank-staff-assignment-constraint.sql'),'utf8');

test('a cancelled bank assignment is never selected for overwrite',()=>{
  const start=html.indexOf('function activeBankAssignmentForDay(');
  const end=html.indexOf('async function saveBankStaffDayAssignment(',start);
  assert.ok(start>=0&&end>start,'active-assignment helper not found');
  const context=vm.createContext({String});
  vm.runInContext(html.slice(start,end),context);

  const active={id:'active',status:'active'};
  const cancelled={id:'cancelled',status:'cancelled'};
  assert.equal(context.activeBankAssignmentForDay([cancelled,active]).id,'active');
  assert.equal(context.activeBankAssignmentForDay([cancelled]),null);
  assert.equal(context.activeBankAssignmentForDay([{id:'legacy',status:null}]).id,'legacy');
});

test('OT and TIL use the same safe same-day save path',()=>{
  const block=html.slice(html.indexOf('function activeBankAssignmentForDay('),html.indexOf('// SHIFT MODAL'));
  assert.match(block,/saveBankStaffDayAssignment\(bankId,date,\{shift_start:start,shift_end:end,notes:null\}\)/);
  assert.match(block,/saveBankStaffDayAssignment\(staffId,date,\{notes:tilNote,shift_start:start,shift_end:until\}\)/);
  assert.match(block,/bankAssignmentSaveMessage/);
});

test('database rule permits one active row while retaining cancelled history',()=>{
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS bank_staff_assignments_active_uniq/);
  assert.match(migration,/WHERE status IS DISTINCT FROM 'cancelled'/);
  assert.doesNotMatch(migration,/DELETE FROM public\.bank_staff_assignments/i);
});
