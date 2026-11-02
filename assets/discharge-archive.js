
const dischargeLetterWindows=new Map();
let dischargeArchiveContext=null,dischargeArchiveRequest=0,dischargeArchiveEditId=null;
// Saved letters are bulky (a full styled HTML document each), so they are stored
// gzip-compressed — roughly 6–8× smaller in Supabase. A "GZ:" prefix marks a
// compressed row; older plain-HTML rows are read back unchanged. If the browser
// has no CompressionStream the letter is stored as-is (still works, just larger).
async function dischargeCompress(html){
  try{
    if(typeof CompressionStream==='undefined')return String(html||'');
    const cs=new CompressionStream('gzip'),w=cs.writable.getWriter();
    w.write(new TextEncoder().encode(String(html||'')));w.close();
    const u8=new Uint8Array(await new Response(cs.readable).arrayBuffer());
    let bin='';for(let i=0;i<u8.length;i+=0x8000)bin+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));
    return 'GZ:'+btoa(bin);
  }catch(e){return String(html||'');}
}
async function dischargeDecompress(stored){
  const s=String(stored||'');
  if(s.slice(0,3)!=='GZ:')return s;
  try{
    const bin=atob(s.slice(3)),u8=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
    const ds=new DecompressionStream('gzip'),w=ds.writable.getWriter();
    w.write(u8);w.close();
    return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
  }catch(e){return s;}
}
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
    dischargeArchiveEditId=String(data.id);
    host.innerHTML='<h3>Saved discharge letter</h3><p class="report-note" id="saved-discharge-note">Saved copy · read only</p>'
      +'<div id="saved-discharge-actions"><button class="psm-btn" type="button" onclick="printSavedDischargeLetter()">Print / save PDF</button> '
      +'<button class="psm-btn" type="button" onclick="editSavedDischargeLetter()">✏️ Edit letter</button></div>';
    const frame=document.createElement('iframe');frame.id='saved-discharge-letter-frame';frame.title='Saved discharge letter';frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.cssText='width:100%;height:85vh;background:white;border:1px solid #d1d9e2;margin-top:12px';frame.srcdoc=await dischargeDecompress(data.letter_html);host.append(frame);host.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){if(request===dischargeArchiveRequest)host.textContent='Could not open this saved letter. '+e.message;}
}
function printSavedDischargeLetter(){document.getElementById('saved-discharge-letter-frame')?.contentWindow?.print();}
// The editable region of a saved letter: the letter body, never the <head> styles.
function _dischargeEditRegion(){
  const doc=document.getElementById('saved-discharge-letter-frame')?.contentDocument;
  return doc?(doc.querySelector('.WordSection1')||doc.body):null;
}
// Amend a saved letter in place: make its text editable, then save the edit back
// to the same row (compressed). Keeps everything in the read-only sandbox — only
// the parent toggles contenteditable, so no script runs inside the letter frame.
function editSavedDischargeLetter(){
  const region=_dischargeEditRegion();if(!region)return;
  region.setAttribute('contenteditable','true');region.style.outline='2px dashed #2563eb';region.focus();
  const note=document.getElementById('saved-discharge-note');
  if(note)note.textContent='Editing — amend the wording, then Save changes (Ctrl/Cmd+B, I, U to format).';
  const actions=document.getElementById('saved-discharge-actions');
  if(actions)actions.innerHTML='<button class="psm-btn psm-btn-primary" type="button" onclick="saveEditedDischargeLetter()">Save changes</button> '
    +'<button class="psm-btn" type="button" onclick="cancelEditSavedDischargeLetter()">Cancel</button>';
}
function cancelEditSavedDischargeLetter(){if(dischargeArchiveEditId)viewSavedDischargeLetter(dischargeArchiveEditId);}
async function saveEditedDischargeLetter(){
  const ctx=dischargeArchiveContext;if(!ctx||!dischargeArchiveEditId)return;
  const region=_dischargeEditRegion(),frame=document.getElementById('saved-discharge-letter-frame');
  if(!region||!frame?.contentDocument)return;
  region.removeAttribute('contenteditable');region.style.outline='';
  const doc=frame.contentDocument;
  const html=(doc.doctype?'<!DOCTYPE html>':'')+doc.documentElement.outerHTML;
  if(html.length>1000000){alert('The amended letter is too large to save.');return editSavedDischargeLetter();}
  const note=document.getElementById('saved-discharge-note');if(note)note.textContent='Saving…';
  try{
    const {error}=await SB.from('patient_discharge_letters').update({letter_html:await dischargeCompress(html)}).eq('id',dischargeArchiveEditId).eq('patient_id',ctx.patientId);
    if(error)throw Error(error.message);
    viewSavedDischargeLetter(dischargeArchiveEditId);   // reload the saved, read-only copy
  }catch(e){if(note)note.textContent='Could not save the changes: '+e.message;editSavedDischargeLetter();}
}
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
    // Store the letter compressed; letter_text is never read back, so it is kept
    // empty to save further space (the plain-text copy is rebuilt live when emailing).
    const letterHtml=await dischargeCompress(payload.html);
    const row={id,patient_id:session.patientId,created_by:auth.user.id,created_by_name:String(payload.author||auth.user.email||''),letter_date:String(payload.date||''),filename:String(payload.filename||'Discharge_letter'),letter_html:letterHtml,letter_text:'',stoma_uids:session.snapshot.stomas.map(s=>s.uid).filter(Boolean)};
    const {error}=await SB.from('patient_discharge_letters').insert(row);
    if(error&&error.code!=='23505')throw Error(error.message);
    if(error){const check=await SB.from('patient_discharge_letters').select('id,letter_html').eq('id',id).eq('patient_id',session.patientId).single();if(check.error||check.data?.letter_html!==letterHtml)throw Error('Could not verify the saved letter. Try saving again.');}
    session.last={id,fingerprint};session.pending=null;
    if(dischargeArchiveContext?.patientId===session.patientId&&document.getElementById('page-discharge-letters')?.classList.contains('active'))openDischargeLetterFor(session.patientId);
    return id;
  }finally{session.busy=false;}
}
