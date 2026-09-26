/* Appointment cancellations are independent of attendance and follow-up.
   The database saves the outcome, details and audit trail in one transaction. */
const CANCELLATION_REASONS={
  patient:[['unavailable','Unable to attend'],['unwell','Unwell'],['transport','Transport difficulty'],['personal','Personal / family commitments'],['not_given','Reason not provided'],['other','Other']],
  clinic:[['availability','Clinic availability'],['staff_unavailable','Staff unavailable'],['clinic_closed','Clinic closed'],['schedule_change','Schedule change'],['other','Other']]
};
let cancellationFormState=null;
let cancellationReportRows=[];
let cancellationReportRequest=0;
let cancellationReportLinks=null;

function cancellationSource(a){return ['patient','clinic'].includes(a?.cancellation_source)?a.cancellation_source:'unknown';}
function cancellationSourceLabel(a){return {patient:'Cancelled by patient',clinic:'Cancelled by clinic',unknown:'Cancellation source not recorded'}[cancellationSource(a)];}
function cancellationReasonLabel(a){return (CANCELLATION_REASONS[cancellationSource(a)]||[]).find(([key])=>key===a.cancellation_reason)?.[1]||'Reason not recorded';}
function cancellationHistory(a){return Array.isArray(a?.cancellation_history)?a.cancellation_history:[];}
function cancellationStamp(value){return value?new Date(value).toLocaleString('en-GB',{timeZone:'Europe/Malta'}):'Not recorded';}
function cancellationBadge(a){return `<span class="status-badge sb-cancelled">${htmlSafe(cancellationSourceLabel(a))}</span>`;}
function cancellationFieldsChanged(a,b){return ['cancellation_source','cancellation_reason','cancellation_note','cancellation_date'].some(k=>(a[k]||'')!==(b[k]||''));}
function cancellationPayload(appt,form,today=TODAY){
  if(!['booked','cancelled'].includes(appt.status))throw new Error('Only a booked appointment can be cancelled. Review the recorded outcome first.');
  if(!CANCELLATION_REASONS[form.source])throw new Error('Choose whether the patient or the clinic requested the cancellation.');
  if(!CANCELLATION_REASONS[form.source].some(([key])=>key===form.reason))throw new Error('Choose a reason for this cancellation.');
  const note=String(form.note||'').trim(),date=String(form.date||'');
  if(form.reason==='other'&&!note)throw new Error('Please explain the reason in the note.');
  if(note.length>1000)throw new Error('Keep the note to 1,000 characters or fewer.');
  if(!date&&appt.status!=='cancelled')throw new Error('Enter the cancellation date.');
  if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>today))throw new Error('Enter a valid cancellation date, today or earlier.');
  return {status:'cancelled',cancellation_source:form.source,cancellation_reason:form.reason,cancellation_note:note||null,cancellation_date:date||null};
}
function cancellationReadForm(){return {
  source:document.querySelector('input[name="cancel-source"]:checked')?.value||'',
  reason:document.getElementById('cancel-reason')?.value||'',
  date:document.getElementById('cancel-date')?.value||'',
  note:document.getElementById('cancel-note')?.value||''
};}
function cancellationChangeSource(){
  const form=cancellationReadForm(),reason=document.getElementById('cancel-reason');
  reason.innerHTML='<option value="">Choose a reason</option>'+(CANCELLATION_REASONS[form.source]||[]).map(([key,label])=>`<option value="${key}">${htmlSafe(label)}</option>`).join('');
  reason.disabled=!form.source;
  cancellationUpdateSummary();
}
function cancellationUpdateSummary(){
  const f=cancellationReadForm();
  const note=document.getElementById('cancel-note-label');if(note)note.textContent=f.reason==='other'?'Reason / note *':'Note (optional)';
  const summary=document.getElementById('cancel-summary');
  if(summary)summary.textContent=f.source?`${f.source==='patient'?'Patient':'Clinic'} cancellation${f.reason?' — '+cancellationReasonLabel({cancellation_source:f.source,cancellation_reason:f.reason}):''}.`:'Choose who requested the cancellation.';
}
async function openCancellationForm(apptId){
  try{
    const{data:raw,error}=await SB.from('appointments').select('*').eq('id',apptId).single();
    if(error||!raw)throw new Error('Could not load this appointment.');
    if(!['booked','cancelled'].includes(raw.status))throw new Error('Only a booked appointment can be cancelled. Review the recorded outcome first.');
    if(!Number.isInteger(raw.cancellation_revision))throw new Error('Cancellation recording has not been enabled yet. Please contact the clinic administrator.');
    const appt=(await enrichAppointments([raw]))[0]||raw,p=appt.patients||{},existing=raw.status==='cancelled';
    cancellationFormState={appt,saving:false};esState=null;
    const mb=document.getElementById('mb');mb.className='mb mb-wide cancellation-modal';
    mb.innerHTML=`<h2>${existing?'Cancellation details':'Cancel appointment'}</h2>
      <div class="cancel-patient"><strong>${htmlSafe(`${p.first_name||''} ${p.surname||''}`.trim()||'Patient')}</strong><span>${htmlSafe(p.id_card||'')} · ${htmlSafe(raw.appt_date||'')} at ${htmlSafe(String(raw.appt_slot||'').slice(0,5))}</span></div>
      <fieldset class="cancel-choices"><legend>Who requested the cancellation? *</legend>
        ${['patient','clinic'].map(source=>`<label><input type="radio" name="cancel-source" value="${source}" ${existing&&raw.cancellation_source===source?'checked':''} onchange="cancellationChangeSource()"/><span><strong>Cancelled by ${source}</strong><small>${source==='patient'?'The patient asked to cancel.':'The clinic cancelled because of availability, staffing or scheduling.'}</small></span></label>`).join('')}
      </fieldset>
      <p class="cancel-help">If a patient contacts a nurse to cancel, choose “Cancelled by patient”. Your account is recorded separately as the person entering this information.</p>
      <div class="fg"><label for="cancel-reason">Reason *</label><select id="cancel-reason" onchange="cancellationUpdateSummary()"></select></div>
      <div class="fg"><label for="cancel-date">Cancellation date${existing?' (if known)':' *'}</label><input type="date" id="cancel-date" max="${TODAY}" value="${htmlSafe(existing?(raw.cancellation_date||''):TODAY)}"/>${existing?'<small class="cancel-help">Leave blank if the date is not known from the record.</small>':''}</div>
      <div class="fg"><label id="cancel-note-label" for="cancel-note">Note (optional)</label><textarea id="cancel-note" maxlength="1000" rows="3">${htmlSafe(existing?(raw.cancellation_note||''):'')}</textarea></div>
      <div class="cancel-summary"><strong>When you save</strong><p id="cancel-summary"></p><p>The appointment will be recorded as cancelled and kept in the history. Follow-up details and DNTU counts are unchanged.</p></div>
      <p id="cancel-error" role="alert" hidden></p>
      <div class="mact"><button type="button" class="btn-cancel" onclick="closeModal()">Back</button><button type="button" class="btn-save" id="cancel-save" onclick="saveCancellationForm()">${existing?'Save cancellation details':'Save cancellation'}</button></div>`;
    cancellationChangeSource();document.getElementById('cancel-reason').value=existing?(raw.cancellation_reason||''):'';cancellationUpdateSummary();openMo();
  }catch(e){alert(e.message||'Could not open the cancellation form.');}
}
function cancellationError(error){
  const msg=String(error?.message||error||'Could not save the cancellation.');
  return /cancellation_.*column|column.*cancellation_|schema cache/i.test(msg)?'Cancellation recording has not been enabled yet. Please contact the clinic administrator.':msg;
}
async function saveCancellationForm(){
  const s=cancellationFormState;if(!s||s.saving)return;
  const errorBox=document.getElementById('cancel-error');
  let payload;
  try{payload=cancellationPayload(s.appt,cancellationReadForm());}catch(e){errorBox.hidden=false;errorBox.textContent=e.message;return;}
  if(s.appt.status==='cancelled'&&!cancellationFieldsChanged(s.appt,payload)){await openCancelledAppointmentModal(s.appt.id,s.appt.patient_id);return;}
  s.saving=true;errorBox.hidden=true;
  document.querySelectorAll('.cancellation-modal input,.cancellation-modal select,.cancellation-modal textarea,.cancellation-modal button').forEach(el=>el.disabled=true);
  try{
    // No fallback which drops cancellation fields: the full record must save.
    let query=SB.from('appointments').update(payload).eq('id',s.appt.id).eq('status',s.appt.status)
      .eq('cancellation_revision',s.appt.cancellation_revision).eq('appt_date',s.appt.appt_date).eq('appt_slot',s.appt.appt_slot);
    query=s.appt.patient_id?query.eq('patient_id',s.appt.patient_id):query.is('patient_id',null);
    const{data,error}=await query.select('id');
    if(error)throw error;
    if(!data?.length)throw new Error('This appointment has changed. Reopen it before saving.');
    closeModal();refreshAppointmentViews();await openCancelledAppointmentModal(s.appt.id,s.appt.patient_id);
  }catch(e){errorBox.hidden=false;errorBox.textContent=cancellationError(e);}
  finally{
    s.saving=false;
    if(cancellationFormState===s){document.querySelectorAll('.cancellation-modal input,.cancellation-modal select,.cancellation-modal textarea,.cancellation-modal button').forEach(el=>el.disabled=false);}
  }
}
async function cancellationReplacementRows(ids){
  const rows=[];
  for(let i=0;i<ids.length;i+=150){
    const result=await fetchAllRows(()=>SB.from('appointments').select('id,patient_id,appt_date,appt_slot,status,rebooked_from_appointment_id')
      .in('rebooked_from_appointment_id',ids.slice(i,i+150)).order('appt_date').order('id'));
    if(result.error)return null;
    rows.push(...result.rows);
  }
  return rows;
}
function cancellationReplacementText(a,rows){
  if(rows===null)return 'Rebooking links unavailable';
  const matches=rows.filter(r=>String(r.rebooked_from_appointment_id)===String(a.id));
  const active=matches.find(r=>r.status!=='cancelled');
  if(active)return `${active.appt_date} ${String(active.appt_slot||'').slice(0,5)} · ${outcomeLabel(active.status)}`;
  return matches.length?'Replacement also cancelled':'No linked replacement';
}
async function showCancellationDetails(apptId){
  try{
    const{data:raw,error}=await SB.from('appointments').select('*').eq('id',apptId).single();
    if(error||!raw)throw new Error('Could not load this cancelled appointment.');
    const appt=(await enrichAppointments([raw]))[0]||raw,p=appt.patients||{};
    const replacements=Number.isInteger(raw.cancellation_revision)?await cancellationReplacementRows([raw.id]):null;
    const hasReplacement=replacements?.some(r=>r.status!=='cancelled');
    cancellationFormState=null;
    const mb=document.getElementById('mb');mb.className='mb mb-wide cancellation-modal';
    const history=cancellationHistory(raw);
    mb.innerHTML=`<h2>Cancelled appointment</h2><div class="cancel-patient"><strong>${htmlSafe(`${p.first_name||''} ${p.surname||''}`.trim()||'Patient')}</strong><span>${htmlSafe(p.id_card||'')} · ${htmlSafe(raw.appt_date||'')} at ${htmlSafe(String(raw.appt_slot||'').slice(0,5))}</span></div>
      ${cancellationBadge(raw)}
      <dl class="cancel-details"><dt>Reason</dt><dd>${htmlSafe(cancellationReasonLabel(raw))}</dd><dt>Cancellation date</dt><dd>${htmlSafe(raw.cancellation_date||'Not recorded')}</dd><dt>Note</dt><dd>${htmlSafe(raw.cancellation_note||'—')}</dd><dt>Recorded by</dt><dd>${htmlSafe(raw.cancellation_recorded_by||'Not recorded')}</dd><dt>Recorded on</dt><dd>${htmlSafe(cancellationStamp(raw.cancellation_recorded_at))}</dd><dt>Replacement appointment</dt><dd>${htmlSafe(cancellationReplacementText(raw,replacements))}</dd></dl>
      ${history.length?`<details><summary>Changes to this cancellation (${history.length})</summary><ol class="cancel-audit">${history.map(h=>`<li><strong>${htmlSafe({cancelled:'Cancellation recorded',classified:'Previous cancellation classified',corrected:'Details corrected',restored:'Cancellation undone'}[h.action]||h.action)}</strong> · ${htmlSafe(cancellationStamp(h.recorded_at))}<br/>${htmlSafe(h.recorded_by||'Staff member not recorded')}<br/>${htmlSafe(cancellationSourceLabel(h))} · ${htmlSafe(cancellationReasonLabel(h))}${h.cancellation_note?`<br/>${htmlSafe(h.cancellation_note)}`:''}</li>`).join('')}</ol></details>`:''}
      <p class="cancel-help">Cancellation is separate from DNTU. Rebooking creates a new appointment and keeps this record.</p>
      <div class="mact cancel-actions"><button class="btn-cancel" onclick="closeModal()">Close</button>
        <button class="btn-cancel" onclick="openCancellationForm('${jsSafe(raw.id)}')">Edit cancellation details</button>
        ${raw.status==='cancelled'?`<button class="btn-cancel" ${hasReplacement?'disabled':''} onclick="undoCancellation('${jsSafe(raw.id)}',${Number(raw.cancellation_revision)||0})">Undo cancellation</button>`:''}
        ${raw.status==='cancelled'&&raw.patient_id?`<button class="btn-save" ${hasReplacement?'disabled':''} onclick="openPatientRebookModal('${jsSafe(raw.patient_id)}','${jsSafe(raw.id)}')">Rebook patient</button>`:''}</div>`;
    openMo();
  }catch(e){alert(e.message||'Could not load this cancellation.');}
}
let cancellationUndoSaving=false;
async function undoCancellation(id,revision){
  if(cancellationUndoSaving||!confirm('Undo this cancellation and return the original appointment to Booked? Use Rebook patient to arrange a different appointment.'))return;
  cancellationUndoSaving=true;
  try{
    const{data,error}=await SB.from('appointments').update({status:'booked'}).eq('id',id).eq('status','cancelled').eq('cancellation_revision',revision).select('id');
    if(error)throw error;if(!data?.length)throw new Error('This appointment has changed. Reopen it before continuing.');
    closeModal();refreshAppointmentViews();
  }catch(e){alert(cancellationError(e));}finally{cancellationUndoSaving=false;}
}
function cancellationCounts(rows){
  const counts={total:0,patient:0,clinic:0,unknown:0};
  rows.filter(a=>a.status==='cancelled').forEach(a=>{counts.total++;counts[cancellationSource(a)]++;});return counts;
}
function cancellationCountsHTML(rows){
  const c=cancellationCounts(rows);
  return `<div class="cancel-totals">${[['total','All cancellations'],['patient','By patient'],['clinic','By clinic'],['unknown','Source not recorded']].map(([key,label])=>`<div><span>${label}</span><strong>${c[key]}</strong></div>`).join('')}</div>`;
}
function cancellationFilteredRows(rows,source='all',reason='all',search=''){
  const q=search.trim().toLowerCase();
  return rows.filter(a=>a.status==='cancelled'&&(source==='all'||cancellationSource(a)===source)&&(reason==='all'||`${cancellationSource(a)}:${a.cancellation_reason||''}`===reason)
    &&(!q||[a.patients?.first_name,a.patients?.surname,a.patients?.id_card,a.cancellation_note,a.cancellation_recorded_by].join(' ').toLowerCase().includes(q)));
}
function cancellationCurrentReportRows(){return cancellationFilteredRows(cancellationReportRows,
  document.getElementById('cancel-report-source')?.value||'all',document.getElementById('cancel-report-reason')?.value||'all',document.getElementById('cancel-report-search')?.value||'');}
