const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'../..');
const app=fs.readFileSync(path.join(root,'index.html'),'utf8');
const letter=fs.readFileSync(path.join(root,'discharge-letter.html'),'utf8');
const helper=fs.readFileSync(path.join(root,'assets/discharge-record.js'),'utf8');
function source(name){
  const match=app.match(new RegExp('(?:async )?function '+name+'\\('));
  assert.ok(match,name+' not found');
  const lineEnd=app.indexOf('\n',match.index);
  if(app.slice(match.index,lineEnd).trim().endsWith('}'))return app.slice(match.index,lineEnd);
  return app.slice(match.index,app.indexOf('\n}',match.index)+2);
}
const catalogue=[
  {name:'Flange 45mm',system:'two',part:'flange'},
  {name:'Drainable bag 45mm',system:'two',part:'bag',outlet:'drainable'},
  {name:'Urostomy bag 45mm',system:'two',part:'bag',outlet:'urostomy'},
  {name:'Lentell closed pouch 70mm',system:'one',outlet:'closed'},
  {name:'Dansac 8080 drainable pouch',system:'one',outlet:'drainable'}
];
function context(){
  const c=vm.createContext({TODAY:'2026-10-01',APP_BUILD:app.match(/const APP_BUILD='([^']+)'/)[1],Date,Map,Set,URL,crypto:require('node:crypto').webcrypto,
    SUPABASE_PAGE_SIZE:2,APPLIANCE_CATALOGUE:catalogue,
    fmtShortDate:s=>s,fixText:s=>String(s||''),initialStomaCode:s=>'STO-'+s,stomaShortType:s=>s,stomaQuadrant:()=>'',
    _normType:s=>String(s||'').toLowerCase(),recCode:s=>s.id||'',alert:()=>{}});
  for(const name of ['parseNameList','parseStomas','parseInitialStomas','parseRefashionings','stomaOperationHistory',
    'patientStomaList','stomaTimeline','stomasPresentOn','applianceStomaUid','parseEpisodeApplianceRows',
    'stomaApplianceHistory','parseComplications','humanList','composeApplianceSentence','dischargeLetterRodData','dischargeLetterRecord',
    'fetchAllRows','openDischargeLetterFor'])vm.runInContext(source(name),c);
  return c;
}
const patient=extra=>({id:'p1',first_name:'Alex',surname:'Example',id_card:'0000000M',sex:'Male',
  stoma_type:'Loop ileostomy',stoma_location:'RIF',surgery_date:'2026-09-01',procedure_performed:'Bowel resection',
  consultant:'Mr Example',rod_removal_date:null,rod_removed_date:null,initial_stomas:[{uid:'colo',type:'End colostomy',location:'LIF'},
    {uid:'uro',type:'Urostomy',location:'RLQ'}],...extra});
const episode=rows=>({id:'ep1',kind:'episode',patient_id:'p1',record_date:'2026-09-01',created_at:'2026-09-01T09:00:00Z',appliances:rows});
const row=(uid,date,appliances,accessories=[])=>({stoma_uid:uid,changed_on:date,appliances,accessories});
const visit=(date,rows)=>({id:'a1',patient_id:'p1',status:'attended',appt_date:date,stoma_appliances:rows});
const snapshot=()=>context().dischargeLetterRecord(patient({
  rod_removal_date:'2026-10-04',rod_stoma_uid:'base',
  complications:[{text:'Mucocutaneous separation',stoma:'1',note:"From 2 to 4 o'clock",status:'open'},
    {text:'Peristomal skin excoriation / dermatitis',stoma:'2',status:'open',
      events:[{date:'2026-09-28',trend:'noted',note:'Small area'},{date:'2026-10-01',trend:'improving',note:'Recorded treatment continued'}]}]
}),[episode([
  row('base','2026-10-01',['Dansac 8080 drainable pouch'],['Stoma powder']),
  row('colo','2026-09-27',['Lentell closed pouch 70mm'],['Stoma belt']),
  {...row('uro','2026-09-29',['Flange 45mm','Urostomy bag 45mm'],['Stoma seal']),flange_due:'2026-10-02'}
])],[]);
function page(record,query='?record=test'){
  const errors=[],alerts=[],console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  const html=letter.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["'][^>]*><\/script>/g,(_m,_a,url)=>
    url.startsWith('assets/discharge-record.js')?'<script>'+helper+'</script>':'');
  const dom=new JSDOM(html,{url:'https://clinic.test/discharge-letter.html'+query,
    runScripts:'dangerously',virtualConsole:console,beforeParse(w){
      if(record)w.sessionStorage.setItem('stoma-discharge:test',JSON.stringify(record));
      w.TextEncoder=TextEncoder;
      w.alert=s=>alerts.push(s);w.confirm=()=>true;
    }});
  assert.deepEqual(errors.map(e=>e.message),[]);
  return {dom,w:dom.window,d:dom.window.document,alerts};
}
const textOf=(d,selector)=>d.querySelector(selector).textContent;

