// Per-stoma assessment in the Complete visit Clinical review step.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync(path.join(__dirname,'../../assets/visit-stoma-review.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
function setup(t,{jason=true,stomas,patient={}}={}){
  const dom=new JSDOM('<div id="host"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  w.TODAY='2026-10-25';w.isEncounterUser=()=>jason;w.stomaTypeCanHaveRod=t=>/loop/i.test(t||'');w.parseComplications=p=>JSON.parse(p.complications||'[]');
  w.stomasPresentOn=()=>JSON.parse(JSON.stringify(stomas||[{uid:'a',typeLabel:'End colostomy'},{uid:'b',typeLabel:'Loop ileostomy'}]));
  w.eval(src);const host=w.document.getElementById('host');
  const pat={id:'p1',rod_stoma_uid:null,rod_removal_date:null,rod_removed_date:null,...patient};
  return {w,host,pat,mount:(appt={id:'ap1',appt_date:'2026-10-25'},resume=false)=>w.VisitStomaReview.mount(host,{appt,patient:pat,resume})};
}
function change(w,el,value){if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));}
const tick=()=>new Promise(r=>setTimeout(r,0));

test('each stoma gets its own named column with colour, output, skin and notes, without rod controls',async t=>{
  const off=setup(t,{jason:false});await off.mount();assert.equal(off.host.innerHTML,'');assert.equal(off.w.VisitStomaReview.payloadFor('ap1'),null);
  const {w,host,mount}=setup(t);await mount();
  assert.deepEqual([...host.querySelectorAll('.jenc-stoma-title')].map(h=>h.textContent),['End Colostomy','Loop Ileostomy']);
  for(const uid of ['a','b'])for(const k of ['colour','output','skin','notes'])assert.ok(host.querySelector('[data-vsr="'+k+'"][data-uid="'+uid+'"]'),k+uid);
  assert.deepEqual([...host.querySelectorAll('[data-vsr="skin"][data-uid="a"]')].map(x=>x.value),['Healthy skin','Irritation','Excoriation','Fungal infection','Psoriasis','Eczema','Dermatitis','Metaplasia','Ulcerated','Varices','Bluish discolouration','Not assessed — flange in situ']);
  assert.equal(host.querySelector('[data-vsr^="rod"]'),null,'appointments never ask about rods, including a loop stoma’s first assessment');
  assert.doesNotMatch(host.textContent,/Rod present|Planned removal date|Rod removed on/i);
  assert.doesNotMatch(host.textContent,/\bS[12]\b/);
});

test('the assessment is kept per stoma; Nil and Healthy skin stand alone; notes are typed freely',async t=>{
  const {w,host,mount}=setup(t);await mount();const q=s=>host.querySelector(s);
  change(w,q('[data-vsr="colour"][data-uid="a"]'),'Healthy pink');
  change(w,q('[data-vsr="output"][data-uid="a"][value="Flatus present"]'),true);change(w,q('[data-vsr="output"][data-uid="a"][value="Liquid stools"]'),true);
  change(w,q('[data-vsr="output"][data-uid="b"][value="Nil"]'),true);
  assert.equal(q('[data-vsr="output"][data-uid="b"]').closest('details').open,true);
  change(w,q('[data-vsr="skin"][data-uid="a"][value="Irritation"]'),true);change(w,q('[data-vsr="skin"][data-uid="a"][value="Healthy skin"]'),true);
  change(w,q('[data-vsr="skin"][data-uid="b"][value="Healthy skin"]'),true);change(w,q('[data-vsr="skin"][data-uid="b"][value="Ulcerated"]'),true);
  const notes=q('[data-vsr="notes"][data-uid="a"]');notes.value='Peristomal skin intact.';notes.dispatchEvent(new w.Event('input',{bubbles:true}));
  const rows=JSON.parse(JSON.stringify(w.VisitStomaReview.payloadFor('ap1')));
  assert.deepEqual(rows[0],{uid:'a',type:'End colostomy',name:'End Colostomy',colour:'Healthy pink',output:['Flatus present','Liquid stools'],skin:{status:'Healthy',problems:[]},notes:'Peristomal skin intact.'});
  assert.deepEqual(rows[1].output,['Nil']);assert.deepEqual(rows[1].skin,{status:'Not healthy',problems:['Ulcerated']});
  assert.ok(rows.every(r=>!('rod' in r)&&!('rod_asked' in r)),'a new visit records no rod decision');
  assert.equal(w.VisitStomaReview.payloadFor('other-appt'),null);
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.summaryLines(rows))),[{name:'End Colostomy',text:'colour: healthy pink; output: Flatus present, Liquid stools; peristomal skin: healthy; notes: Peristomal skin intact.'},{name:'Loop Ileostomy',text:'output: Nil; peristomal skin: not healthy (Ulcerated)'}]);
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.skinFor('ap1'))),{problems:[{uid:'b',text:'Ulcerated'}],healthy:['a'],single:''});
});

