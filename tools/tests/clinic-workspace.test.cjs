const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../../assets/clinic-workspace.js'),'utf8');
function boot(t){
  const dom=new JSDOM('<!doctype html><body><div id="cw-dashboard"></div></body>',{runScripts:'outside-only',url:'https://clinic.test'});t.after(()=>dom.window.close());
  const w=dom.window;w.TODAY='2026-10-08';w.normaliseFollowupOwner=x=>/jason/i.test(x)?'Jason':/lorraine/i.test(x)?'Lorraine':'Common';
  w.attDisplayName=u=>u.email==='jason@example.test'?'Jason Fenech':'Nurse';w.handoverShouldAutoLeave=p=>!!p.deceased_date||p.allClosed;
  w.isFistulaPatient=p=>p.patient_kind==='fistula';w.isBaggingPatient=()=>false;w.fmtShortDate=x=>x;w.followupMonthName=()=> 'October';
  w.statusLabel=x=>x;w.appointmentNurseLabel=a=>a.staff?.full_name||'Common';w.eval(source);return w;
}
const p=(id,extra={})=>({id,first_name:'Alex',surname:id,id_card:'ID-'+id,followup_owner:'Jason',is_inpatient:true,...extra});
test('Today My patients follows the named caseload while appointments follow actual nurse allocation',t=>{
  const w=boot(t),patients=[p('mine'),p('other',{followup_owner:'Lorraine'}),p('shared',{followup_owner:'Common',patient_kind:'fistula'})];
  const s={scope:'my',user:{email:'jason@example.test'},patients,reminders:{buckets:{overdue:patients,current:[],nodue:[]}},appointments:[
    {patient_id:'mine',appt_date:w.TODAY,assigned_to:'l',staff:{full_name:'Lorraine'}},
    {patient_id:'other',appt_date:w.TODAY,assigned_to:'j',staff:{full_name:'Jason Fenech'}},
    {patient_id:'mine',appt_date:w.TODAY},
    {patient_id:'shared',appt_date:w.TODAY,assigned_to:'j',staff:{full_name:'Jason Fenech'}}]};
  const m=w.ClinicWorkspace.model(s);assert.deepEqual(Array.from(m.ward,x=>x.id),['mine']);
  assert.deepEqual(Array.from(m.appointments,x=>x.patient_id),['other','mine','shared']);assert.equal(m.overdue.length,1);
  s.scope='all';assert.equal(w.ClinicWorkspace.model(s).ward.length,3);
});
test('Today current worklists omit archived, deceased and fully closed patients and retain remaining stomas and fistulas',t=>{
  const w=boot(t),patients=[p('archived',{archived:true}),p('dead',{deceased_date:'2026-10-01'}),p('closed',{allClosed:true}),p('multi',{oneClosed:true}),p('fistula',{patient_kind:'fistula',followup_owner:'Common'})];
  const m=w.ClinicWorkspace.model({scope:'all',patients,appointments:[],reminders:{buckets:{overdue:patients}}});
  assert.deepEqual(Array.from(m.ward,x=>x.id),['fistula','multi']);assert.equal(m.overdue.length,2);
});
test('an unrecognised nurse cannot silently inherit the Common caseload',t=>{
  const w=boot(t);assert.equal(w.ClinicWorkspace.mine(p('shared',{followup_owner:'Common'}),{email:'unknown@example.test'}),false);
});
test('patient context shows each present stoma and distinguishes missing appointment data from no booking',t=>{
  const w=boot(t);w.stomasPresentOn=()=>[{type:'End ileostomy'},{type:'Urostomy'},{type:'Closed colostomy',ended:'2026-10-01'}];
  const patient=p('context');let html=w.ClinicWorkspace.contextHTML(patient);
  assert.match(html,/End ileostomy \+ Urostomy/);assert.doesNotMatch(html,/Closed colostomy/);assert.match(html,/Not loaded/);
  html=w.ClinicWorkspace.contextHTML(patient,[]);assert.match(html,/None booked/);
  html=w.ClinicWorkspace.contextHTML(patient,[{status:'cancelled',appt_date:'2026-10-09'},{status:'booked',appt_date:'2026-11-01',appt_slot:'10:00'},{status:'booked',appt_date:'2026-10-10',appt_slot:'09:00'}]);
  assert.match(html,/2026-10-10 09:00/);assert.doesNotMatch(html,/2026-10-09/);
});
test('a failed dashboard source shows an unknown count and an error, while independent lists remain usable',async t=>{
  const w=boot(t);w.getCurrentUserForAudit=async()=>({email:'jason@example.test'});w.SB={from:table=>({table,select(){return this;},eq(){return this;}})};
  w.fetchAllRows=async build=>build().table==='patients'?{rows:[p('ok')],error:null}:{rows:[],error:{message:'unavailable'}};
  w.getReminderData=async()=>({buckets:{overdue:[],current:[],nodue:[]}});w.enrichAppointments=async x=>x;
  await w.ClinicWorkspace.loadDashboard();const el=w.document.getElementById('cw-dashboard');
  assert.match(el.innerHTML,/Could not load this list/);assert.equal(el.querySelector('[data-jump="appointments"] strong').textContent,'—');
  assert.equal(el.querySelector('[data-jump="ward"] strong').textContent,'1');assert.ok(el.querySelector('[data-patient="ok"]'));
});
test('save and connection feedback remains available with the original navigation and across patient changes',t=>{
  const w=boot(t);w.document.body.innerHTML='<div id="app"><nav class="tabs">Original area tabs</nav><nav class="subtabs">Original page tabs</nav><main class="main"><section id="page">Patient work</section></main></div>';
  w.ClinicWorkspace.navigation('today');w.ClinicWorkspace.beginSave();
  assert.match(w.document.querySelector('#cw-status-strip').textContent,/Saving/);
  w.ClinicWorkspace.endSave({message:'Offline'});w.ClinicWorkspace.connection('SUBSCRIBED');w.ClinicWorkspace.navigation('patient-record');
  assert.equal(w.document.querySelectorAll('#cw-status-strip').length,1);
  assert.match(w.document.querySelector('#cw-status-strip').textContent,/Updates connected.*Not saved/);
  assert.equal(w.document.querySelector('.tabs').textContent,'Original area tabs');
  assert.equal(w.document.querySelector('.subtabs').textContent,'Original page tabs');
  assert.equal(w.document.querySelector('#page').textContent,'Patient work');
  assert.equal(w.document.querySelector('#cw-sidebar,#cw-breadcrumbs,#cw-mobile-quick'),null);
});
test('timeline keeps distinct stoma identities, uncertain appliance links and original signed revisions',t=>{
  const w=boot(t),stomas=[{uid:'old',code:'S1',type:'Ileostomy',formed:'2026-01-01',ended:'2026-02-01',endedBy:'refashioned'},{uid:'new',code:'S2',type:'Ileostomy',formed:'2026-02-01',origin:'refashion',target:'old'}];
  w.stomaTimeline=()=>stomas;w.parseEpisodeApplianceRows=r=>r.appliances||[];w.recCode=()=> 'EP-TEST';
  w.eval(fs.readFileSync(path.join(__dirname,'../../assets/clinic-timeline.js'),'utf8'));
  const revisions=[{version:1,report:'Original signed report',snapshot:{stomas:[{uid:'new',notes:'First finding'}]}},{version:2,report:'Corrected signed report',snapshot:{stomas:[{uid:'new',notes:'Corrected finding'}]}}];
  const result=w.ClinicTimeline.build(p('history'),[{id:'ep',kind:'episode',record_date:'2026-02-01',appliances:[{stoma_type:'Ileostomy',appliances:['Ambiguous setup']},{stoma_uid:'new',appliances:['Linked setup']}]}],[],[{id:'enc',encounter_date:'2026-02-02',assessment:{versions:revisions}}]);
  const old=result.events.find(e=>e.id==='ended:old');assert.deepEqual(Array.from(old.scope),['old']);
  assert.equal(result.events.find(e=>e.id==='episode-appliance:ep:0').scope.length,0);
  assert.deepEqual(Array.from(result.events.find(e=>e.id==='episode-appliance:ep:1').scope),['new']);
  const enc=result.events.find(e=>e.encounter);assert.equal(enc.versions.length,2);assert.equal(enc.versions[0].report,'Original signed report');
  const filtered=w.ClinicTimeline.filtered({...result,type:'all',stoma:'new',query:''});assert.ok(filtered.some(e=>e.id==='admit:ep'));assert.ok(!filtered.some(e=>e.id==='formed:old'));
  assert.equal(w.ClinicTimeline.scopedReport(enc.versions[0],'new'),'First finding');
});
