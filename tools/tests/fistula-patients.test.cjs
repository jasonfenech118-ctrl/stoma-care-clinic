// Fistula patients: no stoma, appliance managed on the ward, on the handover
// marked FISTULA, and kept out of every stoma list and count.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {PGlite}=require('@electric-sql/pglite');
const {fistulaHelpers}=require('./fistula-helpers.cjs');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
const plain=x=>JSON.parse(JSON.stringify(x));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const FIS={id:'f1',first_name:'Maria',surname:'Borg',id_card:'123456M',patient_kind:'fistula',fistula_operation_date:'2026-09-30',findings:'ECF through the midline wound'};
const STOMA={id:'s1',first_name:'Joe',surname:'Vella',id_card:'7M',patient_kind:'stoma',stoma_type:'End colostomy',surgery_date:'2026-09-01'};

test('the SQL adds the two columns, keeps every existing patient a stoma patient, and is safe to re-run',async()=>{
  const db=new PGlite();
  await db.exec("create table patients(id serial primary key,first_name text);insert into patients(first_name) values('Existing');");
  const sql=fs.readFileSync(path.join(__dirname,'../../sql/add-fistula-patients.sql'),'utf8');
  await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query('select patient_kind from patients')).rows[0].patient_kind,'stoma');
  await db.query("insert into patients(first_name,patient_kind,fistula_operation_date) values('New','fistula','2026-09-30')");
  await assert.rejects(db.query("insert into patients(first_name,patient_kind) values('Typo','fistual')"),/patient_kind_check/);
  await db.close();
});

function helpers(extra={}){
  const c=vm.createContext({console,Date,Set,Map,Math,...extra});
  vm.runInContext(fistulaHelpers,c);
  return c;
}
test('stoma lists and counts leave fistula patients out, by their column or by id',async()=>{
  const c=helpers({APPLIANCE_ONEPIECE_GROUPS:['Hollister','Salts','Fistula / wound manager'],fetchPatientsSelect:async()=>({rows:[FIS,STOMA],error:null}),fetchAllRows:async()=>({rows:[{id:'f1'}],error:null}),
    SB:{from:()=>{const q={select:()=>q,eq:()=>q,then:(a,b)=>Promise.resolve({count:5,error:null}).then(a,b)};return q;}}});
  assert.equal(c.isFistulaPatient(FIS),true);assert.equal(c.isFistulaPatient(STOMA),false);assert.equal(c.isFistulaPatient({}),false);
  assert.deepEqual(plain((await c.fetchAllStomaPatients()).rows).map(p=>p.id),['s1']);
  // A read that named its own columns (no patient_kind) is matched by id.
  assert.deepEqual(plain(await c.withoutFistulaPatients([{id:'f1'},{id:'s1'}])).map(p=>p.id),['s1']);
  assert.deepEqual(plain(await c.stomaPatientCount()),{count:4,error:null});
  assert.deepEqual(plain(c.onePieceGroupsFor(FIS)).slice(0,1),['Fistula / wound manager']);
  assert.equal(plain(c.onePieceGroupsFor(STOMA)).at(-1),'Fistula / wound manager');
});

test('without the database column nothing is filtered and nothing breaks',async()=>{
  const c=helpers({fetchAllRows:async()=>({rows:null,error:{message:'column patients.patient_kind does not exist'}})});
  assert.deepEqual(plain(await c.withoutFistulaPatients([{id:'f1'},{id:'s1'}])).map(p=>p.id),['f1','s1']);
});

function timeline(){
  const c=helpers({fmtShortDate:d=>d,stomaShortType:t=>t?'Colo':'',stomaQuadrant:()=>'',TODAY:'2026-10-07'});
  for(const name of ['parseStomas','parseRefashionings','parseInitialStomas','stomaOperationHistory','patientStomaList','stomaTimeline','stomasPresentOn'])vm.runInContext(fn(name),c);
  return c;
}
test('a fistula patient’s fistula stands in for a stoma; a stoma patient never gets one',()=>{
  const c=timeline();
  const f=plain(c.stomasPresentOn(FIS,'2026-10-07'));
  assert.equal(f.length,1);assert.equal(f[0].uid,'fistula');assert.equal(f[0].typeLabel,'Fistula');assert.equal(f[0].shortLabel,'Fistula');assert.match(f[0].meta,/operated 2026-09-30/);
  assert.deepEqual(plain(c.stomaTimeline(STOMA)).map(s=>s.typeLabel),['End colostomy']);
  assert.deepEqual(plain(c.stomaTimeline({...STOMA,patient_kind:undefined})).map(s=>s.uid),['base']);
});

