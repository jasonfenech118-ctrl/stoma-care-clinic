/* A focused DNTU form. Historical records and the selected appointment have
   separate save paths; choosing a count never fabricates dates or appointments. */
let dntuNurseState=null;

function dntuEventKey(a){return `${a.appt_date||''} ${String(a.appt_slot||'').slice(0,5)}`;}
function dntuWhen(date,slot=''){
  if(!date)return 'Date not set';
  const label=new Date(`${date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  return label+(slot?` at ${String(slot).slice(0,5)}`:'');
}
function dntuSequence(rows){
  const ordered=rows.filter(a=>a.status!=='booked').sort((a,b)=>dntuEventKey(b).localeCompare(dntuEventKey(a)));
  const sequence=[];
  for(const a of ordered){if(a.status!=='did_not_attend')break;sequence.push(a);}
  return sequence;
}
function dntuFormContext(s){
  const current={...s.appt,appt_date:s.date,appt_slot:s.slot,status:'did_not_attend'};
  const earlier=s.history.filter(a=>String(a.id)!==String(s.appt.id)&&dntuEventKey(a)<dntuEventKey(current));
  const sequence=dntuSequence(s.mode==='record'?earlier:s.history);
  const base=sequence.length+(s.mode==='record'?1:0);
  return {current,sequence,base};
}
async function dntuLoadHistory(patientId){
  const result=await fetchAllRows(()=>SB.from('appointments')
    .select('id,patient_id,appt_date,appt_slot,status,assigned_to,bank_staff_id')
    .eq('patient_id',patientId).order('appt_date',{ascending:false}).order('appt_slot',{ascending:false}).order('id'));
  if(result.error)throw new Error('Could not load the DNTU history. Please try again.');
  return result.rows;
}
async function openDntuNurseModal(apptId,mode='record'){
  try{
    const{data:raw,error}=await SB.from('appointments').select('*').eq('id',apptId).single();
    if(error||!raw)throw new Error('Could not load this appointment.');
    if(!raw.patient_id)throw new Error('This appointment needs a linked patient before a DNTU can be recorded.');
    const appt=(await enrichAppointments([raw]))[0]||raw;
    const p=appt.patients||{};
    const history=await dntuLoadHistory(raw.patient_id);
    const nurseOptions=await buildNurseAllocationOptions(appt.bank_staff_id?'ot':(appt.assigned_to?'core':'common'),appt.bank_staff_id||appt.assigned_to||'common');
    dntuNurseState={appt,p,history,nurseOptions,mode,targets:{},drafts:{record:[],history:[]},
      date:appt.appt_date,slot:String(appt.appt_slot||'').slice(0,5),
      nurse:appt.bank_staff_id?`bank:${appt.bank_staff_id}`:(appt.assigned_to?`core:${appt.assigned_to}`:'common'),
      owner:normaliseFollowupOwner(p.followup_owner||'Common'),
      year:String(p.followup_year||new Date().getFullYear()),month:String(p.followup_due_month||''),
      followupStatus:normaliseFollowupStatus(p.followup_status||'active'),changeFollowup:false,saving:false};
    esState=null;
    dntuRenderForm();
    openMo();
  }catch(e){alert(e.message||'Could not open the DNTU form.');}
}
function dntuRememberFields(){
  const s=dntuNurseState;if(!s)return;
  if(s.mode==='record'){
    s.date=document.getElementById('dw-date')?.value??s.date;
    s.slot=document.getElementById('dw-slot')?.value??s.slot;
    s.nurse=document.getElementById('dw-nurse')?.value||s.nurse;
  }
  document.querySelectorAll('.dw-history-row').forEach((row,i)=>{
    s.drafts[s.mode][i]={appt_date:row.querySelector('input[type="date"]').value,
      appt_slot:row.querySelector('input[type="time"]').value,
      nurse:row.querySelector('select').value};
  });
  s.owner=document.getElementById('of-owner')?.value||s.owner;
  s.year=document.getElementById('of-year')?.value||s.year;
  s.month=document.getElementById('of-month')?.value??s.month;
  s.followupStatus=document.getElementById('of-followup-status')?.value||s.followupStatus;
}
function dntuChangeMode(mode){
  if(!dntuNurseState||dntuNurseState.saving)return;
  dntuRememberFields();dntuNurseState.mode=mode;dntuRenderForm();
}
function dntuChooseCount(value){
  if(!dntuNurseState||dntuNurseState.saving)return;
  dntuRememberFields();dntuNurseState.targets[dntuNurseState.mode]=Number(value);dntuRenderForm();
}
function dntuChangeAppointment(){
  if(!dntuNurseState||dntuNurseState.saving)return;
  dntuRememberFields();dntuNurseState.targets.record=null;dntuRenderForm();
}
function dntuToggleFollowup(checked){
  if(!dntuNurseState||dntuNurseState.saving)return;
  dntuRememberFields();dntuNurseState.changeFollowup=checked;dntuRenderForm();
}
function dntuNurseOptions(selected){
  // Reuse the clinic's existing staff choices, retaining each historical row's
  // own column instead of assigning all past events to the current nurse.
  const select=document.createElement('select');
  select.innerHTML=dntuNurseState.nurseOptions;select.value=selected||'common';
  [...select.options].forEach(o=>o.toggleAttribute('selected',o.selected));
  return select.innerHTML;
}
async function dntuRefreshAvailability(){
  const s=dntuNurseState,select=document.getElementById('of-month');
  if(!s||!select)return;
  const year=document.getElementById('of-year').value,owner=document.getElementById('of-owner').value;
  const request=Symbol();s.availabilityRequest=request;s.availabilityLoading=true;
  const auto=select.querySelector(`option[value="${AUTO_AVAILABILITY_VALUE}"]`);if(auto)auto.disabled=true;
  try{
    const ctx=contextForFollowupOwner(owner),counts=await getMonthlyClinicAvailability(year,ctx);
    if(document.getElementById('of-month')!==select||s.availabilityRequest!==request)return;
    const selected=select.value;
    select.innerHTML=`<option value="">Choose a month</option><option value="${AUTO_AVAILABILITY_VALUE}">According to clinic availability</option>`+Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}">${htmlSafe(availabilityOptionText(m,counts[m]||0,ctx))}</option>`).join('');
    select.value=selected;storeAvailabilityOnSelect(select,counts,ctx);updateOutcomeAvailabilityPreview();
    s.availabilityLoading=false;
  }catch(e){
    if(document.getElementById('of-month')!==select||s.availabilityRequest!==request)return;
    s.availabilityLoading=false;
    if(select.value===AUTO_AVAILABILITY_VALUE)select.value='';
    const note=document.getElementById('of-availability-note');if(note)note.textContent='Availability could not be checked. Choose a due month.';
  }
}
function dntuFollowupHTML(s){
  const plan=s.p.followup_due_month&&s.p.followup_year
    ?`${followupMonthName(s.p.followup_due_month)} ${s.p.followup_year} · ${normaliseFollowupOwner(s.p.followup_owner||'Common')}`
    :'No due month set';
  const years=[...new Set([Number(s.year),new Date().getFullYear(),new Date().getFullYear()+1,new Date().getFullYear()+2])].sort();
  return `<section class="dw-followup"><h3>Follow-up</h3><p class="dw-help">${htmlSafe(plan)}</p>
    <label class="dw-toggle"><input type="checkbox" id="dw-change-followup" ${s.changeFollowup?'checked':''} onchange="dntuToggleFollowup(this.checked)"/> Change the follow-up plan</label>
    ${s.changeFollowup?`<div class="dw-fields">
      <div class="fg"><label for="of-owner">Follow-up owner</label><select id="of-owner" onchange="dntuRefreshAvailability()">${followupOwnerOptions(s.owner)}</select></div>
      <div class="fg"><label for="of-year">Year</label><select id="of-year" onchange="dntuRefreshAvailability()">${years.map(y=>`<option ${Number(s.year)===y?'selected':''}>${y}</option>`).join('')}</select></div>
      <div class="fg dw-full"><label for="of-month">Due month</label><select id="of-month" onchange="updateOutcomeAvailabilityPreview()"><option value="">Choose a month</option><option value="${AUTO_AVAILABILITY_VALUE}" ${s.month===AUTO_AVAILABILITY_VALUE?'selected':''}>According to clinic availability</option>${Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}" ${String(m)===s.month?'selected':''}>${htmlSafe(followupMonthName(m))}</option>`).join('')}</select><div id="of-availability-note"></div></div>
      <div class="fg dw-full"><label for="of-followup-status">Follow-up status</label><select id="of-followup-status">${followupStatusOptionsHTML(s.followupStatus)}</select></div>
    </div>`:''}</section>`;
}
function dntuRenderForm(){
  const s=dntuNurseState;if(!s)return;
  const c=dntuFormContext(s),record=s.mode==='record';
  const target=Math.max(c.base,s.targets[s.mode]||Math.max(1,c.base));
  s.targets[s.mode]=target;
  const missing=Math.max(0,target-c.base);
  const latest=!record||!s.history.some(a=>String(a.id)!==String(s.appt.id)&&a.status!=='booked'&&dntuEventKey(a)>dntuEventKey(c.current));
  const willPause=target>=3&&latest&&!isClosedFollowupStatus(s.p.followup_status);
  const p=s.p,name=`${p.first_name||''} ${p.surname||''}`.trim()||'Patient';
  const already=s.appt.status==='did_not_attend';
  const labels=['','First','Second','Third'];
  const choices=[...new Set([1,2,3,c.base].filter(n=>n>0))];
  const historyFields=Array.from({length:missing},(_,i)=>{
    const draft=s.drafts[s.mode][i]||{};
    return `<div class="dw-history-row"><h4>Earlier missed appointment${missing>1?` ${i+1}`:''}</h4><div class="dw-fields">
      <div class="fg"><label for="dw-past-date-${i}">Date missed *</label><input id="dw-past-date-${i}" type="date" max="${record&&s.date<TODAY?s.date:TODAY}" value="${htmlSafe(draft.appt_date||'')}"/></div>
      <div class="fg"><label for="dw-past-slot-${i}">Time *</label><input id="dw-past-slot-${i}" type="time" value="${htmlSafe(draft.appt_slot||'')}"/></div>
      <div class="fg dw-full"><label for="dw-past-nurse-${i}">Nurse / clinic column</label><select id="dw-past-nurse-${i}">${dntuNurseOptions(draft.nurse||'common')}</select></div>
    </div></div>`;
  }).join('');
  const actionSummary=record
    ?`${already?'Keep':'Mark'} ${dntuWhen(s.date,s.slot)} as ${dntuOrdinal(target)} DNTU.`
    :`Add ${missing} earlier missed appointment${missing===1?'':'s'}. The DNTU count will be ${target}.`;
  const mb=document.getElementById('mb');mb.className='mb mb-wide dw-modal';
  // Legacy appointment save fields are deliberately absent from this form.
  mb.dataset.dntuEditMode='0';
  mb.innerHTML=`<h2>Did not turn up <span class="dw-abbr">DNTU</span></h2>
    <div class="dw-patient"><strong>${htmlSafe(name)}</strong><span>ID: ${htmlSafe(p.id_card||'—')}${p.phone_number?` · ${htmlSafe(p.phone_number)}`:''}</span></div>
    <fieldset class="dw-mode"><legend>What would you like to do?</legend>
      <label class="${record?'selected':''}"><input type="radio" name="dw-mode" value="record" ${record?'checked':''} onchange="dntuChangeMode('record')"/><span><strong>${already?'Review this DNTU appointment':'Record a missed appointment'}</strong><small>${already?'This appointment is already marked DNTU.':'The patient missed this appointment.'}</small></span></label>
      <label class="${!record?'selected':''}"><input type="radio" name="dw-mode" value="history" ${!record?'checked':''} onchange="dntuChangeMode('history')"/><span><strong>Add previous DNTU history</strong><small>Enter missed appointments from earlier records only.</small></span></label>
    </fieldset>
    ${record?`<section class="dw-current"><h3>Missed appointment</h3><div class="dw-fields">
      <div class="fg"><label for="dw-date">Date *</label><input id="dw-date" type="date" value="${htmlSafe(s.date)}" max="${TODAY}" onchange="dntuChangeAppointment()"/></div>
      <div class="fg"><label for="dw-slot">Time *</label><input id="dw-slot" type="time" value="${htmlSafe(s.slot)}" onchange="dntuChangeAppointment()"/></div>
      <div class="fg dw-full"><label for="dw-nurse">Nurse / clinic column</label><select id="dw-nurse">${dntuNurseOptions(s.nurse)}</select></div>
    </div></section>`:`<p class="dw-context">${htmlSafe(dntuWhen(s.appt.appt_date,s.appt.appt_slot))} stays <strong>${htmlSafe(outcomeLabel(s.appt.status))}</strong>.</p>`}
    <fieldset class="dw-choices"><legend>${record?'Which missed appointment is this?':'How many missed appointments should the history show?'}</legend>
      <p class="dw-help">Count appointments missed in a row. A Seen or Cancelled appointment starts a new count.</p>
      ${choices.map(n=>`<label class="${n===target?'selected':''} ${n<c.base?'unavailable':''}"><input type="radio" name="dw-count" value="${n}" ${n===target?'checked':''} ${n<c.base?'disabled':''} onchange="dntuChooseCount(this.value)"/><span><strong>${record?`${labels[n]||dntuOrdinal(n)} missed appointment`:`${n} missed appointment${n===1?'':'s'}`}</strong><small>${record?(n===1?'No earlier appointments were missed.':`${n-1===1?'One':n-1===2?'Two':n-1} earlier appointment${n===2?' was':'s were'} missed.`):`${n<=c.base?'Already recorded.':`${n-c.base} earlier record${n-c.base===1?'':'s'} to add.`}`}${n<c.base?' Already recorded history cannot be reduced here.':''}</small></span></label>`).join('')}
    </fieldset>
    ${c.sequence.length?`<details class="dw-recorded"><summary>View recorded missed appointments (${c.sequence.length})</summary><ul>${c.sequence.map(a=>`<li>${htmlSafe(dntuWhen(a.appt_date,a.appt_slot))}</li>`).join('')}</ul></details>`:''}
    ${missing?`<section class="dw-history"><h3>Add the earlier appointment${missing===1?'':'s'}</h3><p class="dw-help">${missing===1?'This missed appointment is':`These ${missing} missed appointments are`} not yet recorded. Copy the dates and times from the clinical record${missing>1?', oldest first':''}.</p>${historyFields}</section>`:''}
    ${record&&!willPause?dntuFollowupHTML(s):''}
    <div class="dw-summary" role="status"><strong>When you save</strong><p>${htmlSafe(actionSummary)}</p>${record&&missing?`<p>${missing} earlier missed appointment${missing===1?'':'s'} will also be added.</p>`:''}${!record?'<p>The selected appointment will not be changed.</p>':''}<p id="dw-pause-note" ${!willPause?'hidden':''}>Three or more DNTUs in a row: follow-up will be paused.</p></div>
    <div class="dw-error" id="dw-error" role="alert" hidden></div>
    <div class="mact"><button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button><button type="button" id="dw-save" class="btn-save" ${!record&&!missing&&!s.followupPending?'disabled':''} onclick="saveDntuNurseForm()">${s.followupPending?'Retry follow-up update':record?(already?'Save DNTU changes':`Save as ${dntuOrdinal(target)} DNTU`):(missing?'Save previous history':'History already up to date')}</button></div>`;
  if(record&&s.changeFollowup&&!willPause)dntuRefreshAvailability();
}
function dntuHistoryFingerprint(rows){
  return rows.map(a=>[a.id,a.patient_id,a.status,a.appt_date,String(a.appt_slot||'').slice(0,5),a.assigned_to||'',a.bank_staff_id||''].join('|')).sort().join('\n');
}
function dntuAllocation(nurse){
  return {assigned_to:nurse?.startsWith('core:')?nurse.slice(5):null,bank_staff_id:nurse?.startsWith('bank:')?nurse.slice(5):null};
}
function dntuBuildSavePlan(s,today=TODAY){
  const {base,current}=dntuFormContext(s),record=s.mode==='record',target=s.targets[s.mode];
  const missing=target-base;
  if(!Number.isInteger(target)||missing<0)throw new Error('Choose which missed appointment you are recording.');
  const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  const validTime=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t||'');
  if(record&&(!validDate(s.date)||!validTime(s.slot)))throw new Error('Enter the missed appointment date and time.');
  if(record&&s.date>today)throw new Error('This appointment is in the future. Use “Add previous DNTU history” to enter earlier records.');
  if(record&&s.history.some(a=>String(a.id)!==String(s.appt.id)&&dntuEventKey(a)===dntuEventKey(current)))throw new Error('This patient already has an appointment at that date and time. Open that appointment to record its outcome.');
  const rows=[];let lastKey='';
  for(let i=0;i<missing;i++){
    const draft=s.drafts[s.mode][i]||{};
    if(!validDate(draft.appt_date)||!validTime(draft.appt_slot))throw new Error(`Enter the date and time of earlier missed appointment ${i+1}.`);
    if(draft.appt_date>today)throw new Error('An earlier missed appointment cannot be in the future.');
    const key=dntuEventKey(draft);
    if(lastKey&&key<=lastKey)throw new Error('Enter earlier appointments in date and time order, oldest first.');
    if(record&&key>=dntuEventKey(current))throw new Error('Earlier missed appointments must be before the appointment being recorded.');
    if(s.history.some(a=>dntuEventKey(a)===key))throw new Error('An appointment already exists at one of these dates and times. Open that record to correct its outcome.');
    rows.push({patient_id:s.appt.patient_id,appt_date:draft.appt_date,appt_slot:draft.appt_slot,status:'did_not_attend',...dntuAllocation(draft.nurse)});
    lastKey=key;
  }
  const projected=[...s.history.filter(a=>!record||String(a.id)!==String(s.appt.id)),...rows,...(record?[current]:[])];
  const sequenceRows=record?projected.filter(a=>dntuEventKey(a)<=dntuEventKey(current)):projected;
  if(dntuSequence(sequenceRows).length!==target)throw new Error('A Seen or Cancelled appointment breaks this sequence. Check the earlier dates and choose the matching DNTU count.');
  const streak=dntuSequence(projected).length;
  const pause=streak>=3&&!isClosedFollowupStatus(s.p.followup_status);
  if(record&&s.changeFollowup&&!pause&&(!s.month||!s.year))throw new Error('Choose a follow-up month and year, or untick “Change the follow-up plan”.');
  const patientUpdate=pause?{followup_status:'paused'}:(record&&s.changeFollowup?{followup_due_month:Number(s.month),followup_year:Number(s.year),followup_owner:s.owner,followup_status:s.followupStatus}:null);
  return {rows,current:record?{status:'did_not_attend',appt_date:s.date,appt_slot:s.slot,...dntuAllocation(s.nurse)}:null,patientUpdate,streak};
}
function dntuFormError(message){
  const e=document.getElementById('dw-error');
  if(e){e.hidden=false;e.textContent=message;e.scrollIntoView({block:'nearest'});}
}
async function saveDntuNurseForm(){
  const s=dntuNurseState;if(!s||s.saving)return;
  dntuRememberFields();
  // Resolve availability before snapshotting; saving only history never enters
  // the appointment/follow-up path, even when the appointment is in the future.
  if(s.mode==='record'&&s.changeFollowup&&s.month===AUTO_AVAILABILITY_VALUE&&document.getElementById('of-month')){
    if(s.availabilityLoading){dntuFormError('Clinic availability is still loading. Please wait or choose a due month.');return;}
    s.month=String(resolveMonthValueFromSelect(document.getElementById('of-month'),s.year)||'');
  }
  let plan;
  try{plan=dntuBuildSavePlan(s);}catch(e){dntuFormError(e.message);return;}
  s.saving=true;
  document.querySelectorAll('#mb input,#mb select,#mb button').forEach(e=>e.disabled=true);
  const button=document.getElementById('dw-save');if(button)button.textContent='Saving…';
  let historySaved=false,currentSaved=false;
  try{
    const fresh=await dntuLoadHistory(s.appt.patient_id);
    if(dntuHistoryFingerprint(fresh)!==dntuHistoryFingerprint(s.history))throw new Error('The appointment history has changed. Close and reopen this form to review the latest count.');
    const user=await getCurrentUserForAudit();
    const audit={outcome_recorded_at:new Date().toISOString(),outcome_recorded_by_email:user.email,outcome_recorded_by_name:user.name};
    if(plan.rows.length){
      let result=await SB.from('appointments').insert(plan.rows.map(r=>({...r,...audit}))).select('id,patient_id,appt_date,appt_slot,status,assigned_to,bank_staff_id');
      if(result.error&&Object.keys(audit).includes(missingColumnFromError(result.error)))result=await SB.from('appointments').insert(plan.rows).select('id,patient_id,appt_date,appt_slot,status,assigned_to,bank_staff_id');
      if(result.error)throw new Error('Could not save the earlier records: '+result.error.message);
      historySaved=true;s.history.push(...result.data);
    }
    if(plan.current){
      const body={...plan.current,...audit};
      // Guard the source appointment against another nurse changing its outcome
      // after the preflight read. A retry never inserts a second current event.
      let result;
      for(let attempt=0;attempt<4;attempt++){
        result=await SB.from('appointments').update(body).eq('id',s.appt.id).eq('status',s.appt.status)
          .eq('appt_date',s.appt.appt_date).eq('appt_slot',s.appt.appt_slot).select('id');
        const missing=result.error&&missingColumnFromError(result.error);
        if(!missing||!Object.keys(audit).includes(missing))break;
        delete body[missing];
      }
      if(result.error)throw new Error('Could not save this appointment: '+result.error.message);
      if(!result.data?.length)throw new Error('This appointment has changed. Reopen it to review the latest outcome.');
      currentSaved=true;s.appt={...s.appt,...plan.current};
      s.history=s.history.map(a=>String(a.id)===String(s.appt.id)?{...a,...plan.current}:a);
    }
    if(plan.patientUpdate){
      const{error}=await SB.from('patients').update(plan.patientUpdate).eq('id',s.appt.patient_id);
      if(error){s.followupPending=true;throw new Error('The DNTU record was saved, but follow-up could not be updated: '+error.message);}
      s.followupPending=false;
    }
    closeModal();refreshAppointmentViews();
  }catch(e){
    s.saving=false;
    if(historySaved)s.drafts[s.mode]=[];
    dntuRenderForm();
    const savedMessage=historySaved||currentSaved?'Some changes were saved. The form now shows those saved records. ':'';
    dntuFormError(savedMessage+e.message);
  }finally{s.saving=false;}
}