test('latest selections are taken separately for ileostomy, colostomy and urostomy on different dates',()=>{
  const s=snapshot();assert.deepEqual(Array.from(s.stomas,x=>x.uid),['base','colo','uro']);
  assert.match(s.stomas[0].appliance,/Dansac.*stoma powder/);
  assert.match(s.stomas[1].appliance,/Lentell.*stoma belt/);
  assert.match(s.stomas[2].appliance,/Flange 45mm with Urostomy bag 45mm.*stoma seal/);
  assert.equal(s.stomas[2].flangeDue,'2026-10-02');
});
test('latest one-piece replaces an earlier two-piece, without dropping another stoma',()=>{
  const c=context(),s=c.dischargeLetterRecord(patient(),[episode([
    row('base','2026-09-28',['Flange 45mm','Drainable bag 45mm'],['Stoma powder']),
    row('base','2026-10-01',['Dansac 8080 drainable pouch']),
    row('colo','2026-09-26',['Lentell closed pouch 70mm'])
  ])],[]);
  assert.equal(s.stomas[0].system,'one');assert.doesNotMatch(s.stomas[0].appliance,/Flange|powder/);
  assert.match(s.stomas[1].appliance,/Lentell/);
});
test('same-day last change and empty latest selections do not resurrect a previous appliance or powder',()=>{
  const c=context(),s=c.dischargeLetterRecord(patient(),[episode([
    row('base','2026-10-01',['Flange 45mm','Drainable bag 45mm'],['Stoma powder']),
    row('base','2026-10-01',[],['None'])
  ])],[]);
  assert.equal(s.stomas[0].appliance,'');assert.equal(s.stomas[0].accessories.length,0);
  const {d}=page(s);assert.doesNotMatch(textOf(d,'.body'),/stoma powder|Flange 45mm/);
  assert.doesNotMatch(textOf(d,'#planList'),/Apply.*powder|Pouch is to/);
  assert.match(textOf(d,'#wzBody'),/No current appliance recorded/);
});
test('a newer attended clinic selection updates only its stoma; cancelled and future visits are excluded',()=>{
  const c=context(),s=c.dischargeLetterRecord(patient(),[episode([
    row('base','2026-09-27',['Dansac 8080 drainable pouch']),
    row('colo','2026-09-26',['Lentell closed pouch 70mm'])
  ])],[visit('2026-10-01',[{uid:'base',appliances:['Flange 45mm','Drainable bag 45mm']}]),
    {...visit('2026-10-01',[{uid:'colo',appliances:['Cancelled selection']}]),status:'cancelled'},
    visit('2026-10-10',[{uid:'base',appliances:['Future selection']}])]);
  assert.match(s.stomas[0].appliance,/Flange/);assert.match(s.stomas[1].appliance,/Lentell/);
  assert.doesNotMatch(JSON.stringify(s),/Cancelled selection|Future selection/);
});
test('closed and refashioned identities keep their old appliances out of the discharge letter',()=>{
  const c=context(),p=patient({initial_stomas:[{uid:'colo',type:'End colostomy',reversal_date:'2026-09-30'}],
    extra_refashionings:[{uid:'remade',target_uid:'base',formed_date:'2026-10-01',type:'Loop ileostomy'}]});
  const s=c.dischargeLetterRecord(p,[episode([row('base','2026-09-28',['Old ileostomy pouch']),
    row('colo','2026-09-28',['Closed colostomy pouch'])])],[]);
  assert.deepEqual(Array.from(s.stomas,x=>x.uid),['remade']);assert.equal(s.stomas[0].appliance,'');
  assert.doesNotMatch(JSON.stringify(s),/Old ileostomy pouch|Closed colostomy pouch/);
});
test('ward and clinic changes on the same day use the saved time rather than the admission creation time',()=>{
  const c=context(),p=patient({initial_stomas:[]});
  const ward=episode([{...row('base','2026-10-01',['Dansac 8080 drainable pouch']),changed_at:'2026-10-01T12:00:00Z'}]);
  const clinic={...visit('2026-10-01',[{uid:'base',appliances:['Lentell closed pouch 70mm']}]),updated_at:'2026-10-01T09:00:00Z'};
  assert.match(c.dischargeLetterRecord(p,[ward],[clinic]).stomas[0].appliance,/Dansac/);
  clinic.updated_at='2026-10-01T13:00:00Z';
  assert.match(c.dischargeLetterRecord(p,[ward],[clinic]).stomas[0].appliance,/Lentell/);
});
test('same type stomas are matched by ID; ambiguous legacy selections are not copied to both',()=>{
  const c=context(),p=patient({stoma_type:'End colostomy',initial_stomas:[{uid:'colo',type:'End colostomy',location:'LIF'}]});
  const s=c.dischargeLetterRecord(p,[episode([row('base','2026-10-01',['Main pouch']),
    row('colo','2026-09-29',['Second pouch']),{stoma_type:'End colostomy',changed_on:'2026-09-30',appliances:['Unassigned pouch']}])],[]);
  assert.equal(s.stomas[0].appliance,'Main pouch');assert.equal(s.stomas[1].appliance,'Second pouch');
});
test('complications use their latest note, exclude resolved entries, and keep unassigned problems separate',()=>{
  const c=context(),p=patient({complications:[
    {text:'Retraction',stoma:'1',note:'Baseline',events:[{date:'2026-09-29',note:'Older'},{date:'2026-10-01',note:'Latest',trend:'unchanged'}]},
    {text:'Resolved granuloma',stoma:'1',status:'resolved'},
    {text:'General recorded problem',status:'open'}
  ]}),s=c.dischargeLetterRecord(p,[],[]);
  assert.equal(s.stomas[0].complications[0].note,'Latest');
  assert.equal(s.stomas[1].complications.length,0);assert.equal(s.unassignedComplications.length,1);
  const {d}=page(s);assert.match(textOf(d,'.body'),/Retraction — Latest \(unchanged\)/);
  assert.doesNotMatch(textOf(d,'.body'),/Resolved granuloma/);
  assert.equal(textOf(d,'.body').split('General recorded problem').length-1,1);
});
test('the recorded-patient wizard has only review, per-stoma assessment and teaching',()=>{
  const {w,d}=page(snapshot());
  assert.deepEqual(Array.from(w.stepsForWizard()),['recordReview','recordAssessment','teaching']);
  assert.equal(d.querySelector('#wzTotal').textContent,'3');
  assert.match(textOf(d,'#wzBody'),/Stoma powder|stoma powder/);
  w.wzNext();assert.equal(d.querySelectorAll('.wz-record-tab').length,3);
  assert.doesNotMatch(textOf(d,'#wzBody'),/Expected date of rod removal|Choose the one-piece/);
});
test('multiple complication updates on the same day retain the last recorded note',()=>{
  const c=context(),s=c.dischargeLetterRecord(patient({initial_stomas:[],complications:[{
    text:'Skin redness',stoma:'1',events:[{date:'2026-10-01',note:'Morning observation'},
      {date:'2026-10-01',note:'Discharge observation',trend:'improving'}]
  }]}),[],[]);
  assert.equal(s.stomas[0].complications[0].note,'Discharge observation');
});
test('assessment tabs keep independent observations and Finish retains all recorded appliances and complications',()=>{
  const {w,d}=page(snapshot());w.wzNext();
  w.recordSetAssessment('colour','pink/red');w.recordSetAssessment('function','functioning well');
  w.recordSelectStoma(1);w.recordSetAssessment('colour','healthy colostomy colour');
  w.recordSelectStoma(0);assert.equal(d.querySelector('#record-colour').value,'pink/red');
  w.wzNext();w.WZ.teaching='yes';w.WZ.teachingWith='wife';w.wzNext();
  assert.equal(d.querySelectorAll('.body .record-stoma-title').length,3);
  assert.equal(d.querySelectorAll('#planList .record-plan-title').length,3);
  assert.match(textOf(d,'.body'),/pink\/red|healthy colostomy colour/);
  assert.match(textOf(d,'.body'),/Mucocutaneous separation.*From 2 to 4 o'clock/);
  assert.match(textOf(d,'.body'),/Recorded treatment continued/);
  assert.match(textOf(d,'.body'),/Dansac|Lentell|Urostomy bag/);
  assert.equal(textOf(d,'.body').split('teaching session has been carried out').length-1,1);
  w.openWizard();w.wzNext();assert.equal(d.querySelector('#record-colour').value,'pink/red');
});
test('powder instructions are generated only for the stoma on which powder was actually recorded',()=>{
  const {d}=page(snapshot()),children=Array.from(d.querySelector('#planList').children);
  const headings=children.map((el,i)=>el.classList.contains('record-plan-title')?i:-1).filter(i=>i>=0);
  assert.match(children.slice(headings[0],headings[1]).map(el=>el.textContent).join(' '),/Apply protective powder/);
  assert.doesNotMatch(children.slice(headings[0],headings[1]).map(el=>el.textContent).join(' '),/over the skin excoriation/);
  assert.doesNotMatch(children.slice(headings[1]).map(el=>el.textContent).join(' '),/Apply protective powder|Apply.*mucocutaneous separation/);
});
test('a recorded complication does not invent treatment, healthy skin, or a stoma belt',()=>{
  const c=context(),s=c.dischargeLetterRecord(patient({initial_stomas:[],complications:[
    {text:'Mucocutaneous separation',stoma:'1',note:'Small area'},
    {text:'Retraction',stoma:'1'}
  ]}),[episode([row('base','2026-10-01',['Dansac 8080 drainable pouch'])])],[]);
  const {d,w}=page(s);assert.match(textOf(d,'.body'),/Mucocutaneous separation|Retraction/);
  assert.doesNotMatch(textOf(d,'#planList'),/powder|Orabase|Stoma belt/);
  w.wzNext();assert.equal(d.querySelector('#record-skin').value,'');
});
test('rod in situ is tied to its stoma and removed status stops in-situ instructions',()=>{
  const s=snapshot(),{d}=page(s);assert.match(textOf(d,'.body'),/Rod in situ, due for removal on 4 October 2026/);
  assert.match(textOf(d,'#planList'),/while the rod is in situ/);
  s.stomas[0].rod={inSitu:false,removalDate:'2026-10-04',removedDate:'2026-10-01'};
  const removed=page(s);assert.match(textOf(removed.d,'.body'),/Rod removed on 1 October 2026/);
  assert.doesNotMatch(textOf(removed.d,'#planList'),/rod is in situ|Rod in situ/);
});
test('unknown urostomy stents are not treated as absent and the confirmed answer selects the correct plan',()=>{
  const {w,d}=page(snapshot());assert.match(textOf(d,'#planList'),/Urostomy stent status: \[confirm/);
  assert.doesNotMatch(textOf(d,'#planList'),/urostomy bag should be changed daily/);
  w.wzNext();w.recordSelectStoma(2);w.recordSetAssessment('stents','yes');w.applyWizard();
  assert.match(textOf(d,'#planList'),/while the stents are in situ/);
});
test('multiple stomas and complications survive Word HTML, DOCX and email-text export, with escaped recorded text',async()=>{
  const s=snapshot();s.stomas[1].complications.push({text:'<img src=x onerror=alert(1)>',note:'Saved text & details'});
  const {w,d}=page(s);assert.equal(d.querySelector('.body img'),null);
  for(const exportText of [w.buildLetterHTML(),w.buildLetterText()]){
    assert.match(exportText,/Stoma 1|Stoma 2|Stoma 3/);assert.match(exportText,/Lentell|Dansac|Urostomy bag/);
    assert.match(exportText,/Mucocutaneous separation/);
  }
  const blob=w.buildLetterDocx();
  const bytes=await new Promise((resolve,reject)=>{const r=new w.FileReader();r.onload=()=>resolve(Buffer.from(r.result));r.onerror=reject;r.readAsArrayBuffer(blob);});
  const xml=bytes.toString('utf8');
  for(const label of ['Stoma 1','Stoma 2','Stoma 3','Lentell','Dansac','Urostomy bag','Mucocutaneous separation'])assert.ok(xml.includes(label),label);
  assert.ok(xml.includes('<w:keepNext/>'));assert.match(w.buildLetterHTML(),/&lt;img src=x onerror=alert\(1\)&gt;/);
});
test('standalone/legacy query letters retain their manual wizard and Clear removes recorded mode',()=>{
  const blank=page(null,'');assert.ok(blank.w.stepsForWizard().includes('type'));
  const legacy=page(null,'?fn=Alex&sn=Example&type=Loop+ileostomy&appliance=Recorded+pouch');
  assert.equal(legacy.w.WZ.applianceFromRecord,true);assert.match(textOf(legacy.d,'.body'),/Recorded pouch/);
  const recorded=page(snapshot());recorded.w.clearForm();
  assert.equal(recorded.w.dischargeRecord,null);assert.ok(recorded.w.stepsForWizard().includes('type'));
  assert.equal(recorded.w.sessionStorage.getItem('stoma-discharge:test'),null);
});
test('an unavailable snapshot shows a load error instead of silently starting an unrelated letter',()=>{
  const {d}=page(null);assert.match(textOf(d,'#wzBody'),/Close this tab and reopen/);
  assert.equal(d.querySelector('#wzNext').disabled,true);
});
function fakeReads(c,p,episodes,appointments,failure){
  c.fetchPatientById=async()=>({data:p});
  c.SB={from(table){
    const q={filters:[],first:0,last:Infinity,select:()=>q,eq:(k,v)=>{q.filters.push(r=>r[k]===v);return q;},
      order:()=>q,range:(first,last)=>{q.first=first;q.last=last;return q;},
      then(resolve,reject){
        const data=(table==='clinical_records'?episodes:appointments).filter(r=>q.filters.every(f=>f(r)));
        return Promise.resolve(failure===table?{error:{message:'Read failed'}}:{data:data.slice(q.first,q.last+1),error:null}).then(resolve,reject);
      }};return q;
  }};
}
test('opening a letter fetches fresh records and carries all history through tab storage with no clinical data in the URL',async()=>{
  const c=context(),saved=new Map(),target={document:{},sessionStorage:{setItem:(k,v)=>saved.set(k,v)},location:{},close(){this.closed=true;}};
  const episodes=[episode([row('base','2026-10-01',['Dansac 8080 drainable pouch'])])];
  const appointments=Array.from({length:8},(_,i)=>({...visit('2026-09-'+String(30-i).padStart(2,'0'),
    [{uid:i===7?'colo':'base',appliances:[i===7?'Lentell closed pouch 70mm':'Historical pouch']}]),id:'a'+i}));
  let opened=0;c.window={open:url=>{assert.equal(url,'about:blank');opened++;return target;}};
  c.location={href:'https://clinic.test/index.html'};fakeReads(c,patient(),episodes,appointments);
  await c.openDischargeLetterFor('p1');assert.equal(opened,1);assert.equal(saved.size,1);
  assert.doesNotMatch(target.location.href,/Alex|Example|0000000M|appliance/);
  const data=JSON.parse(Array.from(saved.values())[0]);assert.match(data.stomas[1].appliance,/Lentell/);
});
test('failed history reads close the reserved tab and report failure without exporting a partial letter',async()=>{
  const c=context(),alerts=[],target={document:{},close(){this.closed=true;},sessionStorage:{setItem:()=>assert.fail('Unexpected snapshot')}};
  c.window={open:()=>target};c.alert=s=>alerts.push(s);c.location={href:'https://clinic.test/index.html'};
  fakeReads(c,patient(),[],[],'clinical_records');await c.openDischargeLetterFor('p1');
  assert.equal(target.closed,true);assert.match(alerts[0],/Could not load the current appliances/);
});
