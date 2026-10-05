const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){
  const match=html.match(new RegExp('(?:async )?function '+name+'\\('));
  assert.ok(match,name+' not found');
  const firstEnd=html.indexOf('\n',match.index);
  if(html.slice(match.index,firstEnd).trim().endsWith('}'))return html.slice(match.index,firstEnd);
  return html.slice(match.index,html.indexOf('\n}',match.index)+2);
}
const copy=value=>JSON.parse(JSON.stringify(value));
function database(patients){
  const db={patients:copy(patients),siting_sessions:[],clinical_records:patients.map(p=>({id:'ep-'+p.id,patient_id:p.id,
    kind:'episode',is_current:true,discharge_date:null})),writes:[]};
  db.client={from(table){
    const filters=[];let cols='*',patch=null;
    const q={select(value){cols=value;return q;},update(value){patch=value;return q;},
      eq(key,value){filters.push(row=>row[key]===value);return q;},
      in(key,values){filters.push(row=>values.includes(row[key]));return q;},
      lte(key,value){filters.push(row=>row[key]!=null&&row[key]<=value);return q;},
      then(resolve,reject){return Promise.resolve().then(()=>{
        const matches=db[table].filter(row=>filters.every(f=>f(row)));
        if(patch){db.writes.push({table,patch:copy(patch),ids:matches.map(row=>row.id)});matches.forEach(row=>Object.assign(row,copy(patch)));}
        const rows=matches.map(row=>cols==='*'?row:Object.fromEntries(cols.split(',').map(key=>[key,row[key]])));
        return {data:copy(rows),error:null};
      }).then(resolve,reject);}
    };
    return q;
  }};
  return db;
}
function context(db=database([])){
  const dom=new JSDOM('<body><div id="hv-body"></div></body>');
  const c=vm.createContext({document:dom.window.document,TODAY:'2026-10-05',Date,Set,Map,console,SB:db.client,
    FOLLOWUP_STATUSES:['active','awaiting_feedback','paused','relocated_overseas','discharged_gozo','reversed','deceased'],
    FOLLOWUP_STATUS_ALIASES:{reversal:'reversed'},NO_REVERSAL_PLAN_STATUSES:['reversed','deceased','relocated_overseas','discharged_gozo'],
    initialStomaCode:s=>s,fmtShortDate:s=>s,fmtLabel:s=>s,htmlSafe:s=>String(s??''),
    handoverByWard:()=>0,normaliseIdCard:s=>s,isEncounterUser:()=>false,
    attachHandoverApplianceLines:async()=>{},fetchPatientsSelect:build=>build('*'),
    handoverAwaitingRowHTML:p=>`<tr><td>SITING ${p.surname}</td></tr>`,handoverReversalRowHTML:p=>`<tr><td>REVERSAL ${p.surname}</td></tr>`,
    handoverSurgeryRowHTML:p=>`<tr><td>SURGERY ${p.surname}</td></tr>`,
    handoverRowHTML:p=>`<tr><td>INPATIENT ${p.surname}</td></tr>`,
    emptyStateHTML:()=>'<p>Nobody is on the ward right now</p>',fitAllWardBed(){},handoverIsPhone:()=>false,applyHandoverLocks(){},
    loadPatientDirectory(){},loadNewPatients(){}});
  vm.runInContext('let handoverLoadVersion=0;let handoverWasPhone=false;',c);
  for(const name of ['normaliseFollowupStatus','rawExtraStatuses','patientIsDeceased','parseExtraStatuses','canPlanReversal',
    'parseInitialStomas','parseRefashionings','parseStomas','stomaOperationHistory','patientStomaList',
    'stomaEvents','stomaEndDates','hasStomaNow','everReversedDates','handoverReversedGone','handoverDeceased',
    'handoverShouldAutoLeave','missingColumnFromError','loadHandover','attachPatientProfilesByIdCard','handoverAwaitingSitings',
    'handoverAwaitingSurgery','handoverAwaitingReversals','afterStomaSaved'])
    vm.runInContext(source(name),c);
  return {c,db,body:dom.window.document.getElementById('hv-body')};
}
function patient(extra={}){
  return {id:'p1',surname:'Example',stoma_type:'End colostomy',surgery_date:'2026-01-01',followup_status:'active',
    is_inpatient:true,upcoming_surgery_date:'2026-10-05',initial_stomas:[],extra_stomas:[],extra_refashionings:[],stoma_operation_history:[],...extra};
}
function closedUnknown(extra={}){
  return patient({followup_status:'reversed',stoma_operation_history:[{id:'closure',kind:'reversal',date:null,date_unknown:true,
    affected:[{uid:'base',state:'reversed'}]}],...extra});
}

