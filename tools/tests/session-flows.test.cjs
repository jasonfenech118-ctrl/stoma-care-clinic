// Flows added this session that live in index.html: booking an overtime nurse
// from the postop list, the visit review window, and the Appliances step that
// opens its picker by itself.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const visitModule=fs.readFileSync(path.join(__dirname,'../../assets/visit-stoma-review.js'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
const tick=()=>new Promise(r=>setTimeout(r,0));

test('postop follow-up: an overtime nurse is offered, and a bank-only nurse is booked on bank_staff_id',async t=>{
  const dom=new JSDOM('<div id="mb"><input id="pb-date" value="2026-10-25"><div id="pb-msg"></div></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  const inserts=[];
  w.eval(`var TODAY='2026-10-06';var staffList=[{id:'j',full_name:'Jason Fenech'},{id:'t',full_name:'Tracey Galea'}];
    function defaultCode(st){return st.id==='t'?'off':'working';} function isClinicDay(){return true;} function isTILNote(n){return /^TIL-/.test(String(n||''));}
    function normaliseFollowupOwner(x){return String(x||'').split(' ')[0];} function updatePatientTolerant(){return Promise.resolve({error:null});}
    function closeModal(){} function alert(){} function fmtShortDate(d){return d;} function refreshAppointmentViews(){} function loadPostopDischarges(){}
    var postopBookCtx=null;var ROSTER_OFF_STATUSES=['off','sick_leave','maternity_leave','study_leave','annual_leave','public_holiday'];`);
  w.SB={from:table=>{const rows={roster:[],bank_staff_assignments:[{work_date:'2026-10-25',notes:null,bank_staff_id:'b9',bank_staff:{id:'b9',full_name:'Maria Bank'}}],
      leave_records:[{leave_type:'overtime',start_date:'2026-10-25',notes:'Core OT: 07:00-18:00',staff_id:'t',staff:{id:'t',full_name:'Tracey Galea'}}]}[table]||[];
    const q={_r:rows,select:()=>q,eq:(k,v)=>{q._r=q._r.filter(r=>k in r?String(r[k])===String(v):true);return q;},like:(k,p)=>{q._r=q._r.filter(r=>String(r[k]||'').startsWith(p.replace('%','')));return q;},
      insert:row=>{inserts.push(JSON.parse(JSON.stringify(row)));return Promise.resolve({error:null});},then:(a,b)=>Promise.resolve({data:q._r}).then(a,b)};return q;}};
  for(const name of ['normStaffName','staffNamesWithinOneEdit','findCoreStaffByName','calendarNurseBankIds','addCalendarNurse','fetchRosterDay','buildRosterNurses','nurseListForDate','firstNameOf','savePostopBooking'])w.eval(fn(name));
  const nurses=JSON.parse(JSON.stringify(await w.nurseListForDate('2026-10-25')));
  assert.deepEqual(nurses.map(n=>[n.name,n.type]),[['Jason Fenech','core'],['Tracey Galea','core-ot'],['Maria Bank','ot']]);
  w.postopBookCtx={patientId:'p1',nurseId:'b9',nurseName:'Maria Bank',slot:'09:00',nurses};await w.savePostopBooking();
  w.postopBookCtx={patientId:'p2',nurseId:'t',nurseName:'Tracey Galea',slot:'09:30',nurses};await w.savePostopBooking();
  assert.deepEqual(inserts.map(r=>[r.assigned_to,r.bank_staff_id]),[[null,'b9'],['t',null]]);
});

function reviewSetup(t,{appt,today='2026-10-25'}){
  const dom=new JSDOM('<div id="mb"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  const saves=[];
  w.eval(`var TODAY='${today}';function isEncounterUser(){return true;} function stomaTypeCanHaveRod(t){return /loop/i.test(t||'');}
    function stomasPresentOn(){return [{uid:'a',typeLabel:'End colostomy'}];} function parseComplications(){return [];}
    function htmlSafe(x){return String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');} function jsSafe(x){return String(x??'');} function fmtShortDate(d){return d;}
    function openMo(){} function closeModal(){} function attDisplayName(u){return u.name;} function getCurrentUserForAudit(){return Promise.resolve({email:'lorraine.marie.stivala@gov.mt',name:'Lorraine Marie Stivala'});}
    function updatePatientTolerant(){return Promise.resolve({error:null});} function linkVisitSkinComplications(){return Promise.resolve();} var clrState={appts:[]};`);
  w.updateAppointmentTolerant=async(id,patch)=>{saves.push(JSON.parse(JSON.stringify(patch)));return {error:null,dropped:[]};};
  w.SB={from:()=>{const q={select:()=>q,eq:()=>q,lte:()=>q,maybeSingle:async()=>({data:JSON.parse(JSON.stringify(appt)),error:null}),then:(a,b)=>Promise.resolve({data:[]}).then(a,b)};return q;}};
  w.fetchPatientById=async()=>({data:{id:'p1',first_name:'Saviour',surname:'Ciantar',id_card:'733749M'}});
  w.eval(visitModule);
  for(const name of ['visitReviewButtonHTML','openVisitReview','setVisitReviewVersion','toggleVisitReviewChanges','renderVisitReview','saveVisitReviewEdit'])w.eval(fn(name));
  w.eval('var visitReviewState=null;');
  return {w,saves,mb:()=>w.document.getElementById('mb')};
}
const v1=[{uid:'a',type:'End colostomy',name:'End Colostomy',colour:'Healthy pink',output:['Flatus present'],skin:{status:'Healthy',problems:[]},rod:{status:'Not recorded',due:'',removed:''},rod_asked:false,notes:'Settled.'}];

test('visit review: opens the latest signed version; a review from another day is locked with no Edit',async t=>{
  const appt={id:'ap1',patient_id:'p1',appt_date:'2026-10-24',appt_slot:'09:00',stoma_assessment:{schema:2,current:v1,versions:[{version:1,saved_at:'2026-10-24T08:00:00Z',author_name:'Jacqueline Sammut',stomas:v1}]}};
  const {w,mb}=reviewSetup(t,{appt});
  assert.match(w.visitReviewButtonHTML(appt),/Open review · V1/);
  await w.openVisitReview('ap1');
  assert.match(mb().textContent,/Visit review · V1/);assert.match(mb().textContent,/Signed by: Jacqueline Sammut/);assert.match(mb().textContent,/Healthy pink/);
  assert.match(mb().textContent,/edited only on the day it was recorded/);assert.doesNotMatch(mb().innerHTML,/Edit review/);
});

test('visit review: editing on the day saves V2 signed by the nurse; no change saves nothing',async t=>{
  const appt={id:'ap1',patient_id:'p1',appt_date:'2026-10-25',appt_slot:'09:00',stoma_assessment:{schema:2,current:v1,versions:[{version:1,saved_at:'2026-10-25T08:00:00Z',author_name:'Jacqueline Sammut',stomas:v1}]}};
  const {w,saves,mb}=reviewSetup(t,{appt});
  await w.openVisitReview('ap1');assert.match(mb().innerHTML,/Edit review \(V2\)/);
  w.renderVisitReview(true);await tick();
  await w.saveVisitReviewEdit();assert.equal(saves.length,0);assert.match(mb().querySelector('#vr-msg').textContent,/no changes/);
  const sel=mb().querySelector('[data-vsr="colour"][data-uid="a"]');sel.value='Dusky';sel.dispatchEvent(new w.Event('change',{bubbles:true}));
  await w.saveVisitReviewEdit();
  assert.equal(saves.length,1);const st=saves[0].stoma_assessment;assert.equal(st.versions.length,2);
  assert.deepEqual({v:st.versions[1].version,by:st.versions[1].author_name,colour:st.current[0].colour},{v:2,by:'Lorraine Marie Stivala',colour:'Dusky'});
  assert.match(mb().textContent,/Visit review · V2/);
});

test('Complete visit embeds appliance pages and resumes the same flow',async t=>{
  const dom=new JSDOM('<div id="es-pane-3"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  w.eval(`var opened=0,rendered=0,visitWizard=null;function esOpenAppliancePicker(){opened++;}function renderVisitStep(){rendered++;}var esState={apptId:'ap1',step:3};`);
  w.eval(fn('esRenderAppliancePane'));
  w.esRenderAppliancePane();assert.equal(w.eval('opened'),1);
  w.eval('esState.applianceFlow={pending:{integrated:true}}');
  w.esRenderAppliancePane();assert.equal(w.eval('opened'),1);assert.equal(w.eval('rendered'),1);
});
