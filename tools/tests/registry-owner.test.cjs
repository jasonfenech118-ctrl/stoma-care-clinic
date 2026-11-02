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
    function patientNameAvatarHTML(p,nm,meta){return nm+(meta||'');} function extraStatusChipsHTML(){return '';} function docStatusBadgeHTML(){return '';}
    function registrySurgeryDate(p){return p.surgery_date||'';} function registryStomaType(p){return p.stoma_type||'';}
    function _d(s){var d=new Date(String(s||'').slice(0,10)+'T00:00:00Z');return isNaN(d.getTime())?null:d;}
    function ageYearsBetween(a,b){a=_d(a);b=_d(b);if(!a||!b)return null;var y=b.getUTCFullYear()-a.getUTCFullYear();var m=b.getUTCMonth()-a.getUTCMonth();if(m<0||(m===0&&b.getUTCDate()<a.getUTCDate()))y--;return y>=0?y:null;}
    function daysBetween(a,b){a=_d(a);b=_d(b);if(!a||!b)return null;var d=Math.round((b-a)/86400000);return d>=0?d:null;}
    function ageCellHTML(y){return y==null?'<span class="pd-dash">—</span>':htmlSafe(String(y));}
    function daysCellHTML(d){return d==null?'<span class="pd-dash">—</span>':htmlSafe(String(d));}
    function padNumKey(n){return n==null?'':String(n).padStart(7,'0');}`);
  w.eval(between('const PD_CLOSED_STATUSES=','function renderPatientDirectorySummary(')+fn('renderPatientDirectorySummary')+'\nvar pdPage=0,pdLastKey="",pdIncompleteOnly=false,pdSort={col:"name",type:"text",dir:"asc"};const PD_PAGE_SIZE=100;'+fn('patientSortValue')+fn('comparePatients')+fn('pdSortableTh')+fn('setPatientSort')+fn('pageSlice')+fn('renderPager')+fn('renderPatientDirectory'));
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

test('the Incomplete profile filter shows incomplete patients across every status',t=>{
  const w=setup(t);
  // Mark a reversed (3) and a deceased (4) patient incomplete; the actives are complete.
  w.eval("patientIsIncomplete=function(p){return p.id==='3'||p.id==='4';};pdIncompleteOnly=true;");
  w.renderPatientDirectory();
  assert.deepEqual(ids(w).sort(),['3','4'],'incomplete reversed and deceased both show, complete actives hidden');
});

test('clicking a column header sorts the directory, toggling ascending/descending',t=>{
  const w=setup(t);
  w.eval("patientDirectoryRows=[{id:'a',surname:'X',first_name:'1',status:'active',date_of_birth:'1950-01-01',types:[]},{id:'b',surname:'Y',first_name:'2',status:'active',date_of_birth:'1930-05-05',types:[]},{id:'c',surname:'Z',first_name:'3',status:'active',date_of_birth:'1970-09-09',types:[]}];");
  w.renderPatientDirectory();assert.deepEqual(ids(w),['a','b','c'],'default sort is by name');
  w.setPatientSort('date_of_birth','date');assert.deepEqual(ids(w),['b','a','c'],'ascending DOB = oldest first');
  w.setPatientSort('date_of_birth','date');assert.deepEqual(ids(w),['c','a','b'],'second click flips to descending');
});

test('the Reversed view drops Op/Findings/Actions and shows ages + stoma-days',t=>{
  const w=setup(t);
  w.eval("patientDirectoryRows=[{id:'r',surname:'A',first_name:'B',status:'reversed',date_of_birth:'1950-01-01',surgery_date:'2020-01-01',reversal_date:'2021-01-01',types:[]}];");
  w.document.getElementById('pd-status').value='reversed';w.renderPatientDirectory();
  const head=w.document.querySelector('#pd-table thead tr').textContent;
  assert.match(head,/Age at stoma/);assert.match(head,/Age at reversal/);assert.match(head,/Stoma days/);assert.match(head,/Deceased Date/);
  assert.doesNotMatch(head,/Operation Performed/);assert.doesNotMatch(head,/Findings/);assert.doesNotMatch(head,/Actions/);
  const cells=[...w.document.querySelectorAll('#pd-tbody tr.pd-click-row td')].map(td=>td.textContent.trim());
  assert.equal(cells[3],'70','age at stoma formation 1950→2020 = 70');
  assert.equal(cells[7],'71','age at reversal 1950→2021 = 71');
  assert.equal(cells[8],'366','stoma days 2020→2021 = 366 (leap year)');
});

test('a reversed patient with a deceased date is marked (✝) but stays in the Reversed list',t=>{
  const w=setup(t);
  w.eval("patientDirectoryRows=[{id:'r',surname:'A',first_name:'B',status:'reversed',reversed_deceased_date:'2024-05-01',date_of_birth:'1950-01-01',surgery_date:'2020-01-01',reversal_date:'2021-01-01'}];");
  w.document.getElementById('pd-status').value='reversed';w.renderPatientDirectory();
  const row=w.document.querySelector('#pd-tbody tr.pd-click-row');
  assert.ok(row.className.includes('pd-reversed-rip'),'row flagged reversed-deceased');
  assert.ok(row.className.includes('pd-row-reversed'),'still a reversed row');
  assert.match(row.innerHTML,/pd-rip-cross/,'shows the ✝ cross');
  assert.match(row.innerHTML,/openReversedDeceasedDate\('r'\)/,'has the deceased-date button');
});

test('a reversed patient with no deceased date shows a Set button and no cross',t=>{
  const w=setup(t);
  w.eval("patientDirectoryRows=[{id:'r',surname:'A',first_name:'B',status:'reversed',date_of_birth:'1950-01-01',surgery_date:'2020-01-01',reversal_date:'2021-01-01'}];");
  w.document.getElementById('pd-status').value='reversed';w.renderPatientDirectory();
  const row=w.document.querySelector('#pd-tbody tr.pd-click-row');
  assert.ok(!row.className.includes('pd-reversed-rip'));
  assert.doesNotMatch(row.innerHTML,/pd-rip-cross/);
  assert.match(row.innerHTML,/openReversedDeceasedDate\('r'\)/,'still has the set button');
});