test('completed closure leaves handover on the closure day and is not reintroduced by a planned surgery',async()=>{
  const {c,db,body}=context(database([patient({reversal_date:'2026-10-05',followup_status:'reversed'})]));
  await c.loadHandover();
  assert.doesNotMatch(body.textContent,/Example/);assert.equal(db.patients[0].is_inpatient,false);
  assert.equal(db.clinical_records[0].is_current,false);assert.equal(db.clinical_records[0].discharge_date,null);
  assert.equal(db.patients[0].reversal_date,'2026-10-05');assert.equal(db.patients[0].upcoming_surgery_date,'2026-10-05');
  await c.loadHandover();assert.doesNotMatch(body.textContent,/Example/);
});

test('an unknown-date closure and a legacy status-only reversal leave handover',async()=>{
  for(const p of [closedUnknown(),patient({stoma_type:null,surgery_date:null,followup_status:'reversal'})]){
    const {c,db,body}=context(database([p]));await c.loadHandover();
    assert.doesNotMatch(body.textContent,/Example/);assert.equal(db.patients[0].is_inpatient,false);
    assert.equal(db.clinical_records[0].is_current,false);
  }
});

test('cleanup closes a stale open episode even when the inpatient flag is already false',async()=>{
  const {c,db,body}=context(database([closedUnknown({is_inpatient:false})]));
  await c.loadHandover();assert.doesNotMatch(body.textContent,/Example/);
  assert.equal(db.patients[0].is_inpatient,false);assert.equal(db.clinical_records[0].is_current,false);
  assert.ok(!db.writes.some(w=>w.table==='patients'&&w.patch.is_inpatient===true));
});

test('a partial reversal keeps a different stoma present, including one from the same first operation',async()=>{
  const records=[patient({reversal_date:'2026-10-05',initial_stomas:[{uid:'second',type:'End ileostomy'}]}),
    patient({extra_stomas:[{uid:'later',type:'Loop ileostomy',formed_date:'2026-09-01',reversal_date:'2026-10-05'}]}),
    closedUnknown({followup_status:'active',initial_stomas:[{uid:'second',type:'End ileostomy'}]})];
  for(const p of records){
    const {c,db,body}=context(database([p]));assert.equal(c.handoverReversedGone(p),false);await c.loadHandover();
    assert.match(body.textContent,/INPATIENT Example/);assert.equal(db.patients[0].is_inpatient,true);
    assert.equal(db.clinical_records[0].is_current,true);assert.equal(db.writes.length,0);
  }
});

test('a new or refashioned current stoma survives a stale reversed status',async()=>{
  for(const extra of [
    {reversal_date:'2026-09-01',extra_stomas:[{uid:'new',type:'End ileostomy',formed_date:'2026-10-01'}]},
    {extra_refashionings:[{uid:'ref',target_uid:'base',type:'End colostomy',formed_date:'2026-10-01'}]}
  ]){
    const p=patient({...extra,followup_status:'reversed',is_inpatient:false}),{c,db,body}=context(database([p]));
    await c.loadHandover();assert.match(body.textContent,/INPATIENT Example/);
    assert.equal(db.patients[0].is_inpatient,true);assert.equal(db.clinical_records[0].is_current,true);
  }
});

test('a future closure does not remove the patient early',()=>{
  const {c}=context();assert.equal(c.handoverReversedGone(patient({reversal_date:'2026-10-06',followup_status:'reversed'})),false);
  assert.equal(c.handoverReversedGone(patient({stoma_type:null,surgery_date:null,reversal_date:'2026-10-06',followup_status:'reversed'})),false);
});

test('all planned-surgery queries read current stomas and exclude closed patients without losing an active second stoma',async()=>{
  const rows=[
    patient({id:'closed',reversal_date:'2026-10-05',followup_status:'reversed'}),
    closedUnknown({id:'unknown',followup_status:'active'}),
    patient({id:'partial',reversal_date:'2026-10-05',initial_stomas:[{uid:'second',type:'End ileostomy'}]}),
    patient({id:'new',reversal_date:'2026-09-01',followup_status:'reversed',extra_stomas:[{uid:'new',type:'End ileostomy',formed_date:'2026-10-01'}]}),
    patient({id:'dead',deceased_date:'2026-10-05'}),
    patient({id:'future',upcoming_surgery_date:'2026-10-06'})
  ];
  const {c}=context(database(rows));
  assert.deepEqual(Array.from(await c.handoverAwaitingSurgery([]),p=>p.id),['partial','new']);
  assert.deepEqual(Array.from(await c.handoverAwaitingSurgery(['partial']),p=>p.id),['new']);
});

