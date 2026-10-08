/* Patient-linked tasks share the established reminder table and completion history. */
(function(){
  'use strict';
  const esc=x=>ClinicWorkspace.esc(x),list=x=>Array.isArray(x)?x:[],name=p=>ClinicWorkspace.name(p);
  let state={rows:[],patients:[],user:null,scope:'all',status:'open',query:'',ready:false,error:null,request:0},form=null;
  const clean=x=>String(x||'').toLowerCase().replace(/[._-]/g,' ').replace(/\s+/g,' ').trim();
  function mine(t,u){const names=[u?.name,u?.email?.split('@')[0]].map(clean);return !!t.assigned_name&&names.includes(clean(t.assigned_name));}
  function visible(rows,{scope='all',status='open',query='',patientId=null,user=state.user,patients=state.patients}={}){
    const pats=new Map(patients.map(p=>[String(p.id),p])),q=clean(query);
    return rows.filter(t=>(!patientId||String(t.patient_id)===String(patientId))&&(scope!=='my'||mine(t,user))&&
      (status==='all'||status==='completed'?status==='all'||t.is_completed:!t.is_completed)&&
      (!q||clean([t.task_text,t.assigned_name,name(pats.get(String(t.patient_id))),pats.get(String(t.patient_id))?.id_card].join(' ')).includes(q)))
      .sort((a,b)=>Number(a.is_completed)-Number(b.is_completed)||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))||String(a.created_at||'').localeCompare(String(b.created_at||'')));
  }
  function stomaText(t,p){if(!t.stoma_uid)return 'Patient-wide';const s=p&&stomaTimeline(p).find(s=>s.uid===t.stoma_uid);return s?s.code+' · '+(s.typeLabel||s.type)+(s.ended&&s.ended<=TODAY?' (closed)':''):'Recorded stoma · '+t.stoma_uid;}
  function rowsHTML(rows){const pats=new Map(state.patients.map(p=>[String(p.id),p]));return rows.length?'<div class="cw-task-table-wrap"><table class="cw-task-table"><thead><tr><th>Task</th><th>Patient / stoma</th><th>Responsible nurse</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+rows.map(t=>{
    const p=pats.get(String(t.patient_id)),late=!t.is_completed&&t.due_date&&t.due_date<TODAY;
    return '<tr class="'+(late?'cw-task-late':'')+'"><td><strong>'+esc(t.task_text)+'</strong><small>'+esc(t.is_completed?'Completed by '+(t.completed_by_name||'Nurse')+(t.completed_on?' · '+fmtShortDate(t.completed_on):''):'Added by '+(t.created_by_name||'Nurse'))+'</small></td><td>'+(p?'<button type="button" class="cw-link" data-task-patient="'+esc(p.id)+'">'+esc(name(p))+'<b class="cw-patient-id">'+esc(p.id_card||'ID not recorded')+'</b></button><small>'+esc(stomaText(t,p))+'</small>':t.task_kind==='clinical'?'Patient record removed':'Clinic-wide task')+'</td><td>'+esc(t.assigned_name||'Shared team')+'</td><td>'+esc(t.due_date?fmtShortDate(t.due_date):'No date')+(late?'<small class="cw-overdue">Overdue</small>':'')+'</td><td><span class="cw-type">'+(t.is_completed?'Completed':'Open')+'</span></td><td><div class="cw-task-actions"><button type="button" class="cw-button" data-task-complete="'+esc(t.id)+'" data-done="'+!t.is_completed+'">'+(t.is_completed?'Reopen':'Complete')+'</button><button type="button" class="cw-button" data-task-edit="'+esc(t.id)+'">Edit</button></div></td></tr>';
  }).join('')+'</tbody></table></div>':'<p class="cw-empty">No tasks match this view.</p>';}
  function patientPanel(){
    const host=document.getElementById('cw-patient-tasks');if(!host||!clrState.patient)return;
    if(!state.ready){host.innerHTML='<p class="cw-empty" role="status">Loading tasks…</p>';return;}
    const rows=visible(state.rows,{status:'all',patientId:clrState.patient.id});
    host.innerHTML='<div class="cw-toolbar"><h3>Clinical tasks</h3><button type="button" class="cw-button" data-task-new="'+esc(clrState.patient.id)+'">Add clinical task</button></div>'+(state.error?'<p class="cw-error cw-message">Tasks could not be loaded. <button type="button" class="cw-link" data-task-refresh>Try again</button></p>':rowsHTML(rows));
  }
  function render(){
    const host=document.getElementById('cw-tasks');if(host){
      if(!state.ready){host.innerHTML='<div class="cw-message" role="status">Loading clinical tasks…</div>';return;}
      const rows=visible(state.rows,state);
      host.innerHTML='<div class="cw-day-heading"><div><span class="cw-eyebrow">TEAM WORKLIST</span><h2>Clinical tasks</h2><p>Patient-linked actions and the shared clinic task list.</p></div><div class="cw-toolbar"><button type="button" class="cw-button" data-task-new="">Add clinical task</button><button type="button" class="cw-button" data-task-refresh>Refresh</button></div></div><div class="cw-task-filters"><div class="cw-segment" role="group" aria-label="Task scope">'+['all','my'].map(s=>'<button type="button" data-task-scope="'+s+'" aria-pressed="'+(state.scope===s)+'">'+(s==='all'?'All tasks':'My tasks')+'</button>').join('')+'</div><label>Status<select id="cw-task-status">'+['open','completed','all'].map(s=>'<option value="'+s+'" '+(state.status===s?'selected':'')+'>'+s[0].toUpperCase()+s.slice(1)+'</option>').join('')+'</select></label><label>Search<input type="search" id="cw-task-search" value="'+esc(state.query)+'" placeholder="Task, patient ID or nurse"></label></div>'+(state.error?'<div class="cw-message cw-error" role="alert">Could not load the complete task list. Refresh to try again.</div>':'<div id="cw-task-rows" class="cw-card">'+rowsHTML(rows)+'</div>');
    }patientPanel();
  }
  async function load(){
    const request=++state.request;
    if(!state.user){const u=await getCurrentUserForAudit();state.user={...u,name:attDisplayName(u)||u.name};}
    const r=await Promise.allSettled([fetchAllRows(()=>SB.from('clinic_pending_tasks').select('*')),fetchAllRows(()=>SB.from('patients').select('*'))]);if(request!==state.request)return;
    state.error=null;for(let i=0;i<r.length;i++){if(r[i].status==='rejected'||r[i].value.error){state.error=true;state[i?'patients':'rows']=[];}else state[i?'patients':'rows']=r[i].value.rows;}
    state.ready=true;render();
  }
  async function page(){render();await load();}
  async function attach(){
    const nav=document.querySelector('#page-patient-record .psm-tabs');if(!nav)return;
    const b=document.createElement('button');b.type='button';b.id='psm-tab-tasks';b.className='psm-tab psm-tab-tasks';b.setAttribute('role','tab');b.setAttribute('aria-selected','false');b.innerHTML='<span class="psm-tab-icon">'+ClinicWorkspace.icon('task')+'</span><span class="psm-tab-label">Tasks</span>';b.onclick=()=>switchPatientPanel('tasks');nav.append(b);
    const section=document.createElement('section');section.id='psm-tasks';section.className='psm-panel';section.hidden=true;section.innerHTML='<div class="cw-card" id="cw-patient-tasks"><p class="cw-empty">Loading tasks…</p></div>';nav.after(section);await load();
  }
  function patientOptions(query,selected){
    const q=clean(query),matches=state.patients.filter(p=>!p.archived&&(String(p.id)===String(selected)||!q||clean(name(p)+' '+p.id_card).includes(q))).slice(0,30);
    const chosen=state.patients.find(p=>String(p.id)===String(selected));if(chosen&&!matches.some(p=>p.id===chosen.id))matches.unshift(chosen);
    return '<option value="">Choose patient</option>'+matches.map(p=>'<option value="'+esc(p.id)+'" '+(String(p.id)===String(selected)?'selected':'')+'>'+esc(name(p)+' · '+(p.id_card||'No ID'))+'</option>').join('');
  }
  function formStomas(pid,selected){
    const p=state.patients.find(p=>String(p.id)===String(pid));return '<option value="">Whole patient</option>'+ (p?stomaTimeline(p).filter(s=>s.uid===selected||(!s.ended||s.ended>TODAY)).map(s=>'<option value="'+esc(s.uid)+'" '+(s.uid===selected?'selected':'')+'>'+esc(s.code+' · '+(s.typeLabel||s.type||'Stoma'))+'</option>').join(''):'');
  }
  async function openForm(id,patientId){
    if(!state.ready)await load();if(state.error){alert('The task list could not load. Refresh and try again.');return;}
    const t=state.rows.find(t=>String(t.id)===String(id));form={row:t||null,patientId:patientId||t?.patient_id||'',general:!!t&&!t.patient_id,saving:false};
    const mb=document.getElementById('mb');mb.className='mb';mb.innerHTML='<h2>'+(t?'Edit task':'Add clinical task')+'</h2><p class="msub">Link the action to a patient and, when needed, a specific stoma.</p><form id="cw-task-form"><div class="fg"><label for="cw-task-text">Action</label><textarea id="cw-task-text" maxlength="240" required rows="3">'+esc(t?.task_text||'')+'</textarea></div>'+(!form.general?'<div class="fg"><label for="cw-task-patient-search">Find patient</label><input id="cw-task-patient-search" type="search" placeholder="Name or ID card"><label for="cw-task-patient">Patient</label><select id="cw-task-patient" required>'+patientOptions('',form.patientId)+'</select></div><div class="fg"><label for="cw-task-stoma">Stoma</label><select id="cw-task-stoma">'+formStomas(form.patientId,t?.stoma_uid)+'</select></div>':'<p class="cw-scope-note">This is an existing clinic-wide task.</p>')+'<div class="frow"><div class="fg"><label for="cw-task-nurse">Responsible nurse</label><select id="cw-task-nurse" '+(!form.general?'required':'')+'><option value="">'+(form.general?'Shared team':'Choose nurse')+'</option>'+staffList.filter(s=>s.is_active!==false).map(s=>'<option value="'+esc(s.id)+'" '+(s.id===t?.assigned_staff_id?'selected':'')+'>'+esc(s.full_name)+'</option>').join('')+'</select></div><div class="fg"><label for="cw-task-due">Due date</label><input id="cw-task-due" type="date" value="'+esc(t?.due_date||TODAY)+'" '+(!form.general?'required':'')+'></div></div><div id="cw-task-error" role="alert"></div><div class="mact"><button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button><button type="submit" class="btn-save">Save task</button></div></form>';openMo();
    mb.querySelector('#cw-task-patient-search')?.addEventListener('input',e=>{const select=mb.querySelector('#cw-task-patient');select.innerHTML=patientOptions(e.target.value,select.value);});
    mb.querySelector('#cw-task-patient')?.addEventListener('change',e=>{mb.querySelector('#cw-task-stoma').innerHTML=formStomas(e.target.value,'');});
    mb.querySelector('#cw-task-form').addEventListener('submit',saveForm);
  }
  async function saveForm(e){
    e.preventDefault();if(!form||form.saving)return;const f=form,el=document.getElementById('cw-task-form'),value=id=>el.querySelector('#'+id)?.value||'';
    if(!el.reportValidity())return;f.saving=true;const button=el.querySelector('[type=submit]');button.disabled=true;ClinicWorkspace.beginSave();
    try{
      const pid=f.general?null:value('cw-task-patient'),uid=value('cw-task-stoma');
      if(uid&&!stomaTimeline(state.patients.find(p=>p.id===pid)).some(s=>s.uid===uid))throw new Error('Choose a stoma that belongs to this patient.');
      const {data,error}=await SB.rpc('save_clinic_task',{p_id:f.row?.id||null,p_expected_revision:f.row?.revision||0,p_task_text:value('cw-task-text').trim(),p_patient_id:pid,p_stoma_uid:uid||null,p_assigned_staff_id:value('cw-task-nurse')||null,p_due_date:value('cw-task-due')||null});
      if(error)throw error;if(!data?.id)throw new Error('The saved task was not returned.');ClinicWorkspace.endSave(null);closeModal();form=null;await changed();
    }catch(error){ClinicWorkspace.endSave(error);const msg=document.getElementById('cw-task-error');if(msg){msg.className='cw-message cw-error';msg.textContent=error.message;}f.saving=false;button.disabled=false;}
  }
  async function changed(){await Promise.allSettled([load(),refreshReminders()]);if(currentTabName()==='today')ClinicWorkspace.loadDashboard();}
  async function complete(id,done,box){
    if(box)box.disabled=true;ClinicWorkspace.beginSave();
    try{
      let task=state.rows.find(t=>t.id===id)||(typeof pendingReminderTasks!=='undefined'?pendingReminderTasks.items.find(t=>t.id===id):null);
      if(!task||task.revision==null){const {data,error}=await SB.from('clinic_pending_tasks').select('*').eq('id',id).maybeSingle();if(error)throw error;task=data;}
      if(!task)throw new Error('Task unavailable. Refresh the list.');
      const {data,error}=await SB.rpc('set_clinic_task_completed',{p_id:id,p_expected_revision:task.revision||0,p_done:done});if(error)throw error;if(!data?.id)throw new Error('The updated task was not returned.');ClinicWorkspace.endSave(null);await changed();
    }catch(error){if(box)box.checked=!done;ClinicWorkspace.endSave(error);alert(error.message||'Could not update the task. Refresh and try again.');}finally{if(box)box.disabled=false;}
  }
  function summaryHTML(t){return (t.assigned_name?' · '+esc(t.assigned_name):'')+(t.due_date?' · Due '+esc(fmtShortDate(t.due_date)):'')+(t.patient_id?' · <button type="button" class="cw-inline-link" onclick="event.preventDefault();event.stopPropagation();closeReminderPanel();openPatientRecord(\''+String(t.patient_id).replace(/[^a-z0-9-]/gi,'')+'\')">Patient record</button>':'');}
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-task-new'))openForm(null,b.dataset.taskNew);
    if(b.dataset.taskEdit)openForm(b.dataset.taskEdit);
    if(b.dataset.taskPatient)openPatientRecord(b.dataset.taskPatient);
    if(b.dataset.taskComplete)complete(b.dataset.taskComplete,b.dataset.done==='true',b);
    if(b.hasAttribute('data-task-refresh'))page();
    if(b.dataset.taskScope){state.scope=b.dataset.taskScope;render();}
  });
  document.addEventListener('change',e=>{if(e.target.id==='cw-task-status'){state.status=e.target.value;render();}});
  document.addEventListener('input',e=>{if(e.target.id==='cw-task-search'){state.query=e.target.value;const host=document.getElementById('cw-task-rows');if(host)host.innerHTML=rowsHTML(visible(state.rows,state));}});
  window.ClinicTasks={page,load,attach,patientPanel,openForm,complete,mine,visible,summaryHTML,reset(){state.ready=false;state.rows=[];state.patients=[];state.user=null;state.request++;},get state(){return state;}};
})();
