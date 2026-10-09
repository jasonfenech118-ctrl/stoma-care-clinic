const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {fistulaHelpers}=require('./fistula-helpers.cjs');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
function source(name){
  const match=html.match(new RegExp('(?:async )?function '+name+'\\('));
  assert.ok(match,name);
  return html.slice(match.index,html.indexOf('\n}',match.index)+2);
}
const patient=extra=>({id:'p1',first_name:'Example',surname:'Patient',id_card:'TEST',stoma_type:'End colostomy',
  surgery_date:'2026-01-01',initial_stomas:[],extra_stomas:[],extra_refashionings:[],stoma_operation_history:[],
  is_inpatient:false,inpatient_ward:'SW5',inpatient_bed:'1',inpatient_since:null,...extra});
const row=(name,date='2026-10-02',uid='base',extra={})=>({stoma_uid:uid,appliances:name?[name]:[],accessories:[],changed_on:date,...extra});
const episode=(appliances,extra={})=>({id:'old-episode',patient_id:'p1',kind:'episode',is_current:false,
  record_date:'2026-09-17',discharge_date:'2026-10-03',appliances,...extra});
function setup(t,{pat=patient(),records=[],appointments=[]}={}){
  const dom=new JSDOM('<body><div id="mo"><div id="mb"></div></div></body>',{pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const db={patients:[copy(pat)],clinical_records:copy(records),appointments:copy(appointments),inserts:[],patches:[],alerts:[]};
  const client={from(table){
    const filters=[],orders=[];let inserted=null,patch=null,start=0,end=Infinity;
    const q={select(){return q;},insert(value){inserted=copy(value);return q;},update(value){patch=copy(value);return q;},
      eq(key,value){filters.push(r=>r[key]===value);return q;},is(key,value){filters.push(r=>(r[key]??null)===value);return q;},
      order(key,opts={}){orders.push({key,asc:opts.ascending!==false});return q;},range(a,b){start=a;end=b+1;return q;},
      then(resolve,reject){return Promise.resolve().then(async()=>{
        if(db.readGate&&!inserted&&!patch)await db.readGate;
        if(db.failReads===table&&!inserted&&!patch)return{data:null,error:{message:'History read failed'}};
        if(inserted){
          if(db.failInsert)return{data:null,error:{message:'Episode save failed'}};
          inserted.id='new-episode-'+(db.inserts.length+1);db.inserts.push(copy(inserted));db[table].push(inserted);
          return{data:[copy(inserted)],error:null};
        }
        let matches=(db[table]||[]).filter(r=>filters.every(f=>f(r)));
        matches.sort((a,b)=>{for(const o of orders){const n=String(a[o.key]??'').localeCompare(String(b[o.key]??''));if(n)return o.asc?n:-n;}return 0;});
        if(patch){
          if(db.failPatch)return{data:null,error:{message:'Patient save failed'}};
          matches.forEach(r=>Object.assign(r,patch));db.patches.push(copy(patch));
        }
        return{data:copy(matches.slice(start,end)),error:null};
      }).then(resolve,reject);}
    };return q;
  }};
  const c=vm.createContext({window:dom.window,document:dom.window.document,SB:client,TODAY:'2026-10-09',Date,Map,Set,
    console:{error(){}},alert:message=>db.alerts.push(message),fixText:s=>s,prettyStomaType:s=>s,fmtShortDate:s=>s,
    htmlSafe:v=>String(v??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';'),jsSafe:s=>s,
    stomaShortType:s=>s,stomaQuadrant:()=>'',initialStomaCode:s=>s,STOMA_KINDS:{},WARDS:['SW1','SW5'],SAMOC_WARDS:[],
    APPLIANCE_CATALOGUE:[{name:'Old flange',system:'two'},{name:'New pouch',system:'one'},
      {name:'Clinic pouch',system:'one'},{name:'Flange A',system:'two'},{name:'Flange B',system:'two'},{name:'Dressing',system:'dressing'}],
    TWO_PIECE_NAMES:['Old flange','Flange A','Flange B'],shortApplianceList:n=>n||[],handoverReminderDate:v=>v||'',
    openMo:()=>dom.window.document.getElementById('mo').classList.add('open'),closeModal:()=>{},
    getCurrentUserForAudit:async()=>({name:'Nurse A'}),nextEpisodeRef:async()=> 'EP-TEST',
    missingColumnFromError:()=>null,isDuplicateRefError:()=>false,
    reportEpisodeError:(_where,error)=>db.alerts.push(error.message),renderClinicalPanel:()=>{},
    clrState:{patientId:pat.id,patient:copy(pat),rows:copy(records),available:true,expanded:{}},
    fetchPatientById:async id=>({data:copy(db.patients.find(p=>p.id===id)||null),error:db.failPatientRead?{message:'Patient read failed'}:null}),
    updatePatientTolerant:async(id,patch)=>({...await client.from('patients').update(patch).eq('id',id),dropped:[]}),
    loadClinicalRecords:async()=>{c.clrState.rows=copy(db.clinical_records).reverse();},
    visitStomaBannerHTML:st=>'<strong>'+st.typeLabel+'</strong>',psmIc:()=>'<svg></svg>'
  });
  vm.runInContext(fistulaHelpers,c);
  vm.runInContext("let ivWizard=null,ivOpenVersion=0;const _normType=t=>String(t||'').trim().toLowerCase();const SUPABASE_PAGE_SIZE=1000;",c);
  vm.runInContext(html.match(/^const IV_TITLES=.*$/m)[0],c);
  for(const name of ['parseNameList','parseStomas','parseRefashionings','parseInitialStomas','stomaOperationHistory','patientStomaList',
    'stomaTimeline','stomasPresentOn','applianceStomaUid','parseEpisodeApplianceRows','stomaApplianceHistory','appliancePillsHTML',
    'applianceRowIsTwoPiece','applianceLineIsTwoPiece','episodeFlangeDueDate','episodeApplianceNote','inpatientStomaType',
    'fetchAllRows','openEpisodeIn','inpatientSavedApplianceRows','previousInpatientAppliances','applyInpatientApplianceSnapshot',
    'openInpatientVisit','ivSteps','wardOptions','renderInpatientStep','captureInpatientStep','ivNext','admitAwaitingReview',
    'saveInpatientVisit','renderInpatientDone','currentApplianceNoteRows','looseApplianceRows','handoverApplianceRowText','handoverStomaLine'])
    vm.runInContext(source(name),c);
  c.recCode=r=>r?.episode_ref||'';
  return{c,db,dom,get wizard(){return vm.runInContext('ivWizard',c);},text:()=>dom.window.document.getElementById('mb').textContent,
    date(value){dom.window.document.getElementById('iv-admitted').value=value;}};
}

test('readmission offers Admit, retains the latest setup and the actual admission date, and shows it on Handover',async t=>{
  const old=episode([row('Old flange','2026-09-20','base',{flange_due:'2026-10-10'}),row('New pouch','2026-10-02','base',{accessories:['Belt']})]);
  const s=setup(t,{pat:patient({flange_due:'2026-10-10'}),records:[old]});
  await s.c.openInpatientVisit();
  assert.match(s.text(),/New pouch/);assert.match(s.text(),/Belt/);assert.doesNotMatch(s.text(),/Old flange|Awaiting first review|Set appliance now/);
  assert.equal(s.dom.window.document.querySelector('.btn-save').textContent,'Admit');
  assert.equal(s.dom.window.document.querySelectorAll('.iv-saved-appliances .psm-card').length,1);
  s.date('2026-09-17');await s.c.ivNext();
  const saved=s.db.inserts[0];assert.equal(saved.record_date,'2026-09-17');
  assert.deepEqual(saved.appliances[0].appliances,['New pouch']);assert.equal(saved.appliances[0].stoma_uid,'base');
  assert.deepEqual(saved.appliances[0].accessories,['Belt']);assert.equal(saved.appliances[0].changed_by,'Nurse A');
  assert.equal(saved.appliances[0].carried_from,'2026-10-02');assert.deepEqual(s.db.clinical_records[0],old);
  assert.equal(s.db.patches[0].flange_due,null);assert.equal(s.db.patches[0].is_inpatient,true);
  const line=s.c.handoverStomaLine(s.db.patients[0],saved.appliances);
  assert.match(line,/New pouch/);assert.doesNotMatch(line,/Old flange|Awaiting first review/);
  assert.match(s.text(),/2026-09-17/);assert.match(s.text(),/saved appliances and accessories have been kept/);assert.deepEqual(s.db.alerts,[]);
});

test('the newest attended clinic setup wins over an older admission; a booking is never used',async t=>{
  const s=setup(t,{records:[episode([row('Old flange')])],appointments:[
    {id:'a1',patient_id:'p1',status:'attended',appt_date:'2026-10-08',stoma_appliances:JSON.stringify([{uid:'base',appliances:['Clinic pouch'],accessories:['Paste']}])},
    {id:'a2',patient_id:'p1',status:'booked',appt_date:'2026-10-09',appliances:['Future pouch']}]});
  await s.c.openInpatientVisit();await s.c.ivNext();
  assert.deepEqual(s.db.inserts[0].appliances[0].appliances,['Clinic pouch']);
  assert.equal(s.db.inserts[0].appliances[0].carried_source,'followup');assert.equal(s.db.patches[0].flange_due,null);
});

test('multiple current stomas keep separate setups and flange dates without reopening the picker',async t=>{
  const s=setup(t,{pat:patient({initial_stomas:[{uid:'second',type:'End ileostomy'}]}),records:[episode([
    row('Flange A','2026-10-02','base',{flange_due:'2026-10-12',accessories:['Belt']}),
    row('Flange B','2026-10-03','second',{flange_due:'2026-10-10',accessories:['Ring']})])]});
  await s.c.openInpatientVisit();assert.equal(s.wizard.reuse,true);
  assert.equal(s.dom.window.document.querySelectorAll('.iv-saved-appliances .psm-card').length,2);
  assert.doesNotMatch(s.text(),/then set appliances|Awaiting first review/);
  await s.c.ivNext();const rows=s.db.inserts[0].appliances;
  assert.deepEqual(rows.map(r=>r.stoma_uid),['base','second']);assert.deepEqual(rows.map(r=>r.accessories),[['Belt'],['Ring']]);
  assert.equal(s.db.patches[0].flange_due,'2026-10-10');
  const line=s.c.handoverStomaLine(s.db.patients[0],rows);assert.match(line,/Flange A/);assert.match(line,/Flange B/);
});

test('a new second stoma does not force reselection of the first stoma or inherit its appliance',async t=>{
  const s=setup(t,{pat:patient({extra_stomas:[{uid:'new-stoma',type:'End ileostomy',formed_date:'2026-10-06'}]}),
    records:[episode([row('New pouch')])]});
  await s.c.openInpatientVisit();assert.match(s.text(),/No appliance is saved for End ileostomy/);
  await s.c.ivNext();assert.deepEqual(s.db.inserts[0].appliances.map(r=>r.stoma_uid),['base']);
  assert.match(s.c.handoverStomaLine(s.db.patients[0],s.db.inserts[0].appliances),/End ileostomy: Appliance not yet selected/);
});

test('refashioning starts with its own identity instead of copying the previous stoma appliance',async t=>{
  const s=setup(t,{pat:patient({extra_refashionings:[{uid:'refashioned',type:'End colostomy',target_uid:'base',formed_date:'2026-10-06'}]}),
    records:[episode([row('New pouch')])]});
  await s.c.openInpatientVisit();assert.equal(s.wizard.reuse,false);assert.deepEqual(copy(s.wizard.prev),[]);
  assert.match(s.text(),/Awaiting first review/);assert.doesNotMatch(s.text(),/New pouch/);
});

test('a cleared latest selection in either ward or clinic history never resurrects the older pouch',async t=>{
  for(const useClinic of [false,true]){
    const s=setup(t,{records:[episode([row('New pouch'),...useClinic?[]:[row('','2026-10-08')]])],
      appointments:useClinic?[{id:'a1',patient_id:'p1',status:'attended',appt_date:'2026-10-08',stoma_appliances:[{uid:'base',appliances:[],accessories:[]}]}]:[]});
    await s.c.openInpatientVisit();assert.equal(s.wizard.reuse,false);assert.doesNotMatch(s.text(),/New pouch/);
  }
});

test('a first admission without a setup still permits admission awaiting review',async t=>{
  const s=setup(t);await s.c.openInpatientVisit();await s.c.admitAwaitingReview();
  assert.deepEqual(s.db.inserts[0].appliances,[]);assert.equal(s.db.patches[0].inpatient_notes,null);
});

test('an already open episode is not admitted again, including one opened while the form is displayed',async t=>{
  const s=setup(t,{records:[episode([row('New pouch')])]});
  await s.c.openInpatientVisit();s.db.clinical_records.push(episode([],{id:'peer-episode',is_current:true,discharge_date:null}));
  await s.c.ivNext();assert.equal(s.db.inserts.length,0);assert.match(s.db.alerts[0],/already has an inpatient visit open/);
  const another=setup(t,{records:s.db.clinical_records});await another.c.openInpatientVisit();assert.equal(another.wizard,null);
});

test('failed history reads stop admission and retain the displayed saved setup',async t=>{
  const s=setup(t,{records:[episode([row('New pouch')])]});
  s.db.failReads='appointments';await s.c.openInpatientVisit();assert.equal(s.wizard,null);assert.match(s.db.alerts[0],/Could not check/);
  s.db.failReads=null;await s.c.openInpatientVisit();s.date('2026-10-01');s.db.failReads='clinical_records';await s.c.ivNext();
  assert.equal(s.db.inserts.length,0);assert.equal(s.wizard.admitted,'2026-10-01');assert.match(s.text(),/New pouch/);
  assert.equal(s.wizard.saving,false);assert.equal(s.dom.window.document.querySelector('.btn-save').disabled,false);
});

test('a peer appliance change is shown for review before saving, then the latest setup is admitted',async t=>{
  const s=setup(t,{records:[episode([row('New pouch')])]});await s.c.openInpatientVisit();
  s.db.clinical_records[0].appliances.push(row('Clinic pouch','2026-10-09'));
  await s.c.ivNext();assert.equal(s.db.inserts.length,0);assert.match(s.text(),/Clinic pouch/);assert.doesNotMatch(s.text(),/New pouch/);
  await s.c.ivNext();assert.deepEqual(s.db.inserts[0].appliances[0].appliances,['Clinic pouch']);
});

test('double admission clicks and retrying a failed patient update keep one episode',async t=>{
  const s=setup(t,{records:[episode([row('New pouch')])]});await s.c.openInpatientVisit();s.db.failPatch=true;
  await Promise.all([s.c.ivNext(),s.c.ivNext()]);assert.equal(s.db.inserts.length,1);assert.equal(s.wizard.episodeSaved,true);
  assert.equal(s.dom.window.document.querySelector('.btn-save').disabled,false);
  s.db.failPatch=false;await s.c.ivNext();assert.equal(s.db.inserts.length,1);assert.equal(s.db.patches.length,1);assert.equal(s.wizard,null);
});

test('an episode save failure does not claim admission or publish a blank Handover setup',async t=>{
  const s=setup(t,{records:[episode([row('New pouch')])]});await s.c.openInpatientVisit();s.db.failInsert=true;await s.c.ivNext();
  assert.equal(s.db.inserts.length,0);assert.equal(s.db.patches.length,0);assert.equal(s.db.patients[0].is_inpatient,false);assert.match(s.text(),/New pouch/);
});

test('history is paginated, so a saved setup beyond the first 1000 visits is retained',async t=>{
  const appointments=Array.from({length:1001},(_,i)=>({id:String(i).padStart(4,'0'),patient_id:'p1',status:'attended',appt_date:'2026-01-01',appliances:['Old flange']}));
  appointments.push({id:'zz-last',patient_id:'p1',status:'attended',appt_date:'2026-10-08',appliances:['Clinic pouch']});
  const s=setup(t,{appointments});await s.c.openInpatientVisit();assert.deepEqual(copy(s.wizard.prev[0].appliances),['Clinic pouch']);
});

test('a slow appliance read cannot open an admission for the patient the nurse has left',async t=>{
  const s=setup(t,{records:[episode([row('New pouch')])]});let release;s.db.readGate=new Promise(resolve=>release=resolve);
  const pending=s.c.openInpatientVisit();s.c.clrState.patientId='other-patient';release();await pending;
  assert.equal(s.wizard,null);assert.equal(s.text(),'');
});

test('ward and future admission dates are validated before writing',async t=>{
  const s=setup(t,{records:[episode([row('New pouch')])]});await s.c.openInpatientVisit();
  s.dom.window.document.getElementById('iv-ward').value='';await s.c.ivNext();assert.equal(s.db.inserts.length,0);
  s.dom.window.document.getElementById('iv-ward').value='SW5';s.date('2026-10-10');await s.c.ivNext();assert.equal(s.db.inserts.length,0);
  assert.match(s.db.alerts.join(' '),/choose the ward.*cannot be in the future/);
});

test('a new admission does not default to the previous discharged admission date',async t=>{
  const s=setup(t,{pat:patient({inpatient_since:'2026-09-17'}),records:[episode([row('New pouch')])]});
  await s.c.openInpatientVisit();assert.equal(s.wizard.admitted,'2026-10-09');
});
