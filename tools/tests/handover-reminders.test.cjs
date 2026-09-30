const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){
  const start=html.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' not found');
  const end=html.indexOf('\n}',start);
  assert.ok(end>start,name+' end not found');
  return html.slice(start,end+2);
}
function context(today='2026-09-30'){
  const c=vm.createContext({
    TODAY:today,Date,Map,Set,
    APPLIANCE_CATALOGUE:[{name:'Flange Deep',system:'two'},{name:'Lentell',system:'one'}],
    TWO_PIECE_NAMES:['Flange Deep'],
    parseNameList:v=>Array.isArray(v)?v:(v?[v]:[]),
    stomaTimeline:p=>p._stomas||[],
    stomasPresentOn:(p,date)=>(p._stomas||[]).filter(s=>!s.formed||s.formed<=date).filter(s=>!s.ended||s.ended>=date),
    handoverShouldAutoLeave:p=>!!p._gone,
    handoverStomaLine:()=>null,
    htmlSafe:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;'),
    jsSafe:v=>String(v),
    fmtShortDate:v=>v
  });
  for(const name of ['parseEpisodeApplianceRows','currentApplianceNoteRows','looseApplianceRows','applianceRowIsTwoPiece','applianceLineIsTwoPiece','stripHandoverFlangeDue'])
    vm.runInContext(source(name),c);
  const start=html.indexOf('const HANDOVER_REMINDER_COLS=');
  const end=html.indexOf('function renderSitingReminderList(',start);
  assert.ok(start>0&&end>start,'handover reminder implementation not found');
  vm.runInContext(html.slice(start,end),c);
  vm.runInContext(source('renderSitingReminderList'),c);
  return c;
}
function patient(extra={}){
  return {id:'patient-1',first_name:'Alex',surname:'Example',is_inpatient:true,
    _stomas:[{uid:'base',code:'S1',typeLabel:'Ileostomy',location:'RLQ',origin:'base'}],
    ...extra};
}
function episode(rows=[],id='patient-1'){
  return {id:'episode-1',patient_id:id,record_date:'2026-09-20',discharge_date:null,appliances:rows};
}
function appliance(uid,name,date='2026-09-29',due=''){
  return {stoma_uid:uid,appliances:name?[name]:[],accessories:[],changed_on:date,flange_due:due};
}
function kinds(c,p,episodes=[]){
  return Array.from(c.buildHandoverDueReminders([p],episodes),r=>r.kind);
}

test('handover keeps only the latest linked one-piece appliance when an old unassigned two-piece remains in history',()=>{
  const c=context(),p=patient();
  const old=appliance('unassigned','Flange Deep','2026-09-20','2026-09-30');
  const current=appliance('base','Lentell','2026-09-29');
  const rows=[old,current];
  const selected=Array.from(c.currentApplianceNoteRows(p,rows));
  assert.deepEqual(selected,[current]);
  assert.deepEqual(Array.from(c.looseApplianceRows(p,rows)),[]);
  assert.equal(c.applianceLineIsTwoPiece(selected[0].appliances.join(', ')),false);
  assert.deepEqual(kinds(c,{...p,flange_due:'2026-09-30'},[episode(rows)]),[]);
});

test('Schedule 5 begins on the sixth calendar day, persists after discharge, and clears on status change',()=>{
  const c=context();
  const base=patient({is_inpatient:false,schedule_five_permit:'in_ward',schedule_five_left_date:'2026-09-25'});
  assert.deepEqual(kinds(c,base),[]);
  const waiting={...base,schedule_five_left_date:'2026-09-24'};
  const items=Array.from(c.buildHandoverDueReminders([waiting],[]));
  assert.equal(items.length,1);
  assert.equal(items[0].days_waiting,6);
  assert.equal(items[0].kind,'schedule-five');
  for(const status of ['signed','collected','']){
    assert.deepEqual(kinds(c,{...waiting,schedule_five_permit:status}),[]);
  }
  for(const left of [null,'','2026-02-30','2026-10-01'])
    assert.deepEqual(kinds(c,{...waiting,schedule_five_left_date:left}),[]);
  assert.equal(context('2028-03-06').handoverReminderDays('2028-02-29','2028-03-06'),6);
  assert.equal(context('2026-03-30').handoverReminderDays('2026-03-24','2026-03-30'),6);
});

