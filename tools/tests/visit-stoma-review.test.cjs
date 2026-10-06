// Jason's per-stoma assessment in the Complete visit Clinical review step.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync(path.join(__dirname,'../../assets/visit-stoma-review.js'),'utf8');
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

test('only Jason sees it; each stoma gets its own named column with colour, output, skin, notes, and a rod only for a loop stoma',async t=>{
  const off=setup(t,{jason:false});await off.mount();assert.equal(off.host.innerHTML,'');assert.equal(off.w.VisitStomaReview.payloadFor('ap1'),null);
  const {w,host,mount}=setup(t);await mount();
  assert.deepEqual([...host.querySelectorAll('.jenc-stoma-title')].map(h=>h.textContent),['End Colostomy','Loop Ileostomy']);
  for(const uid of ['a','b'])for(const k of ['colour','output','skin','notes'])assert.ok(host.querySelector('[data-vsr="'+k+'"][data-uid="'+uid+'"]'),k+uid);
  assert.deepEqual([...host.querySelectorAll('[data-vsr="skin"][data-uid="a"]')].map(x=>x.value),['Healthy skin','Irritation','Excoriation','Fungal infection','Psoriasis','Eczema','Dermatitis','Metaplasia','Ulcerated']);
  assert.equal(host.querySelector('[data-vsr="rod"][data-uid="a"]'),null,'an end colostomy never has a rod');assert.ok(host.querySelector('[data-vsr="rod"][data-uid="b"]'));
  assert.doesNotMatch(host.textContent,/\bS[12]\b/);
});

test('the assessment is kept per stoma; Nil and Healthy skin stand alone; a ticked rod needs its date; notes are typed freely',async t=>{
  const {w,host,mount}=setup(t);await mount();const q=s=>host.querySelector(s);
  change(w,q('[data-vsr="colour"][data-uid="a"]'),'Healthy pink');
  change(w,q('[data-vsr="output"][data-uid="a"][value="Flatus present"]'),true);change(w,q('[data-vsr="output"][data-uid="a"][value="Liquid stools"]'),true);
  change(w,q('[data-vsr="output"][data-uid="b"][value="Nil"]'),true);
  assert.equal(q('[data-vsr="output"][data-uid="b"]').closest('details').open,true);
  change(w,q('[data-vsr="skin"][data-uid="a"][value="Irritation"]'),true);change(w,q('[data-vsr="skin"][data-uid="a"][value="Healthy skin"]'),true);
  change(w,q('[data-vsr="skin"][data-uid="b"][value="Healthy skin"]'),true);change(w,q('[data-vsr="skin"][data-uid="b"][value="Ulcerated"]'),true);
  const notes=q('[data-vsr="notes"][data-uid="a"]');notes.value='Peristomal skin intact.';notes.dispatchEvent(new w.Event('input',{bubbles:true}));
  change(w,q('[data-vsr="rod"][data-uid="b"]'),true);assert.ok(q('[data-vsr="rod-due"][data-uid="b"]'));
  assert.equal(w.VisitStomaReview.validate(),false);assert.match(q('#vsr-error').textContent,/Loop Ileostomy/);
  change(w,q('[data-vsr="rod-due"][data-uid="b"]'),'2026-10-30');assert.equal(w.VisitStomaReview.validate(),true);
  const rows=JSON.parse(JSON.stringify(w.VisitStomaReview.payloadFor('ap1')));
  assert.deepEqual(rows[0],{uid:'a',type:'End colostomy',name:'End Colostomy',colour:'Healthy pink',output:['Flatus present','Liquid stools'],skin:{status:'Healthy',problems:[]},rod:{status:'Not recorded',due:'',removed:''},rod_asked:false,notes:'Peristomal skin intact.'});
  assert.deepEqual(rows[1].output,['Nil']);assert.deepEqual(rows[1].skin,{status:'Not healthy',problems:['Ulcerated']});assert.deepEqual(rows[1].rod,{status:'In place',due:'2026-10-30',removed:''});
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.rodPatchFor('ap1'))),{rod_stoma_uid:'b',rod_removal_date:'2026-10-30',rod_removed_date:null});
  assert.equal(w.VisitStomaReview.payloadFor('other-appt'),null);
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.summaryLines(rows))),[{name:'End Colostomy',text:'colour: healthy pink; output: Flatus present, Liquid stools; peristomal skin: healthy; notes: Peristomal skin intact.'},{name:'Loop Ileostomy',text:'output: Nil; peristomal skin: not healthy (Ulcerated); rod present (removal 2026-10-30)'}]);
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.skinFor('ap1'))),{problems:[{uid:'b',text:'Ulcerated'}],healthy:['a'],single:''});
});

test('an in-place rod is shown ticked; unticking records removal; the draft survives the appliance-picker rebuild; saved visits reopen',async t=>{
  const {w,host,mount}=setup(t,{patient:{rod_removal_date:'2026-10-27'}});await mount();const q=s=>host.querySelector(s);
  assert.equal(q('[data-vsr="rod"][data-uid="b"]').checked,true);assert.equal(q('[data-vsr="rod"][data-uid="a"]'),null);
  change(w,q('[data-vsr="rod"][data-uid="b"]'),false);assert.equal(q('[data-vsr="rod-removed"][data-uid="b"]').value,'2026-10-25');
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.rodPatchFor('ap1'))),{rod_stoma_uid:'b',rod_removal_date:'2026-10-27',rod_removed_date:'2026-10-25'});
  change(w,q('[data-vsr="colour"][data-uid="a"]'),'Dusky');
  await mount({id:'ap1',appt_date:'2026-10-25'},true);assert.equal(q('[data-vsr="colour"][data-uid="a"]').value,'Dusky');
  await mount({id:'ap1',appt_date:'2026-10-25',stoma_assessment:[{uid:'a',type:'End colostomy',colour:'Necrotic',output:['Blood'],notes:'Saved note.',rod:{status:'Not recorded',due:'',removed:''}}]},false);
  assert.equal(q('[data-vsr="colour"][data-uid="a"]').value,'Necrotic');assert.equal(q('[data-vsr="notes"][data-uid="a"]').value,'Saved note.');assert.equal(w.VisitStomaReview.rodPatchFor('ap1'),null);
});

test('the rod question is asked only at a stoma’s first assessment — not after an earlier encounter or visit',async t=>{
  const {w,host,mount}=setup(t,{patient:{rod_removal_date:'2026-10-27'}});
  w.SB={from:table=>{const q={_t:table,select:()=>q,eq:()=>q,lte:()=>q,then:(a,b)=>Promise.resolve(table==='encounters'
    ?{data:[{assessment:{snapshot:{stomas:[{uid:'b'}]}}}]}:{data:[{id:'ap1',stoma_assessment:[{uid:'a'}]}]}).then(a,b)};return q;}};
  await mount();assert.equal(host.querySelector('[data-vsr="rod"]'),null);
  assert.doesNotMatch(w.VisitStomaReview.summaryLines(w.VisitStomaReview.payloadFor('ap1'))[1].text,/rod/);assert.equal(w.VisitStomaReview.rodPatchFor('ap1'),null);
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
  const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
  const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
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
