const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){
  const match=html.match(new RegExp('(?:async )?function '+name+'\\('));assert.ok(match,name);
  const start=match.index,lineEnd=html.indexOf('\n',start);
  return html.slice(start,html.slice(start,lineEnd).trim().endsWith('}')?lineEnd:html.indexOf('\n}',start)+2);
}
const patient=()=>({id:'p1',first_name:'Example',surname:'Patient',id_card:'TEST-ID',followup_status:'active',
  stoma_type:'End colostomy',surgery_date:'2020-01-15',upcoming_surgery_date:'2026-11-12'});
const siting={id:'s1',status:'seen',session_date:'2020-01-10',surgery_date:'2020-01-15',proposed_operation:'Earlier operation'};
function setup(t,options={}){
  const dom=new JSDOM('<body><main id="page-patient-record" class="page"></main><div id="mb"></div></body>');
  t.after(()=>dom.window.close());
  const database={...patient(),...options.patient},writes=[],alerts=[];
  const c={console,document:dom.window.document,window:{scrollTo(){}},TODAY:'2026-10-28',
    clrState:{patient:null,rows:[],available:true},patientRecordLoadSequence:1,patientRecordOrigin:'patients',
    htmlSafe:v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    jsSafe:v=>String(v).replace(/'/g,"\\'"),fmtShortDate:d=>d,psmIc:()=>'',sexModalClass:()=>'',
    currentTabName:()=> 'patients',isEncounterUser:()=>false,enrichAppointments:async rows=>rows,
    loadClinicalRecords:async()=>{},loadPatientCommunications:async()=>{},fetchPatientEncounters:async()=>[],
    fetchPatientSiting:async()=>options.noSiting?null:{...siting},fetchSitingImage:async()=>null,
    openEpisodeIn:()=>null,patientStomaList:p=>p.stoma_type?[{}]:[],patientOutcome:()=>['Active',''],psmPatientAge:()=>null,
    normaliseFollowupStatus:s=>s||'active',patientIsDeceased:()=>false,patientMissingFields:()=>[],
    recordOutcomeDecor:()=>({isOutcome:false}),isFistulaPatient:()=>false,isBaggingPatient:()=>false,
    hasStomaNow:p=>!!p?.stoma_type,patientStomaSummaryHTML:()=>'<div>Recorded stoma history</div>',
    sitingStatusLabel:()=> 'Sited',alert:message=>alerts.push(message),closeModal:()=>{c.closed=true;},
    openMo:()=>{},patientNameAvatarHTML:()=> 'Example Patient',auditPatientWrite:()=>{},missingColumnFromError:()=>null};
  for(const name of ['renderPrimaryTabs','renderSubTabs','renderMobileNav','renderNavBack','patientHeaderAvatarHTML',
    'fistulaTagHTML','extraStatusChipsHTML','docStatusCardHTML','surgerySnapshotHTML','deceasedMinimiseCardHTML',
    'patientSignatureHTML','complicationsSummaryHTML','stomaOutcomesPanelHTML','localityFlagHTML'])c[name]=()=>'';
  c.SB={from(table){let cols='*',body=null;const query={
    select:value=>{cols=value;return query;},eq:()=>query,order:()=>query,
    update:value=>{body=value;return query;},
    maybeSingle:async()=>{
      if(options.missingColumn&&cols.split(',').includes(options.missingColumn))return {data:null,error:{message:`column patients.${options.missingColumn} does not exist`}};
      return {data:Object.fromEntries(cols.split(',').filter(k=>k in database).map(k=>[k,database[k]])),error:null};
    },
    then(resolve,reject){
      if(body){writes.push({...body});if(!options.writeError)Object.assign(database,body);}
      return Promise.resolve(body?{error:options.writeError||null}:{data:[],error:null}).then(resolve,reject);
    }};return query;}};
  vm.createContext(c);
  for(const name of ['PATIENT_BASE_COLS','PATIENT_DATE_COLS'])vm.runInContext(html.match(new RegExp('const '+name+'=[^\\n]+'))[0],c);
  vm.runInContext('let patientColsPruned=null;let patientDatesAvailable=true;',c);
  for(const name of ['patientSelectCols','dropMissingPatientCol','refreshPatientDatesAvailable','fetchPatientsSelect',
    'fetchPatientById','upcomingSurgerySummaryHTML','sitingChecklistOf','sitingCleanNotes','sitingSummaryHTML',
    'renderStomasPanel','switchPatientPanel','renderPatientRecord','updatePatientTolerant','openSurgeryDateModal','saveSurgeryDate'])vm.runInContext(source(name),c);
  c.renderClinicalPanel=()=>c.renderStomasPanel();
  return {c,database,writes,alerts,open:()=>c.renderPatientRecord('p1',{fromBack:true},1)};
}
test('reopening the profile shows the saved upcoming date in Overview and Stomas alongside an older siting',async t=>{
  const f=setup(t);await f.open();const d=f.c.document;
  assert.equal(d.getElementById('psm-demographics').hidden,false);
  assert.equal(d.getElementById('psm-upcoming-surgery').hidden,false);
  assert.equal(d.querySelector('#psm-demographics time').dateTime,'2026-11-12');
  assert.match(d.getElementById('psm-stomas').textContent,/Upcoming surgery.*2026-11-12.*Pre-operative stoma siting.*2020-01-15/s);
  assert.equal(f.c.clrState.patient.surgery_date,'2020-01-15');assert.equal(f.writes.length,0);
  await f.c.openSurgeryDateModal('p1');assert.equal(d.getElementById('usd-date').value,'2026-11-12');
});
test('saving or changing the date refreshes both profile sections and survives a fresh read',async t=>{
  const f=setup(t,{patient:{upcoming_surgery_date:null}});await f.open();
  assert.equal(f.c.document.getElementById('psm-upcoming-surgery').hidden,true);
  await f.c.saveSurgeryDate('p1','2026-12-03');
  assert.equal(f.c.closed,true);assert.equal(f.c.document.getElementById('psm-upcoming-surgery').hidden,false);
  for(const id of ['psm-upcoming-surgery','psm-stomas'])assert.equal(f.c.document.querySelector('#'+id+' time').dateTime,'2026-12-03');
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].upcoming_surgery_date,'2026-12-03');
  await f.open();assert.equal(f.c.document.querySelector('#psm-demographics time').dateTime,'2026-12-03');
  assert.equal(f.database.surgery_date,'2020-01-15');assert.equal(siting.surgery_date,'2020-01-15');
});
test('removing a planned date clears Overview and keeps the earlier siting and stoma history',async t=>{
  const f=setup(t);await f.open();await f.c.saveSurgeryDate('p1','');
  assert.equal(f.database.upcoming_surgery_date,null);
  assert.equal(f.c.document.getElementById('psm-upcoming-surgery').textContent,'');
  assert.equal(f.c.document.getElementById('psm-upcoming-surgery').hidden,true);
  const stomas=f.c.document.getElementById('psm-stomas');
  assert.match(stomas.textContent,/No surgery date set.*Add surgery date.*Pre-operative stoma siting.*2020-01-15.*Recorded stoma history/s);
  await f.open();assert.equal(f.c.document.getElementById('psm-upcoming-surgery').textContent,'');
});
test('a failed save retains the displayed date and leaves the form open',async t=>{
  const f=setup(t,{writeError:{message:'Save denied'}});await f.open();await f.c.saveSurgeryDate('p1','2026-12-03');
  assert.equal(f.c.closed,undefined);assert.equal(f.database.upcoming_surgery_date,'2026-11-12');
  assert.equal(f.c.document.querySelector('#psm-demographics time').dateTime,'2026-11-12');
  assert.match(f.alerts[0],/Save denied/);
});
test('a database without the optional planned-date column still loads the recorded stoma',async t=>{
  const f=setup(t,{missingColumn:'upcoming_surgery_date'});await f.open();
  assert.equal(f.c.clrState.patient.stoma_type,'End colostomy');assert.equal(f.c.clrState.patient.surgery_date,'2020-01-15');
  assert.equal(f.c.document.getElementById('psm-upcoming-surgery').textContent,'');
  assert.match(f.c.document.getElementById('psm-stomas').textContent,/Recorded stoma history/);
});
test('an existing stoma without a planned date can add one even with a previous siting',async t=>{
  const f=setup(t,{patient:{upcoming_surgery_date:null}});await f.open();
  const section=f.c.document.getElementById('psm-stomas');
  assert.match(section.textContent,/Upcoming surgery.*Add surgery date.*Pre-operative stoma siting/s);
});
test('a patient awaiting their first stoma retains the siting action and a planned reversal stays separate',async t=>{
  const f=setup(t,{patient:{stoma_type:null,upcoming_surgery_date:null,proposed_reversal_date:'2026-12-03'},noSiting:true});await f.open();
  assert.equal(f.c.document.getElementById('psm-upcoming-surgery').textContent,'');
  assert.match(f.c.document.getElementById('psm-stomas').textContent,/Add siting session/);
  assert.doesNotMatch(f.c.document.getElementById('psm-stomas').textContent,/2026-12-03/);
});
