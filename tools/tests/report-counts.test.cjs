const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){
  const match=html.match(new RegExp('(?:async )?function '+name+'\\('));assert.ok(match,name);
  const line=html.slice(match.index,html.indexOf('\n',match.index));
  return line.endsWith('}')?line:html.slice(match.index,html.indexOf('\n}',match.index)+2);
}
class ReportDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-01T12:00:00Z']));}}
function context(dataset={}){
  const d={patients:[],appts:[],sitings:[],noStoma:[],episodes:[],...dataset};
  d.fuType=Object.fromEntries(d.patients.map(p=>[p.id,p.followup_type]));
  const errors={},queries=[],charts=[];
  const dom=new JSDOM('<body><div id="totals"></div><div id="formations"></div><div id="mb"></div><input id="annual-year" value="2026"/></body>');
  const tableRows=table=>d[{patients:'patients',appointments:'appts',siting_sessions:'sitings',operations_no_stoma:'noStoma',clinical_records:'episodes'}[table]]||[];
  const query=table=>({table,cols:'*',filters:[],select(cols){this.cols=cols;return this;},eq(k,v){this.filters.push(r=>r[k]===v);return this;},
    gte(k,v){this.filters.push(r=>r[k]>=v);return this;},lte(k,v){this.filters.push(r=>r[k]<=v);return this;},order(){return this;},
    then(resolve){return Promise.resolve({count:d.patients.length,error:errors[table]||null}).then(resolve);}});
  const c=vm.createContext({document:dom.window.document,Date:ReportDate,Map,Set,console:{warn(){}},TODAY:'2026-10-01',
    initialStomaCode:s=>s,fmtShortDate:s=>s,htmlSafe:s=>String(s??''),jsSafe:s=>String(s),statusLabel:s=>s,
    normaliseFollowupStatus:s=>s||'active',pct:(a,b)=>b?Math.round(a/b*100):0,
    monthEndDate:(y,m)=>`${y}-${m}-${new Date(Number(y),Number(m),0).getDate()}`,
    followupMonthName:m=>new Date(2026,Number(m)-1,1).toLocaleString('en',{month:'long'}),openMo(){},
    SB:{from:query},fetchAllRows:async build=>{
      const q=build();queries.push(q);let rows=tableRows(q.table).filter(r=>q.filters.every(fn=>fn(r)));
      if(q.cols!=='*')rows=rows.map(r=>Object.fromEntries(q.cols.split(',').map(k=>[k,r[k]])));
      return {rows,error:errors[q.table]||null};
    },fetchPatientsSelect:async()=>({rows:d.patients,error:errors.patients||null}),
    reportCharts:{},Chart:class{constructor(el,config){this.config=config;charts.push(config);}destroy(){}},renderMetricCompare(){}});
  for(const [name,end] of [['DA_STOMA_GROUPS','\n];'],['DA_SERIES','\n];'],['METRIC_LABELS','\n};']]){
    const start=html.indexOf('const '+name+'=');vm.runInContext(html.slice(start,html.indexOf(end,start)+end.length),c);
  }
  for(const name of ['MC_MON','YEAR_COMPARE_COLORS']){const start=html.indexOf('const '+name+'=');vm.runInContext(html.slice(start,html.indexOf('\n',start)),c);}
  vm.runInContext("const LEGACY_ADMIN_APPT_START=Date.parse('2026-09-21T21:44:18Z');const LEGACY_ADMIN_APPT_END=Date.parse('2026-09-22T16:15:00Z');let periodTotalsRequest=0,annualStomaRequest=0,metricCompareRequest=0;let annualReportData={year:2026};let metricCompareState={metric:null,periods:[],data:null,tab:'compare'};",c);
  const names=['parseStomas','parseRefashionings','parseInitialStomas','stomaOperationHistory','patientStomaList','daStomaGroup',
    'metricNewReversalDates','stomaReversalEntries','metricReversalDates','metricIsDead','metricOperatedInYear','metricSurgeryDate',
    'metricMonthly','metricPeriodTotal','metricPeriodRecords','metricCumulativeUnique','renderPeriodTotals','renderStomaFormationTable',
    'reportRequiredRows','appointmentJsonHasValues','isLegacyAdminAppliancePlaceholder','metricCompareEnsureData','daDatesOf',
    'openMetricCompare','annualKpi','metricPeriodColor','metricPeriodLabel','metricPeriodKey','metricAddYearOptions','metricRecordsHTML','destroyChart'];
  names.forEach(name=>vm.runInContext(source(name),c));
  c.state=()=>vm.runInContext('metricCompareState',c);
  c.series=key=>vm.runInContext('DA_SERIES',c).find(s=>s.key===key);
  return {c,d,errors,queries,charts};
}
const patient=(id,formed,extra={})=>({id,stoma_type:'Loop ileostomy',surgery_date:formed,initial_stomas:[],extra_stomas:[],extra_refashionings:[],stoma_operation_history:[],...extra});
const period=(month='',year=2026)=>({year,month});
function coherent(c,d,key,p,expected){
  const monthly=c.metricMonthly(key,p.year,d);
  assert.equal(c.metricPeriodTotal(key,p,d,monthly),expected,key+' period total');
  assert.equal(c.metricPeriodRecords(key,p,d).length,expected,key+' records');
  if(p.month)assert.equal(monthly[Number(p.month)-1],expected,key+' chart');
}

