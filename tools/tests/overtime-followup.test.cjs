// Overtime Follow-ups tab: only non-core (OT / TIL) nurses hold a column, a
// booking onto a bank-only nurse goes on bank_staff_id while a core nurse on
// OT/TIL goes on assigned_to, and the worklist is the due-now / overdue
// follow-ups for the chosen owner with no future booking.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};

function ctx(){
  const c=vm.createContext({
    TODAY:'2026-10-14',
    normaliseFollowupStatus:s=>String(s||'').toLowerCase()||'active',
    normaliseFollowupOwner:v=>{const s=String(v||'Common').trim();return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();}
  });
  ['otfIsOvertimeColumn','otfBookingRow','otfDuePatients'].forEach(n=>vm.runInContext(fn(n),c));
  return c;
}

test('only overtime / TIL nurses hold a column — a plain rostered or Common column does not',()=>{
  const c=ctx();
  assert.equal(c.otfIsOvertimeColumn({type:'core-ot'}),true);
  assert.equal(c.otfIsOvertimeColumn({type:'ot'}),true);
  assert.equal(c.otfIsOvertimeColumn({type:'til'}),true);
  assert.equal(c.otfIsOvertimeColumn({type:'core'}),false);
  assert.equal(c.otfIsOvertimeColumn({type:'common'}),false);
  assert.equal(c.otfIsOvertimeColumn(null),false);
});

test('a bank-only OT nurse is booked on bank_staff_id; a core nurse on OT/TIL on assigned_to',()=>{
  const c=ctx();
  const bank=c.otfBookingRow({id:'b1',type:'ot'},'2026-10-14','09:00','p1');
  assert.equal(bank.bank_staff_id,'b1');assert.equal(bank.assigned_to,null);
  assert.equal(bank.appt_slot,'09:00');assert.equal(bank.status,'booked');assert.equal(bank.patient_id,'p1');
  const bankTil=c.otfBookingRow({id:'b2',type:'til',assignmentSource:'bank'},'2026-10-14','09:30','p2');
  assert.equal(bankTil.bank_staff_id,'b2');assert.equal(bankTil.assigned_to,null);
  const coreOt=c.otfBookingRow({id:'c1',type:'core-ot'},'2026-10-14','10:00','p3');
  assert.equal(coreOt.assigned_to,'c1');assert.equal(coreOt.bank_staff_id,null);
  const coreTil=c.otfBookingRow({id:'c2',type:'til'},'2026-10-14','10:30','p4');
  assert.equal(coreTil.assigned_to,'c2');assert.equal(coreTil.bank_staff_id,null);
});

test('the worklist is this owner’s active, due-now / overdue patients with no future booking',()=>{
  const c=ctx();
  const pats=[
    {id:'a',first_name:'Ann',surname:'A',followup_status:'active',followup_owner:'Jason',followup_due_month:10,followup_year:2026}, // due this month, Jason
    {id:'b',first_name:'Ben',surname:'B',followup_status:'active',followup_owner:'Jason',followup_due_month:8,followup_year:2026},  // overdue, Jason
    {id:'c',first_name:'Cy', surname:'C',followup_status:'active',followup_owner:'Common',followup_due_month:10,followup_year:2026},// Common
    {id:'d',first_name:'Di', surname:'D',followup_status:'active',followup_owner:'Jason',followup_due_month:12,followup_year:2026}, // future month → excluded
    {id:'e',first_name:'Ed', surname:'E',followup_status:'paused',followup_owner:'Jason',followup_due_month:9, followup_year:2026}, // paused → excluded
    {id:'f',first_name:'Fi', surname:'F',followup_status:'active',followup_owner:'Jason',followup_due_month:9, followup_year:2026}  // has a future booking → excluded
  ];
  const jason=c.otfDuePatients(pats,{owner:'Jason',futureIds:new Set(['f'])});
  assert.deepEqual(jason.map(p=>p.id),['b','a']);               // overdue first, then this month
  const all=c.otfDuePatients(pats,{owner:'All Patients',futureIds:new Set(['f'])});
  assert.deepEqual(all.map(p=>p.id).sort(),['a','b','c']);      // every owner, same exclusions
});