test('an existing patient rod adds no appointment controls; the draft survives the appliance-picker rebuild; saved visits reopen',async t=>{
  const {w,host,pat,mount}=setup(t,{patient:{rod_stoma_uid:'b',rod_removal_date:'2026-10-27'}});await mount();const q=s=>host.querySelector(s);
  const before=JSON.parse(JSON.stringify(pat));
  assert.equal(q('[data-vsr^="rod"]'),null);
  change(w,q('[data-vsr="colour"][data-uid="a"]'),'Dusky');
  await mount({id:'ap1',appt_date:'2026-10-25'},true);assert.equal(q('[data-vsr="colour"][data-uid="a"]').value,'Dusky');
  await mount({id:'ap1',appt_date:'2026-10-25',stoma_assessment:[{uid:'a',type:'End colostomy',colour:'Necrotic',output:['Blood'],notes:'Saved note.',rod:{status:'Not recorded',due:'',removed:''}}]},false);
  assert.equal(q('[data-vsr="colour"][data-uid="a"]').value,'Necrotic');assert.equal(q('[data-vsr="notes"][data-uid="a"]').value,'Saved note.');
  assert.deepEqual(JSON.parse(JSON.stringify(pat)),before,'patient rod data stays untouched');
});

test('a new loop-stoma visit does not fetch previous assessments to decide whether to ask about a rod',async t=>{
  const {w,host,mount}=setup(t,{patient:{rod_removal_date:'2026-10-27'}});
  let reads=0;w.SB={from:()=>{reads++;throw new Error('No assessment history read is needed');}};
  await mount();assert.equal(reads,0);assert.equal(host.querySelector('[data-vsr^="rod"]'),null);
  assert.doesNotMatch(w.VisitStomaReview.summaryLines(w.VisitStomaReview.payloadFor('ap1'))[1].text,/rod/);
  assert.equal(w.VisitStomaReview.rodPatchFor,undefined);
});

test('editing a saved visit preserves its historical rod data without offering rod controls',async t=>{
  for(const status of ['In place','Removed']){
    for(const legacy of [false,true]){
      const row={uid:'b',type:'Loop ileostomy',name:'Loop Ileostomy',colour:'Healthy pink',output:[],skin:{status:'Healthy',problems:[]},
        rod:{status,due:'',removed:status==='Removed'?'2026-10-24':''},...(legacy?{}:{rod_asked:true}),notes:'Saved.'};
      const saved={schema:2,current:[row],versions:[{version:1,saved_at:'2026-10-25T08:00:00Z',author_name:'Nurse',stomas:[row]}]};
      const {w,host,mount}=setup(t,{stomas:[{uid:'b',typeLabel:'Loop ileostomy'}]});
      await mount({id:'ap1',appt_date:'2026-10-25',stoma_assessment:legacy?[row]:saved});
      assert.equal(host.querySelector('[data-vsr^="rod"]'),null);
      assert.equal(w.VisitStomaReview.storedFor('ap1',w.VisitStomaReview.payloadFor('ap1'),{name:'Nurse'}),null,'removing the control creates no spurious revision');
      const notes=host.querySelector('[data-vsr="notes"]');notes.value='Reviewed today.';notes.dispatchEvent(new w.Event('input',{bubbles:true}));
      const next=JSON.parse(JSON.stringify(w.VisitStomaReview.storedFor('ap1',w.VisitStomaReview.payloadFor('ap1'),{name:'Nurse'})));
      assert.deepEqual(next.current[0].rod,row.rod);
      assert.deepEqual(next.versions[0].stomas[0],row);
      assert.equal(next.current[0].rod_asked,row.rod_asked);
      assert.match(w.VisitStomaReview.reviewHTML(next.current,null),status==='In place'?/Present/:/Removed 2026-10-24/);
      assert.match(w.VisitStomaReview.summaryLines(next.current)[0].text,status==='In place'?/rod present/:/rod removed 2026-10-24/);
    }
  }
});

