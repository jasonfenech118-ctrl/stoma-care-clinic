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
const oneLine=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n',i));};
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const FIS={id:'f1',first_name:'Maria',surname:'Borg',id_card:'123456M',patient_kind:'fistula',fistula_operation_date:'2026-09-30',findings:'ECF through the midline wound'};
const STOMA={id:'s1',first_name:'Joe',surname:'Vella',id_card:'7M',patient_kind:'stoma',stoma_type:'End colostomy',surgery_date:'2026-09-01'};

test('the SQL adds the two columns, keeps every existing patient a stoma patient, and is safe to re-run',async()=>{
  const db=new PGlite();
  await db.exec("create table patients(id serial primary key,first_name text);insert into patients(first_name) values('Existing');");
  const sql=fs.readFileSync(path.join(__dirname,'../../sql/add-fistula-patients.sql'),'utf8');
  await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query('select patient_kind from patients')).rows[0].patient_kind,'stoma');
  await db.query("insert into patients(first_name,patient_kind,fistula_operation_date,fistula_closed_date,fistula_closed_reason) values('New','fistula','2026-09-30','2026-10-07','Healed / resolved')");
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
  assert.deepEqual(actions,['Discharge patient']);assert.match(tr.querySelector('.hv-actions-cell button').getAttribute('onclick'),/dischargeFistulaFromHandover\('f1','Maria Borg','fistula'\)/);
  // Appliance, notes, complications and the encounter work exactly as for anyone.
  assert.match(tr.querySelector('button.hv-appl').getAttribute('onclick'),/openHandoverAppliance\('f1'\)/);
  assert.ok(tr.querySelector('.hv-enc-btn'));assert.ok(tr.querySelector('.hv-cmp-btn'));
  const stoma=handoverRow(STOMA);
  assert.equal(stoma.classList.contains('hv-fistula'),false);assert.equal(stoma.querySelector('.fistula-tag'),null);
  assert.deepEqual([...stoma.querySelectorAll('.hv-actions-cell button:not(.hv-mob-only)')].map(b=>b.textContent.trim()),['Postop discharge','Discharge (old case)','Relocated overseas','Discharged to Gozo']);
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
  w.eval(['openFistulaPatientModal','openFistulaPatientForm','saveFistulaPatient','admitFistulaPatient'].map(fn).join('\n'));
  // The Add flow now opens a pathway chooser first; a kind picks that pathway.
  return {w,log,set:(id,v)=>{w.document.getElementById(id).value=v;},kind:k=>w.openFistulaPatientForm(null,k)};
}
test('Add fistula patient saves a fistula patient off stoma follow-up, then opens the admission window',async t=>{
  const {w,log,set,kind}=fistulaForm(t);await w.openFistulaPatientModal();
  // Add opens a two-pathway chooser first.
  assert.match(w.document.getElementById('mb').textContent,/Which pathway\?/);
  const paths=w.document.querySelectorAll('.fis-path-btn');assert.equal(paths.length,2);assert.match(paths[0].textContent,/Fistula present/);assert.match(paths[1].textContent,/Bagging advice/);
  kind('fistula');
  // The descriptive paragraph is gone; the field pair is one box.
  assert.doesNotMatch(w.document.getElementById('mb').textContent,/kept out of the stoma registry/);
  assert.equal(w.document.getElementById('fis-findings'),null);assert.equal(w.document.getElementById('fis-operation').tagName,'TEXTAREA');
  assert.match(w.document.querySelector('.fis-path-chip').textContent,/Fistula present/);
  assert.equal(w.document.getElementById('fis-admit').checked,true);
  set('fis-first','Maria');set('fis-surname','Borg');set('fis-idcard',' 123456 m ');set('fis-consultant','Mr A Surgeon');set('fis-opdate','2026-09-30');
  set('fis-operation','Laparotomy and small bowel resection — ECF through the midline wound');
  await w.saveFistulaPatient('');
  assert.deepEqual(log.inserts,[{first_name:'Maria',surname:'Borg',id_card:'123456M',consultant:'Mr A Surgeon',fistula_category:'fistula',fistula_operation_date:'2026-09-30',
    procedure_performed:'Laparotomy and small bowel resection — ECF through the midline wound',findings:null,patient_kind:'fistula',followup_status:'paused'}]);
  assert.equal(log.closed,1);assert.deepEqual(log.admitted,['new-1']);
});
test('the form refuses a missing name or ID, a future operation date and an ID card already in the registry',async t=>{
  const {w,log,set,kind}=fistulaForm(t,{matches:[{id:'s1',first_name:'Joe',surname:'Vella'}]});await w.openFistulaPatientModal();
  const err=()=>w.document.getElementById('fis-error').textContent;
  kind('fistula');
  await w.saveFistulaPatient('');assert.match(err(),/first name, surname and ID card/);
  set('fis-first','Maria');set('fis-surname','Borg');set('fis-idcard','7M');set('fis-opdate','2026-10-09');
  await w.saveFistulaPatient('');assert.match(err(),/cannot be in the future/);
  set('fis-opdate','');await w.saveFistulaPatient('');assert.match(err(),/Joe Vella already has ID card 7M/);
  assert.ok(w.document.querySelector('#fis-error button'));assert.equal(log.inserts.length,0);assert.equal(w.document.getElementById('fis-save').disabled,false);
});
test('before the SQL is run the form says which file to run instead of adding a stoma patient',async t=>{
  const {w,log,set,kind}=fistulaForm(t,{insertErrors:[{message:"Could not find the 'patient_kind' column of 'patients' in the schema cache"}]});await w.openFistulaPatientModal();
  kind('fistula');set('fis-first','Maria');set('fis-surname','Borg');set('fis-idcard','123456M');
  await w.saveFistulaPatient('');
  assert.match(w.document.getElementById('fis-error').textContent,/sql\/add-fistula-patients\.sql/);assert.equal(log.inserts.length,1);assert.deepEqual(log.admitted,[]);
});


