const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const helpers=html.slice(html.indexOf('function calendarNurseBankIds('),html.indexOf('function visiblePatientContactHTML('));
const assembly=html.slice(html.indexOf('  const nurses=[];',html.indexOf('async function loadAppts(')),html.indexOf('  // The Common (general) column',html.indexOf('async function loadAppts(')));
function calendar({staffList=[],bankTILToday=[],otToday=[],appts=[]}={}){
  const ctx=vm.createContext({staffList,bankTILToday,otToday,appts,date:'2026-10-04',offIds:new Set(),rd:[],tilIn:[],coreOTToday:[],OFF_ST:[],defaultCode:()=> 'working',findCoreStaffByName:name=>staffList.find(s=>s.full_name===name)});
  vm.runInContext(helpers+assembly+'\nglobalThis.columns=nurses;',ctx);
  return ctx;
}

test('bank TIL appointment appears in its roster column and occupies the slot',()=>{
  const appointment={id:'appointment',bank_staff_id:'bank-1',assigned_to:null,appt_slot:'09:00:00',status:'booked'};
  const ctx=calendar({bankTILToday:[{notes:'TIL-In: test',bank_staff:{id:'bank-1',full_name:'Test Nurse'}}],appts:[appointment]});
  assert.equal(ctx.columns.length,1);
  assert.equal(ctx.columns[0].type,'til');
  assert.equal(ctx.appointmentsForSlotAndColumn([appointment],'09:00',ctx.columns[0]).length,1);
  assert.equal(ctx.appointmentsForSlotAndColumn([appointment],'09:30',ctx.columns[0]).length,0);
});

test('core column retains bank IDs from both TIL and OT without duplicate columns',()=>{
  const appts=[{bank_staff_id:'bank-1',status:'booked'},{bank_staff_id:'bank-2',status:'booked'},{assigned_to:'core-1',status:'booked'}];
  const ctx=calendar({staffList:[{id:'core-1',full_name:'Test Nurse'}],bankTILToday:[{notes:'TIL-In: test',bank_staff:{id:'bank-1',full_name:'Test Nurse'}}],otToday:[{bank_staff:{id:'bank-2',full_name:'Test Nurse'}}],appts});
  assert.equal(ctx.columns.length,1);
  for(const a of appts)assert.equal(ctx.appointmentMatchesNurseColumn(a,ctx.columns[0]),true);
  assert.equal(ctx.appointmentMatchesNurseColumn({bank_staff_id:'other'},ctx.columns[0]),false);
});

test('unrostered bank bookings get a visible fallback column; Common stays separate',()=>{
  const ctx=calendar({appts:[{bank_staff_id:'unrostered',status:'booked'}]});
  assert.equal(ctx.columns.length,1);
  assert.equal(ctx.columns[0].type,'ot-booked');
  assert.equal(ctx.appointmentMatchesNurseColumn({bank_staff_id:'unrostered'},ctx.columns[0]),true);
  assert.equal(ctx.appointmentMatchesNurseColumn({},ctx.columns[0]),false);
  assert.equal(ctx.appointmentMatchesNurseColumn({},{type:'common',id:'common'}),true);
  assert.equal(ctx.appointmentMatchesNurseColumn({bank_staff_id:'unrostered'},{type:'common',id:'common'}),false);
});