function handoverRow(p){
  const dom=new JSDOM('<table><tbody id="t"></tbody></table>');
  const c=helpers({isEncounterUser:()=>true,hvEncounteredToday:new Set(),window:{},htmlSafe:esc,jsSafe:v=>String(v??''),
    parseComplications:()=>[],hvIsInfectionNote:()=>false,wardBlockStyle:()=>'',wardBlockTitle:()=>'',wardHospitalLabel:()=>'',
    patientRodApplies:()=>false,handoverRodPrintCarrier:()=>'',flangeDueChipHTML:()=>'',handoverDocButtonHTML:()=>'',
    handoverComplicationLine:()=>'',stripHandoverFlangeDue:v=>v});
  vm.runInContext(fn('handoverRowHTML'),c);
  dom.window.document.getElementById('t').innerHTML=c.handoverRowHTML({inpatient_ward:'SW4',inpatient_bed:'3',...p},'');
  return dom.window.document.querySelector('tr');
}
test('on the handover a fistula row is marked FISTULA and is simply discharged — no postop, Gozo or overseas choices',()=>{
  const tr=handoverRow(FIS);
  assert.ok(tr.classList.contains('hv-fistula'));
  assert.equal(tr.querySelector('td[data-label="Surname"] .fistula-tag').textContent,'FISTULA');
  assert.equal(tr.querySelector('td[data-label="Surname"] strong').textContent,'Borg');
  const actions=[...tr.querySelectorAll('.hv-actions-cell button:not(.hv-mob-only)')].map(b=>b.textContent.trim());
  assert.deepEqual(actions,['Discharge']);assert.match(tr.querySelector('.hv-actions-cell button').getAttribute('onclick'),/dischargeFistulaFromHandover\('f1','Maria Borg'\)/);
  // Appliance, notes, complications and the encounter work exactly as for anyone.
  assert.match(tr.querySelector('button.hv-appl').getAttribute('onclick'),/openHandoverAppliance\('f1'\)/);
  assert.ok(tr.querySelector('.hv-enc-btn'));assert.ok(tr.querySelector('.hv-cmp-btn'));
  const stoma=handoverRow(STOMA);
  assert.equal(stoma.classList.contains('hv-fistula'),false);assert.equal(stoma.querySelector('.fistula-tag'),null);
  assert.deepEqual([...stoma.querySelectorAll('.hv-actions-cell button:not(.hv-mob-only)')].map(b=>b.textContent.trim()),['Postop discharge','Discharge (old case)','Relocated overseas','Discharged to Gozo']);
});

test('discharging a fistula patient closes the episode but never writes a stoma discharge date',async()=>{
  const calls=[];
  const c=helpers({confirm:()=>true,alert:m=>calls.push(['alert',m]),
    SB:{from:t=>({update:patch=>({eq:async(k,v)=>{calls.push(['update',t,patch,v]);return {error:null};}})})},
    closeOpenInpatientEpisode:async(id,o)=>calls.push(['close',id,o]),stampPostopDischargeDate:async()=>calls.push(['stamp']),
    loadHandover:()=>calls.push(['reload']),refreshReminders:async()=>calls.push(['bell'])});
  vm.runInContext(fn('dischargeFistulaFromHandover'),c);
  await c.dischargeFistulaFromHandover('f1','Maria Borg');
  assert.deepEqual(plain(calls),[['update','patients',{is_inpatient:false},'f1'],['close','f1',{postop:true}],['reload'],['bell']]);
});

