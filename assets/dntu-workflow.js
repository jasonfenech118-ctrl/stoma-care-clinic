/* A focused DNTU form. The appointment it opens on is marked as a missed (DNTU)
   appointment; the running DNTU count is worked out automatically. Earlier
   missed appointments that were never entered can be added as previous DNTU
   events — a date each, no time. On a fresh DNTU the follow-up due month is set
   automatically "according to clinic availability"; three misses in a row pause
   the follow-up instead. */
let dntuNurseState=null;

// Previous-DNTU-event rows carry no time, so they order by date alone.
const DNTU_PAST_SLOT='00:00';

function dntuEventKey(a){return `${a.appt_date||''} ${String(a.appt_slot||'').slice(0,5)}`;}
function dntuWhen(date,slot=''){
  if(!date)return 'Date not set';
  const label=new Date(`${date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  return label+(slot?` at ${String(slot).slice(0,5)}`:'');
}
function dntuSequence(rows){
  const ordered=rows.filter(a=>a.status!=='booked'&&a.status!=='cancelled').sort((a,b)=>dntuEventKey(b).localeCompare(dntuEventKey(a)));
  const sequence=[];
  for(const a of ordered){if(a.status!=='did_not_attend')break;sequence.push(a);}
  return sequence;
}
/* The running state of the form: whether the current appointment is being newly
   marked (record) or is already a DNTU being reviewed, the consecutive misses
   already on file, and the count once the previous events being added are
   included. */
function dntuFormContext(s){
  const record=s.appt.status!=='did_not_attend';
  const current={...s.appt,appt_date:s.date,appt_slot:s.slot,status:'did_not_attend'};
  const earlier=s.history.filter(a=>String(a.id)!==String(s.appt.id)&&dntuEventKey(a)<dntuEventKey(current));
  const sequence=dntuSequence(record?earlier:s.history);
  const base=sequence.length+(record?1:0);
  const past=(s.pastEvents||[]).filter(Boolean);
  return {record,current,sequence,base,past,target:base+past.length};
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
    if(raw.status==='cancelled')return showCancellationDetails(apptId);
    if(!raw.patient_id)throw new Error('This appointment needs a linked patient before a DNTU can be recorded.');
    const appt=(await enrichAppointments([raw]))[0]||raw;
    const p=appt.patients||{};
    const history=await dntuLoadHistory(raw.patient_id);
    dntuNurseState={appt,p,history,
      date:appt.appt_date,slot:String(appt.appt_slot||'').slice(0,5),
      owner:normaliseFollowupOwner(p.followup_owner||'Common'),
      // The follow-up due month is set for this year, or the patient's stored
      // year when that is later — never a year already past.
      year:Math.max(new Date().getFullYear(),Number(p.followup_year)||0),
      pastEvents:[],saving:false,followupPending:false};
    esState=null;
    dntuRenderForm();
    openMo();
  }catch(e){alert(e.message||'Could not open the DNTU form.');}
}
function dntuRememberFields(){
  const s=dntuNurseState;if(!s)return;
  s.date=document.getElementById('dw-date')?.value??s.date;
  s.slot=document.getElementById('dw-slot')?.value??s.slot;
  s.owner=document.getElementById('dw-owner')?.value||s.owner;
  const dates=[...document.querySelectorAll('.dw-past-date')];
  if(dates.length)s.pastEvents=dates.map(i=>i.value||'');
}
function dntuAddPastEvent(){
  if(!dntuNurseState||dntuNurseState.saving)return;
  dntuRememberFields();
  dntuNurseState.pastEvents=[...(dntuNurseState.pastEvents||[]),''];
  dntuRenderForm();
  const rows=document.querySelectorAll('.dw-past-date');
  if(rows.length)rows[rows.length-1].focus();
}
function dntuRemovePastEvent(i){
  if(!dntuNurseState||dntuNurseState.saving)return;
  dntuRememberFields();
  (dntuNurseState.pastEvents||[]).splice(i,1);
  dntuRenderForm();
}
// Re-read the fields and repaint so the count, the "when you save" note and the
// button keep up as a date or the time is entered — otherwise they show the
// figure from the last repaint and a third miss can look like a second.
function dntuRecount(){
  if(!dntuNurseState||dntuNurseState.saving)return;
  dntuRememberFields();
  dntuRenderForm();
}
function dntuRenderForm(){
  const s=dntuNurseState;if(!s)return;
  const c=dntuFormContext(s);
  const already=!c.record;
  const willPause=c.target>=3&&!isClosedFollowupStatus(s.p.followup_status);
  const p=s.p,name=`${p.first_name||''} ${p.surname||''}`.trim()||'Patient';
  const pastRows=(s.pastEvents||[]).map((d,i)=>`<div class="dw-past-row">
      <div class="fg dw-full"><label for="dw-past-${i}">Previous DNTU event date *</label>
        <input id="dw-past-${i}" class="dw-past-date" type="date" max="${TODAY}" value="${htmlSafe(d||'')}" onchange="dntuRecount()"/></div>
      <button type="button" class="dw-past-remove" title="Remove this date" onclick="dntuRemovePastEvent(${i})">✕</button>
    </div>`).join('');
  const actionSummary=`${already?'Keep':'Mark'} ${dntuWhen(s.date,s.slot)} as ${dntuOrdinal(c.target)} DNTU.`;
  const mb=document.getElementById('mb');mb.className='mb mb-wide dw-modal';
  // Legacy appointment save fields are deliberately absent from this form.
  mb.dataset.dntuEditMode='0';
  mb.innerHTML=`<h2>Did not turn up <span class="dw-abbr">DNTU</span></h2>
    <div class="dw-patient"><strong>${htmlSafe(name)}</strong><span>ID: ${htmlSafe(p.id_card||'—')}${p.phone_number?` · ${htmlSafe(p.phone_number)}`:''}</span></div>
    <section class="dw-current"><h3>Missed appointment</h3><div class="dw-fields">
      <div class="fg"><label for="dw-date">Date *</label><input id="dw-date" type="date" value="${htmlSafe(s.date)}" max="${TODAY}" ${already?'disabled':''} onchange="dntuRecount()"/></div>
      <div class="fg"><label for="dw-slot">Time *</label><input id="dw-slot" type="time" value="${htmlSafe(s.slot)}" ${already?'disabled':''} onchange="dntuRecount()"/></div>
      <div class="fg dw-full"><label for="dw-owner">Nurse owner</label><select id="dw-owner" class="followup-owner-plain">${followupOwnerOptions(s.owner)}</select></div>
    </div></section>
    <div class="dw-count" role="status">This is the <strong>${dntuOrdinal(c.target)}</strong> missed appointment in a row.${willPause?' <span class="dw-count-warn">Follow-up will be paused.</span>':''}</div>
    <section class="dw-history"><h3>Previous DNTU events</h3>
      <p class="dw-help">Earlier missed appointments that were never entered. Add a date for each — no time is needed — and each one raises the count above. A Seen appointment in between breaks the run.</p>
      ${pastRows}
      <button type="button" class="dw-addbtn" onclick="dntuAddPastEvent()">＋ Add a previous DNTU event</button>
    </section>
    ${c.sequence.length?`<details class="dw-recorded"><summary>View recorded missed appointments (${c.sequence.length})</summary><ul>${c.sequence.map(a=>`<li>${htmlSafe(dntuWhen(a.appt_date,a.appt_slot))}</li>`).join('')}</ul></details>`:''}
    <div class="dw-summary" role="status"><strong>When you save</strong><p>${htmlSafe(actionSummary)}</p>${c.past.length?`<p>${c.past.length} previous DNTU event${c.past.length===1?'':'s'} will also be added.</p>`:''}${willPause?'<p id="dw-pause-note">Three or more DNTUs in a row: follow-up will be paused.</p>':(c.record?'<p>The follow-up due month will be set according to clinic availability.</p>':'')}</div>
    <div class="dw-error" id="dw-error" role="alert" hidden></div>
    <div class="mact"><button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button><button type="button" id="dw-save" class="btn-save" onclick="saveDntuNurseForm()">${already?(c.past.length?'Save previous DNTU events':'Save changes'):`Save as ${dntuOrdinal(c.target)} DNTU`}</button></div>`;
}
function dntuHistoryFingerprint(rows){
  return rows.map(a=>[a.id,a.patient_id,a.status,a.appt_date,String(a.appt_slot||'').slice(0,5),a.assigned_to||'',a.bank_staff_id||''].join('|')).sort().join('\n');
}
/* Build the save: the earlier events to insert, the current appointment to mark,
   and the follow-up change (auto due month, or pause on three in a row). The
   resolved auto month is passed in because reading clinic availability is async.
   Nothing is fabricated: a date is inserted only for a previous event the nurse
   typed, and the current appointment is touched only when it is being marked. */
function dntuBuildSavePlan(s,resolved){
  const c=dntuFormContext(s),record=c.record;
  const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  const validTime=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t||'');
  if(record&&(!validDate(s.date)||!validTime(s.slot)))throw new Error('Enter the missed appointment date and time.');
  if(record&&s.date>TODAY)throw new Error('This appointment is in the future, so it cannot be marked as missed yet.');
  if(record&&s.history.some(a=>String(a.id)!==String(s.appt.id)&&dntuEventKey(a)===dntuEventKey(c.current)))throw new Error('This patient already has an appointment at that date and time. Open that appointment to record its outcome.');
  const rows=[];let lastKey='';
  const cleaned=(s.pastEvents||[]).filter(Boolean);
  for(let i=0;i<cleaned.length;i++){
    const d=cleaned[i];
    if(!validDate(d))throw new Error(`Enter a valid date for previous DNTU event ${i+1}.`);
    if(d>TODAY)throw new Error('A previous DNTU event cannot be in the future.');
    if(record&&d>=String(c.current.appt_date))throw new Error('A previous DNTU event must be dated before the appointment being recorded.');
    const draft={appt_date:d,appt_slot:DNTU_PAST_SLOT};
    const key=dntuEventKey(draft);
    if(lastKey&&key<=lastKey)throw new Error('Enter the previous DNTU events in date order, oldest first, with no two on the same day.');
    if(s.history.some(a=>dntuEventKey(a)===key))throw new Error('A DNTU is already recorded on one of these dates. Open that record to correct its outcome.');
    rows.push({patient_id:s.appt.patient_id,appt_date:d,appt_slot:DNTU_PAST_SLOT,status:'did_not_attend'});
    lastKey=key;
  }
  const projected=[...s.history.filter(a=>!record||String(a.id)!==String(s.appt.id)),...rows,...(record?[c.current]:[])];
  const sequenceRows=record?projected.filter(a=>dntuEventKey(a)<=dntuEventKey(c.current)):projected;
  if(dntuSequence(sequenceRows).length!==c.target)throw new Error('A Seen appointment breaks this run of misses. Check the previous dates.');
  const streak=dntuSequence(projected).length;
  const pause=streak>=3&&!isClosedFollowupStatus(s.p.followup_status);
  const patientUpdate={followup_owner:s.owner};
  if(pause)patientUpdate.followup_status='paused';
  else if(record&&resolved&&resolved.month){
    patientUpdate.followup_due_month=Number(resolved.month);
    patientUpdate.followup_year=Number(resolved.year);
    patientUpdate.followup_flexible=true;
  }
  return {rows,current:record?{status:'did_not_attend',appt_date:s.date,appt_slot:s.slot}:null,patientUpdate,streak,pause};
}
function dntuFormError(message){
  const e=document.getElementById('dw-error');
  if(e){e.hidden=false;e.textContent=message;e.scrollIntoView({block:'nearest'});}
}
// The auto due month for a fresh DNTU that will not pause. Reads the owner's
// clinic availability for the year; on failure it still returns a month so a
// DNTU always ends with a due month.
async function dntuResolveDueMonth(s){
  const ctx=contextForFollowupOwner(s.owner);
  let counts={};
  try{counts=await getMonthlyClinicAvailability(String(s.year),ctx)||{};}catch(e){counts={};}
  return {month:recommendedMonthFromAvailability(s.year,counts),year:s.year};
}
async function saveDntuNurseForm(){
  const s=dntuNurseState;if(!s||s.saving)return;
  dntuRememberFields();
  const c=dntuFormContext(s);
  const willPause=c.target>=3&&!isClosedFollowupStatus(s.p.followup_status);
  // Only a fresh DNTU that will not pause takes an automatic due month.
  let resolved=null;
  if(c.record&&!willPause){try{resolved=await dntuResolveDueMonth(s);}catch(e){resolved=null;}}
  let plan;
  try{plan=dntuBuildSavePlan(s,resolved);}catch(e){dntuFormError(e.message);return;}
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
      // Tolerant of followup_flexible not being in the database yet: retry once
      // without it so the rest of the follow-up still saves.
      let up=await SB.from('patients').update(plan.patientUpdate).eq('id',s.appt.patient_id);
      if(up.error&&/followup_flexible/i.test(String(up.error.message||''))){
        const{followup_flexible,...rest}=plan.patientUpdate;
        up=await SB.from('patients').update(rest).eq('id',s.appt.patient_id);
      }
      if(up.error){s.followupPending=true;throw new Error('The DNTU record was saved, but follow-up could not be updated: '+up.error.message);}
      s.followupPending=false;
    }
    closeModal();refreshAppointmentViews();
  }catch(e){
    s.saving=false;
    if(historySaved)s.pastEvents=[];
    dntuRenderForm();
    const savedMessage=historySaved||currentSaved?'Some changes were saved. The form now shows those saved records. ':'';
    dntuFormError(savedMessage+e.message);
  }finally{s.saving=false;}
}