test('flange alerts use the editable handover date and only current two-piece stomas',()=>{
  const c=context();
  const rows=[appliance('base','Flange Deep')];
  const due=patient({flange_due:'2026-09-30'});
  const today=Array.from(c.buildHandoverDueReminders([due],[episode(rows)]));
  assert.equal(today.length,1);
  assert.equal(today[0].days_overdue,0);
  assert.match(today[0].stoma_labels[0],/S1.*Ileostomy/);
  assert.equal(Array.from(c.buildHandoverDueReminders([{...due,flange_due:'2026-09-27'}],[episode(rows)]))[0].days_overdue,3);
  for(const date of ['',null,'2026-10-01'])
    assert.deepEqual(kinds(c,{...due,flange_due:date},[episode(rows)]),[]);
  assert.deepEqual(kinds(c,{...due,is_inpatient:false},[]),[]);
  assert.deepEqual(kinds(c,{...due,_gone:true},[episode(rows)]),[]);
  assert.deepEqual(kinds(c,due,[episode([appliance('base','Flange Deep','2026-09-20'),appliance('base','Lentell')])]),[]);
  assert.deepEqual(kinds(c,due,[episode([appliance('base','Flange Deep','2026-09-20'),appliance('base','')])]),[]);
});

test('multiple stomas show their own labels; reversal and refashion remove old appliances',()=>{
  const c=context();
  const original={uid:'base',code:'S1',typeLabel:'Ileostomy',origin:'base',ended:'2026-09-30'};
  const mf={uid:'mf',code:'S2',typeLabel:'Mucus fistula',origin:'initial'};
  const refashion={uid:'new',code:'S1',typeLabel:'Colostomy',origin:'refashion'};
  const p=patient({flange_due:'2026-09-28',_stomas:[original,mf,refashion]});
  const records=[appliance('base','Flange Deep'),appliance('mf','Flange Deep'),appliance('new','Flange Deep')];
  const item=Array.from(c.buildHandoverDueReminders([p],[episode(records)]))[0];
  assert.equal(item.kind,'flange');
  assert.equal(item.stoma_labels.length,2);
  assert.match(item.stoma_labels.join(' '),/Mucus fistula/);
  assert.match(item.stoma_labels.join(' '),/Colostomy/);
  assert.doesNotMatch(item.stoma_labels.join(' '),/Ileostomy/);
  assert.deepEqual(kinds(c,patient({flange_due:'2026-09-28',_stomas:[original,refashion]}),
    [episode([appliance('base','Flange Deep'),appliance('new','Lentell')])]),[]);
});

test('bell rows include days waiting and navigate to the relevant handover controls',()=>{
  const c=context();
  const rows=Array.from(c.buildHandoverDueReminders([
    patient({schedule_five_permit:'in_ward',schedule_five_left_date:'2026-09-24',flange_due:'2026-09-30'})
  ],[episode([appliance('base','Flange Deep')])]));
  const markup=c.renderSitingReminderList(rows);
  assert.match(markup,/waiting 6 days/);
  assert.match(markup,/Open permit/);
  assert.match(markup,/Open handover/);
  assert.match(markup,/Ileostomy/);
  assert.match(markup,/Due today/);
});

test('a current episode pulls back a patient whose inpatient flag drifted off',async()=>{
  const c=context();
  const p=patient({is_inpatient:false,flange_due:'2026-09-30'});
  const queries=[];
  c.SB={from(table){
    const q={table,select(cols){this.cols=cols;return this;},eq(key,value){this[key]=value;return this;},
      in(key,value){this[key]=value;return this;},or(value){this.filter=value;return this;}};
    return q;
  }};
  c.fetchAllRows=async builder=>{
    const q=builder();queries.push(q);
    if(q.table==='clinical_records')return {rows:[episode([appliance('base','Flange Deep')])],error:null};
    return {rows:q.id?.includes('patient-1')?[p]:[],error:null};
  };
  const result=await c.getHandoverDueReminders();
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].kind,'flange');
  assert.ok(queries.some(q=>q.filter?.includes('schedule_five_permit.eq.in_ward')));
  assert.ok(queries.some(q=>q.id?.includes('patient-1')));
});

test('bell combines ward alerts even when siting reminders fail',async()=>{
  const c=context();
  const start=html.indexOf('async function refreshReminders(){');
  const end=html.indexOf('async function refreshRemindersOLD()',start);
  assert.ok(start>0&&end>start);
  c.getSitingReminders=async()=>({items:[],total:0,today:0});
  c.getHandoverDueReminders=async()=>({items:[{kind:'flange',eff:'2026-09-30'}],error:''});
  c.getPendingReminderTasks=async()=>({items:[]});
  c.getDatedClinicReminders=async()=>({items:[]});
  c.updateReminderBadges=()=>{};
  c.clinicReminderBadgeTotal=()=>1;
  c.pendingReminderOpenCount=()=>0;
  c.renderClinicReminderPanelHTML=()=>'<div>bell</div>';
  c.renderDailyReminderTasksHTML=()=>'<div>daily</div>';
  c.document={getElementById:()=>null};
  vm.runInContext('let sitingReminders={};let pendingReminderTasks={};let datedClinicReminders={};',c);
  vm.runInContext(html.slice(start,end),c);
  const result=await c.refreshReminders();
  assert.equal(result.total,1);
  assert.equal(result.items[0].kind,'flange');
});
