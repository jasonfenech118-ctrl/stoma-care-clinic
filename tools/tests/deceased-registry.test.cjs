const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../../assets/deceased-registry.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const dead=(id,date='2026-10-01',extra={})=>({id,first_name:'Test',surname:'Patient '+id,id_card:'TEST-'+id,followup_status:'deceased',deceased_date:date,...extra});
function setup(t,patients){
  const dom=new JSDOM('<div id="pd-deceased-controls" hidden></div><table id="pd-table"><thead><tr></tr></thead><tbody id="pd-tbody"></tbody></table><div id="pd-pager"></div>',{runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;
  const tables={patients:structuredClone(patients),appointments:[],clinical_records:[],encounters:[],patient_communications:[],siting_sessions:[],siting_images:[],operations_no_stoma:[]};
  const writes=[],reads=[],downloads=[],audits=[],summaries=[],opened=[],faults={};let page;
  const db={from(table){
    let mode='read',payload,filters=[],columns='*',start=0,end=Infinity,order='id';
    const query={
      select(value){columns=value;return query;},eq(k,v){filters.push(r=>String(r[k])===String(v));return query;},in(k,values){filters.push(r=>values.map(String).includes(String(r[k])));return query;},
      order(key){order=key;return query;},range(a,b){start=a;end=b;return query;},update(value){mode='update';payload=value;return query;},delete(){mode='delete';return query;},
      maybeSingle(){return execute(true);},then(resolve,reject){return execute(false).then(resolve,reject);}
    };
    async function execute(single){
      const log={table,mode,payload:payload&&structuredClone(payload),columns,start,end};
      (mode==='read'?reads:writes).push(log);
      const fault=faults[table+':'+mode];if(fault){const error=typeof fault==='function'?fault(log):fault;if(error)return {data:null,error};}
      if(!tables[table])return {data:null,error:{code:'42P01',message:'Table not installed'}};
      let rows=tables[table].filter(r=>filters.every(f=>f(r)));
      if(mode==='update')rows.forEach(r=>Object.assign(r,payload));
      if(mode==='delete')tables[table]=tables[table].filter(r=>!rows.includes(r));
      rows=rows.slice().sort((a,b)=>String(a[order]).localeCompare(String(b[order]))).slice(start,end+1);
      const result=rows.map(row=>columns==='*'?structuredClone(row):Object.fromEntries(columns.split(',').map(k=>[k,row[k]])));
      return {data:single?(result[0]||null):result,error:null};
    }
    return query;
  }};
  const isDeceased=p=>p.followup_status==='deceased'||!!p.deceased_date||(p.extra_statuses||[]).includes('deceased');
  const render=()=>w.DeceasedRegistry.render(structuredClone(tables.patients.filter(isDeceased)));
  w.confirm=()=>true;w.eval(source);
  w.DeceasedRegistry.configure({db:()=>db,isDeceased,formatDate:x=>x,avatar:(p,n)=>n.replace(/</g,'&lt;'),surgeryDate:p=>p.surgery_date,stomaType:p=>p.stoma_type,
    rerender:render,refresh:async()=>render(),pager:(total,size,n,onMove)=>{page={total,size,n,onMove};},openPatient:id=>opened.push(id),openHistory:()=>{},restore:()=>{},
    summary:(p,details)=>{summaries.push({id:p.id,details});return '<!DOCTYPE html><html><body>'+p.id+' '+details.photoCount+' photographs</body></html>';},audit:async event=>audits.push(event),auditName:async()=>'Test nurse',download:(html,filename)=>downloads.push({html,filename})});
  render();
  const click=selector=>{const element=w.document.querySelector(selector);assert.ok(element,selector);element.click();};
  const filter=(key,value)=>{const element=w.document.querySelector('[data-filter="'+key+'"]');element.value=value;element.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const count=()=>w.document.querySelector('.pd-deceased-selected').textContent;
  return {w,tables,writes,reads,downloads,audits,summaries,faults,opened,click,filter,count,render,page:()=>page};
}

test('deceased grouping uses death dates, newest first, and keeps undated/invalid deaths together',t=>{
  const x=setup(t,[dead('old','2025-10-01'),dead('new','2026-10-01'),dead('sep','2026-09-02'),dead('none',null),dead('invalid','2026-02-30'),{id:'active',followup_status:'active'}]);
  assert.deepEqual([...x.w.document.querySelectorAll('[data-group]')].map(e=>e.dataset.group),['2026-10','2026-09','2025-10','unknown']);
  assert.equal(x.w.document.querySelectorAll('[data-select]').length,5);
  x.filter('groupBy','year');assert.deepEqual([...x.w.document.querySelectorAll('[data-group]')].map(e=>e.dataset.group),['2026','2025','unknown']);
  x.filter('year','2026');x.filter('month','09');assert.equal(x.page().total,1);assert.ok(x.w.document.querySelector('[data-select="sep"]'));
  x.filter('month','unknown');assert.equal(x.page().total,2);
});

test('group and select-all checkboxes include patients beyond the current page; individual selection stays separate from navigation',t=>{
  const x=setup(t,Array.from({length:105},(_,i)=>dead('oct-'+String(i).padStart(3,'0'))).concat(dead('sep','2026-09-01')));
  assert.equal(x.w.document.querySelectorAll('[data-select]').length,100);
  x.click('[data-group="2026-10"]');assert.match(x.count(),/^105 selected/);assert.equal(x.opened.length,0);
  x.page().onMove(1);assert.equal(x.w.document.querySelectorAll('[data-select]:checked').length,5);
  x.click('[data-action="all"]');assert.match(x.count(),/^106 selected/);
  x.click('[data-action="clear"]');assert.match(x.count(),/^0 selected/);
  x.click('[data-select="sep"]');assert.match(x.count(),/^1 selected/);assert.equal(x.opened.length,0);
  x.click('[data-patient="sep"] td:nth-child(2)');assert.deepEqual(x.opened,['sep']);
});

test('year group selection and changed filters prune hidden patients and set mixed checkbox states',t=>{
  const x=setup(t,[dead('oct'),dead('sep','2026-09-01'),dead('old','2025-10-01')]);
  x.click('[data-select="oct"]');assert.equal(x.w.document.querySelector('[data-action="all"]').indeterminate,true);
  x.filter('groupBy','year');x.click('[data-group="2026"]');assert.match(x.count(),/^2 selected/);
  x.filter('month','09');assert.match(x.count(),/^1 selected/);
  x.filter('year','2025');assert.match(x.count(),/^0 selected/);assert.equal(x.w.document.querySelector('[data-action="export"]').disabled,true);
  x.w.DeceasedRegistry.hide();assert.equal(x.w.document.getElementById('pd-deceased-controls').hidden,true);
});

test('selection keeps keyboard focus, search/owner changes reset paging, and background export does not reopen a hidden deceased view',async t=>{
  const x=setup(t,Array.from({length:105},(_,i)=>dead('p'+i)));
  x.w.DeceasedRegistry.render(structuredClone(x.tables.patients),'owner-a');x.page().onMove(1);assert.equal(x.page().n,1);
  x.w.DeceasedRegistry.render(structuredClone(x.tables.patients),'owner-b');assert.equal(x.page().n,0);
  const checkbox=x.w.document.querySelector('[data-select]'),id=checkbox.dataset.select;checkbox.focus();checkbox.click();
  assert.equal(x.w.document.activeElement.dataset.select,id);
  x.faults['appointments:read']=()=>{x.w.DeceasedRegistry.hide();return null;};
  await x.w.DeceasedRegistry.exportSelected();assert.equal(x.downloads.length,1);assert.equal(x.w.document.getElementById('pd-deceased-controls').hidden,true);
});

test('HTML export saves only selected patients with full paginated records, revisions, communications, legacy sitings and safe photographs; it never writes',async t=>{
  const x=setup(t,[dead('selected',undefined,{first_name:'<script>bad()</script>',extra_stomas:[{type:'Test colostomy',findings:'<img onerror="bad()">'}]}),dead('excluded')]);
  x.tables.appointments=Array.from({length:405},(_,i)=>({id:'a'+String(i).padStart(3,'0'),patient_id:'selected',notes:'Visit '+i}));
  x.tables.appointments.push({id:'other',patient_id:'excluded',notes:'EXCLUDED-NOTE'});
  x.tables.encounters=[{id:'e1',patient_id:'selected',assessment:{versions:[{version:1,notes:'First assessment'},{version:2,notes:'Signed correction'}]}}];
  x.tables.patient_communications=[{id:'c1',patient_id:'selected',notes:'Community contact',corrections:[{notes:'Contact correction'}]}];
  x.tables.siting_sessions=[{id:'s1',patient_id:'selected',id_card:'TEST-selected',checklist:{notes:'Siting assessment'}},{id:'legacy',patient_id:null,id_card:'TEST-selected',notes:'Legacy siting'},{id:'wrong',patient_id:'excluded',id_card:'TEST-selected',notes:'WRONG-PATIENT'}];
  x.tables.siting_images=[{siting_id:'s1',image_data:'data:image/png;base64,aGVsbG8='},{siting_id:'legacy',image_data:'data:image/svg+xml,<svg onload="bad()">'},{siting_id:'wrong',image_data:'WRONG-IMAGE'}];
  x.click('[data-select="selected"]');await x.w.DeceasedRegistry.exportSelected();
  assert.equal(x.downloads.length,1);assert.equal(x.writes.length,0);
  const html=x.downloads[0].html,doc=new JSDOM(html).window.document;
  t.after(()=>doc.defaultView.close());
  assert.equal(doc.querySelectorAll('article').length,1);assert.equal(doc.querySelectorAll('script').length,0);assert.equal(doc.querySelectorAll('img').length,1);
  for(const text of ['Visit 404','Signed correction','First assessment','Community contact','Contact correction','Siting assessment','Legacy siting','Test colostomy'])assert.ok(doc.body.textContent.includes(text),text);
  assert.doesNotMatch(html,/EXCLUDED-NOTE|WRONG-PATIENT|WRONG-IMAGE/);assert.ok(doc.querySelector('meta[http-equiv="Content-Security-Policy"]'));
  assert.match(html,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);assert.ok(x.reads.some(r=>r.table==='appointments'&&r.start===400));
});

test('a read failure aborts HTML saving; absent optional tables are explicitly identified',async t=>{
  const x=setup(t,[dead('p')]);x.click('[data-action="all"]');
  x.faults['encounters:read']={code:'42501',message:'Permission denied'};await x.w.DeceasedRegistry.exportSelected();
  assert.equal(x.downloads.length,0);assert.match(x.w.document.querySelector('[role="status"]').textContent,/HTML was not saved.*Permission denied/);
  delete x.faults['encounters:read'];delete x.tables.encounters;await x.w.DeceasedRegistry.exportSelected();
  assert.equal(x.downloads.length,1);assert.match(x.downloads[0].html,/section was not available/);assert.equal(x.writes.length,0);
});

test('a changed death month still exports the full selected record, while a corrected active outcome blocks export',async t=>{
  const x=setup(t,[dead('p')]);x.filter('month','10');x.click('[data-action="all"]');
  x.tables.patients[0].deceased_date='2026-09-01';await x.w.DeceasedRegistry.exportSelected();assert.match(x.downloads[0].html,/September 2026/);assert.match(x.downloads[0].html,/Test Patient p/);
  x.tables.patients[0].deceased_date=null;x.tables.patients[0].followup_status='active';await x.w.DeceasedRegistry.exportSelected();
  assert.equal(x.downloads.length,1);assert.match(x.w.document.querySelector('[role="status"]').textContent,/no longer deceased/);
});

test('bulk minimisation saves each target summary before deleting only their photos; counts come from that patient',async t=>{
  const x=setup(t,[dead('a'),dead('b'),dead('other')]);
  x.tables.appointments=[{id:'a1',patient_id:'a'},{id:'b1',patient_id:'b'},{id:'b2',patient_id:'b'}];
  x.tables.clinical_records=[{id:'ep',patient_id:'b',kind:'episode'}];
  x.tables.siting_sessions=[{id:'s-a',patient_id:'a'},{id:'s-b',patient_id:'b'},{id:'s-other',patient_id:'other',id_card:'TEST-a'}];
  x.tables.siting_images=[{siting_id:'s-a',image_data:'a'},{siting_id:'s-b',image_data:'b'},{siting_id:'s-other',image_data:'other'}];
  x.click('[data-select="a"]');x.click('[data-select="b"]');await x.w.DeceasedRegistry.minimiseSelected();
  assert.deepEqual(x.tables.siting_images.map(r=>r.siting_id),['s-other']);
  assert.equal(x.tables.appointments.length,3);assert.equal(x.tables.clinical_records.length,1);assert.equal(x.tables.patients.length,3);
  assert.deepEqual(x.summaries.map(s=>[s.id,s.details.apptCount,s.details.episodeCount]),[['a',1,0],['b',2,1]]);
  assert.deepEqual(x.writes.map(w=>[w.table,w.mode]),[['patients','update'],['siting_images','delete'],['patients','update'],['patients','update'],['siting_images','delete'],['patients','update']]);
  assert.equal(x.writes[0].payload.minimised_at,null);assert.ok(x.tables.patients[0].minimised_at);assert.equal(x.tables.patients[2].minimised_at,undefined);
  assert.equal(x.audits.length,2);assert.match(x.count(),/^0 selected/);
});

test('cancelling or correcting the deceased status before confirmation performs no writes',async t=>{
  const x=setup(t,[dead('p')]);x.click('[data-action="all"]');x.w.confirm=()=>false;
  await x.w.DeceasedRegistry.minimiseSelected();assert.equal(x.writes.length,0);
  x.w.confirm=()=>{x.tables.patients[0].deceased_date=null;x.tables.patients[0].followup_status='active';return true;};
  await x.w.DeceasedRegistry.minimiseSelected();assert.equal(x.writes.length,0);assert.equal(x.audits.length,0);
});

test('missing archive columns prevent all photo deletion; failed photo deletion stays retryable',async t=>{
  const x=setup(t,[dead('p')]);x.tables.siting_sessions=[{id:'s',patient_id:'p'}];x.tables.siting_images=[{siting_id:'s',image_data:'photo'}];x.click('[data-action="all"]');
  x.faults['patients:update']={code:'42703',message:'minimised_at column does not exist'};
  await x.w.DeceasedRegistry.minimiseSelected();assert.equal(x.tables.siting_images.length,1);assert.equal(x.writes.filter(r=>r.mode==='delete').length,0);
  delete x.faults['patients:update'];x.faults['siting_images:delete']={message:'Connection failed'};
  await x.w.DeceasedRegistry.minimiseSelected();assert.equal(x.tables.siting_images.length,1);assert.equal(x.tables.patients[0].minimised_at,null);assert.ok(x.tables.patients[0].minimised_archive);assert.equal(x.audits.length,0);
  assert.match(x.count(),/^1 selected/);delete x.faults['siting_images:delete'];await x.w.DeceasedRegistry.minimiseSelected();
  assert.equal(x.tables.siting_images.length,0);assert.ok(x.tables.patients[0].minimised_at);assert.equal(x.audits.length,1);
});

test('a completion-stamp failure keeps the saved summary, audits removed photos, and retries without losing the original photo count',async t=>{
  const x=setup(t,[dead('p')]);x.tables.siting_sessions=[{id:'s',patient_id:'p'}];x.tables.siting_images=[{siting_id:'s',image_data:'photo'}];x.click('[data-action="all"]');
  x.faults['patients:update']=log=>log.payload.minimised_at?{message:'Stamp failed'}:null;
  await x.w.DeceasedRegistry.minimiseSelected();
  assert.equal(x.tables.siting_images.length,0);assert.equal(x.tables.patients[0].minimised_at,null);assert.match(x.tables.patients[0].minimised_archive,/1 photographs/);
  assert.equal(x.audits[0].details.completed,false);assert.match(x.count(),/^1 selected/);
  delete x.faults['patients:update'];await x.w.DeceasedRegistry.minimiseSelected();
  assert.ok(x.tables.patients[0].minimised_at);assert.match(x.tables.patients[0].minimised_archive,/1 photographs/);assert.equal(x.summaries.length,1);
});

test('the registry is integrated and the unminimised Overview no longer offers the action',()=>{
  assert.match(app,/id="pd-deceased-controls" hidden/);assert.match(app,/configureDeceasedRegistry\(\);window\.DeceasedRegistry\.render\(rows,pdKey\);return;/);
  const start=app.indexOf('function deceasedMinimiseCardHTML('),end=app.indexOf('function viewDeceasedArchive(',start),card=app.slice(start,end);
  assert.match(card,/!pat\.minimised_at\)return ''/);assert.doesNotMatch(card,/onclick="minimise/);
  assert.match(app,/fistula_category,minimised_at,minimised_by/);
});