test('deaths and Gozo in September include operations earlier in the selected year',async()=>{
  const {c,d}=context({patients:[
    patient('death','2026-02-01',{deceased_date:'2026-09-10'}),
    patient('gozo1','2026-01-01',{followup_status:'discharged_gozo',discharged_gozo_date:'2026-09-11'}),
    patient('gozo2','2026-09-01',{followup_status:'discharged_gozo',followup_status_effective_date:'2026-09-12'}),
    patient('older','2025-12-01',{deceased_date:'2026-09-15'}),
    patient('october','2026-09-01',{deceased_date:'2026-10-01'})]});
  await c.renderPeriodTotals('totals',2026,'09',d.patients,[]);
  for(const [key,n] of [['deaths_new',1],['gozo_new',2]]){
    coherent(c,d,key,period('09'),n);
    const tile=c.document.querySelector(`[onclick*="'${key}'"]`);
    assert.equal(tile.querySelector('.k-value').textContent,String(n));
    assert.match(tile.querySelector('.k-sub').textContent,/operated in 2026/);
  }
});

test('every activity tile, monthly chart, year total and record list reconcile',async()=>{
  const {c,d}=context({patients:[
    patient('a','2026-01-01',{reversal_date:'2026-09-01',deceased_date:'2026-10-01',followup_type:'common'}),
    patient('b','2026-08-01',{followup_status:'discharged_gozo',discharged_gozo_date:'2026-09-02',followup_type:'new_case'}),
    patient('c','2025-01-01',{stoma_type:'Urostomy',initial_stomas:[{uid:'second',type:'End colostomy',reversal_date:'2026-09-03'}]}),
    patient('d','2026-02-01',{followup_status:'relocated_overseas',relocated_overseas_date:'2026-09-04'})],
    appts:[{id:'a1',patient_id:'a',appt_date:'2026-08-01',status:'attended'},{id:'a2',patient_id:'a',appt_date:'2026-09-01',status:'attended'},
      {id:'b1',patient_id:'b',appt_date:'2026-09-02',status:'booked'},{id:'b2',patient_id:'b',appt_date:'2026-09-03',status:'cancelled'},
      {id:'a3',patient_id:'a',appt_date:'2026-09-04',status:'did_not_attend'},{id:'no-patient',appt_date:'2026-09-05',status:'attended'}],
    sitings:[{id:'s1',session_date:'2026-08-01',surgery_date:'2026-09-01',status:'done',stoma_formed:true},
      {id:'s2',session_date:'2026-09-02',status:'booked'},{id:'cancelled',session_date:'2026-09-02',status:'cancelled',stoma_formed:true}],
    noStoma:[{id:'n1',surgery_date:'2026-09-03'}],episodes:[{id:'e1',patient_id:'a',record_date:'2026-09-01',kind:'episode'}]});
  const keys=['appointments','attended','dntu','cancellations','followups','unique_patients','inpatients','sitings','stoma_performed','stoma_not_performed','reversals_new','stomas_formed','colostomies','ileostomies','urostomies','deaths_new','gozo_new','overseas_new','reversals','reversals_colostomy','reversals_ileostomy','deaths','gozo','overseas'];
  for(const year of [2025,2026,2027])for(const month of ['',...Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0'))]){
    await c.renderPeriodTotals('totals',year,month,d.patients,d.appts.filter(a=>a.appt_date.startsWith(String(year))).map(a=>({...a,patients:d.patients.find(p=>p.id===a.patient_id)})));
    for(const key of keys){
      const p=period(month,year),monthly=c.metricMonthly(key,year,d),expected=c.metricPeriodRecords(key,p,d).length;
      coherent(c,d,key,p,expected);
      const tile=c.document.querySelector(`[onclick*="'${key}'"]`);
      if(tile)assert.equal(Number(tile.querySelector('.k-value').textContent),expected,key+' tile');
      if(!month&&key!=='unique_patients')assert.equal(expected,monthly.reduce((a,b)=>a+b,0),key+' yearly sum');
    }
  }
  for(const year of [2025,2026,2027]){
    await c.renderStomaFormationTable('formations',year,d.patients);
    const rows=c.document.querySelectorAll('#formations tbody tr');
    for(let i=0;i<13;i++)for(const [column,key] of [[1,'colostomies'],[2,'ileostomies'],[3,'urostomies'],[4,'stomas_formed'],[5,'reversals_colostomy'],[6,'reversals_ileostomy']]){
      const p=period(i===12?'':String(i+1).padStart(2,'0'),year);
      assert.equal(Number(rows[i].children[column].textContent),c.metricPeriodRecords(key,p,d).length,key+' formation table');
    }
  }
});

test('unique patients are distinct across the year rather than the sum of months',()=>{
  const {c,d}=context({patients:[patient('p','2026-01-01')],appts:[{patient_id:'p',appt_date:'2026-01-01'},{patient_id:'p',appt_date:'2026-09-01'}]});
  coherent(c,d,'unique_patients',period(),1);
  assert.equal(c.metricMonthly('unique_patients',2026,d).reduce((a,b)=>a+b),2);
  assert.equal(c.metricCumulativeUnique(2026,d)[11],1);
});

test('undated Gozo outcomes appear in the current full year but no month is invented',()=>{
  const {c,d}=context({patients:[patient('p','2026-02-01',{followup_status:'discharged_gozo'})]});
  coherent(c,d,'gozo_new',period(),1);
  coherent(c,d,'gozo_new',period('09'),0);
  assert.equal(c.metricMonthly('gozo_new',2026,d).reduce((a,b)=>a+b),0);
  coherent(c,d,'gozo_new',period('',2025),0);
});

test('unregistered sitings and no-stoma operations retain their names without patient action links',()=>{
  const {c,d}=context({sitings:[{id:'session-id',first_name:'Test',surname:'Siting',id_card:'TEST-S',session_date:'2026-09-01'}],
    noStoma:[{id:'operation-id',first_name:'Test',surname:'Operation',id_card:'TEST-N',surgery_date:'2026-09-02'}]});
  for(const key of ['sitings','stoma_not_performed']){
    coherent(c,d,key,period('09'),1);
    const record=c.metricPeriodRecords(key,period('09'),d)[0];
    assert.equal(record.p.id,null);assert.equal(record.p.first_name,'Test');
    c.state().periods=[period('09')];
    const rendered=c.metricRecordsHTML(key,d);assert.match(rendered,/TEST-/);assert.doesNotMatch(rendered,/openPatientRecord|openPatientDatesModal/);
  }
});

test('surgery is counted in its operation month, with an explicit fallback for older undated sitings',async()=>{
  const {c,d}=context({sitings:[{id:'s1',session_date:'2026-08-01',surgery_date:'2026-09-01',stoma_formed:true},
    {id:'legacy',session_date:'2026-09-02',stoma_formed:true}]});
  coherent(c,d,'sitings',period('08'),1);coherent(c,d,'stoma_performed',period('08'),0);coherent(c,d,'stoma_performed',period('09'),2);
  assert.match(c.metricPeriodRecords('stoma_performed',period('09'),d)[1].note,/dated by siting/);
  await c.renderPeriodTotals('totals',2026,'09',[],[]);
  assert.equal(c.document.querySelector('[onclick*="stoma_performed"] .k-value').textContent,'2');
});

test('all stomas contribute closures, refashioning alone is excluded, and repeated entries do not duplicate a reversal date',()=>{
  const mixed=patient('mixed','2026-01-01',{stoma_type:'Urostomy',reversal_date:'2026-09-01',initial_stomas:[{uid:'second',type:'Loop ileostomy',reversal_date:'2026-09-02'}]});
  const refashioned=patient('r','2026-01-01',{extra_refashionings:[{uid:'r1',target_uid:'base',type:'Loop ileostomy',formed_date:'2026-08-01',closure_date:'2026-09-03'}]});
  const duplicated=patient('d','2026-01-01',{reversal_date:'2026-09-04',initial_stomas:[{uid:'same',type:'Loop ileostomy',reversal_date:'2026-09-04'}]});
  const {c,d}=context({patients:[mixed,refashioned,duplicated]}),before=JSON.stringify(d.patients);
  coherent(c,d,'reversals',period('09'),3);coherent(c,d,'reversals_new',period('09'),3);coherent(c,d,'reversals_ileostomy',period('09'),3);
  coherent(c,d,'stomas_formed',period('08'),0);
  assert.equal(JSON.stringify(d.patients),before);
});

test('Data Analysis counts every reversal date and excludes status changes for living patients from deaths',()=>{
  const {c}=context();
  const p=patient('multi','2025-01-01',{reversal_date:'2026-03-01',initial_stomas:[{uid:'same',type:'Loop ileostomy',reversal_date:'2026-03-01'}],
    extra_stomas:[{uid:'later',type:'End colostomy',formed_date:'2026-04-01',reversal_date:'2026-09-01'}]});
  assert.deepEqual(Array.from(c.daDatesOf(c.series('reversals'),p)),['2026-03-01','2026-09-01']);
  assert.deepEqual(Array.from(c.daDatesOf(c.series('deaths'),{followup_status:'discharged_gozo',followup_status_effective_date:'2026-09-01'})),[]);
  assert.deepEqual(Array.from(c.daDatesOf(c.series('deaths'),{followup_status:'deceased',followup_status_effective_date:'2026-09-01'})),['2026-09-01']);
  assert.deepEqual(Array.from(c.daDatesOf(c.series('deaths'),{followup_status:'deceased'})),[]);
});

test('clicking a period total replaces a stale comparison selection and yearly rates open the whole year',async()=>{
  const {c}=context();c.state().periods=[period('02',2025),period('',2024)];
  await c.renderPeriodTotals('totals',2026,'09',[],[]);
  vm.runInContext(c.document.querySelector('[onclick*="deaths_new"]').getAttribute('onclick'),c);
  assert.deepEqual(JSON.parse(JSON.stringify(c.state().periods)),[period('09')]);
  const dom=new JSDOM(c.annualKpi('Attended',80,'rate','', 'attended'));
  vm.runInContext(dom.window.document.querySelector('[onclick]').getAttribute('onclick'),c);
  assert.deepEqual(JSON.parse(JSON.stringify(c.state().periods)),[period()]);
});

test('comparison appointment reads exclude legacy appliance-only placeholders',async()=>{
  const placeholder={id:'placeholder',patient_id:'p',status:'attended',appt_date:'2026-09-22',appt_slot:'09:00',outcome_recorded_at:'2026-09-22T08:00:00Z',stoma_appliances:{base:{codes:['TEST']}}};
  const genuine={...placeholder,id:'genuine',assigned_to:'nurse'};
  const {c}=context({patients:[patient('p','2026-01-01')],appts:[placeholder,genuine]});
  const d=await c.metricCompareEnsureData([2026]);
  assert.deepEqual(Array.from(d.appts,a=>a.id),['genuine']);coherent(c,d,'appointments',period('09'),1);
});

test('failed and partial report reads are never cached as zero activity',async()=>{
  const {c,errors}=context({patients:[patient('p','2026-01-01')]});
  errors.siting_sessions={message:'read failed'};
  await assert.rejects(c.metricCompareEnsureData([2026]),/Could not read sitings/);
  assert.equal(c.state().data.sitings,undefined);
  await c.renderPeriodTotals('totals',2026,'09',[],[]);
  assert.equal(c.document.querySelector('[onclick*="sitings"] .k-value').textContent,'—');
  errors.appointments={message:'appointment read failed'};
  await c.renderPeriodTotals('totals',2026,'09',[]);
  assert.match(c.document.getElementById('totals').textContent,/Could not read appointments/);
  errors.patients={message:'partial registry'};
  await c.renderStomaFormationTable('formations',2026);
  assert.match(c.document.getElementById('formations').textContent,/Could not read the registry/);
  vm.runInContext(source('renderMetricCompare'),c);c.state().metric='sitings';c.state().periods=[period('09')];
  await c.renderMetricCompare();
  assert.match(c.document.getElementById('mc-body').textContent,/Could not read sitings/);
  delete errors.siting_sessions;delete errors.patients;delete errors.appointments;
  const repaired=await c.metricCompareEnsureData([2026]);assert.equal(repaired.sitings.length,0);
});

test('a slower comparison read cannot repaint an older month of the same metric',async()=>{
  const {c,d}=context({patients:[patient('p','2026-01-01')],appts:[{patient_id:'p',appt_date:'2026-09-01',status:'attended'},
    {patient_id:'p',appt_date:'2026-10-01',status:'attended'},{patient_id:'p',appt_date:'2026-10-02',status:'attended'}]});
  const resolve=[];c.metricCompareEnsureData=()=>new Promise(r=>resolve.push(r));
  vm.runInContext(source('renderMetricCompare'),c);c.state().metric='appointments';c.state().periods=[period('09')];
  const old=c.renderMetricCompare();c.state().periods=[period('10')];const latest=c.renderMetricCompare();
  resolve[1](d);await latest;resolve[0](d);await old;
  assert.match(c.document.querySelector('.mc-stat-h').textContent,/Oct 2026/);
  assert.equal(c.document.querySelector('.mc-stat-big').textContent,'2');
});
