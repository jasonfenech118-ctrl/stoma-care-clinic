// Audit Trail: every patient create / edit / delete is logged (who, when, what),
// and the tab reads it newest-first with a filter and a search.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;');
const slice=(a,b)=>{const i=html.indexOf(a);assert.ok(i>=0,a);const j=html.indexOf(b,i);assert.ok(j>=0,b);return html.slice(i,j);};
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
// The whole audit helper block (constants + patientAuditFields + logAudit + auditPatientWrite).
const auditBlock=html.slice(html.indexOf('const AUDIT_STAMP_COLS=new Set'),html.indexOf('\n}',html.indexOf('function auditPatientWrite('))+2);

function ctx(extra={}){
  const c=vm.createContext({console,Date,Set,Map,Number,String,Math,Array,Object,JSON,htmlSafe:esc,...extra});
  return c;
}

test('patientAuditFields lists real edits only — stamp and dropped columns are left out, objects summarised', ()=>{
  const c=ctx();vm.runInContext(auditBlock.replace('async function logAudit','logStub;async function logAudit').replace('logStub;',''),c);
  const fields=c.patientAuditFields({phone_number:'79000000',locality:'Mosta',updated_at:'x',updated_by:'y',initial_stomas:[{a:1}],findings:null},['locality']);
  // locality was dropped; updated_at/updated_by are stamp cols → excluded.
  assert.deepEqual(plain(fields).map(f=>f.label),['Phone','Stomas','Findings']);
  assert.equal(fields.find(f=>f.label==='Stomas').value,'(updated)');
  assert.equal(fields.find(f=>f.label==='Findings').value,'(cleared)');
});

test('auditPatientWrite logs a create / edit / delete, but skips a pure signature-stamp write', ()=>{
  const logged=[];
  const c=ctx({getCurrentUserForAudit:async()=>({email:'x'}),attDisplayName:()=>'N'});
  vm.runInContext(auditBlock,c);
  c.logAudit=e=>{logged.push(e);};   // capture instead of inserting
  c.auditPatientWrite('create','p1',{first_name:'Mary',surname:'Borg',id_card:'7M'},[]);
  c.auditPatientWrite('update','p1',{phone_number:'7900',locality:'Mosta'},[]);
  c.auditPatientWrite('update','p1',{updated_at:'t',updated_by:'N'},[]); // stamp only → no line
  assert.equal(logged.length,2);
  assert.equal(logged[0].action,'create');assert.equal(logged[0].summary,'Added patient');assert.equal(logged[0].patient_name,'Mary Borg');
  assert.equal(logged[1].summary,'Edited Phone, Locality');assert.deepEqual(plain(logged[1].details.fields).map(f=>f.label),['Phone','Locality']);
});

test('the central write helpers log on success and never on error', async ()=>{
  const c=ctx();let err=null;const calls=[];
  c.SB={from:()=>({update:()=>({eq:async()=>({error:err})}),insert:()=>({select:()=>({single:async()=>({data:err?null:{id:'new'},error:err})})})})};
  c.missingColumnFromError=()=>'';c.auditPatientWrite=(...a)=>calls.push(a);
  vm.runInContext(fn('updatePatientTolerant')+'\n'+fn('insertPatientTolerant'),c);
  await c.updatePatientTolerant('p1',{phone_number:'1'});
  await c.insertPatientTolerant({first_name:'A',surname:'B'});
  assert.deepEqual(calls.map(x=>x[0]),['update','create']);
  assert.equal(calls[1][1],'new');          // the new id is logged on create
  // On error nothing is logged.
  err={message:'boom'};calls.length=0;
  await c.updatePatientTolerant('p1',{phone_number:'1'});
  assert.equal(calls.length,0);
});

