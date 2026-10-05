const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){const m=html.match(new RegExp('(?:async )?function '+name+'\\('));assert(m,name);const start=m.index;const lineEnd=html.indexOf('\n',start);if(html.slice(start,lineEnd).trim().endsWith('}'))return html.slice(start,lineEnd);const end=html.indexOf('\n}',start);return html.slice(start,end+2);}
function context(){
 const dom=new JSDOM('<body><div id="mo"></div><div id="mb"></div></body>');
 const c=vm.createContext({document:dom.window.document,TODAY:'2026-09-25',Date,console,htmlSafe:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),fmtShortDate:s=>s,prettyStomaType:s=>s,initialStomaCode:s=>'ID-'+s,newStomaUid:()=> 'draft-uid',sexModalClass:()=>'',openMo:()=>{},confirm:()=>true,closeModalGuarded:()=>{},normaliseFollowupStatus:s=>s||'active',patientIsDeceased:p=>!!p.deceased_date,shortApplianceList:a=>a||[],stomaShortType:t=>t,stomaQuadrant:()=>'',collectStomaTargetsFromPatient:()=>[],stomaTypeOptions:t=>`<option>${t||'End colostomy'}</option>`,stomaLocOptions:t=>`<option>${t||'Existing location'}</option>`});
 for(const name of ['parseStomas','parseRefashionings','parseInitialStomas','stomaOperationHistory','stomaOperationFingerprint','patientStomaList','stomaTimeline','stomasPresentOn','stomaEvents','stomaEndDates','hasStomaNow','everReversedDates','patientEverReversed','reversedBeforeDeath','derivedFollowupStatus','rawExtraStatuses','patientIsDeceased','followupStatusText','buildStomaOperationPatch','applianceStomaUid','currentApplianceNoteRows','looseApplianceRows','handoverApplianceRowText','handoverStomaLine','handoverOperationSummary','previousStomaRecords','stomaRecordsFor','operationTargetLabel','openStomaOperation','changeStomaOperationTarget','changeStomaOperationKind','readStomaOperation','stomaOperationError','reviewStomaOperation','backStomaOperation','saveStomaOperation','persistStomaOperation','persistPatientDetailsForm','openCurrentStomaFromPatientDetails','revealPatientDetailsSave','outcomeRevertTargets','revertStomaClosureHistory','revertedLegacyClosureDates','buildOutcomeRevertPatch'])vm.runInContext(source(name),c);
 vm.runInContext('let stomaOperationCtx=null;let PF_STOMA_TARGETS=[];let modalCloseGuard=null;let patientEditReturn=null;',c);
 return c;
}
const patient=()=>({id:'p1',stoma_type:'End colostomy',stoma_location:'LIF',surgery_date:'2026-01-01',followup_status:'active',extra_stomas:[],extra_refashionings:[],initial_stomas:[],stoma_operation_history:[]});
const draft=(kind='refashion')=>({kind,uid:'new-id',target_uid:'base',date:'2026-09-25',date_unknown:false,type:'End colostomy',location:'LIF',operation:'Procedure and findings',same_admission:true,admission_answer:'yes',outcomes:[],discharge_date:null});
function outcomePanel(c,p){
 c.jsSafe=s=>String(s);
 c.document.defaultView.HTMLElement.prototype.scrollIntoView=()=>{};
 const start=html.indexOf('const PF_STATUS_ACTIONS=[');vm.runInContext(html.slice(start,html.indexOf('\n];',start)+3),c);
 for(const name of ['croPatientLabel','croStatusDate','croStatusPanelHTML','croAsk','croCancel','croConfirm','croConfirmReversal','croApply','croApplyReversal','croAskClear','croApplyClear'])vm.runInContext(source(name),c);
 c.outcomePatient=p;vm.runInContext('let clrState={patient:outcomePatient};let croReversalCtx=null;let croRevertCtx=null;',c);
 const panel=c.document.createElement('section');panel.id='psm-outcomes';panel.innerHTML=c.croStatusPanelHTML(p);c.document.body.appendChild(panel);return panel;
}
test('Outcome reversal uses inline Yes / No, then closes only the chosen stoma in one guarded write',async()=>{
 const c=context(),p={...patient(),first_name:'Alex',surname:'Example',id_card:'0000000M',updated_at:'2026-09-25T08:00:00Z',initial_stomas:[{uid:'second-id',type:'End ileostomy',location:'RIF'}]},before=JSON.stringify(p);let writes=0,patch,refreshed=0,panel;const filters=[];
 c.fetchPatientById=async()=>({data:p});
 const query={eq:(key,value)=>{filters.push([key,value]);return query;},select:()=>({single:async()=>({data:{id:p.id}})})};
 c.SB={from:table=>({update:value=>{assert.equal(table,'patients');writes++;patch=value;return query;}})};
 c.refreshReminders=async()=>{};c.afterStomaSaved=async id=>{assert.equal(id,p.id);refreshed++;};c.switchPatientPanel=value=>{panel=value;};
 const button=outcomePanel(c,p).querySelector('.pf-sbtn-rev');assert.equal(button.disabled,false);
 await vm.runInContext(button.getAttribute('onclick'),c);
 const d=c.document,box=d.getElementById('cro-confirm');assert.equal(box.hidden,false);
 assert.match(box.textContent,/Alex Example/);assert.match(box.textContent,/0000000M/);assert.match(box.textContent,/reversed \/ closed/);
 assert.equal(box.querySelector('.pf-sc-no').textContent,'No, leave it');assert.equal(box.querySelector('.pf-sc-yes').textContent,'Yes');
 assert.equal(d.getElementById('so-details'),null);assert.equal(d.getElementById('cro-date'),null);assert.equal(writes,0);
 await vm.runInContext(box.querySelector('.pf-sc-yes').getAttribute('onclick'),c);
 assert.equal(d.getElementById('cro-stoma').value,'');assert.equal(d.getElementById('cro-stoma').options.length,3);
 d.getElementById('cro-stoma').value='second-id';d.getElementById('cro-date').value='2026-09-25';assert.equal(d.getElementById('cro-notes'),null);
 assert.equal(writes,0);assert.equal(JSON.stringify(p),before);
 await Promise.all([c.croApply('reversed'),c.croApply('reversed')]);assert.equal(writes,1);
 assert.equal(patch.reversal_date,undefined);assert.equal(patch.initial_stomas[0].reversal_date,'2026-09-25');
 assert.equal(patch.followup_status,'active');assert.deepEqual(Array.from(c.patientStomaList({...p,...patch}).filter(x=>x.present),x=>x.uid),['base']);
 assert.equal(patch.stoma_operation_history.length,1);assert.equal(patch.stoma_operation_history[0].affected[0].uid,'second-id');
 assert.equal(patch.proposed_reversal_date,null);assert.equal(JSON.stringify(p),before);assert.equal(refreshed,1);assert.equal(panel,'outcomes');
 assert.deepEqual(filters,[['id','p1'],['stoma_operation_history','[]'],['updated_at',p.updated_at]]);
});
test('declining or cancelling inline closure makes no changes; the stoma-specific shortcut keeps its target',()=>{
 const c=context(),p={...patient(),initial_stomas:[{uid:'second-id',type:'End ileostomy'}]},before=JSON.stringify(p);
 c.fetchPatientById=()=>{throw Error('Unexpected read before OK');};c.SB={from:()=>{throw Error('Unexpected write');}};
 outcomePanel(c,p);c.croAsk('reversed');c.croCancel();assert.equal(c.document.getElementById('cro-confirm').hidden,true);
 c.croAsk('reversed','initial:second-id');c.croConfirm('reversed');assert.equal(c.document.getElementById('cro-stoma').value,'second-id');
 c.croCancel();assert.equal(c.document.getElementById('cro-date'),null);assert.equal(JSON.stringify(p),before);
 c.croAsk('deceased');assert.match(c.document.getElementById('cro-confirm').textContent,/Deceased/);c.croConfirm('deceased');
 assert.equal(c.document.getElementById('cro-stoma'),null);assert.equal(c.document.getElementById('cro-date').max,c.TODAY);
});
test('inline closure validates the selected stoma and date chronology before any write',async()=>{
 const c=context(),p={...patient(),date_of_birth:'1980-01-01',initial_stomas:[{uid:'second-id',type:'End ileostomy'}]};let reads=0;
 outcomePanel(c,p);c.fetchPatientById=async()=>{reads++;return{data:p};};c.SB={from:()=>{throw Error('Unexpected write');}};
 c.croAsk('reversed');c.croConfirm('reversed');const d=c.document;
 await c.croApply('reversed');assert.match(d.getElementById('cro-err').textContent,/Choose the present stoma/);
 d.getElementById('cro-stoma').value='base';await c.croApply('reversed');assert.match(d.getElementById('cro-err').textContent,/Enter the operation date/);
 d.getElementById('cro-date').value='2026-09-26';await c.croApply('reversed');assert.match(d.getElementById('cro-err').textContent,/Check the operation date/);
 d.getElementById('cro-date').value='1979-01-01';await c.croApply('reversed');assert.match(d.getElementById('cro-err').textContent,/Check the operation date/);
 d.getElementById('cro-date').value='2025-12-31';await c.croApply('reversed');assert.match(d.getElementById('cro-err').textContent,/before the affected stoma was formed/);
 assert.equal(d.getElementById('cro-notes'),null);
 assert.equal(reads,0);assert.equal(d.querySelector('#cro-confirm .pf-sc-ok').disabled,false);
});
test('inline closure refuses a stale record and restores the form for correction',async()=>{
 const c=context(),p=patient();outcomePanel(c,p);c.croAsk('reversed');c.croConfirm('reversed');const d=c.document;
 d.getElementById('cro-date').value='2026-09-25';
 c.fetchPatientById=async()=>({data:{...p,reversal_date:'2026-09-24'}});c.SB={from:()=>{throw Error('Unexpected stale write');}};
 await c.croApply('reversed');assert.match(d.getElementById('cro-err').textContent,/record has changed/);
 assert.equal(d.getElementById('cro-date').value,'2026-09-25');assert.equal(d.querySelector('#cro-confirm .pf-sc-ok').disabled,false);
 c.croCancel();assert.equal(d.getElementById('cro-confirm').hidden,true);
});
test('inline closure keeps the draft after a failed save and can retry without dropping history',async()=>{
 const c=context(),p=patient();let writes=0,refreshed=0;
 outcomePanel(c,p);c.croAsk('reversed');c.croConfirm('reversed');const d=c.document;
 d.getElementById('cro-date').value='2026-09-25';c.fetchPatientById=async()=>({data:p});
 const query={eq:()=>query,select:()=>({single:async()=>writes===1?{error:{message:'stoma_operation_history column missing'}}:{data:{id:'p1'}}})};
 c.SB={from:()=>({update:patch=>{writes++;assert.equal(patch.stoma_operation_history.length,1);assert.equal(patch.followup_status,'reversed');return query;}})};
 c.refreshReminders=async()=>{};c.afterStomaSaved=async()=>{refreshed++;};c.switchPatientPanel=()=>{};
 await c.croApply('reversed');assert.match(d.getElementById('cro-err').textContent,/Nothing from this operation has been saved/);
 assert.equal(refreshed,0);assert.equal(d.querySelector('#cro-confirm .pf-sc-ok').disabled,false);assert.equal(d.getElementById('cro-date').value,'2026-09-25');
 await c.croApply('reversed');assert.equal(writes,2);assert.equal(refreshed,1);
});
test('inline closure retains an unknown date and preserves an existing date of death',async()=>{
 const c=context(),p={...patient(),deceased_date:'2026-09-24',followup_status:'deceased'};let patch;
 outcomePanel(c,p);c.croAsk('reversed');assert.doesNotMatch(c.document.getElementById('cro-confirm').textContent,/date of death is cleared/);c.croConfirm('reversed');const d=c.document;
 d.getElementById('cro-date').value='2026-09-25';c.fetchPatientById=async()=>({data:p});
 await c.croApply('reversed');assert.match(d.getElementById('cro-err').textContent,/Check the operation date/);
 d.getElementById('cro-unknown').checked=true;
 const query={eq:()=>query,select:()=>({single:async()=>({data:{id:'p1'}})})};c.SB={from:()=>({update:value=>{patch=value;return query;}})};
 c.refreshReminders=async()=>{};c.afterStomaSaved=async()=>{};c.switchPatientPanel=()=>{};
 await c.croApply('reversed');assert.equal(patch.reversal_date,null);assert.equal(patch.deceased_date,undefined);assert.equal(patch.followup_status,'deceased');assert.equal(patch.stoma_operation_history[0].date_unknown,true);
 assert.equal(c.patientStomaList({...p,...patch})[0].present,false);
});
test('Outcome reversal shortcut is unavailable when no stoma remains present',()=>{
 const c=context(),p={...patient(),reversal_date:'2026-09-24',followup_status:'reversed'};
 const button=outcomePanel(c,p).querySelector('.pf-sbtn-rev');assert.equal(button.disabled,true);
 assert.match(button.title,/No stoma is currently present/);
});
test('date-only closure preserves saved notes; formation and refashioning still need their operation details',()=>{
 const c=context(),p={...patient(),reversal_notes:'Existing base note',initial_stomas:[{uid:'second',type:'End ileostomy',reversal_notes:'Existing second note'}]};
 const base=c.buildStomaOperationPatch(p,{...draft('reversal'),operation:null});
 assert.equal(base.reversal_notes,undefined);assert.equal(base.stoma_operation_history[0].operation,null);
 const second=c.buildStomaOperationPatch(p,{...draft('reversal'),target_uid:'second',operation:null});
 assert.equal(second.initial_stomas[0].reversal_notes,'Existing second note');
 for(const kind of ['new','refashion'])assert.throws(()=>c.buildStomaOperationPatch(p,{...draft(kind),operation:''}),/operation performed and findings/);
});
test('switching operation kinds hides and ignores reversal findings while retaining formation inputs',async()=>{
 const c=context();c.fetchPatientById=async()=>({data:patient()});await c.openStomaOperation('p1','reversal');const d=c.document;
 assert.equal(d.getElementById('so-findingswrap').hidden,true);assert.equal(c.readStomaOperation().operation,null);
 d.getElementById('so-kind').value='new';c.changeStomaOperationKind();assert.equal(d.getElementById('so-findingswrap').hidden,false);
 d.getElementById('so-findings').value='New formation details';assert.equal(c.readStomaOperation().operation,'New formation details');
 d.getElementById('so-kind').value='reversal';c.changeStomaOperationKind();assert.equal(d.getElementById('so-findingswrap').hidden,true);assert.equal(c.readStomaOperation().operation,null);
});
test('every non-active outcome offers a revert confirmation even without an outcome date',()=>{
 for(const status of ['deceased','discharged_gozo','relocated_overseas','reversed','paused','awaiting_feedback']){
  const c=context(),p={...patient(),followup_status:status,...(status==='reversed'?{stoma_type:null,surgery_date:null}:{})};
  const panel=outcomePanel(c,p),btn=panel.querySelector('[onclick="croAskClear()"]');assert(btn,status);assert.match(btn.textContent,/Revert status/);
  c.croAskClear();const box=c.document.getElementById('cro-confirm');assert.match(box.textContent,/Do you want to revert/);assert.equal(box.querySelector('.pf-sc-ok').textContent,'Yes, revert');
  assert.equal(box.querySelector('input,textarea,select'),null);c.croCancel();assert.equal(box.hidden,true);
 }
 const c=context();assert.equal(outcomePanel(c,patient()).querySelector('[onclick="croAskClear()"]'),null);
});
test('declining a status reversion makes no read or write',async()=>{
 const c=context(),p={...patient(),followup_status:'deceased'},before=JSON.stringify(p);
 c.fetchPatientById=()=>{throw Error('Unexpected read');};c.SB={from:()=>{throw Error('Unexpected write');}};
 outcomePanel(c,p);c.croAskClear();c.croCancel();await c.croApplyClear();assert.equal(JSON.stringify(p),before);
});
test('confirmed undated outcome reversion writes only outcome fields once and preserves clinical history',async()=>{
 const c=context(),p={...patient(),followup_status:'deceased',extra_statuses:['deceased'],updated_at:'2026-09-25T08:00:00Z',procedure_performed:'Prior operation',findings:'Prior findings'},before=JSON.stringify(p);let writes=0,patch,refreshed=0;
 const filters=[],query={eq:(k,v)=>{filters.push([k,v]);return query;},select:()=>({single:async()=>({data:{id:p.id}})})};
 c.fetchPatientById=async()=>({data:p});c.SB={from:()=>({update:value=>{writes++;patch=value;return query;}})};
 c.refreshReminders=async()=>{};c.afterStomaSaved=async()=>{refreshed++;};c.switchPatientPanel=()=>{};
 c.patientFormHTML=()=>{throw Error('Must not rebuild patient fields to revert status');};
 outcomePanel(c,p);c.croAskClear();await Promise.all([c.croApplyClear(),c.croApplyClear()]);
 assert.equal(writes,1);assert.equal(refreshed,1);assert.equal(patch.followup_status,'active');assert.equal(patch.deceased_date,null);
 assert.equal(patch.stoma_type,undefined);assert.equal(patch.surgery_date,undefined);assert.equal(patch.findings,undefined);assert.equal(patch.stoma_operation_history,undefined);
 assert.equal(JSON.stringify(p),before);assert.equal(c.derivedFollowupStatus({...p,...patch}),'active');
 assert.deepEqual(filters,[['id','p1'],['stoma_operation_history','[]'],['updated_at',p.updated_at]]);
});
test('reverting the latest closure retains earlier reversals and all original notes',()=>{
 const c=context(),p={...patient(),followup_status:'reversed',reversal_date:'2026-03-01',reversal_notes:'Earlier closure',extra_stomas:[{uid:'later',type:'End ileostomy',formed_date:'2026-04-01',reversal_date:'2026-09-24',comments:'Preserved comments',findings:'Distinct findings'}],stoma_operation_history:[{id:'old',kind:'reversal',date:'2026-03-01',affected:[{uid:'base',state:'reversed'}],operation:'Old closure'},{id:'latest',kind:'reversal',date:'2026-09-24',affected:[{uid:'later',state:'reversed'}],operation:'Saved closure notes'}]},before=JSON.stringify(p);
 const patch=c.buildOutcomeRevertPatch(p),merged={...p,...patch};
 assert.equal(patch.reversal_date,undefined);assert.equal(merged.reversal_date,'2026-03-01');assert.equal(patch.extra_stomas[0].reversal_date,null);
 assert.equal(patch.extra_stomas[0].comments,'Preserved comments');assert.equal(patch.extra_stomas[0].findings,'Distinct findings');
 assert.equal(patch.stoma_operation_history[0].affected[0].state,'reversed');assert.equal(patch.stoma_operation_history[1].affected[0].state,'present');
 assert.equal(patch.stoma_operation_history[1].operation,'Saved closure notes');assert.equal(patch.stoma_operation_history[1].affected[0].reverted_state,'reversed');assert(patch.stoma_operation_history[1].reverted_at);
 assert.equal(c.derivedFollowupStatus(merged),'active');assert.deepEqual(Array.from(c.patientStomaList(merged).filter(x=>x.present),x=>x.uid),['later']);
 assert.equal(c.stomaTimeline(merged).find(x=>x.uid==='later').ended,null);assert.match(c.handoverOperationSummary(merged),/2026-03-01/);assert.equal(JSON.stringify(p),before);
});
test('reverting an unknown-date closure reopens the stoma in every timeline',()=>{
 const c=context(),p={...patient(),followup_status:'reversed',stoma_operation_history:[{id:'unknown',kind:'reversal',date:null,date_unknown:true,affected:[{uid:'base',state:'reversed'}],operation:null}]};
 assert.equal(c.patientStomaList(p)[0].present,false);const patch=c.buildOutcomeRevertPatch(p),merged={...p,...patch};
 assert.equal(c.patientStomaList(merged)[0].present,true);assert.equal(c.stomaTimeline(merged)[0].ended,null);
 assert.equal(c.derivedFollowupStatus(merged),'active');assert.equal(c.patientEverReversed(merged),false);assert.equal(c.handoverOperationSummary(merged),'');
 assert.equal(p.stoma_operation_history[0].affected[0].state,'reversed');
});
test('a closure involving two stomas is reverted together while a superseded stoma stays closed',()=>{
 const c=context(),p={...patient(),followup_status:'reversed',stoma_superseded_date:'2026-03-01',initial_stomas:[{uid:'one',type:'End ileostomy',reversal_date:'2026-09-24'},{uid:'two',type:'End colostomy',reversal_date:'2026-09-24'}],stoma_operation_history:[{id:'both',kind:'reversal',date:'2026-09-24',affected:[{uid:'one',state:'reversed'},{uid:'two',state:'reversed'}]}]};
 const patch=c.buildOutcomeRevertPatch(p),merged={...p,...patch};
 assert.equal(patch.initial_stomas[0].reversal_date,null);assert.equal(patch.initial_stomas[1].reversal_date,null);
 assert.equal(merged.stoma_superseded_date,'2026-03-01');assert.equal(c.patientStomaList(merged).find(x=>x.uid==='base').present,false);
 assert.equal(c.patientStomaList(merged).filter(x=>x.present).length,2);
});
test('reopening a refashioned stoma retains its original superseded stoma and ID',()=>{
 const c=context(),p={...patient(),followup_status:'reversed',extra_refashionings:[{uid:'ref',target_uid:'base',type:'End colostomy',formed_date:'2026-03-01',closure_date:'2026-09-24',operation:'Refashion details',same_admission:true}],stoma_operation_history:[{id:'rf',kind:'refashion',date:'2026-03-01',affected:[{uid:'base',state:'refashioned'}],new_uid:'ref'},{id:'cl',kind:'reversal',date:'2026-09-24',affected:[{uid:'ref',state:'reversed'}]}]};
 const merged={...p,...c.buildOutcomeRevertPatch(p)},list=c.patientStomaList(merged);
 assert.equal(list.find(x=>x.uid==='base').present,false);assert.equal(list.find(x=>x.uid==='ref').present,true);
 assert.equal(merged.extra_refashionings[0].operation,'Refashion details');assert.equal(merged.extra_refashionings[0].target_uid,'base');assert.equal(merged.extra_refashionings[0].closure_date,null);
});
test('legacy scalar closure dates and reversals recorded without a stoma can be reverted',()=>{
 const c=context();
 for(const fields of [{refashion_formed_date:'2026-03-01',refashion_closure_date:'2026-09-24'},{newstoma_formed_date:'2026-03-01',newstoma_closure_date:'2026-09-24'}]){
  const p={...patient(),...fields,followup_status:'reversed'},patch=c.buildOutcomeRevertPatch(p),merged={...p,...patch};
  const key=fields.refashion_closure_date?'refashion_closure_date':'newstoma_closure_date';assert.equal(patch[key],null);assert.equal(c.derivedFollowupStatus(merged),'active');
 }
 const p={id:'p1',followup_status:'reversed',reversal_date:'2026-09-24'},patch=c.buildOutcomeRevertPatch(p);assert.equal(patch.reversal_date,null);assert.equal(c.derivedFollowupStatus({...p,...patch}),'active');
});
test('reverting a reversal retains a later date of death',()=>{
 const c=context(),p={...patient(),followup_status:'deceased',reversal_date:'2026-09-10',deceased_date:'2026-09-20'};
 assert.equal(c.derivedFollowupStatus(p),'reversed');const patch=c.buildOutcomeRevertPatch(p),merged={...p,...patch};
 assert.equal(patch.deceased_date,undefined);assert.equal(merged.deceased_date,'2026-09-20');assert.equal(c.derivedFollowupStatus(merged),'deceased');
});
test('reopening a migrated refashioning clears its matching legacy date from historical totals',()=>{
 const c=context(),p={...patient(),followup_status:'reversed',refashion_formed_date:'2026-03-01',refashion_closure_date:'2026-09-24',extra_refashionings:[{uid:'ref',target_uid:'base',type:'End colostomy',formed_date:'2026-03-01',closure_date:'2026-09-24'}]};
 const patch=c.buildOutcomeRevertPatch(p),merged={...p,...patch};assert.equal(patch.refashion_closure_date,null);assert.equal(c.patientEverReversed(merged),false);assert.deepEqual(Array.from(c.everReversedDates(merged)),[]);
});
test('outcome reversion detects a changed Gozo date before writing',async()=>{
 const c=context(),p={...patient(),followup_status:'discharged_gozo',discharged_gozo_date:'2026-09-20'};
 outcomePanel(c,p);c.croAskClear();c.fetchPatientById=async()=>({data:{...p,discharged_gozo_date:'2026-09-21'}});c.SB={from:()=>{throw Error('Unexpected write');}};
 await c.croApplyClear();assert.match(c.document.getElementById('cro-err').textContent,/record has changed/);
 assert.equal(c.document.querySelector('#cro-confirm .pf-sc-ok').disabled,false);
});
test('reverting one outcome preserves other outcome dates and stoma closure history',()=>{
 const c=context(),p={...patient(),followup_status:'deceased',deceased_date:'2026-09-20',discharged_gozo_date:'2026-08-10',relocated_overseas_date:'2026-08-20',extra_statuses:['deceased'],findings:'Saved findings'};
 const patch=c.buildOutcomeRevertPatch(p);assert.equal(patch.deceased_date,null);assert.equal(patch.discharged_gozo_date,undefined);assert.equal(patch.relocated_overseas_date,undefined);assert.equal(patch.findings,undefined);
 const closed={...p,reversal_date:'2026-09-22'},merged={...closed,...c.buildOutcomeRevertPatch(closed)};
 assert.equal(merged.reversal_date,'2026-09-22');assert.equal(c.derivedFollowupStatus(merged),'reversed');
});
test('reverted closure is removed from report counts while an earlier true reversal stays counted',()=>{
 const c=context();c.daStomaGroup=t=>/ileostomy/i.test(t)?'Ileostomy':/colostomy/i.test(t)?'Colostomy':'Other';
 for(const name of ['metricNewReversalDates','stomaReversalEntries','metricReversalDates'])vm.runInContext(source(name),c);
 const p={...patient(),followup_status:'reversed',reversal_date:'2026-03-01',extra_stomas:[{uid:'later',type:'End ileostomy',formed_date:'2026-04-01',reversal_date:'2026-09-24'}]},merged={...p,...c.buildOutcomeRevertPatch(p)};
 assert.equal(c.metricNewReversalDates(p,2026,d=>d?.startsWith('2026-09')).size,1);assert.equal(c.metricNewReversalDates(merged,2026,d=>d?.startsWith('2026-09')).size,0);
 assert.deepEqual(Array.from(c.metricReversalDates(merged)),['2026-03-01']);assert.deepEqual(Array.from(c.stomaReversalEntries(merged),x=>x.date),['2026-03-01']);
});
test('reversion is refused when another user saves between the read and the guarded update',async()=>{
 const c=context(),p={...patient(),followup_status:'deceased',updated_at:'2026-09-25T08:00:00Z'};let refreshed=0;
 const filters=[],query={eq:(k,v)=>{filters.push([k,v]);return query;},select:()=>({single:async()=>({error:{message:'The result contains 0 rows'}})})};
 c.fetchPatientById=async()=>({data:p});c.SB={from:()=>({update:()=>query})};c.afterStomaSaved=async()=>{refreshed++;};
 outcomePanel(c,p);c.croAskClear();await c.croApplyClear();assert.equal(refreshed,0);assert.match(c.document.getElementById('cro-err').textContent,/record changed while saving/);
 assert(filters.some(([k,v])=>k==='updated_at'&&v===p.updated_at));assert.equal(c.document.querySelector('#cro-confirm .pf-sc-ok').disabled,false);
});
test('failed status reversion keeps its confirmation and allows one retry',async()=>{
 const c=context(),p={...patient(),followup_status:'deceased'};let writes=0,refreshed=0;
 const query={eq:()=>query,select:()=>({single:async()=>writes===1?{error:{message:'Connection failed'}}:{data:{id:p.id}}})};
 c.fetchPatientById=async()=>({data:p});c.SB={from:()=>({update:()=>{writes++;return query;}})};
 c.refreshReminders=async()=>{};c.afterStomaSaved=async()=>{refreshed++;};c.switchPatientPanel=()=>{};
 outcomePanel(c,p);c.croAskClear();await c.croApplyClear();assert.match(c.document.getElementById('cro-err').textContent,/Connection failed/);
 assert.equal(c.document.querySelector('#cro-confirm .pf-sc-ok').disabled,false);assert.equal(refreshed,0);
 await c.croApplyClear();assert.equal(writes,2);assert.equal(refreshed,1);
});
test('refashion creates a fresh linked ID, retaining prior history and one present stoma',()=>{const c=context(),p=patient(),patch=c.buildStomaOperationPatch(p,draft());assert.equal(patch.extra_refashionings[0].target_uid,'base');assert.equal(patch.extra_refashionings[0].uid,'new-id');assert.equal(patch.reversal_date,undefined);assert.equal(patch.extra_stomas,undefined);assert.equal(p.extra_refashionings.length,0);const list=c.patientStomaList({...p,...patch});assert.equal(list.filter(x=>x.present).length,1);assert.equal(list.find(x=>x.uid==='base').superseded,true);});
test('a refashioned stoma can itself be refashioned; appliance choices use only the latest ID',()=>{const c=context();let p=patient();p={...p,...c.buildStomaOperationPatch(p,draft())};p={...p,...c.buildStomaOperationPatch(p,{...draft(),uid:'third-id',target_uid:'new-id'})};assert.deepEqual(Array.from(c.patientStomaList(p).filter(x=>x.present),x=>x.uid),['third-id']);assert.deepEqual(Array.from(c.stomasPresentOn(p,'2026-09-25'),x=>x.uid),['third-id']);});
test('combined reversal and new stoma stays active; unaffected stomas stay present',()=>{const c=context(),p=patient();const patch=c.buildStomaOperationPatch(p,{...draft('new'),outcomes:[{uid:'base',state:'reversed'}]});assert.equal(patch.reversal_date,'2026-09-25');assert.equal(patch.followup_status,'active');assert.equal(c.patientStomaList({...p,...patch}).filter(x=>x.present).length,1);const two=c.buildStomaOperationPatch(p,{...draft('new'),outcomes:[{uid:'base',state:'present'}]});assert.equal(c.patientStomaList({...p,...two}).filter(x=>x.present).length,2);});
test('unknown reversal date is not invented and does not leave stoma present',()=>{const c=context(),p=patient();const patch=c.buildStomaOperationPatch(p,{...draft('reversal'),date:null,date_unknown:true});assert.equal(patch.reversal_date,null);assert.equal(patch.followup_status,'reversed');assert.equal(c.patientStomaList({...p,...patch})[0].reversal_unknown,true);});
test('handover never carries an old appliance or flange due to the refashioned stoma',()=>{const c=context(),p=patient();const updated={...p,...c.buildStomaOperationPatch(p,draft())};const old=[{stoma_uid:'base',appliances:['Old pouch'],flange_due:'2026-09-26',changed_on:'2026-09-25'}];const line=c.handoverStomaLine(updated,old);assert.match(line,/End colostomy/);assert.match(line,/Appliance not yet selected/);assert.doesNotMatch(line,/Old pouch|flange due/);assert.equal(c.currentApplianceNoteRows(updated,old).length,0);const current=c.handoverStomaLine(updated,[...old,{stoma_uid:'new-id',appliances:['New pouch'],changed_on:'2026-09-25'}]);assert.match(current,/New pouch/);assert.doesNotMatch(current,/Old pouch/);assert.match(c.handoverOperationSummary(updated),/Refashioning/);});
test('multi-stoma handover drops an older undated Lentell entry after both stomas have current selections',async()=>{
 const c=context();c.TODAY='2026-09-30';c.parseNameList=v=>v||[];
 const p={...patient(),stoma_type:'End ileostomy',extra_refashionings:[{uid:'current-ileo',type:'End ileostomy',target_uid:'base',formed_date:'2026-01-01'}],extra_stomas:[{uid:'current-colo',type:'End colostomy',formed_date:'2026-09-24'}]};
 const ep={id:'open-episode',patient_id:p.id,record_date:'2026-09-25',is_current:true,discharge_date:null,appliances:[
  {stoma_uid:'',stoma_type:'End ileostomy',appliances:['Lentell 100mm'],accessories:['None'],changed_on:''},
  {stoma_uid:'current-colo',appliances:['Lentell transp 70mm'],changed_on:'2026-09-26'},
  {stoma_uid:'current-ileo',appliances:['SH flange 70mm','Drainable Bag 70mm'],changed_on:'2026-09-28'},
  {stoma_uid:'current-colo',appliances:['Lentell transp 70mm'],changed_on:'2026-09-30'}
 ]};
 const before=JSON.stringify(ep.appliances);let activeFilter=false;
 const query={select(){return this;},in(){return this;},eq(){return this;},is(key,value){assert.equal(key,'discharge_date');assert.equal(value,null);activeFilter=true;return this;},order(){return this;},then(resolve){resolve({data:[ep]});}};
 c.SB={from:()=>query};vm.runInContext(source('parseEpisodeApplianceRows'),c);vm.runInContext(source('attachHandoverApplianceLines'),c);
 await c.attachHandoverApplianceLines([p]);
 assert.match(p._applianceLine,/SH flange 70mm, Drainable Bag 70mm/);
 assert.match(p._applianceLine,/Lentell transp 70mm/);assert.doesNotMatch(p._applianceLine,/Lentell 100mm/);
 assert.equal((p._applianceLine.match(/Lentell/g)||[]).length,1);
 assert.equal(activeFilter,true);assert.equal(JSON.stringify(ep.appliances),before);
});
test('a closed stoma with an older date-based ID cannot duplicate the current Lentell and accessories',()=>{
 const c=context();c.TODAY='2026-09-30';
 const p={...patient(),stoma_type:'End ileostomy',reversal_date:'2025-06-25',extra_stomas:[{uid:'closed-stoma',type:'Loop Ileostomy',formed_date:'2026-08-29',superseded_date:'2026-09-24'}],extra_refashionings:[{uid:'current-stoma',type:'End ileostomy',target_uid:'base',formed_date:'2026-09-14'}]};
 const rows=[{stoma_uid:'',appliances:['Microporous 70mm','Drainable Bag 70mm'],changed_on:'2026-09-14'},
  {stoma_uid:'new:2026-08-29',appliances:['Lentell transp 70mm'],accessories:['Hydrocolloid 5x20'],changed_on:'2026-09-15'},
  {stoma_uid:'current-stoma',appliances:['Lentell transp 70mm'],accessories:['None'],changed_on:'2026-09-28'}];
 const before=JSON.stringify(rows),line=c.handoverStomaLine(p,rows);
 assert.equal(c.patientStomaList(p).filter(s=>s.present).length,1);
 assert.equal((line.match(/Lentell transp 70mm/g)||[]).length,1);
 assert.doesNotMatch(line,/Hydrocolloid|Microporous|Drainable/);
 assert.equal(c.looseApplianceRows(p,rows).length,0);assert.equal(JSON.stringify(rows),before);
});
test('a present stoma keeps the newest selection when a legacy ID and stored ID refer to the same stoma',()=>{
 const c=context(),p={...patient(),extra_stomas:[{uid:'stored-id',type:'End ileostomy',formed_date:'2026-09-20'}]};
 const rows=[{stoma_uid:'base',appliances:['Base pouch'],changed_on:'2026-09-21'},
  {stoma_uid:'stored-id',appliances:['Old 100mm pouch'],changed_on:'2026-09-22'},
  {stoma_uid:'new:2026-09-20',appliances:['Latest 70mm pouch'],changed_on:'2026-09-25'}];
 const line=c.handoverStomaLine(p,rows);
 assert.match(line,/Base pouch/);assert.match(line,/Latest 70mm pouch/);assert.doesNotMatch(line,/Old 100mm|not yet selected/);
 assert.equal(c.currentApplianceNoteRows(p,rows).find(r=>r.appliances[0]==='Latest 70mm pouch').stoma_uid,'stored-id');
 assert.equal(rows[2].stoma_uid,'new:2026-09-20');
});
test('two genuine current stomas can use the same Lentell without being collapsed into one',()=>{
 const c=context(),p={...patient(),initial_stomas:[{uid:'second-id',type:'End ileostomy'}]};
 const rows=[{stoma_uid:'',appliances:['Old pouch'],changed_on:'2026-09-20'},
  {stoma_uid:'base',appliances:['Lentell transp 70mm'],changed_on:'2026-09-25'},
  {stoma_uid:'second-id',appliances:['Lentell transp 70mm'],changed_on:'2026-09-25'}];
 const line=c.handoverStomaLine(p,rows);
 assert.equal((line.match(/Lentell transp 70mm/g)||[]).length,2);assert.doesNotMatch(line,/Old pouch/);
});
test('clearing the latest appliance does not resurface an older linked or unlinked selection',()=>{
 const c=context(),p=patient();
 const rows=[{stoma_uid:'',appliances:['Legacy pouch'],changed_on:'2026-09-20'},
  {stoma_uid:'base',appliances:['Old pouch'],changed_on:'2026-09-24'},
  {stoma_uid:'base',appliances:[],accessories:['None'],changed_on:'2026-09-25'}];
 assert.equal(c.currentApplianceNoteRows(p,rows).length,0);assert.equal(c.looseApplianceRows(p,rows).length,0);
 assert.doesNotMatch(c.handoverStomaLine(p,rows)||'',/Old pouch|Legacy pouch/);
});
test('a refashioning cannot inherit an unlinked appliance recorded before its formation',()=>{
 const c=context(),p={...patient(),...c.buildStomaOperationPatch(patient(),draft())};
 const line=c.handoverStomaLine(p,[{stoma_uid:'',appliances:['Previous stoma pouch'],changed_on:'2026-09-24'}]);
 assert.match(line,/Appliance not yet selected/);assert.doesNotMatch(line,/Previous stoma pouch/);
});
test('legacy flat clinic appliances are not offered to a refashioned ID',()=>{const c=context();c.parseNameList=x=>x||[];const rows=c.previousStomaRecords([{id:'a1',appliances:['Old pouch'],accessories:[]}],null,[{uid:'new-id',origin:'refashion'}]);assert.equal(rows['new-id'],undefined);});
test('registry appliance history stays with the exact stoma ID through a refashioning',()=>{
 const c=context();c.parseNameList=v=>Array.isArray(v)?v:(v?[v]:[]);c.fixText=s=>s;c.recCode=r=>r.episode_ref||'';
 vm.runInContext("const _normType=t=>String(t||'').trim().toLowerCase();",c);
 for(const name of ['parseEpisodeApplianceRows','stomaApplianceHistory'])vm.runInContext(source(name),c);
 const p={...patient(),extra_refashionings:[{uid:'new-id',type:'End colostomy',target_uid:'base',formed_date:'2026-09-25'}]};
 const records=[{kind:'episode',record_date:'2026-09-20',appliances:[
  {stoma_uid:'base',stoma_type:'End colostomy',appliances:['Old pouch'],changed_on:'2026-09-20'},
  {stoma_uid:'new-id',stoma_type:'End colostomy',appliances:['Ward pouch'],changed_on:'2026-09-25'}]}];
 const appointments=[{status:'attended',appt_date:'2026-09-28',stoma_appliances:[{uid:'new-id',stoma_type:'End colostomy',appliances:['Clinic pouch'],accessories:['Belt']}]}];
 const groups=c.stomaApplianceHistory(p,records,appointments);
 assert.deepEqual(Array.from(groups.get('base'),e=>e.appliances[0]),['Old pouch']);
 assert.deepEqual(Array.from(groups.get('new-id'),e=>e.appliances[0]),['Clinic pouch','Ward pouch']);
 assert.deepEqual(Array.from(groups.get('new-id')[0].added),['Clinic pouch','Belt']);
 assert.deepEqual(Array.from(groups.get('new-id')[0].stopped),['Ward pouch']);
 assert.equal(groups.has('__unassigned__'),false);
});
test('registry appliance history does not guess between two matching current stomas',()=>{
 const c=context();c.parseNameList=v=>Array.isArray(v)?v:(v?[v]:[]);c.fixText=s=>s;c.recCode=()=>'';
 vm.runInContext("const _normType=t=>String(t||'').trim().toLowerCase();",c);
 for(const name of ['parseEpisodeApplianceRows','stomaApplianceHistory'])vm.runInContext(source(name),c);
 const p={...patient(),initial_stomas:[{uid:'second-id',type:'End colostomy',location:'RIF'}]};
 const records=[{kind:'episode',record_date:'2026-09-25',appliances:[{stoma_type:'End colostomy',appliances:['Unlinked pouch'],changed_on:'2026-09-25'}]}];
 const groups=c.stomaApplianceHistory(p,records,[]);
 assert.equal(groups.has('base'),false);assert.equal(groups.has('second-id'),false);
 assert.deepEqual(Array.from(groups.get('__unassigned__')[0].appliances),['Unlinked pouch']);
});
test('same-day legacy history can still belong to a stoma closed during that operation',()=>{
 const c=context();c.parseNameList=v=>Array.isArray(v)?v:(v?[v]:[]);c.fixText=s=>s;c.recCode=()=>'';
 vm.runInContext("const _normType=t=>String(t||'').trim().toLowerCase();",c);
 for(const name of ['parseEpisodeApplianceRows','stomaApplianceHistory'])vm.runInContext(source(name),c);
 const p={...patient(),reversal_date:'2026-09-25',extra_stomas:[{uid:'new-id',type:'End ileostomy',formed_date:'2026-09-25'}]};
 const records=[{kind:'episode',record_date:'2026-09-25',appliances:[{stoma_type:'End colostomy',appliances:['Final colostomy pouch'],changed_on:'2026-09-25'}]}];
 const groups=c.stomaApplianceHistory(p,records,[]);
 assert.deepEqual(Array.from(groups.get('base')[0].appliances),['Final colostomy pouch']);
 assert.equal(groups.has('__unassigned__'),false);
});
test('stomas panel renders the unified stoma summary without a second generated stoma section',()=>{
 const c=context();c.document.body.insertAdjacentHTML('beforeend','<section id="psm-stomas"></section>');
 c.sitingSummaryHTML=()=>'<div data-siting></div>';c.patientStomaSummaryHTML=()=>'<div data-unified-stomas></div>';
 vm.runInContext("let clrState={patient:{id:'p1'},siting:null,available:true};",c);
 vm.runInContext(source('renderStomasPanel'),c);c.renderStomasPanel();
 const host=c.document.getElementById('psm-stomas');
 assert.equal(host.querySelectorAll('[data-unified-stomas]').length,1);
 assert.equal(host.querySelectorAll('.clr-cats').length,0);
});
test('opening and reviewing a draft performs no write and preserves location control',async()=>{const c=context();let writes=0;c.fetchPatientById=async()=>({data:patient()});c.SB={from:()=>{writes++;throw Error('Unexpected write');}};await c.openStomaOperation('p1','refashion');assert.equal(writes,0);const d=c.document;assert.equal(d.getElementById('so-location').value,'LIF');d.getElementById('so-date').value='2026-09-25';d.getElementById('so-findings').value='Procedure';d.getElementById('so-admission').value='yes';c.stomaBadgesHTML=x=>x.present?'Present':'History';c.reviewStomaOperation();assert.equal(d.getElementById('so-details').hidden,true);assert.equal(writes,0);c.backStomaOperation();assert.equal(d.getElementById('so-details').hidden,false);});
test('refashion page fixes the stoma type and retains the discharge date',async()=>{const c=context();c.fetchPatientById=async()=>({data:patient()});await c.openStomaOperation('p1','refashion','base:base');const d=c.document;assert.equal(d.getElementById('so-type').disabled,true);assert.match(d.getElementById('so-title').textContent,/End colostomy/);d.getElementById('so-type').innerHTML='<option>End ileostomy</option>';d.getElementById('so-date').value='2026-09-25';d.getElementById('so-discharge').value='2026-09-26';d.getElementById('so-findings').value='Operation details';d.getElementById('so-admission').value='yes';const f=c.readStomaOperation();assert.equal(f.type,'End colostomy');assert.equal(f.discharge_date,'2026-09-26');});
test('individual stoma modal exposes its three paths and closure date without saving',async()=>{
 const c=context(),p=patient();c.fetchPatientById=async()=>({data:p});c.jsSafe=x=>x;c.STOMA_KINDS={first:{label:'First stoma',dateLabel:'Surgery date'},initial:{label:'First stoma',dateLabel:'Surgery date'},later:{label:'Later stoma',dateLabel:'Surgery date'},refashion:{label:'Refashioned',dateLabel:'Surgery date'}};
 c.refashionTargetOptions=()=>'<option value="base">First stoma</option>';c.stomaReplacesOptions=()=>'<option value="">No</option>';
 for(const name of ['stomaTitle','stomaBySlot','openStomaModal','stomaModalSnapshot','onStomaTypeChange','onStomaModalPreview','onStomaPresent','stomaModalCloseAction','stomaModalRefashionAction','stomaModalRefashionChoice'])vm.runInContext(source(name),c);
 vm.runInContext('let stomaModalCtx=null;',c);
 const slot=c.patientStomaList(p)[0].slot;await c.openStomaModal('p1',slot);
 const d=c.document;assert.match(d.querySelector('.sm-gold-title').textContent,/End colostomy/);
 assert.equal(d.querySelectorAll('.sm-actions button').length,3);
 assert.equal(d.querySelectorAll('.sm-tab').length,1);
 assert.equal(d.getElementById('sm-revwrap').hidden,true);
 c.stomaModalCloseAction();assert.equal(d.getElementById('sm-revwrap').hidden,false);
 c.stomaModalRefashionAction();assert.equal(d.getElementById('sm-refashion-choice').hidden,false);
 c.stomaModalRefashionChoice(true);assert.equal(d.getElementById('sm-refashion-confirm').hidden,false);
});
test('removed stoma fields preserve distinct saved comments, findings, reversal notes and replacement links',async()=>{
 const c=context(),p={...patient(),stoma_superseded_date:'2026-03-01',findings:'Base findings',extra_stomas:[{uid:'later',type:'End ileostomy',formed_date:'2026-03-01',replaces_uid:'base',operation:'Formation details',comments:'Saved comments',findings:'Different saved findings',reversal_date:'2026-09-24',reversal_notes:'Prior closure notes'}]};
 c.fetchPatientById=async()=>({data:p});c.jsSafe=x=>x;c.STOMA_KINDS={first:{label:'First stoma',dateLabel:'Surgery date'},later:{label:'Later stoma',dateLabel:'Surgery date'}};
 for(const name of ['stomaTitle','stomaBySlot','openStomaModal','stomaModalSnapshot','onStomaTypeChange','onStomaModalPreview','readStomaModal','stomaPayloadFor'])vm.runInContext(source(name),c);
 vm.runInContext('let stomaModalCtx=null;',c);await c.openStomaModal('p1','later:later');const d=c.document;
 for(const id of ['sm-comments','sm-replaces','sm-revnotes'])assert.equal(d.getElementById(id),null,id);
 d.getElementById('sm-discharge').value='2026-03-05';const f=c.readStomaModal(),patch=c.stomaPayloadFor(p,'later:later',f);
 assert.equal(patch.extra_stomas[0].comments,'Saved comments');assert.equal(patch.extra_stomas[0].findings,'Different saved findings');assert.equal(patch.extra_stomas[0].reversal_notes,'Prior closure notes');assert.equal(patch.extra_stomas[0].replaces_uid,'base');
 assert.equal(patch.extra_stomas[0].discharge_date,'2026-03-05');assert.equal(patch.stoma_superseded_date,undefined);
 await c.openStomaModal('p1','base');assert.equal(c.stomaPayloadFor(p,'base',c.readStomaModal()).findings,undefined);
});
test('reverting a stoma closure selection asks first and corrects unknown-date history when saved',async()=>{
 const c=context(),p={...patient(),followup_status:'reversed',stoma_operation_history:[{id:'closed',kind:'reversal',date_unknown:true,affected:[{uid:'base',state:'reversed'}]}]};
 c.fetchPatientById=async()=>({data:p});c.jsSafe=x=>x;c.STOMA_KINDS={first:{label:'First stoma',dateLabel:'Surgery date'}};
 for(const name of ['stomaTitle','stomaBySlot','openStomaModal','stomaModalSnapshot','onStomaTypeChange','onStomaModalPreview','onStomaPresent','stomaModalMarkPresent','readStomaModal','stomaPayloadFor'])vm.runInContext(source(name),c);
 vm.runInContext('let stomaModalCtx=null;',c);await c.openStomaModal('p1','base');
 let prompts=0;c.confirm=q=>{prompts++;assert.match(q,/Revert the closed \/ reversed status/);return false;};c.stomaModalMarkPresent();
 assert.equal(c.document.querySelector('[name="sm-present"]:checked').value,'reversed');assert.equal(prompts,1);
 c.confirm=()=>true;c.stomaModalMarkPresent();const patch=c.stomaPayloadFor(p,'base',c.readStomaModal());assert.equal(c.patientStomaList({...p,...patch})[0].present,true);assert.equal(patch.followup_status,'active');
});
test('missing stoma details make the stoma shortcut primary; demographic edits reveal their own save',async()=>{
 const c=context(),p={id:'p1',first_name:'Alex',surname:'Example'};
 c.fetchPatientById=async()=>({data:p});c.patientDetailsOnlyHTML=()=>'<div id="pcd-pane-1"><div id="pcd-lockbar"></div><input data-locked="1" readonly value="Alex"></div>';
 vm.runInContext(source('openPatientDatesModal'),c);vm.runInContext(source('unlockDemographics'),c);
 await c.openPatientDatesModal('p1');const d=c.document,save=d.getElementById('pcd-savebtn'),stoma=d.getElementById('pcd-stomabtn');
 assert.equal(save.hidden,true);assert.equal(stoma.textContent,'Input / edit stoma details');assert.equal(stoma.className,'btn-save');
 d.querySelector('#pcd-pane-1 input').dispatchEvent(new d.defaultView.Event('input',{bubbles:true}));assert.equal(save.hidden,false);assert.equal(stoma.className,'btn-stoma');
 await c.openPatientDatesModal('p1');assert.equal(d.getElementById('pcd-savebtn').hidden,true);c.unlockDemographics('pcd');assert.equal(d.getElementById('pcd-savebtn').hidden,false);assert.equal(d.querySelector('#pcd-pane-1 input').hasAttribute('readonly'),false);
});
test('recorded stoma and appointment return workflows retain demographic saving',async()=>{
 const c=context();c.patientDetailsOnlyHTML=()=>'<div id="pcd-pane-1"></div>';vm.runInContext(source('openPatientDatesModal'),c);
 c.fetchPatientById=async()=>({data:patient()});await c.openPatientDatesModal('p1');assert.equal(c.document.getElementById('pcd-savebtn').hidden,false);
 c.fetchPatientById=async()=>({data:{id:'p1'}});await c.openPatientDatesModal('p1',{apptId:'visit1'});
 assert.equal(c.document.getElementById('pcd-savebtn').hidden,false);assert.equal(c.document.getElementById('pcd-savebtn').textContent,'Save & return to appointment');assert.match(c.document.querySelector('.btn-cancel').textContent,/Back to appointment/);
});
test('patient details shortcut opens the present stoma and starts a new one when none is present',async()=>{
 const c=context();let opened=null;
 c.openStomaModal=async(id,slot)=>{opened=['current',id,slot];};
 c.openStomaOperation=async(id,kind)=>{opened=['operation',id,kind];};
 c.fetchPatientById=async()=>({data:{...patient(),id_card:'0000000M'},error:null});
 await c.openCurrentStomaFromPatientDetails('p1');assert.deepEqual(Array.from(opened),['current','p1','base']);
 c.fetchPatientById=async()=>({data:{id:'p1',id_card:'0000000M',initial_stomas:[],extra_stomas:[],extra_refashionings:[],stoma_operation_history:[]},error:null});
 await c.openCurrentStomaFromPatientDetails('p1');assert.deepEqual(Array.from(opened),['operation','p1','new']);
});
test('saving patient details updates demographics without writing stoma history',async()=>{
 const c=context(),p={...patient(),first_name:'Alex',surname:'Example',id_card:'0000000M',sex:'Male',locality:'Mosta',date_of_birth:'1980-01-01',consultant:'Firm A'};
 c.document.body.insertAdjacentHTML('beforeend','<div id="pcd-error"></div><input id="pcd-first" value="Alexander"><input id="pcd-surname" value="Example" data-locked="1"><input id="pcd-idcard" value="0000000M" data-locked="1">');
 c.fetchPatientById=async()=>({data:p,error:null});c.normaliseIdCard=s=>s;c.findRegistryPatientsByIdCard=async()=>({matches:[],error:null});c.refreshReminders=()=>{};c.closeModal=()=>{};
 let written;c.updatePatientTolerant=async(id,patch)=>{written=patch;return{error:null,dropped:[]};};
 vm.runInContext(source('savePatientDates'),c);vm.runInContext('patientEditReturn=null;',c);
 await c.savePatientDates('p1');assert.equal(written.first_name,'Alexander');assert.equal(written.surname,undefined);
 assert.equal(written.stoma_type,undefined);assert.equal(written.extra_refashionings,undefined);
});
test('invalid chronology and missing refashion target are blocked',()=>{const c=context();assert.throws(()=>c.buildStomaOperationPatch(patient(),{...draft(),date:'2025-01-01'}),/before/);assert.throws(()=>c.buildStomaOperationPatch(patient(),{...draft(),target_uid:'absent'}),/Choose the present/);});
test('save is one guarded update; an inpatient refashioning opens appliance selection',async()=>{const c=context(),p={...patient(),is_inpatient:true};let writes=0,appliance=0,closed=0;const filters=[];c.fetchPatientById=async()=>({data:p});c.stomaBadgesHTML=x=>x.present?'Present':'History';c.SB={from:()=>({update:patch=>{writes++;assert.equal(patch.extra_refashionings[0].uid,'draft-uid');return{eq:(k,v)=>{filters.push([k,v]);return query;}};}})};const query={eq:(k,v)=>{filters.push([k,v]);return query;},select:()=>({single:async()=>({data:{id:'p1'}})})};c.closeModal=()=>closed++;c.refreshReminders=()=>{};c.afterStomaSaved=async()=>{};c.openHandoverAppliance=async()=>appliance++;await c.openStomaOperation('p1','refashion');const d=c.document;d.getElementById('so-date').value='2026-09-25';d.getElementById('so-findings').value='Refashioned';d.getElementById('so-admission').value='yes';c.reviewStomaOperation();await Promise.all([c.saveStomaOperation(),c.saveStomaOperation()]);assert.equal(writes,1);assert.equal(closed,1);assert.equal(appliance,1);assert(filters.some(([k])=>k==='stoma_operation_history'));});
test('missing migration blocks the entire operation with an actionable error',async()=>{const c=context();c.fetchPatientById=async()=>({data:patient()});c.stomaBadgesHTML=()=>'';const query={eq:()=>query,select:()=>({single:async()=>({error:{message:'stoma_operation_history column missing'}})})};c.SB={from:()=>({update:()=>query})};await c.openStomaOperation('p1','reversal');const d=c.document;d.getElementById('so-unknown').checked=true;c.reviewStomaOperation();await c.saveStomaOperation();assert.match(d.getElementById('so-error').textContent,/Nothing from this operation has been saved/);assert.equal(d.getElementById('so-save').disabled,false);});
