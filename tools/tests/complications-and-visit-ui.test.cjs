const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

function sourceBetween(startText,endText){
  const start=html.indexOf(startText);
  const end=html.indexOf(endText,start);
  assert.ok(start>=0&&end>start,`Source block not found: ${startText}`);
  return html.slice(start,end);
}

function stomaControlContext(stomas){
  const source=sourceBetween('function complicationStomaControlHTML(','/* The stoma a rod belongs');
  const context=vm.createContext({
    patientStomaList:()=>stomas,
    prettyStomaType:String,
    htmlSafe:String,
    complicationScopeForStoma:type=>String(type||'').toLowerCase().includes('colostomy')?'colostomy':null,
    complicationCatalogue:[
      {name:'All-stoma problem',scope:'all',display_order:10,active:true},
      {name:'Colostomy problem',scope:'colostomy',display_order:20,active:true},
      {name:'Inactive problem',scope:'all',display_order:30,active:false}
    ],
    document:{getElementById:()=>null},
    Set,String
  });
  vm.runInContext(source,context);
  return context;
}

test('one stoma is assigned automatically without a stoma dropdown',()=>{
  const context=stomaControlContext([{number:1,type:'End colostomy',present:true}]);
  const output=context.complicationStomaControlHTML({},'cmpm-stoma','refresh()');
  assert.match(output,/type="hidden" id="cmpm-stoma" value="1"/);
  assert.match(output,/selected automatically/);
  assert.doesNotMatch(output,/<select/);
});

test('more than one stoma shows a required stoma selector',()=>{
  const context=stomaControlContext([
    {number:1,type:'End colostomy',present:false},
    {number:2,type:'Loop ileostomy',present:true}
  ]);
  const output=context.complicationStomaControlHTML({},'cmpm-stoma','refresh()');
  assert.match(output,/<select id="cmpm-stoma" data-requires-choice="1"/);
  assert.match(output,/Stoma 1/);
  assert.match(output,/Stoma 2/);
  assert.doesNotMatch(output,/not tied to a stoma/);
});

test('complication choices are checkboxes and respect the selected stoma scope',()=>{
  const context=stomaControlContext([]);
  const output=context.complicationChoiceListHTML('cmpm-type','End colostomy');
  assert.match(output,/type="checkbox" class="cmpm-type"/);
  assert.match(output,/All-stoma problem/);
  assert.match(output,/Colostomy problem/);
  assert.doesNotMatch(output,/Inactive problem/);
});

test('baseline complication manager has no date input and saves every ticked item',async()=>{
  const managerMarkup=sourceBetween('function complicationsManagerBodyHTML(','function complicationCardHTML(');
  assert.match(managerMarkup,/Baseline complications/);
  assert.match(managerMarkup,/Add selected complications/);
  assert.doesNotMatch(managerMarkup,/cmpm-date/);

  const source=sourceBetween('async function mgrAddComplication(','async function mgrAddUpdate(');
  const calls=[];
  let refreshed=0;
  const context=vm.createContext({
    document:{
      querySelectorAll:()=>[{value:'Prolapse'},{value:'Retraction'}],
      getElementById:id=>id==='cmpm-stoma'
        ?{value:'1',dataset:{requiresChoice:'0'}}
        :id==='cmpm-note'?{value:'Baseline review'}:null
    },
    addComplicationToPatient:async(patientId,entry)=>{calls.push({patientId,entry});return{list:[]};},
    cmpSaveAlert:()=>true,
    cmpMgrRefresh:async()=>{refreshed++;},
    cmpMgrSource:'Record',
    alert:()=>{},Set,String
  });
  vm.runInContext(source,context);
  await context.mgrAddComplication('patient-1');
  assert.deepEqual(calls.map(x=>x.entry.text),['Prolapse','Retraction']);
  assert.ok(calls.every(x=>x.entry.stoma==='1'&&x.entry.note==='Baseline review'));
  assert.ok(calls.every(x=>!Object.hasOwn(x.entry,'date')));
  assert.equal(refreshed,1);
});

