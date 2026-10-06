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

test('a bank OT entry spelt one letter differently folds into the core nurse column',()=>{
  const nameHelpers=html.slice(html.indexOf('function normStaffName('),html.indexOf('function isTILNote('));
  const staffList=[{id:'core-t',full_name:'Tracey Galea'},{id:'core-j',full_name:'Jason Fenech'}];
  const ctx=vm.createContext({staffList,bankTILToday:[],otToday:[{bank_staff:{id:'bank-t',full_name:'Tracy Galea'}}],appts:[],date:'2026-10-25',offIds:new Set(),rd:[],tilIn:[],coreOTToday:[{staff_id:'core-t',staff:{full_name:'Tracey Galea'}}],OFF_ST:[],defaultCode:()=> 'off'});
  vm.runInContext(nameHelpers+helpers+assembly+'\nglobalThis.columns=nurses;',ctx);
  assert.equal(ctx.columns.length,1);
  assert.equal(ctx.columns[0].name,'Tracey Galea');
  assert.equal(ctx.appointmentMatchesNurseColumn({bank_staff_id:'bank-t'},ctx.columns[0]),true);
  assert.equal(ctx.appointmentMatchesNurseColumn({assigned_to:'core-t'},ctx.columns[0]),true);
  assert.equal(ctx.findCoreStaffByName('Tracy Galea').id,'core-t');
  assert.equal(ctx.findCoreStaffByName('Tracy Borg'),null);
  assert.equal(ctx.findCoreStaffByName('Jasmine Fenech'),null);
});

test('a booking left under a cancelled, misspelt OT entry stays in the core nurse column',()=>{
  const nameHelpers=html.slice(html.indexOf('function normStaffName('),html.indexOf('function isTILNote('));
  const staffList=[{id:'core-t',full_name:'Tracey Galea'}];
  const appts=[{bank_staff_id:'bank-t',bank_staff:{full_name:'Tracy Galea'},appt_slot:'10:00',status:'booked'}];
  const ctx=vm.createContext({staffList,bankTILToday:[],otToday:[],appts,date:'2026-10-25',offIds:new Set(),rd:[],tilIn:[],coreOTToday:[{staff_id:'core-t',staff:{full_name:'Tracey Galea'}}],OFF_ST:[],defaultCode:()=> 'off'});
  vm.runInContext(nameHelpers+helpers+assembly+'\nglobalThis.columns=nurses;',ctx);
  assert.equal(ctx.columns.length,1);
  assert.equal(ctx.columns[0].type,'core-ot');
  assert.equal(ctx.appointmentsForSlotAndColumn(appts,'10:00',ctx.columns[0]).length,1);
});
