// Overtime Follow-ups tab: only non-core (OT / TIL) nurses hold a column, a
// booking onto a bank-only nurse goes on bank_staff_id while a core nurse on
// OT/TIL goes on assigned_to, and the to-book list uses the SAME rule as
// Follow-up Planning (bcDuePatientsFor): the chosen month, overdue carried into
// the current month, owner filter, and nobody already booked.
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
  ['otfIsOvertimeColumn','otfBookingRow','bcDuePatientsFor'].forEach(n=>vm.runInContext(fn(n),c));
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

// The to-book list is literally Follow-up Planning's booking worklist rule.
const OTF_PATS=[
  {id:'a',first_name:'Ann',surname:'A',followup_status:'active',followup_owner:'Jason',followup_due_month:10,followup_year:2026}, // due this month
  {id:'b',first_name:'Ben',surname:'B',followup_status:'active',followup_owner:'Jason',followup_due_month:8, followup_year:2026}, // overdue
  {id:'c',first_name:'Cy', surname:'C',followup_status:'active',followup_owner:'Common',followup_due_month:10,followup_year:2026},// Common
  {id:'d',first_name:'Di', surname:'D',followup_status:'active',followup_owner:'Jason',followup_due_month:12,followup_year:2026}, // future month
  {id:'e',first_name:'Ed', surname:'E',followup_status:'paused',followup_owner:'Jason',followup_due_month:9, followup_year:2026}, // paused
  {id:'f',first_name:'Fi', surname:'F',followup_status:'active',followup_owner:'Jason',followup_due_month:9, followup_year:2026}  // already booked
];

test('this month carries overdue in, filters by owner, and drops anyone already booked',()=>{
  const c=ctx();
  const r=c.bcDuePatientsFor(OTF_PATS,{year:2026,month:10,owner:'Jason',earliestFuture:{f:'2026-11-01'}});
  assert.deepEqual(r.map(p=>p.id),['b','a']);   // overdue (carried) first, then this month; c Common, d future, e paused, f booked all excluded
});

test('a chosen FUTURE month shows only that month (no overdue carry-over), so months differ',()=>{
  const c=ctx();
  const dec=c.bcDuePatientsFor(OTF_PATS,{year:2026,month:12,owner:'Jason',earliestFuture:{}});
  assert.deepEqual(dec.map(p=>p.id),['d']);     // only December
  const nov=c.bcDuePatientsFor(OTF_PATS,{year:2026,month:11,owner:'Jason',earliestFuture:{}});
  assert.deepEqual(nov.map(p=>p.id),[]);        // nobody due November → genuinely different from December
});

// Regression: changing the Due Month dropdown re-renders the list end to end
// (onchange → otfFilterChanged → otfRefilter → otfVisiblePatients →
// bcDuePatientsFor → renderOtFollowup), and the list visibly changes per month.
const {JSDOM}=require('jsdom');
test('changing the Due Month dropdown re-renders the to-book list to that month',()=>{
  const dom=new JSDOM(`<!DOCTYPE html><body>
    <select id="otf-year"><option value="2026">2026</option></select>
    <select id="otf-month"></select>
    <div id="otf-owners"></div><div id="otf-root"></div></body>`);
  const w=dom.window;
  const c=vm.createContext({
    window:w,document:w.document,TODAY:'2026-10-14',
    htmlSafe:v=>String(v==null?'':v),jsSafe:v=>String(v==null?'':v),
    normaliseFollowupStatus:s=>String(s||'').toLowerCase()||'active',
    normaliseFollowupOwner:v=>{const s=String(v||'Common').trim();return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();},
    FOLLOWUP_OWNER_FILTERS:['Common','Jacqueline','Jason','Lorraine','Tracey'],
    followupMonthName:m=>['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)]||'',
    bcStomaLabel:()=>'',fmtLabel:v=>String(v),firstNameOf:v=>String(v).split(' ')[0],
    pickerNurseTag:()=>'',appointmentMatchesNurseColumn:()=>false,SLOTS:['09:00','09:30'],
    OTF_OWNER_COLORS:{Common:'#475569',Jacqueline:'#7c3aed',Jason:'#2563eb',Lorraine:'#db2777',Tracey:'#0d7377'}
  });
  ['bcDuePatientsFor','otfVisiblePatients','otfOwnerColor','otfNurseColor','otfRefilter','renderOtFollowup','otfListHTML','otfGridHTML','otfFilterChanged']
    .forEach(n=>vm.runInContext(fn(n),c));
  vm.runInContext('function otfAttachDrag(){};function renderOtCalendar(){};',c);
  vm.runInContext(`var otfState={date:'2026-10-14',owner:'Jacqueline',patients:[],nurses:[],bookings:[],selId:null,focusNurseId:null,dueMonth:'12',dueYear:2026,
    rawPatients:[
      {id:'a',first_name:'Alex',surname:'Debono',followup_status:'active',followup_owner:'Jacqueline',followup_due_month:12,followup_year:2026},
      {id:'b',first_name:'Ben',surname:'Borg',followup_status:'active',followup_owner:'Jacqueline',followup_due_month:11,followup_year:2026},
      {id:'z',first_name:'Cy',surname:'Cauchi',followup_status:'active',followup_owner:'Jacqueline',followup_due_month:5,followup_year:2026}],
    earliestFuture:{}};`,c);
  w.document.getElementById('otf-month').innerHTML='<option value="">This month + overdue</option>'+[...Array(12)].map((_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  const names=()=>[...w.document.querySelectorAll('#otf-right .bc-nm')].map(e=>e.textContent.trim());
  w.document.getElementById('otf-month').value='12';vm.runInContext('otfFilterChanged()',c);
  assert.deepEqual(names(),['Alex Debono']);     // December only
  w.document.getElementById('otf-month').value='11';vm.runInContext('otfFilterChanged()',c);
  assert.deepEqual(names(),['Ben Borg']);          // November only — the list changes
  w.document.getElementById('otf-month').value='5';vm.runInContext('otfFilterChanged()',c);
  assert.deepEqual(names(),['Cy Cauchi']);         // May only
});
