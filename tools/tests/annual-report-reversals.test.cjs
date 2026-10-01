const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){
  const match=html.match(new RegExp('(?:async )?function '+name+'\\('));assert.ok(match,name);
  return html.slice(match.index,html.indexOf('\n}',match.index)+2);
}
function context(){
  const dom=new JSDOM('<body><div id="totals"></div></body>');
  const c=vm.createContext({document:dom.window.document,Date,Map,Set,console,TODAY:'2026-10-01',
    initialStomaCode:s=>s,fmtShortDate:s=>s,htmlSafe:s=>String(s??''),normaliseFollowupStatus:s=>s||'active',
    monthEndDate:(y,m)=>`${y}-${m}-${new Date(Number(y),Number(m),0).getDate()}`,
    followupMonthName:m=>new Date(2026,Number(m)-1,1).toLocaleString('en',{month:'long'}),pct:(a,b)=>b?Math.round(a/b*100):0,
    SB:{from:()=>({select:async()=>({count:7,error:null})})},fetchAllRows:async()=>({rows:[],error:null})});
  const start=html.indexOf('const DA_STOMA_GROUPS=[');vm.runInContext(html.slice(start,html.indexOf('\n];',start)+3),c);
  for(const name of ['parseStomas','parseRefashionings','parseInitialStomas','stomaOperationHistory','patientStomaList','daStomaGroup',
    'stomaEvents','stomaEndDates','metricNewReversalDates','stomaReversalEntries','metricMonthly','metricIsDead',
    'metricPeriodTotal','metricPeriodRecords','renderPeriodTotals'])vm.runInContext(source(name),c);
  vm.runInContext('let periodTotalsRequest=0;',c);return c;
}
const patient=(id,formed,reversed,extra={})=>({id,stoma_type:'Loop ileostomy',surgery_date:formed,reversal_date:reversed,
  initial_stomas:[],extra_stomas:[],extra_refashionings:[],stoma_operation_history:[],...extra});
const septemberPatients=()=>[
  ...Array.from({length:5},(_,i)=>patient('this-year-'+i,`2026-0${i+1}-12`,`2026-09-${17+i}`)),
  patient('older-1','2025-12-11','2026-09-17'),patient('older-2','2025-09-03','2026-09-03')
];
const dataset=patients=>({patients,appts:[],fuType:{}});

test('September Reversals tile includes five stomas formed earlier in the report year',async()=>{
  const c=context();await c.renderPeriodTotals('totals',2026,'09',septemberPatients(),[]);
  const tile=c.document.querySelector('[onclick*="reversals_new"]');
  assert.equal(tile.querySelector('.k-value').textContent,'5');
  assert.match(tile.querySelector('.k-sub').textContent,/formed in 2026/);
  assert.match(tile.querySelector('.k-sub').textContent,/reversed in September 2026/);
});

test('monthly chart, period total and patient list use the same report-year cohort',()=>{
  const c=context(),d=dataset(septemberPatients()),monthly=c.metricMonthly('reversals_new',2026,d);
  assert.equal(monthly[8],5);
  for(let m=1;m<=12;m++){
    const period={year:2026,month:String(m).padStart(2,'0')};
    assert.equal(c.metricPeriodTotal('reversals_new',period,d,monthly),monthly[m-1]);
    assert.equal(c.metricPeriodRecords('reversals_new',period,d).length,monthly[m-1]);
  }
  assert.equal(c.metricPeriodTotal('reversals_new',{year:2026,month:''},d,monthly),monthly.reduce((a,b)=>a+b,0));
  assert.equal(c.metricMonthly('reversals',2026,d)[8],7);
});

test('later stomas count by their own formation date and duplicate closure entries count once',()=>{
  const c=context(),p=patient('multi','2026-01-01','2026-09-22',{
    initial_stomas:[{uid:'same-operation',type:'Loop ileostomy',reversal_date:'2026-09-22'}],
    extra_stomas:[{uid:'later-stoma',type:'End colostomy',formed_date:'2026-08-01',reversal_date:'2026-09-25'}]
  }),before=JSON.stringify(p),d=dataset([p]),monthly=c.metricMonthly('reversals_new',2026,d);
  assert.equal(monthly[8],2);
  assert.equal(c.metricPeriodRecords('reversals_new',{year:2026,month:'09'},d).length,2);
  assert.equal(JSON.stringify(p),before);
});

test('reversal month uses the closure date while formation year and unknown dates remain respected',()=>{
  const c=context(),d=dataset([
    patient('september-formation','2026-09-01','2026-10-01'),
    patient('older-formation','2025-12-31','2026-09-01'),
    patient('unknown-date','2026-01-01',null,{followup_status:'reversed'}),
    patient('urostomy','2026-01-01','2026-09-01',{stoma_type:'Urostomy'}),
    patient('later-deceased','2026-02-01','2026-09-15',{followup_status:'deceased',deceased_date:'2026-10-01'})
  ]),monthly=c.metricMonthly('reversals_new',2026,d);
  assert.equal(monthly[8],1);assert.equal(monthly[9],1);
  assert.equal(c.metricPeriodTotal('reversals_new',{year:2026,month:'09'},d,monthly),1);
  assert.equal(c.metricPeriodRecords('reversals_new',{year:2026,month:'09'},d)[0].p.id,'later-deceased');
  assert.equal(c.metricPeriodTotal('reversals_new',{year:2026,month:''},d,monthly),2);
});