async function loadCancellationReport(rows){
  const request=++cancellationReportRequest;
  cancellationReportRows=rows.filter(a=>a.status==='cancelled');cancellationReportLinks=null;renderCancellationReport();
  const linked=await cancellationReplacementRows(cancellationReportRows.map(a=>a.id));
  if(request!==cancellationReportRequest)return;cancellationReportLinks=linked;renderCancellationReport();
}
function cancellationReportSourceChanged(){
  const source=document.getElementById('cancel-report-source').value;
  const selected=document.getElementById('cancel-report-reason').value;
  document.getElementById('cancel-report-reason').innerHTML='<option value="all">All reasons</option>'+Object.entries(CANCELLATION_REASONS).filter(([key])=>source==='all'||source===key).flatMap(([key,reasons])=>reasons.map(([r,label])=>`<option value="${key}:${r}">${key==='patient'?'Patient':'Clinic'} — ${htmlSafe(label)}</option>`)).join('');
  if([...document.getElementById('cancel-report-reason').options].some(o=>o.value===selected))document.getElementById('cancel-report-reason').value=selected;
  renderCancellationReport();
}
function renderCancellationReport(){
  const host=document.getElementById('cancellation-report-body');if(!host)return;
  const rows=cancellationCurrentReportRows(),reasons=new Map();
  rows.forEach(a=>{const label=`${cancellationSourceLabel(a)} · ${cancellationReasonLabel(a)}`;reasons.set(label,(reasons.get(label)||0)+1);});
  host.innerHTML=cancellationCountsHTML(rows)+`<p class="report-note">${rows.length} cancelled appointment${rows.length===1?'':'s'} match the filters. The selected month/year uses the original appointment date. Rebooked appointments keep their cancellation history. Older records are shown as “Source not recorded” until confirmed.</p>
    ${reasons.size?`<details><summary>Breakdown by reason</summary><ul>${[...reasons].map(([label,n])=>`<li>${htmlSafe(label)}: <strong>${n}</strong></li>`).join('')}</ul></details>`:''}
    <div class="cancel-table-wrap"><table class="dt"><thead><tr><th>Appointment</th><th>Patient / ID</th><th>Cancelled by</th><th>Reason</th><th>Cancellation date</th><th>Recorded by</th><th>Replacement</th><th></th></tr></thead><tbody>${rows.length?rows.map(a=>`<tr><td>${htmlSafe(a.appt_date)} ${htmlSafe(String(a.appt_slot||'').slice(0,5))}</td><td>${htmlSafe(`${a.patients?.first_name||''} ${a.patients?.surname||''}`.trim()||'Patient')}<br/>${htmlSafe(a.patients?.id_card||'—')}</td><td>${htmlSafe(cancellationSourceLabel(a))}</td><td>${htmlSafe(cancellationReasonLabel(a))}</td><td>${htmlSafe(a.cancellation_date||'Not recorded')}</td><td>${htmlSafe(a.cancellation_recorded_by||'Not recorded')}</td><td>${htmlSafe(cancellationReplacementText(a,cancellationReportLinks))}</td><td><button class="ncb-btn" onclick="showCancellationDetails('${jsSafe(a.id)}')">Details</button></td></tr>`).join(''):'<tr><td colspan="8" class="empty">No cancellations match these filters.</td></tr>'}</tbody></table></div>`;
}
function cancellationCSV(rows,links){
  const cell=v=>{let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const lines=[['Appointment date','Appointment time','Patient','ID card','Cancelled by','Reason','Cancellation date','Note','Recorded at','Recorded by','Replacement appointment'],
    ...rows.map(a=>[a.appt_date,String(a.appt_slot||'').slice(0,5),`${a.patients?.first_name||''} ${a.patients?.surname||''}`.trim(),a.patients?.id_card,cancellationSourceLabel(a),cancellationReasonLabel(a),a.cancellation_date,a.cancellation_note,a.cancellation_recorded_at,a.cancellation_recorded_by,cancellationReplacementText(a,links)])];
  return '\ufeff'+lines.map(row=>row.map(cell).join(',')).join('\r\n');
}
function exportCancellations(){
  const rows=cancellationCurrentReportRows();if(!rows.length){alert('No cancellations match these filters.');return;}
  const url=URL.createObjectURL(new Blob([cancellationCSV(rows,cancellationReportLinks)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`cancellations-${document.getElementById('rep-year').value}-${document.getElementById('rep-month').value||'all-months'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function cancellationAnnualHTML(appts){
  const months=Array.from({length:12},(_,i)=>({label:followupMonthName(i+1),...cancellationCounts(appts.filter(a=>Number(String(a.appt_date).slice(5,7))===i+1))}));
  const total=cancellationCounts(appts);
  return `<h3 class="annual-h3">Cancellations by source</h3><p class="report-note">Cancelled appointments, by original appointment month. Separate from DNTU.</p><table class="dt annual-table"><thead><tr><th>Month</th><th>By patient</th><th>Source not recorded</th><th>Total</th></tr></thead><tbody>${[...months,{label:'Year',...total}].map(m=>`<tr><td>${htmlSafe(m.label)}</td><td>${m.patient}</td><td>${m.unknown}</td><td>${m.total}</td></tr>`).join('')}</tbody></table>`;
}