test('Complete visit advances and saves without a rod date, keeps complication checks and leaves patient rod fields alone',async t=>{
  const row={uid:'b',type:'Loop ileostomy',colour:'Healthy pink',output:['Nil'],skin:{status:'Healthy',problems:[]},rod:{status:'In place',due:'',removed:''},rod_asked:true,notes:'Saved.'};
  const {w,host,mount}=setup(t,{stomas:[{uid:'b',typeLabel:'Loop ileostomy'}],patient:{rod_stoma_uid:'b',rod_removal_date:'2026-10-27'}});
  await mount({id:'ap1',appt_date:'2026-10-25',stoma_assessment:[row]});
  w.document.body.insertAdjacentHTML('beforeend','<div id="mb"><input type="radio" name="of-cmp-review" value="none"><div id="of-review-error" hidden></div></div>');
  const steps=[],appointments=[],patients=[];
  w.esState={apptId:'ap1',patientId:'p1'};w.esOutcomeAttended=()=>true;w.esGoStep=n=>steps.push(n);
  w.eval(fn('esFollowupNext'));
  await w.esFollowupNext();assert.deepEqual(steps,[],'complication review is still required');
  assert.match(w.document.getElementById('of-review-error').textContent,/confirm how complications were reviewed/);
  w.document.querySelector('[name="of-cmp-review"]').checked=true;
  await w.esFollowupNext();assert.deepEqual(steps,[3],'the old rod with no date does not block the Appliances step');
  const notes=host.querySelector('[data-vsr="notes"]');notes.value='Reviewed.';notes.dispatchEvent(new w.Event('input',{bubbles:true}));
  w.getCurrentUserForAudit=async()=>({name:'Nurse',email:'nurse@gov.mt'});w.attDisplayName=u=>u.name;
  w.updateAppointmentTolerant=async(_id,patch)=>{appointments.push(JSON.parse(JSON.stringify(patch)));return {error:null,dropped:[]};};
  w.updatePatientTolerant=async(_id,patch)=>{patients.push(JSON.parse(JSON.stringify(patch)));return {error:null,dropped:[]};};
  w.linkVisitSkinComplications=async()=>{};w.closeModal=()=>{};w.refreshAppointmentViews=()=>{};w.alert=m=>{throw new Error(m);};
  w.eval(fn('commitOutcomeFollowup'));
  await w.commitOutcomeFollowup({apptId:'ap1',patientId:'p1',status:'attended',year:'2026',month:'11',followupFlexible:false,followupStatus:'active',owner:'Nurse',fn:'Test',sn:'Patient',idcard:'1M',phone:'',
    date:'2026-10-25',slot:'08:30',nurse:'core:nurse1',isDntuEditMode:false,dntuTarget:0,complicationReview:'none',applianceReview:'unchanged',complicationReviews:[],followupAction:'review-month',noDueMonth:false},[]);
  assert.equal(appointments.length,1);assert.equal(appointments[0].status,'attended');assert.deepEqual(appointments[0].stoma_assessment.current[0].rod,row.rod);
  assert.equal(patients.length,1);assert.equal(patients[0].followup_due_month,11);assert.ok(Object.keys(patients[0]).every(k=>!k.startsWith('rod_')));
});

