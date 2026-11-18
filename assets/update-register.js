/* Completed IDs are matched before a missing patient registration is offered. */
window.UpdateRegister=(()=>{
  let timer,request=0,saving=false,flow=null;
  function open(){
    clearTimeout(timer);request++;flow=null;
    const input=document.getElementById('ur-search');
    if(input){input.value='';input.focus({preventScroll:true});}
    const host=document.getElementById('ur-results');
    if(host)host.textContent='Enter at least two characters of an ID number, first name or surname.';
  }
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
      let data,error,dupNote='';
      if(completeId){
        const result=await duplicateAwareIdSearch(term);data=result.rows;error=result.error;
      }else{
        const result=await SB.from('patients').select('id,id_card,first_name,surname,followup_status')
          .or(`id_card.ilike.%${term}%,first_name.ilike.%${term}%,surname.ilike.%${term}%`)
          .order('surname',{ascending:true}).order('first_name',{ascending:true}).limit(30);
        data=result.data;error=result.error;
      }
      if(token!==request)return;
      if(error)throw error;
      if(!data?.length){
        if(completeId){
          host.innerHTML=`<div class="ur-row"><div><strong>${htmlSafe(term)}</strong><br>No patient found with this ID.</div><div><button type="button" class="btn-add" onclick="UpdateRegister.createNewProfile('${jsSafe(term)}')">Create New Profile</button></div></div>`;
          return;
        }
        host.textContent='No existing patient found. Complete the ID number with its final letter to see the Create New Profile button, or search by name.';return;
      }
      // A record whose ID (normalised) appears more than once is a duplicate,
      // whether it came from the ID search or a name search.
      const idCount={};data.forEach(p=>{const k=normaliseIdCard(p.id_card);if(k)idCount[k]=(idCount[k]||0)+1;});
      const isDup=p=>!!p._sameName||(normaliseIdCard(p.id_card)&&idCount[normaliseIdCard(p.id_card)]>1);
      const dupCount=data.filter(isDup).length;
      if(dupCount>1||data.some(p=>p._sameName))
        dupNote=`<div class="ur-dup-note">⚠ <strong>${dupCount} records look like the same patient.</strong> Open each to check, keep the correct one, and press <strong>🗑 Remove duplicate</strong> on the others (it archives the record — it can be restored — with an option to delete it permanently).</div>`;
      const d=v=>v?fmtShortDate(String(v).slice(0,10)):'';
      host.innerHTML=dupNote+data.map(p=>{
        const extra=[p.date_of_birth?'DOB '+d(p.date_of_birth):'',p.surgery_date?'Surgery '+d(p.surgery_date):'',p.stoma_type||'',
          p.updated_at?'Last edited '+d(p.updated_at):(p.created_at?'Added '+d(p.created_at):'')].filter(Boolean).join(' · ');
        const nm=[p.first_name,p.surname].filter(Boolean).join(' ');
        const tag=p._sameName?'<span class="ur-dup-tag">Possible duplicate — same name, different ID</span>':isDup(p)?'<span class="ur-dup-tag">Duplicate ID</span>':'';
        return `<div class="ur-row${isDup(p)?' ur-row-dup':''}">
        <div><strong>${htmlSafe(p.id_card||'No ID recorded')}</strong> ${p.id_card?`<button type="button" class="btn-cancel" data-id-number="${htmlSafe(p.id_card)}" onclick="copyPatientId(this)">Copy ID</button>`:''} ${tag}<br>${htmlSafe(nm)}<br><small>${htmlSafe(followupStatusText(p.followup_status))}${extra?' · '+htmlSafe(extra):''}</small></div>
        <div class="ur-row-actions"><button type="button" class="btn-add" onclick="UpdateRegister.profile('${jsSafe(p.id)}')">Open Profile</button>
          ${isDup(p)?`<button type="button" class="btn-cancel ur-dup-remove" onclick="confirmArchivePatient('${jsSafe(p.id)}','${jsSafe(nm||p.id_card||'this record')}')">🗑 Remove duplicate</button>`:''}
        </div>
      </div>`;}).join('')+(data.length===30?'<p>Showing the first 30 matches. Enter more of the ID or name to narrow the search.</p>':'');
    }catch(error){if(token===request)host.textContent='Could not search the register. Please try again.';}
  }
  /* Every record that may be this patient: all copies of the ID (including ones
     stored with spaces, a different letter case or leading zeros) and records
     with the same first name and surname under a different or missing ID.
     Archived records are left out. */
  async function duplicateAwareIdSearch(term){
    const key=normaliseIdCard(term),digits=key.replace(/\D/g,'');
    const live=p=>p.archived!==true;
    let res=await SB.from('patients').select('*').ilike('id_card','%'+digits+'%').limit(40);
    if(res.error)return {rows:[],error:res.error};
    const byId=(res.data||[]).filter(p=>live(p)&&normaliseIdCard(p.id_card)===key);
    if(!byId.length){
      // Fall back to the original exact lookup (it scans the whole table).
      const r=await findRegistryPatientsByIdCard(term);
      if(r.error)return {rows:[],error:r.error};
      return {rows:r.matches,error:null};
    }
    const seen=new Set(byId.map(p=>String(p.id))),rows=byId.slice();
    const names=new Set(byId.map(p=>(String(p.first_name||'').trim()+'|'+String(p.surname||'').trim()).toLowerCase()).filter(n=>n!=='|'));
    for(const n of names){
      const[first,sur]=n.split('|');if(!first||!sur)continue;
      try{
        const q=await SB.from('patients').select('*').ilike('first_name',first).ilike('surname',sur).limit(20);
        (q.data||[]).forEach(p=>{if(live(p)&&!seen.has(String(p.id))&&normaliseIdCard(p.id_card)!==key){seen.add(String(p.id));rows.push({...p,_sameName:true});}});
      }catch(e){}
    }
    return {rows,error:null};
  }
  async function profile(id){
    flow={id,step:'details'};
    await openPatientDatesModal(id,{updateRegister:true});
  }
  async function detailsSaved(id){
    flow={id,step:'stoma'};
    await openPatientRecord(id,{panel:'stomas'});
    // The shared profile may still contain the previous patient after a load
    // failure or another in-flight profile request. Never select a stoma from it.
    const {data:patient,error}=await fetchPatientById(id);
    if(!flow||String(flow.id)!==String(id)||flow.step!=='stoma')return;
    if(error||!patient||String(patient.id)!==String(id)){
      alert('Patient details were saved, but the stoma record could not be loaded. Open this patient again to continue.');
      return;
    }
    const stomas=patientStomaList(patient);
    const stoma=stomas.find(x=>x.present)||stomas[0];
    if(stoma)await openStomaModal(id,stoma.slot);
    else await openStomaOperation(id,'new');
  }
  function renderFlowControls(id){
    document.getElementById('ur-continue-outcome')?.remove();
    if(!flow||flow.id!==id||flow.step!=='stoma')return;
    const bar=document.querySelector('#page-patient-record .psm-page-bar');if(!bar)return;
    const next=document.createElement('button');next.id='ur-continue-outcome';next.type='button';next.className='psm-btn psm-btn-primary';
    next.textContent='Continue to Outcome ›';next.onclick=()=>stomaSaved(id);bar.append(next);
  }
  function stomaSaved(id){
    if(!flow||flow.id!==id||flow.step!=='stoma')return;
    flow.step='outcome';switchPatientPanel('outcomes');renderFlowControls(id);
  }
  async function surgery(id){await openPatientRecord(id,{panel:'stomas'});}
  async function edit(id){await openPatientDatesModal(id);}
  async function outcome(id){await openPatientRecord(id,{panel:'outcomes'});}
  function newPatient(id){
    const host=document.getElementById('ur-results');
    host.innerHTML=`<p><strong>${htmlSafe(id)}</strong> is not in the register. Enter the patient details below. Saving opens the separate stoma modal, then continues to Outcome.</p>
      ${patientDetailsOnlyHTML({id_card:id},'ur')}
      <p id="ur-new-error" role="status"></p>
      <button id="ur-savebtn" class="btn-save" type="button" onclick="UpdateRegister.saveNew()">Save patient details & continue to stoma</button>`;
    document.getElementById('ur-first')?.focus({preventScroll:true});
  }
  async function saveNew(){
    if(saving)return;
    const status=document.getElementById('ur-new-error'),button=document.getElementById('ur-savebtn');
    if(!status||!button)return;
    const payload=readPatientForm('ur');
    const missing=pfStepMissing('ur',1).map(([,label])=>label);
    if(!/^\d+[A-Z]$/.test(payload.id_card||'')){status.textContent='Enter the complete ID number, ending with its letter.';return;}
    if(missing.length){status.textContent='Please complete: '+missing.join(', ');return;}
    saving=true;button.disabled=true;status.textContent='Checking ID and saving…';
    try{
      const {matches,error:lookupError}=await findRegistryPatientsByIdCard(payload.id_card);
      if(lookupError)throw lookupError;
      if(matches.length){
        status.textContent='This patient is already registered. Open their existing record to update it.';
        const go=document.createElement('button');go.type='button';go.textContent='Open existing patient';go.onclick=()=>profile(matches[0].id);status.append(go);return;
      }
      payload.followup_owner='Common';payload.followup_type=normaliseFollowupType('new_case');
      const by=await patientSignatureName(),now=new Date().toISOString();
      payload.created_at=now;payload.updated_at=now;
      if(by){payload.created_by=by;payload.updated_by=by;}
      const {data,error,dropped}=await insertPatientTolerant(payload);
      if(error)throw error;
      if(!data?.id)throw new Error('Could not confirm the saved patient. Search the ID again before retrying.');
      if(dropped?.length)alert('Saved, except for unavailable fields: '+dropped.join(', '));
      await detailsSaved(data.id);
      refreshReminders();
    }catch(error){status.textContent='Could not save: '+(error.message||'Please try again.');}
    finally{saving=false;button.disabled=false;}
  }
  return {open,search,refresh:()=>{clearTimeout(timer);run();},profile,surgery,edit,outcome,saveNew,detailsSaved,renderFlowControls,stomaSaved,createNewProfile:newPatient};
})();
