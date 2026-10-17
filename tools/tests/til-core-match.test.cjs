// A TIL In/Off typed with a slightly misspelled core-nurse name (a transposed
// letter, e.g. "Erika Pasila" for core "Erika Psaila") must be recorded against
// the core nurse (a leave_records "overtime" row), never saved as a brand-new
// bank nurse — which is what made Erika show twice on the daily attendance sheet.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};

function setup(t,name){
  const dom=new JSDOM(`<input id="til-name" value="${name}"><input id="til-date" value="2026-10-17"><input id="til-start" value="07:00"><input id="til-until" value="14:00">`,{runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window;
  const calls={staffQuery:[],bankInsert:0,leaveInsert:[],bankAssign:[]};
  w.staffList=[{id:'e',full_name:'Erika Psaila',role:'Senior Staff Nurse'}];
  w.alert=()=>{};
  w.logRoster=()=>{};w.renderRoster=()=>{};w.loadStaffAudit=()=>{};
  w.fmtShortDate=d=>d;w.bankAssignmentSaveMessage=()=>'err';
  w.saveBankStaffDayAssignment=async(id,date,opt)=>{calls.bankAssign.push({id,date,opt});return {error:null};};
  // Minimal Supabase stub: records which tables were touched.
  w.SB={from(table){
    const q={_table:table,_ins:null,
      select(){return q;},ilike(col,val){q._ilike={col,val};return q;},eq(){return q;},like(){return q;},
      insert(row){q._ins=row;if(table==='bank_staff')calls.bankInsert++;if(table==='leave_records')calls.leaveInsert.push(row);return q;},
      update(){return q;},single(){return q;},
      then(res){                              // awaited as a thenable
        if(q._ins&&table==='bank_staff')return Promise.resolve({data:{id:'bank-new'}}).then(res);
        if(q._ins&&table==='leave_records')return Promise.resolve({error:null}).then(res);
        if(table==='staff'){calls.staffQuery.push(q._ilike?.val);return Promise.resolve({data:[]}).then(res);}   // DB exact lookup finds nothing
        if(table==='bank_staff')return Promise.resolve({data:[]}).then(res);
        if(table==='leave_records')return Promise.resolve({data:[]}).then(res);
        return Promise.resolve({data:[]}).then(res);
      }};
    return q;
  }};
  w.eval(fn('normStaffName'));
  w.eval(fn('staffNamesWithinOneEdit'));
  w.eval(fn('findCoreStaffByName'));
  w.eval(fn('isTILNote'));
  w.eval(fn('addTIL'));
  return {w,calls};
}

test('a misspelled core name is recorded against the core nurse, not a new bank nurse',async t=>{
  const {w,calls}=setup(t,'Erika Pasila');
  await w.addTIL('in');
  assert.equal(calls.bankInsert,0,'no phantom bank nurse created');
  assert.equal(calls.bankAssign.length,0,'not saved as a bank assignment');
  assert.equal(calls.leaveInsert.length,1,'recorded as a core leave_records overtime row');
  assert.equal(calls.leaveInsert[0].staff_id,'e');
  assert.equal(calls.leaveInsert[0].leave_type,'overtime');
  assert.match(calls.leaveInsert[0].notes,/^TIL-In/);
});

test('a genuinely unknown name still becomes a bank nurse',async t=>{
  const {w,calls}=setup(t,'Totally Unknown');
  await w.addTIL('off');
  assert.equal(calls.bankInsert,1,'an unknown person is created as bank staff');
  assert.equal(calls.bankAssign.length,1,'and booked as a bank assignment');
  assert.equal(calls.leaveInsert.length,0,'not recorded against any core nurse');
});