test('saving an edited visit review preserves a historical rod without a removal date and never writes patient rod fields',async t=>{
  const row={uid:'b',type:'Loop ileostomy',colour:'Healthy pink',output:[],skin:{status:'Healthy',problems:[]},rod:{status:'In place',due:'',removed:''},rod_asked:true,notes:'Saved.'};
  const appt={id:'ap1',patient_id:'p1',appt_date:'2026-10-25',stoma_assessment:[row]};
  const {w,host,mount}=setup(t,{stomas:[{uid:'b',typeLabel:'Loop ileostomy'}]});await mount(appt);
  w.document.body.insertAdjacentHTML('beforeend','<div id="vr-msg"></div><button id="vr-save">Save as V2</button>');
  const notes=host.querySelector('[data-vsr="notes"]');notes.value='Reviewed.';notes.dispatchEvent(new w.Event('input',{bubbles:true}));
  w.eval('var visitReviewState=null;var clrState={appts:[]};');w.visitReviewState={apptId:'ap1',appt};
  const saves=[];let patientWrites=0,rendered=false;
  w.getCurrentUserForAudit=async()=>({name:'Nurse',email:'nurse@gov.mt'});w.attDisplayName=u=>u.name;
  w.updateAppointmentTolerant=async(_id,patch)=>{saves.push(JSON.parse(JSON.stringify(patch)));return {error:null,dropped:[]};};
  w.updatePatientTolerant=async()=>{patientWrites++;return {error:null};};w.linkVisitSkinComplications=async()=>{};w.renderVisitReview=()=>{rendered=true;};w.htmlSafe=String;
  w.eval(fn('saveVisitReviewEdit'));await w.saveVisitReviewEdit();
  assert.equal(saves.length,1);assert.deepEqual(saves[0].stoma_assessment.current[0].rod,row.rod);
  assert.equal(saves[0].stoma_assessment.versions[1].author_name,'Nurse');assert.equal(patientWrites,0);assert.equal(rendered,true);
});

test('peristomal skin: an open skin complication pre-fills it; findings are tied to their stoma; "+ Add other…" extends a list',async t=>{
  const {w,host,mount}=setup(t,{patient:{complications:JSON.stringify([{id:'c1',text:'Fungal infection',stoma_uid:'b',status:'open'},{id:'c2',text:'Retraction',stoma_uid:'b',status:'open'}])}});
  let hooked=0;w.onVisitSkinChange=()=>hooked++;await mount();const q=s=>host.querySelector(s);
  assert.equal(q('[data-vsr="skin"][data-uid="b"][value="Fungal infection"]').checked,true);
  change(w,q('[data-vsr="skin"][data-uid="a"][value="Excoriation"]'),true);assert.equal(hooked,1);assert.equal(q('[data-vsr="skin"][data-uid="a"]').closest('details').open,true);
  change(w,q('[data-vsr="skin"][data-uid="b"][value="Healthy skin"]'),true);
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.skinFor('ap1'))),{problems:[{uid:'a',text:'Excoriation'}],healthy:['b'],single:''});
  w.prompt=()=>'Granuloma';host.querySelector('[data-vsr-add="skin"][data-uid="a"]').click();await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.state.stomas[0].skin)),{status:'Not healthy',problems:['Excoriation','Granuloma']});assert.equal(hooked,3);
  w.prompt=()=>'Pale';change(w,q('[data-vsr="colour"][data-uid="a"]'),'__add__');await tick();assert.equal(w.VisitStomaReview.state.stomas[0].colour,'Pale');
  assert.equal(w.VisitStomaReview.isSkinProblem('Excoriation'),true);assert.equal(w.VisitStomaReview.isSkinProblem('Healthy skin'),false);
});