test('Complete visit hides nurse selection but retains the booked allocation',()=>{
  const source=sourceBetween('async function openOutcomeFollowupModal(','/* ── The Edit-appointment stepper');
  assert.match(source,/const bookedNurseValue=/);
  assert.match(source,/type="hidden" id="of-nurse"/);
  assert.doesNotMatch(source,/<label>Nurse \/ Column<\/label><select id="of-nurse"/);
  assert.match(source,/id="of-owner" class="followup-owner-plain"/);
  assert.match(html,/\.followup-owner-plain\{background:var\(--gold\)!important;color:#000!important/);
  assert.match(html,/\.followup-owner-plain option\{background:#fff!important;color:#000!important/);
});

test('Complete visit has aligned patient details and no redundant appliance copy',()=>{
  const modal=sourceBetween('async function openOutcomeFollowupModal(','/* ── The Edit-appointment stepper');
  const appliance=sourceBetween('function visitApplianceSummaryHTML(','function applianceSectionHTML(');
  const review=sourceBetween('function esAppReviewChange(','/* Auto-advance off the Clinical review page');
  assert.match(modal,/class="es-summary-head"/);
  assert.match(modal,/class="es-summary-details"/);
  assert.match(modal,/class="es-summary-label">Appointment/);
  assert.doesNotMatch(modal,/Clinical review — complications &amp; appliances/);
  assert.doesNotMatch(modal,/Edit \/ correct appliance/);
  assert.doesNotMatch(appliance,/Nothing recorded yet\. Saving this appointment/);
  assert.doesNotMatch(appliance,/Appliances reviewed/);
  assert.match(review,/if\(v==='changed'/);
  assert.match(review,/if\(cmpDone\)\{esFollowupNext\(\);return;\}/);
});

test('appliances and accessories are alphabetical and Deodorant is retired',()=>{
  const source=sourceBetween('const APPLIANCE_CATALOGUE=','/* Stored as a JSON array');
  const context=vm.createContext({Set,String});
  vm.runInContext(source,context);

  const accessories=Array.from(vm.runInContext('accessoryChoices([])',context));
  assert.deepEqual(accessories,[
    'Dilators','Filler Paste','Flange Extenders','Gelling Agents',
    'Hydrocolloid 5x20','Hydrocolloid 20x20','Powder','Protective Wipes',
    'Stick Paste','Stoma Belt','Stoma Seals','None'
  ]);
  const withHistorical=Array.from(vm.runInContext("accessoryChoices(['Zinc barrier','Deodorant'])",context));
  assert.equal(withHistorical.includes('Deodorant'),false);
  assert.equal(withHistorical.at(-1),'None');
  assert.deepEqual(
    Array.from(vm.runInContext("sortedApplianceItems([{name:'Zulu 20'},{name:'Alpha'},{name:'Zulu 5'}]).map(x=>x.name)",context)),
    ['Alpha','Zulu 5','Zulu 20']
  );

  assert.equal((html.match(/accessoryChoices\(/g)||[]).length>=4,true);
  assert.doesNotMatch(html,/ACCESSORIES\.concat\([^\n]*\.map\(/);
  assert.doesNotMatch(html,/ACCESSORIES\.map\(n=>applianceChkHTML/);
});

test('the Seen visit Review no longer shows a Complications section',()=>{
  const pane={innerHTML:''};
  const context=vm.createContext({
    document:{
      getElementById:id=>id==='es-pane-5'?pane:null,
      querySelector:()=>null,
      querySelectorAll:()=>[]
    },
    esState:{apptId:'a',complications:[{text:'Current concern',status:'open'}]},
    esResume:null,window:{},htmlSafe:String,attDMY:String
  });
  vm.runInContext(sourceBetween('function esRenderReview(){','function esOnOutcomeChange(){'),context);
  context.esRenderReview();
  // Complications are written in the clinical review free text now — no separate card.
  assert.doesNotMatch(pane.innerHTML,/Complications/);
  assert.doesNotMatch(pane.innerHTML,/Current concern|A complication is identified/);
});

test('the Review stoma-assessment card renders colour/format markers, not raw {red}',()=>{
  const pane={innerHTML:''};
  const VSR={
    currentRows:()=>[{uid:'u',type:'Urostomy',notes:'a {red}b{/red} **c**'}],
    summaryLines:()=>[{name:'Urostomy',text:'notes: a {red}b{/red} **c**'}],
    formatNotes:t=>String(t).replace(/\{red\}([\s\S]*?)\{\/red\}/g,'<span style="color:#dc2626">$1</span>').replace(/\*\*([\s\S]+?)\*\*/g,'<strong>$1</strong>')
  };
  const context=vm.createContext({
    document:{getElementById:id=>id==='es-pane-5'?pane:null,querySelector:()=>null,querySelectorAll:()=>[]},
    esState:{apptId:'a'},esResume:null,window:{VisitStomaReview:VSR},VisitStomaReview:VSR,htmlSafe:s=>String(s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';'),attDMY:String
  });
  vm.runInContext(sourceBetween('function esRenderReview(){','function esOnOutcomeChange(){'),context);
  context.esRenderReview();
  assert.match(pane.innerHTML,/color:#dc2626">b<\/span>/);   // {red}b{/red} rendered
  assert.match(pane.innerHTML,/<strong>c<\/strong>/);        // **c** rendered
  assert.doesNotMatch(pane.innerHTML,/\{red\}|\{\/red\}|\*\*c\*\*/);  // no raw markers
});

test('changing a complication outcome refreshes the matching visit review only',()=>{
  let renders=0;
  const context=vm.createContext({
    document:{getElementById:()=>null},clrState:{},cmpMgrPatient:null,
    esState:{patientId:'p1',step:5,patient:{},complications:[]},
    esRenderReview:()=>renders++
  });
  vm.runInContext(sourceBetween('function refreshComplicationViews(','/* ── Complications manager'),context);
  const updated=[{text:'Prior complication',status:'resolved'}];
  context.refreshComplicationViews('p2',updated);
  assert.equal(renders,0);
  context.refreshComplicationViews('p1',updated);
  assert.equal(context.esState.complications,updated);
  assert.equal(context.esState.patient.complications,updated);
  assert.equal(renders,1);
});

test('failed hernia save retains its selection and reports the underlying error',async()=>{
  const boxes=[{value:'Parastomal hernia',checked:true},{value:'Granuloma',checked:true}];
  const alerts=[],err={hidden:true,textContent:''};
  const context=vm.createContext({
    document:{querySelectorAll:()=>boxes.filter(b=>b.checked),getElementById:id=>id==='of-review-error'?err:null},
    addComplicationToPatient:async(id,entry)=>entry.text==='Parastomal hernia'?{error:{message:'Permission denied'}}:{list:[{text:'Granuloma'}]},
    clrState:{},esState:{},esMaybeAutoAdvance:()=>{},TODAY:'2026-10-25',alert:m=>alerts.push(m)
  });
  vm.runInContext(sourceBetween('async function onApptAddComplicationsMulti(','/* Save one complication'),context);
  assert.equal(await context.onApptAddComplicationsMulti('p1'),false);
  assert.equal(boxes[0].checked,true);
  assert.equal(boxes[1].checked,false);
  assert.equal(context.esState.cmpAdded,false);
  assert.match(alerts[0],/Parastomal hernia: Permission denied/);
  assert.equal(err.hidden,false);
});

test('Clinical review advances straight to Appliances (no complications gate)',async()=>{
  const steps=[];
  const context=vm.createContext({
    esState:{patientId:'p1',apptId:'a1'},window:{},
    document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},
    esOutcomeAttended:()=>true,esGoStep:n=>steps.push(n)
  });
  vm.runInContext(sourceBetween('async function esFollowupNext(){','/* The Appliances step'),context);
  await context.esFollowupNext();
  assert.deepEqual(steps,[3]);   // moves to Appliances with no complication confirmation
});

test('adding parastomal hernia preserves granulomas already saved on the patient',async()=>{
  const prior={id:'g1',text:'Granuloma',status:'open',events:[{id:'e1'}]};
  let saved;
  const context=vm.createContext({
    fetchPatientById:async()=>({data:{complications:[prior]}}),parseComplications:p=>p.complications.slice(),
    getCurrentUserForAudit:async()=>({name:'Nurse'}),TODAY:'2026-10-25',
    saveComplicationsWithEvent:async(id,list)=>{saved=list;return{list};}
  });
  vm.runInContext(sourceBetween('async function addComplicationToPatient(','async function removeComplicationFromPatient('),context);
  await context.addComplicationToPatient('p1',{text:'Parastomal hernia',stoma:'1'});
  assert.equal(saved.length,2);
  assert.equal(saved[0],prior);
  assert.equal(saved[1].text,'Parastomal hernia');
});