function fistulaForm(t,{matches=[],insertErrors=[]}={}){
  const dom=new JSDOM('<div id="mo"></div><div id="mb"></div><section id="page-fistulas" class="page active"></section>',{runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;const log={inserts:[],admitted:[],closed:0};
  Object.assign(w,{TODAY:'2026-10-07',htmlSafe:esc,jsSafe:v=>String(v??''),firmList:['Mr A Surgeon'],firmOptions:c=>'<option value="">— firm —</option><option>Mr A Surgeon</option>'+(c&&c!=='Mr A Surgeon'?`<option selected>${c}</option>`:''),
    loadFirms:async()=>{},openMo:()=>{},closeModal:()=>{log.closed++;},normaliseIdCard:v=>String(v||'').trim().toUpperCase().replace(/\s+/g,''),
    findRegistryPatientsByIdCard:async()=>({matches,error:null}),missingColumnFromError:e=>(String(e?.message||'').match(/'([a-z_]+)' column/)||[])[1]||'',
    loadFistulaPatients:()=>{},openPatientRecord:()=>{},updatePatientTolerant:async()=>({error:null,dropped:[]}),
    fetchPatientById:async id=>({data:{id,first_name:'Maria',is_inpatient:false},error:null}),openInpatientVisitFor:async(id)=>log.admitted.push(id),
    SB:{from:()=>({insert:body=>({select:()=>({single:async()=>{log.inserts.push(JSON.parse(JSON.stringify(body)));const e=insertErrors.shift();return e?{data:null,error:e}:{data:{id:'new-1'},error:null};}})})})}});
  w.eval(fistulaHelpers);
  w.eval(['openFistulaPatientModal','saveFistulaPatient','admitFistulaPatient'].map(fn).join('\n'));
  return {w,log,set:(id,v)=>{w.document.getElementById(id).value=v;}};
}
test('Add fistula patient saves a fistula patient off stoma follow-up, then opens the admission window',async t=>{
  const {w,log,set}=fistulaForm(t);await w.openFistulaPatientModal();
  assert.match(w.document.getElementById('mb').textContent,/Add fistula patient/);assert.equal(w.document.getElementById('fis-admit').checked,true);
  set('fis-first','Maria');set('fis-surname','Borg');set('fis-idcard',' 123456 m ');set('fis-consultant','Mr A Surgeon');set('fis-opdate','2026-09-30');
  set('fis-operation','Laparotomy');set('fis-findings','ECF through the midline wound');
  await w.saveFistulaPatient('');
  assert.deepEqual(log.inserts,[{first_name:'Maria',surname:'Borg',id_card:'123456M',consultant:'Mr A Surgeon',fistula_operation_date:'2026-09-30',
    procedure_performed:'Laparotomy',findings:'ECF through the midline wound',patient_kind:'fistula',followup_status:'paused'}]);
  assert.equal(log.closed,1);assert.deepEqual(log.admitted,['new-1']);
});
test('the form refuses a missing name or ID, a future operation date and an ID card already in the registry',async t=>{
  const {w,log,set}=fistulaForm(t,{matches:[{id:'s1',first_name:'Joe',surname:'Vella'}]});await w.openFistulaPatientModal();
  const err=()=>w.document.getElementById('fis-error').textContent;
  await w.saveFistulaPatient('');assert.match(err(),/first name, surname and ID card/);
  set('fis-first','Maria');set('fis-surname','Borg');set('fis-idcard','7M');set('fis-opdate','2026-10-09');
  await w.saveFistulaPatient('');assert.match(err(),/cannot be in the future/);
  set('fis-opdate','');await w.saveFistulaPatient('');assert.match(err(),/Joe Vella already has ID card 7M/);
  assert.ok(w.document.querySelector('#fis-error button'));assert.equal(log.inserts.length,0);assert.equal(w.document.getElementById('fis-save').disabled,false);
});
test('before the SQL is run the form says which file to run instead of adding a stoma patient',async t=>{
  const {w,log,set}=fistulaForm(t,{insertErrors:[{message:"Could not find the 'patient_kind' column of 'patients' in the schema cache"}]});await w.openFistulaPatientModal();
  set('fis-first','Maria');set('fis-surname','Borg');set('fis-idcard','123456M');
  await w.saveFistulaPatient('');
  assert.match(w.document.getElementById('fis-error').textContent,/sql\/add-fistula-patients\.sql/);assert.equal(log.inserts.length,1);assert.deepEqual(log.admitted,[]);
});

test('the Fistulas list puts patients on the ward first, offers Admit to the rest, and searches',t=>{
  const dom=new JSDOM('<input id="fis-search"/><span id="fis-count"></span><div id="fis-body"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  Object.assign(w,{htmlSafe:esc,jsSafe:v=>String(v??''),fmtShortDate:d=>d,patientNameAvatarHTML:(p,nm,meta)=>`<span class="nm">${nm}</span>${meta}`,emptyStateHTML:(i,title)=>`<p>${title}</p>`});
  w.eval(fistulaHelpers);w.eval(fn('renderFistulaPatients')+'\nvar fistulaRows=[];');
  w.renderFistulaPatients();assert.match(w.document.getElementById('fis-body').textContent,/No fistula patients yet/);
  w.eval(`fistulaRows=${JSON.stringify([{...FIS,surname:'Zammit',is_inpatient:false},{...FIS,id:'f2',surname:'Abela',is_inpatient:false,procedure_performed:'Hartmann reversal'},{...FIS,id:'f3',surname:'Micallef',is_inpatient:true,inpatient_ward:'SW2',inpatient_bed:'7'}])}`);
  w.renderFistulaPatients();
  const names=()=>[...w.document.querySelectorAll('.nm')].map(n=>n.textContent);
  assert.deepEqual(names(),['Maria Micallef','Maria Abela','Maria Zammit']);
  const first=w.document.querySelector('tbody tr');assert.match(first.textContent,/SW2 – 7/);assert.match(first.textContent,/Handover/);
  assert.match(w.document.querySelectorAll('tbody tr')[1].querySelector('.fis-actions button').getAttribute('onclick'),/admitFistulaPatient\('f2'\)/);
  assert.equal(w.document.querySelectorAll('.fistula-tag').length,3);
  assert.equal(w.document.getElementById('fis-count').textContent,'3 of 3 fistula patients · 1 on the handover');
  w.document.getElementById('fis-search').value='hartmann';w.renderFistulaPatients();assert.deepEqual(names(),['Maria Abela']);
});
