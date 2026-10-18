/* Existing patients only: this workflow never inserts a patient. */
window.UpdateRegister=(()=>{
  let timer,request=0;
  function open(){document.getElementById('ur-search')?.focus({preventScroll:true});}
  function search(){clearTimeout(timer);request++;timer=setTimeout(run,250);}
  async function run(){
    const token=++request,host=document.getElementById('ur-results');
    const term=String(document.getElementById('ur-search')?.value||'').replace(/[%,()"\\]/g,' ').trim();
    if(!host)return;
    if(term.length<2){host.textContent='Enter at least two characters of an ID number, first name or surname.';return;}
    host.textContent='Searching existing patients…';
    try{
      const {data,error}=await SB.from('patients').select('id,id_card,first_name,surname,followup_status')
        .or(`id_card.ilike.%${term}%,first_name.ilike.%${term}%,surname.ilike.%${term}%`)
        .order('surname',{ascending:true}).order('first_name',{ascending:true}).limit(30);
      if(token!==request)return;
      if(error)throw error;
      if(!data?.length){host.textContent='No existing patient found. Check the ID number or search by name.';return;}
      host.innerHTML=data.map(p=>`<div class="ur-row">
        <div><strong>${htmlSafe(p.id_card||'No ID recorded')}</strong><br>${htmlSafe([p.first_name,p.surname].filter(Boolean).join(' '))}<br><small>${htmlSafe(followupStatusText(p.followup_status))}</small></div>
        <div><button type="button" class="btn-add" onclick="UpdateRegister.edit('${jsSafe(p.id)}')">Edit details</button>
        <button type="button" class="btn-add" onclick="UpdateRegister.outcome('${jsSafe(p.id)}')">Outcome</button></div>
      </div>`).join('')+(data.length===30?'<p>Showing the first 30 matches. Enter more of the ID or name to narrow the search.</p>':'');
    }catch(error){if(token===request)host.textContent='Could not search the register. Please try again.';}
  }
  async function edit(id){await openPatientDatesModal(id);}
  async function outcome(id){await openPatientRecord(id,{panel:'outcomes'});}
  return {open,search,edit,outcome};
})();
