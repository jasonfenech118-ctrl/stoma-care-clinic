const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){const m=html.match(new RegExp('(?:async )?function '+name+'\\('));assert(m,name);const start=m.index;const end=html.indexOf('\n}',start);return html.slice(start,end+2);}
function context(){
 const dom=new JSDOM('<body><div id="mo"></div><div id="mb"></div></body>');
 const c=vm.createContext({document:dom.window.document,TODAY:'2026-09-25',Date,console,htmlSafe:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),fmtShortDate:s=>s,prettyStomaType:s=>s,initialStomaCode:s=>'ID-'+s,newStomaUid:()=> 'draft-uid',sexModalClass:()=>'',openMo:()=>{},confirm:()=>true,closeModalGuarded:()=>{},normaliseFollowupStatus:s=>s||'active',patientIsDeceased:p=>!!p.deceased_date,shortApplianceList:a=>a||[],stomaShortType:t=>t,stomaQuadrant:()=>'',collectStomaTargetsFromPatient:()=>[],stomaTypeOptions:t=>`<option>${t||'End colostomy'}</option>`,stomaLocOptions:t=>`<option>${t||'Existing location'}</option>`});
 for(const name of ['parseStomas','parseRefashionings','parseInitialStomas','stomaOperationHistory','stomaOperationFingerprint','patientStomaList','stomaTimeline','stomasPresentOn','buildStomaOperationPatch','applianceStomaUid','currentApplianceNoteRows','looseApplianceRows','handoverApplianceRowText','handoverStomaLine','handoverOperationSummary','previousStomaRecords','stomaRecordsFor','operationTargetLabel','openStomaOperation','changeStomaOperationTarget','changeStomaOperationKind','readStomaOperation','stomaOperationError','reviewStomaOperation','backStomaOperation','saveStomaOperation','openCurrentStomaFromPatientDetails'])vm.runInContext(source(name),c);
 vm.runInContext('let stomaOperationCtx=null;let PF_STOMA_TARGETS=[];let modalCloseGuard=null;let patientEditReturn=null;',c);
 return c;
}
const patient=()=>({id:'p1',stoma_type:'End colostomy',stoma_location:'LIF',surgery_date:'2026-01-01',followup_status:'active',extra_stomas:[],extra_refashionings:[],initial_stomas:[],stoma_operation_history:[]});
const draft=(kind='refashion')=>({kind,uid:'new-id',target_uid:'base',date:'2026-09-25',date_unknown:false,type:'End colostomy',location:'LIF',operation:'Procedure and findings',same_admission:true,admission_answer:'yes',outcomes:[],discharge_date:null});
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
test('patient details shortcut opens the present stoma and starts a new one when none is present',async()=>{
 const c=context();let opened=null;
 c.openStomaModal=async(id,slot)=>{opened=['current',id,slot];};
 c.openStomaOperation=async(id,kind)=>{opened=['operation',id,kind];};
 c.fetchPatientById=async()=>({data:patient(),error:null});
 await c.openCurrentStomaFromPatientDetails('p1');assert.deepEqual(Array.from(opened),['current','p1','base']);
 c.fetchPatientById=async()=>({data:{id:'p1',initial_stomas:[],extra_stomas:[],extra_refashionings:[],stoma_operation_history:[]},error:null});
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
test('missing migration blocks the entire operation with an actionable error',async()=>{const c=context();c.fetchPatientById=async()=>({data:patient()});c.stomaBadgesHTML=()=>'';const query={eq:()=>query,select:()=>({single:async()=>({error:{message:'stoma_operation_history column missing'}})})};c.SB={from:()=>({update:()=>query})};await c.openStomaOperation('p1','reversal');const d=c.document;d.getElementById('so-unknown').checked=true;d.getElementById('so-findings').value='Reversal';c.reviewStomaOperation();await c.saveStomaOperation();assert.match(d.getElementById('so-error').textContent,/Nothing from this operation has been saved/);assert.equal(d.getElementById('so-save').disabled,false);});
