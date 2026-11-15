// A patient marked deceased / reversed / discharged to Gozo / relocated overseas
// is out of active follow-up, so the appointment Seen / DNTU / Edit / Delete
// actions are hidden until they are reverted to active.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

function slice(from,to){const i=html.indexOf(from);const j=html.indexOf(to,i);assert.ok(i>=0&&j>i,from);return html.slice(i,j);}

test('isTerminalFollowupStatus flags the four closed/relocated statuses only',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(
    slice('const FOLLOWUP_STATUSES=','function normaliseFollowupStatus')+
    slice('function normaliseFollowupStatus','function isClosedFollowupStatus')+
    slice('function isTerminalFollowupStatus','// Paused, relocated'),ctx);
  for(const s of ['deceased','reversed','relocated_overseas','discharged_gozo'])
    assert.equal(ctx.isTerminalFollowupStatus(s),true,s+' is terminal');
  for(const s of ['active','paused','awaiting_feedback','',null,undefined])
    assert.equal(ctx.isTerminalFollowupStatus(s),false,String(s)+' is not terminal');
  assert.equal(ctx.isTerminalFollowupStatus('Deceased'),true,'case/alias normalised');
});

test('the day list hides the action buttons for a terminal-status patient',()=>{
  const block=slice('body.innerHTML=appts.map(a=>{','function activeBankAssignmentForDay(');
  assert.match(block,/const terminal=isTerminalFollowupStatus\(a\.patients\?\.followup_status\)/);
  // Seen / DNTU / Edit / Delete are inside a `${terminal?'':`…`}` group.
  assert.match(block,/\$\{terminal\?''[\s\S]*?did_not_attend[\s\S]*?editAppointment[\s\S]*?delApp/);
});

test('the clinic grid card hides Seen/DNTU/Edit/Delete but keeps the read-only notes button',()=>{
  const block=slice('const terminalPt=isTerminalFollowupStatus(appt.patients','else if(vacationBlocked){');
  assert.match(block,/\$\{terminalPt\?''[\s\S]*?setAS/,'Seen/DNTU gated on !terminal');
  assert.match(block,/openApptNotes\(/,'the notes button stays visible');
  assert.match(block,/\$\{terminalPt\?''[\s\S]*?editAppointment[\s\S]*?delApp/,'Edit/Delete gated on !terminal');
});
