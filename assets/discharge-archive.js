
const dischargeLetterWindows=new Map();
let dischargeArchiveContext=null,dischargeArchiveRequest=0;
function registerDischargeLetterWindow(token,patientId,target,snapshot){
  dischargeLetterWindows.set(token,{patientId:String(patientId),target,snapshot,last:null,pending:null});
}
async function openDischargeLetterFor(patientId){
  const request=++dischargeArchiveRequest;
  dischargeArchiveContext={patientId:String(patientId)};
  let page=document.getElementById('page-discharge-letters');
  if(!page){page=document.createElement('section');page.id='page-discharge-letters';page.className='page';document.querySelector('#app .main').append(page);}
  closeModal();document.querySelectorAll('.main > .page.active').forEach(p=>p.classList.remove('active'));
  page.classList.add('active');page.innerHTML='<p class="report-note">Loading discharge letters…</p>';window.scrollTo(0,0);
  try{
    const [patientResult,letters]=await Promise.all([fetchPatientById(patientId),
      fetchAllRows(()=>SB.from('patient_discharge_letters').select('id,patient_id,created_at,created_by_name,letter_date,filename').eq('patient_id',patientId).order('created_at',{ascending:false}).order('id'))]);
    if(request!==dischargeArchiveRequest)return;
    if(patientResult.error||letters.error)throw Error(patientResult.error?.message||letters.error?.message);
    if(!patientResult.data)throw Error('Patient record unavailable.');
    const p=patientResult.data;
    page.innerHTML=dischargeArchiveHTML(p,letters.rows||[]);
  }catch(e){if(request===dischargeArchiveRequest)page.innerHTML='<button class="psm-back" onclick="backDischargeLetters()">Back to patient record</button><p role="alert">'+htmlSafe(e.message||'Could not load saved letters.')+'</p><button class="psm-btn" onclick="openDischargeLetterFor(\''+jsSafe(String(patientId))+'\')">Retry</button>';}
}
function dischargeArchiveHTML(p,letters){
  const id=jsSafe(String(p.id)),name=[p.first_name,p.surname].filter(Boolean).join(' ');
  return `<div class="discharge-archive"><button type="button" class="psm-back" onclick="backDischargeLetters()">‹ Back to patient record</button><header class="psm-head"><div><h2>Discharge letters</h2><p>${htmlSafe(name)} · ${htmlSafe(p.id_card||'No ID recorded')}</p></div><button type="button" class="psm-btn psm-btn-primary" onclick="createPatientDischargeLetter('${id}')">Create new discharge letter</button></header><h3>Past discharge letters</h3>${letters.length?`<div class="pd-table-scroll"><table class="pd-history-table"><thead><tr><th>Letter date</th><th>Saved by</th><th>Saved on</th><th></th></tr></thead><tbody>${letters.map(r=>`<tr><td>${htmlSafe(r.letter_date||'Not recorded')}</td><td>${htmlSafe(r.created_by_name||'Clinic nurse')}</td><td>${htmlSafe(new Date(r.created_at).toLocaleString('en-GB',{timeZone:'Europe/Malta'}))}</td><td><button type="button" class="psm-btn" onclick="viewSavedDischargeLetter('${jsSafe(String(r.id))}')">Open letter</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="report-note">No discharge letters have been saved to this patient record yet. Create a new letter, then choose Save to patient record.</p>'}<div id="saved-discharge-letter"></div></div>`;
}
async function viewSavedDischargeLetter(letterId){
  const ctx=dischargeArchiveContext;if(!ctx)return;
  const host=document.getElementById('saved-discharge-letter');if(!host)return;
  const request=++dischargeArchiveRequest;host.innerHTML='<p>Loading saved letter…</p>';
  try{
    const {data,error}=await SB.from('patient_discharge_letters').select('id,patient_id,letter_html,letter_date').eq('patient_id',ctx.patientId).eq('id',letterId).single();
    if(request!==dischargeArchiveRequest)return;if(error||!data)throw Error(error?.message||'Letter unavailable.');
    host.innerHTML='<h3>Saved discharge letter</h3><p class="report-note">Saved copy · read only</p><button class="psm-btn" type="button" onclick="printSavedDischargeLetter()">Print / save PDF</button>';
    const frame=document.createElement('iframe');frame.id='saved-discharge-letter-frame';frame.title='Saved discharge letter';frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.cssText='width:100%;height:85vh;background:white;border:1px solid #d1d9e2;margin-top:12px';frame.srcdoc=data.letter_html;host.append(frame);host.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){if(request===dischargeArchiveRequest)host.textContent='Could not open this saved letter. '+e.message;}
}
function printSavedDischargeLetter(){document.getElementById('saved-discharge-letter-frame')?.contentWindow?.print();}
async function backDischargeLetters(){++dischargeArchiveRequest;const id=dischargeArchiveContext?.patientId;document.getElementById('page-discharge-letters')?.classList.remove('active');if(id)await openPatientRecord(id);}
async function savePatientDischargeLetter(token,source,payload){
  const session=dischargeLetterWindows.get(token);
  if(!session||session.target!==source)throw Error('Reopen the letter from the patient record before saving.');
  if(!payload||typeof payload.html!=='string'||!payload.html.trim()||payload.html.length>1000000)throw Error('The letter is empty or too large to save.');
  if(typeof payload.text!=='string'||!payload.text.trim())throw Error('Complete the letter before saving.');
  if(String(payload.patientIdNo||'').replace(/\s/g,'').toUpperCase()!==String(session.snapshot.patient.id||'').replace(/\s/g,'').toUpperCase())throw Error('The letter ID number differs from the selected patient. Correct it before saving.');
  const fingerprint=JSON.stringify(payload);
  if(session.last?.fingerprint===fingerprint)return session.last.id;
  if(session.busy)throw Error('The letter is already being saved.');
  session.busy=true;
  try{
    const {data:auth,error:authError}=await SB.auth.getUser();if(authError||!auth?.user)throw Error('Sign in to Stoma Roster again, then reopen the letter.');
    if(!session.pending||session.pending.fingerprint!==fingerprint)session.pending={id:crypto.randomUUID(),fingerprint};
    const id=session.pending.id;
    const row={id,patient_id:session.patientId,created_by:auth.user.id,created_by_name:String(payload.author||auth.user.email||''),letter_date:String(payload.date||''),filename:String(payload.filename||'Discharge_letter'),letter_html:payload.html,letter_text:payload.text,stoma_uids:session.snapshot.stomas.map(s=>s.uid).filter(Boolean)};
    const {error}=await SB.from('patient_discharge_letters').insert(row);
    if(error&&error.code!=='23505')throw Error(error.message);
    if(error){const check=await SB.from('patient_discharge_letters').select('id,letter_html').eq('id',id).eq('patient_id',session.patientId).single();if(check.error||check.data?.letter_html!==payload.html)throw Error('Could not verify the saved letter. Try saving again.');}
    session.last={id,fingerprint};session.pending=null;
    if(dischargeArchiveContext?.patientId===session.patientId&&document.getElementById('page-discharge-letters')?.classList.contains('active'))openDischargeLetterFor(session.patientId);
    return id;
  }finally{session.busy=false;}
}
