// Patient Registry: an owner's view is their live caseload, with matching tiles.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function setup(t){
  const dom=new JSDOM(`<div id="pd-summary"></div><select id="pd-owner"><option value="all">All owners</option></select><select id="pd-status"><option value="all">All</option><option value="reversed">Reversed</option></select>
    <input id="pd-search"/><span id="pd-count"></span><div id="pd-setup-note"></div><table id="pd-table"><thead><tr></tr></thead><tbody id="pd-tbody"></tbody></table><div id="pd-pager"></div>`,{runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;
  w.eval(`var FOLLOWUP_OWNERS=['Common','Jacqueline','Jason','Lorraine','Tracey'];var pdShowArchived=false,patientDatesAvailable=true;
    function annualKpi(label,value,sub){return '<div class="kpi" data-label="'+label+'"><b>'+value+'</b><i>'+sub+'</i></div>';}
    function patientStomaList(p){return (p.types||[]).map(type=>({type}));}
    function patientEverReversed(p){return p.status==='reversed';} function patientsMarkedOtherButDeceased(){return [];}
    function patientIsIncomplete(){return false;} function isClosedFollowupStatus(){return false;} function fixText(x){return x;}
    function htmlSafe(x){return String(x??'');} function jsSafe(x){return String(x??'');} function fmtShortDate(x){return x||'';}
    function patientNameAvatarHTML(p,nm){return nm;} function extraStatusChipsHTML(){return '';}
    function registrySurgeryDate(p){return p.surgery_date||'';} function registryStomaType(p){return p.stoma_type||'';}`);
  w.eval(between('const PD_CLOSED_STATUSES=','function renderPatientDirectorySummary(')+fn('renderPatientDirectorySummary')+'\nvar pdPage=0,pdLastKey="";const PD_PAGE_SIZE=100;'+fn('pageSlice')+fn('renderPager')+fn('renderPatientDirectory'));
  w.eval(`var patientDirectoryRows=[
    {id:'1',surname:'A',owner:'Jason',status:'active',types:['End colostomy']},
    {id:'2',surname:'B',owner:'Jason',status:'active',types:['Loop ileostomy','Urostomy (ileal conduit)']},
    {id:'3',surname:'C',owner:'Jason',status:'reversed',types:['Loop ileostomy']},
    {id:'4',surname:'D',owner:'Jason',status:'deceased',types:['End colostomy']},
    {id:'5',surname:'E',owner:'Jason',status:'paused',types:['End - Colostomy']},
    {id:'6',surname:'F',owner:'Jason',status:'discharged_gozo',types:[]},
    {id:'7',surname:'G',owner:'Common',status:'active',types:['End ileostomy']}];`);
  return w;
}
const tiles=w=>Object.fromEntries([...w.document.querySelectorAll('#pd-summary .kpi')].map(k=>[k.dataset.label,Number(k.querySelector('b').textContent)]));
const ids=w=>[...w.document.querySelectorAll('#pd-tbody tr.pd-click-row')].map(r=>(r.getAttribute('onclick').match(/'([^']+)'/)||[])[1]);

test('All owners is the master list, with colostomy, ileostomy and urostomy tiles',t=>{
  const w=setup(t);w.renderPatientDirectory();
  const k=tiles(w);assert.equal(k['Total Patients'],7);assert.equal(k.Reversed,1);assert.equal(k.Deceased,1);
  assert.equal(k.Colostomies,3);assert.equal(k.Ileostomies,3);assert.equal(k.Urostomies,1);
  assert.equal(ids(w).length,7);
});

test('an owner shows only their live caseload, and every top number follows it',t=>{
  const w=setup(t);const sel=w.document.getElementById('pd-owner');sel.innerHTML+='<option value="Jason">Jason</option>';sel.value='Jason';
  w.renderPatientDirectory();
  assert.deepEqual(ids(w),['1','2','5'],'reversed, deceased and Gozo are hidden under the owner');
  const k=tiles(w);assert.deepEqual(k,{'Total Patients':3,Active:2,'Paused / awaiting':1,Colostomies:2,Ileostomies:1,Urostomies:1});
  w.document.getElementById('pd-status').value='reversed';w.renderPatientDirectory();assert.deepEqual(ids(w),['3'],'a closed status can still be chosen on purpose');
  sel.value='all';w.document.getElementById('pd-status').value='all';w.renderPatientDirectory();assert.equal(tiles(w)['Total Patients'],7);
});