function discharge(t,{dropped=[]}={}){
  const dom=new JSDOM('<div id="mb"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;const calls=[];
  Object.assign(w,{TODAY:'2026-10-07',htmlSafe:esc,jsSafe:v=>String(v??''),openMo:()=>{},closeModal:()=>calls.push(['closeModal']),alert:m=>calls.push(['alert',m]),
    SB:{from:t=>({update:patch=>({eq:async(k,v)=>{calls.push(['update',t,patch,v]);return {error:null};}})})},
    updatePatientTolerant:async(id,patch)=>{calls.push(['case',id,patch]);return {error:null,dropped};},
    closeOpenInpatientEpisode:async(id,o)=>calls.push(['close',id,o]),stampPostopDischargeDate:async()=>calls.push(['stamp']),
    loadHandover:()=>calls.push(['reload']),refreshReminders:async()=>calls.push(['bell'])});
  w.eval(fn('dischargeFistulaFromHandover')+'\n'+fn('confirmFistulaDischarge'));
  w.openMo=()=>{};
  return {w,calls};
}
test('Discharge patient asks whether the fistula resolved: resolved closes the case, never a postop discharge',async t=>{
  const {w,calls}=discharge(t);w.dischargeFistulaFromHandover('f1','Maria Borg','fistula');
  const mb=w.document.getElementById('mb');assert.match(mb.querySelector('h2').textContent,/Discharge patient/);
  assert.equal(mb.querySelector('input[name="fis-dis"]:checked').value,'close');assert.match(mb.textContent,/do not go on the Postop Discharges list/);
  await w.confirmFistulaDischarge('f1','fistula');
  assert.deepEqual(plain(calls),[['update','patients',{is_inpatient:false},'f1'],['close','f1',{postop:true}],
    ['case','f1',{fistula_closed_date:'2026-10-07',fistula_closed_reason:'Healed / resolved'}],['closeModal'],['reload'],['bell']]);
});
test('a long-term fistula goes home as an open case',async t=>{
  const {w,calls}=discharge(t);w.dischargeFistulaFromHandover('f1','Maria Borg','fistula');
  w.document.querySelector('input[name="fis-dis"][value="open"]').checked=true;
  await w.confirmFistulaDischarge('f1','fistula');
  assert.equal(calls.some(c=>c[0]==='case'),false);assert.equal(calls.some(c=>c[0]==='stamp'),false);assert.deepEqual(plain(calls[1]),['close','f1',{postop:true}]);
});
test('before the SQL is run the discharge still happens and says the case could not be closed',async t=>{
  const {w,calls}=discharge(t,{dropped:['fistula_closed_date','fistula_closed_reason']});w.dischargeFistulaFromHandover('f1','Maria Borg','fistula');
  await w.confirmFistulaDischarge('f1','fistula');
  assert.match(calls.at(-1)[1],/sql\/add-fistula-patients\.sql/);
});

function registry(t,rows,episodes={},encounters={}){
  const dom=new JSDOM('<div id="fis-tiles"></div><input id="fis-search"/><select id="fis-kind"><option value="all">All</option><option value="fistula">F</option><option value="bagging">B</option></select><span id="fis-count"></span><div id="fis-body"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  Object.assign(w,{htmlSafe:esc,jsSafe:v=>String(v??''),fmtShortDate:d=>d,patientNameAvatarHTML:(p,nm,meta)=>`<span class="nm">${nm}</span>${meta}`,emptyStateHTML:(i,title)=>`<p>${title}</p>`});
  w.eval(fistulaHelpers);
  const start=html.indexOf('const FISTULA_CLOSE_REASONS=');
  w.eval(html.slice(start,html.indexOf('\n',start)).replace(/^const /,'var ')+'\n'+oneLine('fistulaCaseClosed')+'\n'+fn('fistulaEpisodesHTML')+'\n'+fn('fistulaCaseHTML')+'\n'+fn('renderFistulaPatients')+'\n'+fn('setFistulaView'));
  w.eval(`var fistulaView='open',fistulaRows=${JSON.stringify(rows)},fistulaEpisodes=${JSON.stringify(episodes)},fistulaEncounters=${JSON.stringify(encounters)};`);
  return w;
}
test('the Fistula Registry shows open cases first by default, with closed cases and the ward a tap away',t=>{
  const rows=[{...FIS,surname:'Zammit'},{...FIS,id:'f2',surname:'Abela',procedure_performed:'Hartmann reversal'},
    {...FIS,id:'f3',surname:'Micallef',is_inpatient:true,inpatient_ward:'SW2',inpatient_bed:'7'},
    {...FIS,id:'f4',surname:'Camilleri',fistula_closed_date:'2026-09-20',fistula_closed_reason:'Healed / resolved'}];
  const eps={f3:[{id:'e1',patient_id:'f3',episode_ref:'EP-2026-0007',record_date:'2026-10-01',is_current:true},{id:'e0',patient_id:'f3',episode_ref:'EP-2026-0002',record_date:'2026-06-01',discharge_date:'2026-06-20'}],
    f4:[{id:'e9',patient_id:'f4',episode_ref:'EP-2026-0005',record_date:'2026-09-01',discharge_date:'2026-09-20'}]};
  const w=registry(t,rows,eps,{f3:[{id:'n1'},{id:'n2'},{id:'n3'}]});
  w.renderFistulaPatients();
  const names=()=>[...w.document.querySelectorAll('.nm')].map(n=>n.textContent);
  assert.deepEqual([...w.document.querySelectorAll('#fis-tiles button')].map(b=>b.textContent),['Open cases 3','On the ward 1','Closed cases 1','All 4']);
  assert.deepEqual(names(),['Maria Micallef','Maria Abela','Maria Zammit']);
  const ward=w.document.querySelector('tbody tr');
  assert.match(ward.textContent,/On the ward · SW2 – 7/);assert.match(ward.textContent,/2 episodes · 3 encounters/);assert.match(ward.textContent,/Latest: EP-2026-0007 · on the ward since 2026-10-01/);
  assert.match(ward.querySelector('[onclick^="openFistulaEpisodes"]').getAttribute('onclick'),/'f3'/);
  const abela=w.document.querySelectorAll('tbody tr')[1];
  assert.match(abela.textContent,/No admission yet/);assert.match(abela.textContent,/Not admitted yet/);
  assert.deepEqual([...abela.querySelectorAll('.fis-actions button')].map(b=>b.textContent),['🏥 Admit to handover','✓ Close case','Edit','Record']);
  w.setFistulaView('closed');
  assert.deepEqual(names(),['Maria Camilleri']);const closed=w.document.querySelector('tbody tr');
  assert.match(closed.textContent,/Closed 2026-09-20/);assert.match(closed.textContent,/Healed \/ resolved/);assert.match(closed.textContent,/discharged 2026-09-20/);
  assert.deepEqual([...closed.querySelectorAll('.fis-actions button')].map(b=>b.textContent),['↺ Reopen case','Edit','Record']);
  w.setFistulaView('all');w.document.getElementById('fis-search').value='hartmann';w.renderFistulaPatients();assert.deepEqual(names(),['Maria Abela']);
  // A patient back on the ward is an open case, whatever an older closure says.
  const back=registry(t,[{...FIS,is_inpatient:true,fistula_closed_date:'2026-09-01'}]);back.renderFistulaPatients();
  assert.match(back.document.getElementById('fis-tiles').textContent,/Open cases 1.*Closed cases 0/);
});

function caseActions(t,patient){
  const dom=new JSDOM('<div id="mb"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;const log={patches:[],admitted:[],alerts:[]};
  Object.assign(w,{TODAY:'2026-10-07',htmlSafe:esc,jsSafe:v=>String(v??''),fmtShortDate:d=>d,openMo:()=>{},closeModal:()=>{},confirm:()=>true,alert:m=>log.alerts.push(m),
    updatePatientTolerant:async(id,p)=>{log.patches.push(p);return {error:null,dropped:[]};},fetchPatientById:async()=>({data:JSON.parse(JSON.stringify(patient)),error:null}),
    openInpatientVisitFor:async id=>log.admitted.push(id),loadFistulaPatients:async()=>{},openPatientRecord:async()=>{},clrState:{}});
  const start=html.indexOf('const FISTULA_CLOSE_REASONS=');
  w.eval(html.slice(start,html.indexOf('\n',start)).replace(/^const /,'var ')+'\nvar fistulaRows='+JSON.stringify([patient])+';\n'+
    ['openCloseFistulaCase','saveCloseFistulaCase','reopenFistulaCase','afterFistulaCaseChange','admitFistulaPatient'].map(fn).join('\n'));
  return {w,log};
}
test('a case is closed with a date and reason, reopened, and a closed case is reopened before it is admitted',async t=>{
  const {w,log}=caseActions(t,{...FIS,id:'f1'});
  w.openCloseFistulaCase('f1');
  assert.deepEqual([...w.document.querySelectorAll('#fis-close-reason option')].map(o=>o.textContent),['Healed / resolved','Drain removed','Surgically repaired','Deceased','Other']);
  w.document.getElementById('fis-close-date').value='2026-10-06';w.document.getElementById('fis-close-reason').value='Surgically repaired';
  await w.saveCloseFistulaCase('f1');
  await w.reopenFistulaCase('f1');
  assert.deepEqual(plain(log.patches),[{fistula_closed_date:'2026-10-06',fistula_closed_reason:'Surgically repaired'},{fistula_closed_date:null,fistula_closed_reason:null}]);
  const closed=caseActions(t,{...FIS,id:'f2',fistula_closed_date:'2026-09-01'});
  await closed.w.admitFistulaPatient('f2');
  assert.deepEqual(plain(closed.log.patches),[{fistula_closed_date:null,fistula_closed_reason:null}]);assert.deepEqual(closed.log.admitted,['f2']);
  const ward=caseActions(t,{...FIS,id:'f3',is_inpatient:true});ward.w.openCloseFistulaCase('f3');
  assert.match(ward.log.alerts[0],/Discharge them there/);assert.equal(ward.w.document.getElementById('fis-close-date'),null);
});

test('seeing a fistula patient in clinic saves no nurse owner, due month or follow-up status',async()=>{
  const patches=[];
  const c=vm.createContext({console,Date,Set,Number,window:{},alert:()=>{},getCurrentUserForAudit:async()=>({email:'nurse@gov.mt',name:'Nurse'}),
    updateAppointmentTolerant:async()=>({error:null,dropped:[]}),updatePatientTolerant:async(id,p)=>{patches.push(JSON.parse(JSON.stringify(p)));return {error:null,dropped:[]};},
    checkDntuThresholdForAppointment:async()=>{},createMissingDntuRowsFromEditForm:async()=>{},refreshAppointmentViews:async()=>{},closeModal:()=>{},
    attDisplayName:()=>'',linkVisitSkinComplications:async()=>{},openCancellationForm:()=>{}});
  vm.runInContext(fn('commitOutcomeFollowup'),c);
  const v={apptId:'a1',patientId:'f1',status:'attended',year:'2026',month:'11',followupFlexible:false,followupStatus:'active',owner:'Jason',fn:'Maria',sn:'Borg',idcard:'1M',phone:'',
    date:'2026-10-07',slot:'08:30',nurse:'common',isDntuEditMode:false,dntuTarget:0,complicationReview:'none',applianceReview:'unchanged',complicationReviews:[],followupAction:'none',noDueMonth:true};
  await c.commitOutcomeFollowup({...v,fistula:true},[]);
  await c.commitOutcomeFollowup({...v,fistula:false,followupAction:'review-month',noDueMonth:false},[]);
  assert.deepEqual(patches[0],{first_name:'Maria',surname:'Borg',id_card:'1M',phone_number:null});
  assert.equal(patches[1].followup_owner,'Jason');assert.equal(patches[1].followup_due_month,11);assert.equal(patches[1].followup_status,'active');
});

test('the Complete visit window offers a fistula patient no nurse owner and no due month',()=>{
  const i=html.indexOf('async function openOutcomeFollowupModal(');const src=html.slice(i,html.indexOf('\n}',i));
  assert.match(src,/fistulaVisit\?`<div class="fg"><label>Nurse owner<\/label><input type="hidden" id="of-owner" value=""\/>/);
  assert.match(src,/fistulaVisit\s*\? `<label><input type="radio" name="of-next" value="none" checked/);
  assert.match(src,/<div id="of-duemonth-wrap"\$\{fistulaVisit\?' hidden':''\}>/);
});

test('bagging advice is the other kind in the section: its own labels, tag and close reason', async t=>{
  // The add form offers both kinds and relabels the fields for bagging advice.
  const {w,log,set,kind}=fistulaForm(t);await w.openFistulaPatientModal();
  kind('bagging');
  assert.match(w.document.querySelector('.fis-path-chip').textContent,/Bagging advice/);
  const labels=[...w.document.querySelectorAll('.edit-seen-grid label')].map(l=>l.textContent);
  assert.ok(labels.some(t=>/Date of procedure/.test(t)));
  assert.ok(labels.some(t=>/Drain \/ wound.*reason/.test(t)));
  assert.match(w.document.getElementById('fis-operation').placeholder,/Percutaneous drain|PCD/);
  set('fis-first','Paul');set('fis-surname','Said');set('fis-idcard','55M');
  set('fis-operation','Percutaneous drain, right flank — high output, asked for a bag');
  w.document.getElementById('fis-admit').checked=false;
  await w.saveFistulaPatient('');
  const row=log.inserts[0];assert.equal(row.fistula_category,'bagging');assert.equal(row.patient_kind,'fistula');
  assert.equal(row.procedure_performed,'Percutaneous drain, right flank — high output, asked for a bag');assert.equal(row.findings,null);
});

test('a bagging-advice patient reads BAGGING everywhere and stands in for a stoma without a stoma', t=>{
  const c=helpers();const BAG={id:'b1',patient_kind:'fistula',fistula_category:'bagging',first_name:'Paul',surname:'Said',procedure_performed:'PCD right flank — high output'};
  assert.equal(c.isFistulaPatient(BAG),true);assert.equal(c.isBaggingPatient(BAG),true);assert.equal(c.isBaggingPatient(FIS),false);
  assert.equal(c.fistulaKindLabel(BAG),'Bagging advice');assert.equal(c.fistulaKindLabel(FIS),'Fistula');
  assert.match(c.fistulaTagHTML(BAG),/BAGGING/);assert.doesNotMatch(c.fistulaTagHTML(BAG),/>FISTULA</);
  assert.equal(c.fistulaOpText({procedure_performed:'Op',findings:'Finding'}),'Op — Finding');
  const tl=timeline();const s=plain(tl.stomasPresentOn(BAG,'2026-10-07'));
  assert.equal(s.length,1);assert.equal(s[0].typeLabel,'Drain / wound');assert.equal(s[0].shortLabel,'Drain/wound');assert.match(s[0].meta,/bagging advice/);
});

test('the handover marks a bagging row BAGGING with a blue stripe and its discharge closes with Drain removed', async t=>{
  const tr=handoverRow({id:'b1',first_name:'Paul',surname:'Said',id_card:'55M',patient_kind:'fistula',fistula_category:'bagging'});
  assert.ok(tr.classList.contains('hv-bagging'));
  assert.equal(tr.querySelector('td[data-label="Surname"] .bagging-tag').textContent,'BAGGING');
  assert.match(tr.querySelector('.hv-actions-cell button').getAttribute('onclick'),/dischargeFistulaFromHandover\('b1','Paul Said','bagging'\)/);
  const {w,calls}=discharge(t);w.dischargeFistulaFromHandover('b1','Paul Said','bagging');
  assert.match(w.document.getElementById('mb').textContent,/drain removed/i);
  await w.confirmFistulaDischarge('b1','bagging');
  const caseWrite=calls.find(c=>c[0]==='case');assert.equal(caseWrite[2].fistula_closed_reason,'Drain removed');
});

test('the registry filter separates fistulas from bagging advice', t=>{
  const rows=[{...FIS,id:'f1',surname:'Borg'},{id:'b1',surname:'Said',first_name:'Paul',patient_kind:'fistula',fistula_category:'bagging',procedure_performed:'PCD'}];
  const w=registry(t,rows);
  w.renderFistulaPatients();
  assert.deepEqual([...w.document.querySelectorAll('.nm')].map(n=>n.textContent),['Maria Borg','Paul Said']);
  assert.equal(w.document.querySelectorAll('.bagging-tag').length,1);
  w.document.getElementById('fis-kind').value='bagging';w.renderFistulaPatients();
  assert.deepEqual([...w.document.querySelectorAll('.nm')].map(n=>n.textContent),['Paul Said']);
  w.document.getElementById('fis-kind').value='fistula';w.renderFistulaPatients();
  assert.deepEqual([...w.document.querySelectorAll('.nm')].map(n=>n.textContent),['Maria Borg']);
});

test('Add opens a two-pathway chooser; each button opens its form, and Back returns to the chooser', async t=>{
  const {w}=fistulaForm(t);
  await w.openFistulaPatientModal();
  // Chooser first — no form fields yet.
  assert.match(w.document.getElementById('mb').textContent,/Which pathway\?/);
  assert.equal(w.document.getElementById('fis-first'),null);
  const [fis,bag]=w.document.querySelectorAll('.fis-path-btn');
  assert.match(fis.getAttribute('onclick'),/openFistulaPatientForm\(null,'fistula'\)/);
  assert.match(bag.getAttribute('onclick'),/openFistulaPatientForm\(null,'bagging'\)/);
  // Bagging pathway opens the form with the kind fixed and a Back button.
  await w.openFistulaPatientForm(null,'bagging');
  assert.equal(w.document.getElementById('fis-kind-value').value,'bagging');
  assert.match(w.document.querySelector('.fis-path-chip').textContent,/Bagging advice/);
  const back=w.document.querySelector('.mact .btn-cancel');
  assert.match(back.textContent,/Back/);assert.match(back.getAttribute('onclick'),/openFistulaPatientModal\(\)/);
  // The "change" link also returns to the chooser.
  assert.match(w.document.querySelector('.fis-path-chip .fis-change').getAttribute('onclick'),/openFistulaPatientModal\(\)/);
});

test('editing a patient skips the chooser and opens straight into their pathway', async t=>{
  const {w}=fistulaForm(t);
  w.fetchPatientById=async()=>({data:{id:'b1',first_name:'Paul',surname:'Said',patient_kind:'fistula',fistula_category:'bagging',procedure_performed:'PCD'},error:null});
  await w.openFistulaPatientModal('b1');
  assert.equal(w.document.getElementById('mb').textContent.includes('Which pathway?'),false);
  assert.equal(w.document.getElementById('fis-kind-value').value,'bagging');
  assert.equal(w.document.getElementById('fis-first').value,'Paul');
  assert.equal(w.document.querySelector('.fis-path-chip .fis-change'),null,'no change link when editing');
  assert.match(w.document.querySelector('.mact .btn-cancel').textContent,/Cancel/);
});