test('saving the visit adds each skin problem as a complication on its stoma and resolves skin complications on a Healthy stoma',async t=>{
  const {w,mount}=setup(t);mount();
  let stored=[{id:'c1',text:'Fungal infection',stoma_uid:'b',status:'open',events:[]},{id:'c2',text:'Retraction',stoma_uid:'b',status:'open',events:[]},{id:'c3',text:'Mucocutaneous separation',stoma_uid:'a',status:'open',events:[]}];
  w.fetchPatientById=async()=>({data:{id:'p1',complications:JSON.stringify(stored)}});w.getCurrentUserForAudit=async()=>({name:'Jason Fenech'});
  w.saveComplicationsWithEvent=async(_id,list)=>{stored=JSON.parse(JSON.stringify(list));return {list};};w.clrState={patient:null};w.alert=m=>{throw new Error(m);};
  w.eval(fn('parseComplications'));w.eval(fn('linkVisitSkinComplications'));
  await w.linkVisitSkinComplications('p1',{problems:[{uid:'a',text:'Mucocutaneous separation'},{uid:'a',text:'Folliculitis'}],healthy:['b'],single:''});
  const by=id=>stored.find(c=>c.id===id);
  assert.equal(by('c1').status,'resolved');assert.equal(by('c1').resolved_date,'2026-10-25');
  assert.equal(by('c2').status,'open','a non-skin complication is left alone');
  assert.equal(stored.filter(c=>c.text==='Mucocutaneous separation').length,1,'an open one is not duplicated');
  const added=stored.find(c=>c.text==='Folliculitis');assert.equal(added.stoma_uid,'a');assert.equal(added.status,'open');assert.equal(added.source,'Appointment');
});

test('visit reviews are signed versions: editing on the day makes V2 with changes in red; a review from another day is locked',async t=>{
  const v1=[{uid:'a',type:'End colostomy',name:'End Colostomy',colour:'Healthy pink',output:['Flatus present'],skin:{status:'Healthy',problems:[]},rod:{status:'Not recorded',due:'',removed:''},rod_asked:false,notes:'Settled.'},
    {uid:'b',type:'Loop ileostomy',name:'Loop Ileostomy',colour:'',output:[],skin:{status:'',problems:[]},rod:{status:'Not recorded',due:'',removed:''},rod_asked:false,notes:''}];
  const stored={schema:2,current:v1,versions:[{version:1,saved_at:'2026-10-25T08:00:00Z',author_name:'Jacqueline Sammut',author_email:'j@x',stomas:v1}]};
  const {w,host,mount}=setup(t);w.getCurrentUserForAudit=async()=>({email:'jason.fenech@gov.mt'});w.attDisplayName=()=> 'Jason Fenech';
  await mount({id:'ap1',appt_date:'2026-10-25',stoma_assessment:stored});const q=s=>host.querySelector(s);
  assert.match(host.textContent,/Editing V2 · changes in red/);assert.match(host.textContent,/Signature will be recorded automatically: Jason Fenech/);
  assert.equal(q('[data-vsr="colour"][data-uid="a"]').value,'Healthy pink');
  change(w,q('[data-vsr="colour"][data-uid="a"]'),'Dusky');assert.ok(q('[data-vsr="colour"][data-uid="a"]').classList.contains('jenc-changed'));assert.match(host.textContent,/Previously: Healthy pink/);
  change(w,q('[data-vsr="output"][data-uid="a"][value="Liquid stools"]'),true);
  assert.equal(q('[data-vsr="output"][data-uid="a"]').closest('details').querySelector('summary .jenc-change').textContent,'Liquid stools');
  const notes=q('[data-vsr="notes"][data-uid="a"]');notes.value='Settled. Skin reviewed.';notes.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.match(q('.vsr-note-diff[data-uid="a"] .jenc-change').textContent,/Skin/);
  const rows=w.VisitStomaReview.payloadFor('ap1');const next=JSON.parse(JSON.stringify(w.VisitStomaReview.storedFor('ap1',rows,{name:'Jason Fenech',email:'jason.fenech@gov.mt'})));
  assert.equal(next.versions.length,2);assert.equal(next.versions[0].author_name,'Jacqueline Sammut');assert.equal(next.versions[1].author_name,'Jason Fenech');assert.equal(next.versions[1].version,2);
  assert.equal(next.current[0].colour,'Dusky');assert.deepEqual(next.versions[0].stomas[0].colour,'Healthy pink');
  const html=w.VisitStomaReview.reviewHTML(next.versions[1].stomas,next.versions[0].stomas);const el=w.document.createElement('div');el.innerHTML=html;
  assert.deepEqual([...el.querySelectorAll('.jenc-change')].map(x=>x.textContent.trim()).filter(Boolean).slice(0,2),['Dusky','Liquid stools']);
  // unchanged → nothing to store
  await mount({id:'ap1',appt_date:'2026-10-25',stoma_assessment:next});assert.equal(w.VisitStomaReview.storedFor('ap1',w.VisitStomaReview.payloadFor('ap1'),{name:'x'}),null);
  // recorded yesterday → locked, read-only, nothing saved
  const old={...stored,versions:[{...stored.versions[0],saved_at:'2026-10-24T09:00:00Z'}]};
  await mount({id:'ap2',appt_date:'2026-10-24',stoma_assessment:old});
  assert.match(host.textContent,/Recorded 2026-10-24 — a visit review can be edited only on the day it was recorded/);assert.equal(host.querySelector('[data-vsr]'),null);
  assert.match(host.textContent,/Signed by: Jacqueline Sammut/);assert.equal(w.VisitStomaReview.payloadFor('ap2'),null);
  assert.equal(w.VisitStomaReview.currentRows('ap2')[0].colour,'Healthy pink');
  assert.equal(w.VisitStomaReview.editableToday({appt_date:'2026-10-24',stoma_assessment:old}),false);assert.equal(w.VisitStomaReview.editableToday({appt_date:'2026-10-24'}),true);
});

