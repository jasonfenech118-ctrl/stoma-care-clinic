/* Completed IDs are matched before a missing patient registration is offered. */
window.UpdateRegister=(()=>{
  let timer,request=0,saving=false;
  function open(){document.getElementById('ur-search')?.focus({preventScroll:true});}
  function search(){clearTimeout(timer);request++;timer=setTimeout(run,250);}
  async function run(){
    const token=++request,host=document.getElementById('ur-results');
    const input=document.getElementById('ur-search');
    const completeId=/^\d+[a-z]$/i.test(String(input?.value||'').replace(/\s+/g,''));
    if(completeId)input.value=normaliseIdCard(input.value);
    const term=String(input?.value||'').replace(/[%,()"\\]/g,' ').trim();
    if(!host)return;
    if(term.length<2){host.textContent='Enter at least two characters of an ID number, first name or surname.';return;}
    host.textContent='Searching existing patients…';
    try{
      let data,error;
      if(completeId){
        const result=await findRegistryPatientsByIdCard(term);data=result.matches;error=result.error;
      }else{
        const result=await SB.from('patients').select('id,id_card,first_name,surname,followup_status')
          .or(`id_card.ilike.%${term}%,first_name.ilike.%${term}%,surname.ilike.%${term}%`)
          .order('surname',{ascending:true}).order('first_name',{ascending:true}).limit(30);
        data=result.data;error=result.error;
      }
      if(token!==request)return;
      if(error)throw error;
      if(!data?.length){
        if(completeId){newPatient(term);return;}
        host.textContent='No existing patient found. Complete the ID number with its final letter to open a new patient form, or search by name.';return;
      }
      if(completeId&&data.length===1){await profile(data[0].id);return;}
      host.innerHTML=data.map(p=>`<div class="ur-row">
        <div><strong>${htmlSafe(p.id_card||'No ID recorded')}</strong><br>${htmlSafe([p.first_name,p.surname].filter(Boolean).join(' '))}<br><small>${htmlSafe(followupStatusText(p.followup_status))}</small></div>
        <div><button type="button" class="btn-add" onclick="UpdateRegister.profile('${jsSafe(p.id)}')">Open profile</button>
        <button type="button" class="btn-add" onclick="UpdateRegister.surgery('${jsSafe(p.id)}')">Surgery / stomas</button>
        <button type="button" class="btn-add" onclick="UpdateRegister.edit('${jsSafe(p.id)}')">Edit details</button>
        <button type="button" class="btn-add" onclick="UpdateRegister.outcome('${jsSafe(p.id)}')">Outcome</button></div>
      </div>`).join('')+(data.length===30?'<p>Showing the first 30 matches. Enter more of the ID or name to narrow the search.</p>':'');
    }catch(error){if(token===request)host.textContent='Could not search the register. Please try again.';}
  }
  async function profile(id){await openPatientRecord(id,{panel:'demographics'});}
  async function surgery(id){await openPatientRecord(id,{panel:'stomas'});}
  async function edit(id){await openPatientDatesModal(id);}
  async function outcome(id){await openPatientRecord(id,{panel:'outcomes'});}
  function newPatient(id){
    const host=document.getElementById('ur-results');
    host.innerHTML=`<p><strong>${htmlSafe(id)}</strong> is not in the register. Enter the patient details and stoma information below, then save to continue to Outcome.</p>
      ${patientFormHTML({id_card:id},'ur')}
      <p id="ur-new-error" role="status"></p>
      <button id="ur-savebtn" class="btn-save" type="button" hidden onclick="UpdateRegister.saveNew()">Save patient & continue to Outcome</button>`;
    pfShowStep('ur',1);
    document.getElementById('ur-first')?.focus({preventScroll:true});
  }
  async function saveNew(){
    if(saving)return;
    const status=document.getElementById('ur-new-error'),button=document.getElementById('ur-savebtn');
    if(!status||!button)return;
    const payload=readPatientForm('ur');
    const missing=patientMissingFields(payload),refError=refashioningError(payload);
    if(!/^\d+[A-Z]$/.test(payload.id_card||'')){status.textContent='Enter the complete ID number, ending with its letter.';return;}
    if(missing.length||refError){status.textContent=refError||'Please complete: '+missing.join(', ');return;}
    saving=true;button.disabled=true;status.textContent='Checking ID and saving…';
    try{
      const {matches,error:lookupError}=await findRegistryPatientsByIdCard(payload.id_card);
      if(lookupError)throw lookupError;
      if(matches.length){
        status.textContent='This patient is already registered. Open their existing record to update it.';
        const go=document.createElement('button');go.type='button';go.textContent='Open existing patient';go.onclick=()=>outcome(matches[0].id);status.append(go);return;
      }
      payload.followup_owner='Common';payload.followup_type=normaliseFollowupType('new_case');
      const by=await patientSignatureName(),now=new Date().toISOString();
      payload.created_at=now;payload.updated_at=now;
      if(by){payload.created_by=by;payload.updated_by=by;}
      const {data,error,dropped}=await insertPatientTolerant(payload);
      if(error)throw error;
      if(!data?.id)throw new Error('Could not confirm the saved patient. Search the ID again before retrying.');
      if(dropped?.length)alert('Saved, except for unavailable fields: '+dropped.join(', '));
      await outcome(data.id);
      refreshReminders();
    }catch(error){status.textContent='Could not save: '+(error.message||'Please try again.');}
    finally{saving=false;button.disabled=false;}
  }
  return {open,search,profile,surgery,edit,outcome,saveNew};
})();
