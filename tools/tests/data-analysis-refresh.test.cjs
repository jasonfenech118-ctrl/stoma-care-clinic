const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const source=html.slice(html.indexOf('let dataAnalysisLoadVersion='),html.indexOf('function setDaYears('));
function setup(){
  const dom=new JSDOM('<div id="app"></div><div id="da-body">Previous results</div><div id="mo"><div id="mb"></div></div>');
  const c={document:dom.window.document,console:{warn(){}},htmlSafe:v=>String(v),currentTabName:()=> 'data-analysis',dataAnalysisRows:[],derivedFollowupStatus:p=>p.followup_status,
    renderDataAnalysis:()=>{},incompleteListState:{kind:'all',value:''},openIncompleteList:()=>{}};
  vm.createContext(c);vm.runInContext(source,c);return {c,dom};
}
test('fresh patient data replaces the previous completeness results',async()=>{
  const {c,dom}=setup();let complete=false,shown;
  c.fetchAllStomaPatients=async()=>({rows:[{id:'p1',first_name:'Test',locality:complete?'Mosta':null}],error:null});
  c.renderDataAnalysis=()=>{shown=c.dataAnalysisRows.filter(p=>!p.locality).length;};
  await c.loadDataAnalysis();assert.equal(shown,1);complete=true;
  await c.loadDataAnalysis({background:true});assert.equal(shown,0);dom.window.close();
});
test('an older, slower read cannot overwrite a newer refresh',async()=>{
  const {c,dom}=setup();let resolveOld;
  c.fetchAllStomaPatients=()=>new Promise(resolve=>resolveOld=resolve);
  const old=c.loadDataAnalysis();c.fetchAllStomaPatients=async()=>({rows:[{id:'new'}]});
  await c.loadDataAnalysis();resolveOld({rows:[{id:'stale'}]});await old;
  assert.equal(c.dataAnalysisRows[0].id,'new');dom.window.close();
});
test('open incomplete list refreshes its results and keeps the scroll position',async()=>{
  const {c,dom}=setup();const mo=c.document.getElementById('mo');mo.classList.add('open');
  c.document.getElementById('mb').innerHTML='<span id="da-incomplete-list"></span><div class="inc-list-scroll"></div>';
  c.document.querySelector('.inc-list-scroll').scrollTop=80;
  let refreshed=0;c.openIncompleteList=()=>{refreshed++;c.document.querySelector('.inc-list-scroll').scrollTop=0;};
  c.fetchAllStomaPatients=async()=>({rows:[]});await c.loadDataAnalysis({background:true});
  assert.equal(refreshed,1);assert.equal(c.document.querySelector('.inc-list-scroll').scrollTop,80);
  c.document.getElementById('mb').innerHTML='<input id="patient-edit">';
  await c.loadDataAnalysis({background:true});assert.equal(refreshed,1);dom.window.close();
});
test('a failed background read keeps the last good totals',async()=>{
  const {c,dom}=setup();c.dataAnalysisRows=[{id:'last-good'}];
  c.fetchAllStomaPatients=async()=>({error:{message:'offline'}});
  await c.loadDataAnalysis({background:true});assert.equal(c.dataAnalysisRows[0].id,'last-good');
  assert.equal(c.document.getElementById('da-body').textContent,'Previous results');dom.window.close();
});