test('the Seen (Complete visit) form has no Support / referrals section — referrals live in encounters',async t=>{
  const {w,host,mount}=setup(t);await mount();
  assert.doesNotMatch(host.textContent,/referral/i);assert.equal(host.querySelector('[data-vsr-ref-add],[data-vsr^="ref-"]'),null);
  assert.equal(w.VisitStomaReview.referralsPatchFor,undefined);assert.equal(w.VisitStomaReview.referralLines,undefined);
});

test('a fistula patient’s visit has one Fistula column: output and the skin around it, no colour and no rod',async t=>{
  const {host,mount}=setup(t,{stomas:[{uid:'fistula',type:'Fistula',typeLabel:'Fistula'}]});await mount();
  assert.deepEqual([...host.querySelectorAll('.jenc-stoma-title')].map(h=>h.textContent),['Fistula']);
  assert.equal(host.querySelector('[data-vsr="colour"]'),null);assert.equal(host.querySelector('[data-vsr="rod"]'),null);
  const labels=[...host.querySelectorAll('label')].map(l=>l.textContent);
  assert.ok(labels.includes('Output'));assert.ok(labels.includes('Skin around the fistula'));
  assert.ok(host.querySelector('[data-vsr="output"][data-uid="fistula"]'));assert.ok(host.querySelector('[data-vsr="notes"][data-uid="fistula"]'));
});

test('assessment requires colour, output and skin on every current stoma; notes are optional',async t=>{
  const {w,host,mount}=setup(t);await mount();
  assert.equal(w.VisitStomaReview.validate('ap1'),false);
  assert.match(host.querySelector('[role="alert"]').textContent,/End Colostomy.*Loop Ileostomy/);
  for(const id of ['a','b']){
    change(w,host.querySelector('[data-vsr="colour"][data-uid="'+id+'"]'),'Healthy pink');
    change(w,host.querySelector('[data-vsr="output"][data-uid="'+id+'"][value="Nil"]'),true);
    change(w,host.querySelector('[data-vsr="skin"][data-uid="'+id+'"][value="Healthy skin"]'),true);
    if(id==='a')assert.equal(w.VisitStomaReview.validate('ap1'),false);
  }
  assert.equal(w.VisitStomaReview.validate('ap1'),true);
  assert.equal(w.VisitStomaReview.payloadFor('ap1')[0].notes,'');
  change(w,host.querySelector('[data-vsr="skin"][data-uid="b"][value="Not assessed — flange in situ"]'),true);
  assert.equal(w.VisitStomaReview.validate('ap1'),true);
  assert.equal(w.VisitStomaReview.payloadFor('ap1')[1].skin.status,'Not assessed');
  assert.equal(w.VisitStomaReview.skinFor('ap1').problems.length,0);
});