function tab(rows){
  const dom=new JSDOM('<div id="audit-filters"><button class="pd-qf active" data-af="all"></button><button class="pd-qf" data-af="update"></button><button class="pd-qf" data-af="delete"></button></div><input id="audit-search"/><span id="audit-count"></span><div id="audit-body"></div>',{runScripts:'outside-only'});
  const w=dom.window;
  Object.assign(w,{htmlSafe:esc,jsSafe:v=>String(v??''),fmtShortDate:d=>d,emptyStateHTML:(i,t)=>`<p>${t}</p>`,openPatientRecord:()=>{}});
  const block=html.slice(html.indexOf('let auditRows=[]'),html.indexOf('\n}',html.indexOf('async function deleteAuditMonth('))+2);
  w.eval(block.replace('let auditRows=[]','var auditRows=[]'));
  w.auditRows=rows;w.auditNamesById={p2:'Resolved Name'};
  return w;
}
test('the tab shows newest changes with a filter and a search; edits list the fields that changed', ()=>{
  const rows=[
    {at:'2026-10-08T10:43:00Z',actor:'Jason Fenech',action:'update',patient_id:'p1',patient_name:'Stephen Fava',summary:'Edited Phone, Locality',details:{fields:[{label:'Phone',value:'7900'},{label:'Locality',value:'Mosta'}]}},
    {at:'2026-10-08T09:00:00Z',actor:'Lorraine Stivala',action:'create',patient_id:'p2',patient_name:'',summary:'Added patient'},
    {at:'2026-10-07T16:00:00Z',actor:'Jason Fenech',action:'delete',patient_id:'p3',patient_name:'Old Record',summary:'Deleted patient'},
  ];
  const w=tab(rows);w.renderAuditTrail();
  const body=w.document.getElementById('audit-body');
  assert.equal(body.querySelectorAll('tbody tr').length,3);
  assert.match(body.textContent,/Stephen Fava/);assert.match(body.textContent,/Phone/);assert.match(body.textContent,/Mosta/);
  // A missing name is resolved from the lookup; a create row links to the record.
  assert.match(body.textContent,/Resolved Name/);
  assert.match(w.document.getElementById('audit-count').textContent,/3 shown of 3/);
  // Filter to deletes.
  w.setAuditFilter('delete');
  assert.equal(body.querySelectorAll('tbody tr').length,1);
  assert.match(body.textContent,/Old Record/);assert.doesNotMatch(body.textContent,/Stephen Fava/);
  // Search within all.
  w.setAuditFilter('all');w.document.getElementById('audit-search').value='lorraine';w.renderAuditTrail();
  assert.equal(body.querySelectorAll('tbody tr').length,1);assert.match(body.textContent,/Resolved Name/);
});

test('logRoster records a roster change (duty / overtime / leave) under the roster entity', ()=>{
  const logged=[];
  const c=ctx();vm.runInContext(auditBlock,c);c.logAudit=e=>logged.push(e);
  // logRoster lives just above auditPatientWrite in the same block.
  c.logRoster('create','Jason Fenech','Overtime — Jason Fenech: 16:00–20:00 on 8 Oct 2026',{kind:'core OT'});
  assert.equal(logged.length,1);
  assert.equal(logged[0].entity,'roster');
  assert.equal(logged[0].patient_name,'Jason Fenech');
  assert.equal(logged[0].patient_id,'');
  assert.match(logged[0].summary,/Overtime — Jason Fenech/);
});

test('a roster row shows a Roster tag, its subject and summary, and does not link to a patient', ()=>{
  const w=tab([{at:'2026-10-08T08:00:00Z',actor:'Jason Fenech',action:'create',entity:'roster',patient_id:'',patient_name:'Tracey Galea',summary:'Overtime — Tracey Galea: 07:00–18:00 on 8 Oct 2026'}]);
  w.renderAuditTrail();
  const tr=w.document.querySelector('tbody tr');
  assert.match(tr.textContent,/Roster/);assert.match(tr.textContent,/Tracey Galea/);assert.match(tr.textContent,/Overtime/);
  assert.equal(tr.getAttribute('onclick'),null,'roster rows are not click-through to a patient');
});

function monthTab(){
  const dom=new JSDOM('<div id="audit-filters"><button class="pd-qf active" data-af="all"></button></div><select id="audit-month"></select><button id="audit-del-month" style="display:none"></button><input id="audit-search"/><span id="audit-count"></span><div id="audit-body"></div>',{runScripts:'outside-only'});
  const w=dom.window;
  Object.assign(w,{htmlSafe:esc,jsSafe:v=>String(v??''),fmtShortDate:d=>d,emptyStateHTML:(i,t)=>`<p>${t}</p>`,openPatientRecord:()=>{},confirm:()=>true,alert:m=>{w.__alert=m;}});
  const block=html.slice(html.indexOf('let auditRows=[]'),html.indexOf('\n}',html.indexOf('async function deleteAuditMonth('))+2);
  w.eval(block.replace('let auditRows=[]','var auditRows=[]'));
  return w;
}
test('the month picker is populated and the Delete button only shows for a chosen month', ()=>{
  const w=monthTab();
  w.auditMonths=['2026-10','2026-09','2026-08'];
  w.auditRows=[{at:'2026-10-08T08:00:00Z',actor:'A',action:'create',patient_name:'X',summary:'Added patient'}];
  w.auditMonth='all';w.renderAuditTrail();
  assert.deepEqual([...w.document.querySelectorAll('#audit-month option')].map(o=>o.value),['all','2026-10','2026-09','2026-08']);
  assert.equal([...w.document.querySelectorAll('#audit-month option')].find(o=>o.value==='2026-09').textContent,'September 2026');
  assert.equal(w.document.getElementById('audit-del-month').style.display,'none');
  w.auditMonth='2026-09';w.renderAuditTrail();
  assert.notEqual(w.document.getElementById('audit-del-month').style.display,'none');
});
test('Delete this month clears exactly that month on the server, after a confirmation', async ()=>{
  const w=monthTab();const calls=[];
  w.SB={from:t=>({delete:()=>({gte:(k,v)=>({lt:(k2,v2)=>{calls.push([t,v,v2]);return Promise.resolve({error:null});}})})})};
  w.loadAuditTrail=()=>{w.__reloaded=true;};
  w.auditMonth='2026-09';
  await w.deleteAuditMonth();
  assert.deepEqual(calls,[['audit_log','2026-09-01','2026-10-01']]);
  assert.equal(w.auditMonth,'all');assert.equal(w.__reloaded,true);
  // December rolls into next January.
  w.auditMonth='2026-12';calls.length=0;await w.deleteAuditMonth();
  assert.deepEqual(calls,[['audit_log','2026-12-01','2027-01-01']]);
});

