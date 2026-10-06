// Patients left unbooked when their due month ends carry over to the current month.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};
function ctx(today){
  const c=vm.createContext({TODAY:today,normaliseFollowupStatus:s=>s||'active',normaliseFollowupOwner:o=>o||'Common',
    followupMonthName:m=>['','January','February','March','April','May','June','July','August','September','October','November','December'][m]});
  vm.runInContext(fn('bcDuePatientsFor')+fn('bcCarriedLabel'),c);return c;
}
const P=(id,first,m,y,extra={})=>({id,first_name:first,surname:'X',followup_due_month:m,followup_year:y,followup_owner:'Jacqueline',followup_status:'active',...extra});
const pats=[P('cc','Charmaine',10,2026),P('a1','Anna',11,2026),P('old','Old',8,2026),P('booked','Booked',10,2026),P('paused','Paused',10,2026,{followup_status:'paused'}),P('lor','Other',10,2026,{followup_owner:'Lorraine'}),P('next','Next',12,2026)];
const opts={owner:'Jacqueline',earliestFuture:{booked:'2026-11-20'}};

test('once November starts, an unbooked October patient is carried into November first, in red, oldest first',()=>{
  const c=ctx('2026-11-02');const list=c.bcDuePatientsFor(pats,{...opts,year:2026,month:11});
  assert.deepEqual(list.map(p=>p.id),['old','cc','a1']);
  assert.equal(list[0]._carried,202608);assert.equal(list[1]._carried,202610);assert.equal(list[2]._carried,undefined);
  assert.equal(c.bcCarriedLabel(list[1]),'Carried over from October 2026 — not yet booked');
  assert.equal(c.bcCarriedLabel(list[0]),'Carried over from August 2026 · 3 months — not yet booked');
});

test('nothing carries before the month ends, into a future month, or for booked, paused or other nurses’ patients',()=>{
  const c=ctx('2026-10-28');
  assert.deepEqual(c.bcDuePatientsFor(pats,{...opts,year:2026,month:10}).map(p=>p.id),['old','cc']);
  assert.deepEqual(c.bcDuePatientsFor(pats,{...opts,year:2026,month:11}).map(p=>p.id),['a1']);
  const nov=ctx('2026-11-02');
  assert.deepEqual(nov.bcDuePatientsFor(pats,{...opts,year:2026,month:12}).map(p=>p.id),['next']);
  assert.deepEqual(nov.bcDuePatientsFor(pats,{...opts,year:2026,month:10}).map(p=>p.id),['cc'],'a past month still shows its own due patients');
  assert.deepEqual(nov.bcDuePatientsFor(pats,{owner:'All Patients',earliestFuture:{},year:2026,month:11}).map(p=>p.id).sort(),['a1','booked','cc','lor','old'].sort());
});