test('a stale reversal plan with a confirmed unknown-date closure stays off the awaiting-reversal list',async()=>{
  const {c}=context(database([closedUnknown({followup_status:'active',proposed_reversal_date:'2026-10-05'})]));
  assert.equal((await c.handoverAwaitingReversals([])).length,0);
});

test('deceased patients never reappear from siting or a planned reversal, irrespective of where death is recorded',async()=>{
  for(const marker of [
    {deceased_date:'2026-10-04'},
    {followup_status:'deceased'},
    {extra_statuses:['deceased']},
    {extra_statuses:'["deceased"]'},
    {followup_status:'reversed',reversal_date:'2026-10-01',extra_statuses:['deceased']}
  ]){
    const p=patient({id_card:'0000001M',proposed_reversal_date:'2026-10-10',...marker}),db=database([p]);
    db.siting_sessions=[{id:'siting-1',id_card:p.id_card,surname:p.surname,status:'booked',surgery_date:'2026-10-05',surgery_performed:false}];
    const {c,body}=context(db);assert.equal(c.handoverDeceased(p),true);await c.loadHandover();
    assert.doesNotMatch(body.textContent,/Example/);assert.equal(db.clinical_records[0].is_current,false);
    c.TODAY='2026-10-10';await c.loadHandover();assert.doesNotMatch(body.textContent,/Example/);
    assert.equal((await c.handoverAwaitingSitings()).length,0);
    assert.equal((await c.handoverAwaitingSurgery([])).length,0);
    assert.equal((await c.handoverAwaitingReversals([])).length,0);
    assert.equal(db.patients[0].proposed_reversal_date,'2026-10-10');
    assert.deepEqual(db.patients[0].extra_statuses,p.extra_statuses);
  }
});

test('an early completed reversal stays hidden before, on and after the stipulated surgery date',async()=>{
  for(const p of [patient({id_card:'0000001M',reversal_date:'2026-10-02',proposed_reversal_date:'2026-10-07'}),
    closedUnknown({id_card:'0000001M',followup_status:'active',proposed_reversal_date:'2026-10-07'})]){
    const db=database([p]);
    db.siting_sessions=[{id:'siting-1',id_card:p.id_card,surname:p.surname,status:'seen',surgery_date:'2026-10-07',surgery_performed:false}];
    const {c,body}=context(db);
    for(const date of ['2026-10-05','2026-10-07','2026-10-08']){
      c.TODAY=date;await c.loadHandover();assert.doesNotMatch(body.textContent,/Example/);
      assert.equal((await c.handoverAwaitingReversals([])).length,0);
      assert.equal((await c.handoverAwaitingSurgery([])).length,0);
      assert.equal((await c.handoverAwaitingSitings()).length,0);
    }
    assert.equal(db.patients[0].proposed_reversal_date,'2026-10-07');
  }
});

test('awaiting surgery keeps an unregistered patient and a patient with a remaining current stoma',async()=>{
  const p=patient({id_card:'0000001M',is_inpatient:false,reversal_date:'2026-10-02',initial_stomas:[{uid:'second',type:'End ileostomy'}]}),db=database([p]);
  db.siting_sessions=[
    {id:'siting-1',id_card:p.id_card,surname:p.surname,status:'seen',surgery_date:'2026-10-05'},
    {id:'siting-2',id_card:'0000002M',surname:'Unregistered',status:'booked',surgery_date:'2026-10-05'}
  ];
  const {c}=context(db);
  const rows=await c.handoverAwaitingSitings();
  assert.deepEqual(Array.from(rows,r=>r.id),['siting-1','siting-2']);
  assert.equal(rows[0]._registry_patient_id,p.id);
});

test('the post-save refresh completes before the save workflow returns',async()=>{
  const {c}=context();let done=false,returned=false,release;
  c.loadHandover=()=>new Promise(resolve=>{release=()=>{done=true;resolve();};});
  const saved=c.afterStomaSaved('p1').then(()=>{returned=true;});
  await Promise.resolve();await Promise.resolve();assert.equal(done,false);assert.equal(returned,false);
  release();await saved;assert.equal(done,true);
});
