// Jason's per-stoma assessment in the Complete visit Clinical review step.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync(path.join(__dirname,'../../assets/visit-stoma-review.js'),'utf8');
function setup(t,{jason=true,stomas,patient={}}={}){
  const dom=new JSDOM('<div id="host"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  w.TODAY='2026-10-25';w.isEncounterUser=()=>jason;w.stomaTypeCanHaveRod=t=>/loop/i.test(t||'');
  w.stomasPresentOn=()=>JSON.parse(JSON.stringify(stomas||[{uid:'a',typeLabel:'End colostomy'},{uid:'b',typeLabel:'Loop ileostomy'}]));
  w.eval(src);const host=w.document.getElementById('host');
  const pat={id:'p1',rod_stoma_uid:null,rod_removal_date:null,rod_removed_date:null,...patient};
  return {w,host,pat,mount:(appt={id:'ap1',appt_date:'2026-10-25'},resume=false)=>w.VisitStomaReview.mount(host,{appt,patient:pat,resume})};
}
function change(w,el,value){if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));}

test('only Jason sees it; each stoma gets its own named column with colour, output, rod and notes',t=>{
  const off=setup(t,{jason:false});off.mount();assert.equal(off.host.innerHTML,'');assert.equal(off.w.VisitStomaReview.payloadFor('ap1'),null);
  const {w,host,mount}=setup(t);mount();
  assert.deepEqual([...host.querySelectorAll('.jenc-stoma-title')].map(h=>h.textContent),['End Colostomy','Loop Ileostomy']);
  for(const uid of ['a','b'])for(const k of ['colour','output','rod','notes'])assert.ok(host.querySelector('[data-vsr="'+k+'"][data-uid="'+uid+'"]'),k+uid);
  assert.doesNotMatch(host.textContent,/\bS[12]\b/);
});

test('the assessment is kept per stoma; Nil is exclusive; a ticked rod needs its date; notes are typed freely',t=>{
  const {w,host,mount}=setup(t);mount();const q=s=>host.querySelector(s);
  change(w,q('[data-vsr="colour"][data-uid="a"]'),'Healthy pink');
  change(w,q('[data-vsr="output"][data-uid="a"][value="Flatus present"]'),true);change(w,q('[data-vsr="output"][data-uid="a"][value="Liquid stools"]'),true);
  change(w,q('[data-vsr="output"][data-uid="b"][value="Nil"]'),true);
  assert.equal(q('[data-vsr="output"][data-uid="b"]').closest('details').open,true);
  const notes=q('[data-vsr="notes"][data-uid="a"]');notes.value='Peristomal skin intact.';notes.dispatchEvent(new w.Event('input',{bubbles:true}));
  change(w,q('[data-vsr="rod"][data-uid="b"]'),true);assert.ok(q('[data-vsr="rod-due"][data-uid="b"]'));
  assert.equal(w.VisitStomaReview.validate(),false);assert.match(q('#vsr-error').textContent,/Loop Ileostomy/);
  change(w,q('[data-vsr="rod-due"][data-uid="b"]'),'2026-10-30');assert.equal(w.VisitStomaReview.validate(),true);
  const rows=JSON.parse(JSON.stringify(w.VisitStomaReview.payloadFor('ap1')));
  assert.deepEqual(rows[0],{uid:'a',type:'End colostomy',name:'End Colostomy',colour:'Healthy pink',output:['Flatus present','Liquid stools'],rod:{status:'Not recorded',due:'',removed:''},notes:'Peristomal skin intact.'});
  assert.deepEqual(rows[1].output,['Nil']);assert.deepEqual(rows[1].rod,{status:'In place',due:'2026-10-30',removed:''});
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.rodPatchFor('ap1'))),{rod_stoma_uid:'b',rod_removal_date:'2026-10-30',rod_removed_date:null});
  assert.equal(w.VisitStomaReview.payloadFor('other-appt'),null);
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.summaryLines(rows))),[{name:'End Colostomy',text:'colour: healthy pink; output: Flatus present, Liquid stools; notes: Peristomal skin intact.'},{name:'Loop Ileostomy',text:'output: Nil; rod present (removal 2026-10-30)'}]);
});

test('an in-place rod is shown ticked; unticking records removal; the draft survives the appliance-picker rebuild; saved visits reopen',t=>{
  const {w,host,mount}=setup(t,{patient:{rod_removal_date:'2026-10-27'}});mount();const q=s=>host.querySelector(s);
  assert.equal(q('[data-vsr="rod"][data-uid="b"]').checked,true);assert.equal(q('[data-vsr="rod"][data-uid="a"]').checked,false);
  change(w,q('[data-vsr="rod"][data-uid="b"]'),false);assert.equal(q('[data-vsr="rod-removed"][data-uid="b"]').value,'2026-10-25');
  assert.deepEqual(JSON.parse(JSON.stringify(w.VisitStomaReview.rodPatchFor('ap1'))),{rod_stoma_uid:'b',rod_removal_date:'2026-10-27',rod_removed_date:'2026-10-25'});
  change(w,q('[data-vsr="colour"][data-uid="a"]'),'Dusky');
  mount({id:'ap1',appt_date:'2026-10-25'},true);assert.equal(q('[data-vsr="colour"][data-uid="a"]').value,'Dusky');
  mount({id:'ap1',appt_date:'2026-10-25',stoma_assessment:[{uid:'a',type:'End colostomy',colour:'Necrotic',output:['Blood'],notes:'Saved note.',rod:{status:'Not recorded',due:'',removed:''}}]},false);
  assert.equal(q('[data-vsr="colour"][data-uid="a"]').value,'Necrotic');assert.equal(q('[data-vsr="notes"][data-uid="a"]').value,'Saved note.');assert.equal(w.VisitStomaReview.rodPatchFor('ap1'),null);
});