test('a whole year is its own scope — labelled as a year and spanning Jan-to-Jan', ()=>{
  const w=monthTab();
  assert.equal(w.auditScopeKind('all'),'all');
  assert.equal(w.auditScopeKind('2026'),'year');
  assert.equal(w.auditScopeKind('2026-09'),'month');
  assert.equal(w.auditMonthLabel('2026'),'2026 — whole year');
  assert.deepEqual(plain(w.auditMonthRange('2026')),{start:'2026-01-01',end:'2027-01-01'});
});
test('Delete this year clears the whole calendar year on the server', async ()=>{
  const w=monthTab();const calls=[];
  w.SB={from:t=>({delete:()=>({gte:(k,v)=>({lt:(k2,v2)=>{calls.push([t,v,v2]);return Promise.resolve({error:null});}})})})};
  w.loadAuditTrail=()=>{w.__reloaded=true;};
  w.auditMonth='2026';
  await w.deleteAuditMonth();
  assert.deepEqual(calls,[['audit_log','2026-01-01','2027-01-01']]);
  assert.equal(w.auditMonth,'all');assert.equal(w.__reloaded,true);
});
test('the picker offers each year as a whole, above its own months', async ()=>{
  // loadAuditTrail reads the first and last recorded change, then lists every
  // month between them with a "whole year" entry before each year's months.
  const w=monthTab();
  w.SB={from:()=>{
    const q={_asc:false};
    q.select=()=>q; q.order=(k,o)=>{q._asc=!!(o&&o.ascending);return q;};
    q.gte=()=>q; q.lt=()=>q; q.in=()=>Promise.resolve({data:[]});
    q.limit=n=>n===1?Promise.resolve({data:[{at:q._asc?'2025-11-10T08:00:00Z':'2026-02-03T08:00:00Z'}]})
                     :Promise.resolve({data:[{id:'x',at:'2026-02-03T08:00:00Z',actor:'A',action:'create',patient_name:'X',summary:'Added patient'}],error:null});
    return q;
  }};
  await w.loadAuditTrail();
  assert.deepEqual(plain(w.auditMonths),['2026','2026-02','2026-01','2025','2025-12','2025-11']);
  assert.deepEqual([...w.document.querySelectorAll('#audit-month option')].map(o=>o.value),
    ['all','2026','2026-02','2026-01','2025','2025-12','2025-11']);
  assert.equal([...w.document.querySelectorAll('#audit-month option')].find(o=>o.value==='2025').textContent,'2025 — whole year');
});
test('each entry can be deleted on its own — a hard delete by id, gone from the view', async ()=>{
  const w=monthTab();const calls=[];
  w.SB={from:t=>({delete:()=>({eq:(k,v)=>{calls.push([t,k,v]);return Promise.resolve({error:null});}})})};
  w.auditRows=[{id:'a1',at:'2026-10-08T08:00:00Z',actor:'A',action:'create',patient_name:'X',summary:'Added patient'},
               {id:'a2',at:'2026-10-08T09:00:00Z',actor:'B',action:'update',patient_name:'Y',summary:'Edited Phone'}];
  await w.deleteAuditEntry('a1');
  assert.deepEqual(calls,[['audit_log','id','a1']]);     // exactly that one row, by id
  assert.deepEqual(w.auditRows.map(r=>r.id),['a2']);     // dropped from the in-memory view
});
test('every row offers a single-entry delete, but only when the line has an id', ()=>{
  const w=tab([
    {id:'a1',at:'2026-10-08T10:00:00Z',actor:'A',action:'update',patient_id:'p1',patient_name:'Stephen Fava',summary:'Edited Phone'},
    {at:'2026-10-07T10:00:00Z',actor:'A',action:'create',patient_id:'p2',patient_name:'No Id',summary:'Added patient'}]);
  w.renderAuditTrail();
  const btns=[...w.document.querySelectorAll('.audit-del')];
  assert.equal(btns.length,1);
  assert.match(btns[0].getAttribute('onclick'),/deleteAuditEntry\('a1'\)/);
  // The per-row delete must not also trigger the row's open-record click.
  assert.match(btns[0].getAttribute('onclick'),/stopPropagation/);
});
