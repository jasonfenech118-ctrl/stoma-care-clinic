/* Shared clinical workspace. Existing clinical writers remain authoritative. */
(function(){
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr=x=>Array.isArray(x)?x:[];
  const norm=x=>String(x||'').trim().toLowerCase();
  const name=p=>[p?.first_name,p?.surname].filter(Boolean).join(' ')||'Patient';
  const state={scope:'all',user:null,patients:[],appointments:[],tasks:[],reminders:null,errors:{},loaded:false,request:0,saveText:'Ready',saveKind:'neutral',connection:'Connecting updates',connectionKind:'neutral',saves:0};
  function renderStatus(){
    let el=document.getElementById('cw-status-strip');if(!el){el=document.createElement('div');el.id='cw-status-strip';el.className='cw-status-strip';el.setAttribute('aria-label','Saving and connection status');document.querySelector('#app .main')?.prepend(el);}
    el.innerHTML='<span class="cw-connection '+state.connectionKind+'" aria-label="Connection status">'+esc(state.connection)+'</span><span class="cw-save-note '+state.saveKind+'" role="status" aria-live="polite">'+esc(state.saveText)+'</span>';
  }
  function saveStatus(text,kind='neutral'){state.saveText=text;state.saveKind=kind;renderStatus();}
  function beginSave(){state.saves++;saveStatus('Saving…','saving');}
  function endSave(error,partial=false){state.saves=Math.max(0,state.saves-1);if(state.saves)return;
    saveStatus(error?'Not saved — changes remain on this page':partial?'Saved with unavailable fields':'Saved at '+new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/Malta',hour:'2-digit',minute:'2-digit'}),error?'error':'saved');}
  function connection(status){
    const offline=!navigator.onLine;
    state.connection=offline?'Offline':status==='SUBSCRIBED'?'Updates connected':status==='CLOSED'?'Updates disconnected':'Reconnecting updates';
    state.connectionKind=offline?'error':status==='SUBSCRIBED'?'saved':'neutral';renderStatus();
  }
  function watchWriters(){for(const key of ['updatePatientTolerant','insertPatientTolerant']){
    const original=window[key];if(typeof original!=='function'||original.cwWrapped)continue;
    const wrapped=async function(...args){beginSave();try{const r=await original.apply(this,args);endSave(r?.error,!!r?.dropped?.length);return r;}catch(e){endSave(e);throw e;}};wrapped.cwWrapped=true;window[key]=wrapped;
  }}
  const ICONS={
    today:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    appointments:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4m8-4v4M8 11h8m-8 4h5"/>',
    patients:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 10v-3a5 5 0 0 0-2-4"/>',
    handover:'<path d="M4 21V5h16v16M9 21v-5h6v5M9 9h6m-3-3v6"/>',
    siting:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    audit:'<path d="M4 3v18h17M8 17v-5m5 5V8m5 9V5"/>',
    phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
    add:'<path d="M12 4v16M4 12h16"/>',
    document:'<path d="M14 2H5v20h14V7Z M14 2v5h5M8 11h8m-8 4h8m-8 4h5"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    task:'<path d="m3 6 2 2 4-4m3 2h9M3 13l2 2 4-4m3 2h9M3 20l2 2 4-4m3 2h9"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 1-2 3m0 3h.01"/>',
    archive:'<rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v14h14V7M9 11h6"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5M20 12a8 8 0 0 0-14-5M4 12a8 8 0 0 0 14 5"/>',
    bagging:'<rect x="5" y="8" width="14" height="13" rx="3"/><path d="M9 8V5a3 3 0 0 1 6 0v3m-6 5h6"/>'
  };
  function icon(key){
    const alias={roster:'calendar',cod:'refresh','daily-attendance':'task','attendance-records':'archive','staff-audit':'refresh',stomaperformed:'document',nostoma:'document',postop:'document',snapshots:'archive','new-patients':'patients','add-patient':'add',duplicates:'search',fistulas:'bagging',reports:'audit','data-analysis':'audit','annual-report':'document','registry-map':'siting','dntu-policy':'document','audit-trail':'document','clinical-tasks':'task'};
    return '<svg class="cw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(ICONS[alias[key]||key]||ICONS.document)+'</svg>';
  }
  function contextHTML(p,appointments){
    if(!p)return '';
    const current=typeof stomasPresentOn==='function'?arr(stomasPresentOn(p,TODAY)).filter(s=>!s.ended||s.ended>TODAY):[];
    const types=current.map(s=>s.typeLabel||s.type).filter(Boolean);
    const next=Array.isArray(appointments)?appointments.filter(a=>a.status==='booked'&&a.appt_date>=TODAY).sort((a,b)=>String(a.appt_date+(a.appt_slot||'')).localeCompare(String(b.appt_date+(b.appt_slot||''))))[0]:undefined;
    const care=isFistulaPatient(p)?(isBaggingPatient(p)?'Bagging advice':'Fistula'):types.join(' + ')||'No current stoma';
    const owner=isFistulaPatient(p)?'Shared care':normaliseFollowupOwner(p.followup_owner);
    return '<div class="cw-care-context"><span><b>Current care</b> '+esc(care)+'</span>'+(p.is_inpatient?'<span><b>Ward</b> '+esc([p.inpatient_ward,p.inpatient_bed?'Bed '+p.inpatient_bed:''].filter(Boolean).join(' · ')||'Not recorded')+'</span>':'')+
      '<span class="cw-owner"><b>Owner</b> '+esc(owner)+'</span><span><b>Next appointment</b> '+(Array.isArray(appointments)?next?esc(fmtShortDate(next.appt_date)+' '+String(next.appt_slot||'').slice(0,5)):'None booked':'Not loaded')+'</span></div>';
  }
  async function loadContext(p){
    try{const {rows,error}=await fetchAllRows(()=>SB.from('appointments').select('id,appt_date,appt_slot,status').eq('patient_id',p.id).gte('appt_date',TODAY));return contextHTML(p,error?undefined:rows);}catch(_){return contextHTML(p);}
  }
  function nurseOwner(u){
    const owner=normaliseFollowupOwner([u?.email,u?.name,typeof attDisplayName==='function'?attDisplayName(u):''].join(' '));
    return owner==='Common'?'':owner;
  }
  const eligible=p=>p&&!p.archived&&!handoverShouldAutoLeave(p);
  function mine(p,u){const owner=nurseOwner(u);return !!owner&&normaliseFollowupOwner(p?.followup_owner)===owner;}
  function appointmentMine(a,u){
    const owner=nurseOwner(u);
    const assigned=a.staff?.full_name||a.bank_staff?.full_name;
    return assigned?(owner?normaliseFollowupOwner(assigned)===owner:[u?.name,u?.email?.split('@')[0].replace(/[._-]/g,' ')].some(x=>norm(x)===norm(assigned))):(!a.assigned_to&&!a.bank_staff_id&&mine(a.patients,u));
  }
  function model(s=state){
    const personal=s.scope==='my',byId=new Map(s.patients.map(p=>[String(p.id),p]));
    const match=p=>eligible(p)&&(!personal||mine(p,s.user));
    const appointments=s.appointments.map(a=>({...a,patients:byId.get(String(a.patient_id))||a.patients})).filter(a=>
      !a.patients?.archived&&a.appt_date===TODAY&&(!personal||appointmentMine(a,s.user)))
      .sort((a,b)=>String(a.appt_slot||'').localeCompare(String(b.appt_slot||'')));
    return {appointments,ward:s.patients.filter(p=>p.is_inpatient&&match(p)).sort((a,b)=>
      String(a.inpatient_ward||'').localeCompare(String(b.inpatient_ward||''))||name(a).localeCompare(name(b))),
      overdue:arr(s.reminders?.buckets?.overdue).filter(p=>match(byId.get(String(p.id))||p)),
      due:arr(s.reminders?.buckets?.current).filter(p=>match(byId.get(String(p.id))||p)),
      tasks:arr(s.tasks).filter(t=>!t.is_completed&&(!personal||window.ClinicTasks?.mine(t,s.user))).sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))),
      missing:arr(s.reminders?.buckets?.nodue).filter(p=>match(byId.get(String(p.id))||p))};
  }
  function patientButton(p,detail=''){
    return '<button type="button" class="cw-patient" data-patient="'+esc(p.id)+'"><span><strong>'+esc(name(p))+'</strong><span class="cw-patient-id">'+esc(p.id_card||'ID not recorded')+'</span></span>'+
      '<span class="cw-patient-detail">'+esc(detail)+'</span><span aria-hidden="true">›</span></button>';
  }
  function panel(title,count,body,error,action,tab){
    return '<section class="cw-card"><div class="cw-card-head"><h3>'+title+'</h3><span class="cw-count">'+(error?'—':count)+'</span></div>'+
      (error?'<div class="cw-message cw-error" role="alert">Could not load this list. Refresh to try again.</div>':body||'<p class="cw-empty">No items to show.</p>')+
      '<button type="button" class="cw-link" data-tab="'+tab+'">'+action+' <span aria-hidden="true">→</span></button></section>';
  }
  function renderDashboard(){
    const host=document.getElementById('cw-dashboard');if(!host)return;
    if(!state.loaded){host.innerHTML='<div class="cw-message" role="status">Loading today’s clinic workspace…</div>';return;}
    const m=model(),o=state.user?.email;
    const cards=[['Appointments today',m.appointments.length,'appointments','All statuses'],['On the ward',m.ward.length,'ward','Current inpatients'],['Overdue follow-ups',m.overdue.length,'overdue','Awaiting booking'],['Due this month',m.due.length,'due','Awaiting booking'],['Open tasks',m.tasks.length,'tasks','Patient and clinic actions']];
    host.innerHTML='<div class="cw-day-heading"><div><span class="cw-eyebrow">CLINICAL WORKSPACE</span><h2>Today</h2><p>'+esc(fmtShortDate(TODAY))+' · '+esc(state.user?.name||'Stoma Care Clinic')+'</p></div>'+
      '<div class="cw-toolbar"><div class="cw-segment" role="group" aria-label="Patient scope"><button type="button" data-scope="my" aria-pressed="'+(state.scope==='my')+'" '+(!o?'disabled title="No named caseload is assigned to this profile"':'')+'>My patients</button><button type="button" data-scope="all" aria-pressed="'+(state.scope==='all')+'">All patients</button></div><button type="button" class="cw-button" data-refresh>Refresh</button></div></div>'+
      '<p class="cw-scope-note">'+(state.scope==='my'?'Your caseload and appointments assigned to you. Shared patients remain available in All patients.':'The whole clinic. Counts and lists use the same scope.')+'</p>'+
      '<div class="cw-stats">'+cards.map(([title,count,key,sub])=>'<button type="button" class="cw-stat '+(key==='overdue'&&count?'cw-stat-alert':'')+'" data-jump="'+key+'"><span>'+title+'</span><strong>'+(state.errors[key==='ward'?'patients':key==='appointments'?'appointments':key==='tasks'?'tasks':'reminders']?'—':count)+'</strong><small>'+sub+'</small></button>').join('')+'</div>'+
      '<div class="cw-grid"><div id="cw-appointments">'+panel('Appointments today',m.appointments.length,m.appointments.map(a=>a.patients?patientButton(a.patients,String(a.appt_slot||'').slice(0,5)+' · '+statusLabel(a.status,a)+' · '+appointmentNurseLabel(a)):'<p class="cw-empty">Appointment at '+esc(String(a.appt_slot||'').slice(0,5))+' — patient record unavailable</p>').join(''),state.errors.appointments,'Open daily clinic','appointments')+'</div>'+
      '<div id="cw-ward">'+panel('On the ward',m.ward.length,m.ward.map(p=>patientButton(p,[p.inpatient_ward,p.inpatient_bed?'Bed '+p.inpatient_bed:'',isFistulaPatient(p)?(isBaggingPatient(p)?'Bagging advice':'Fistula'):p.stoma_type].filter(Boolean).join(' · '))).join(''),state.errors.patients,'Open handover','handover')+'</div>'+
      '<div id="cw-overdue">'+panel('Overdue follow-ups',m.overdue.length,m.overdue.map(p=>patientButton(p,'Due '+followupMonthName(p.followup_due_month)+' '+p.followup_year)).join(''),state.errors.reminders,'Open follow-up planning','staff-audit')+'</div>'+
      '<div id="cw-due">'+panel('Due this month',m.due.length,m.due.map(p=>patientButton(p,normaliseFollowupOwner(p.followup_owner))).join(''),state.errors.reminders,'Open follow-up planning','staff-audit')+'</div><div id="cw-tasks-section" class="cw-grid-wide">'+panel('Open clinical and clinic tasks',m.tasks.length,m.tasks.map(t=>'<button type="button" class="cw-patient" data-task-edit="'+esc(t.id)+'"><span><strong>'+esc(t.task_text)+'</strong><span class="cw-patient-id">'+esc(t.assigned_name||'Shared team')+'</span></span><span class="cw-patient-detail">'+esc(t.due_date?'Due '+fmtShortDate(t.due_date):'No due date')+'</span></button>').join(''),state.errors.tasks,'Open clinical tasks','clinical-tasks')+'</div></div>'+
      (m.missing.length?'<div class="cw-message">'+m.missing.length+' '+(state.scope==='my'?'of your patients have':'patients have')+' no follow-up month recorded. <button type="button" class="cw-link" data-reminders>Review reminders</button></div>':'')+
      '<p class="cw-updated">Updated '+esc(state.updated||'')+' · Ward counts exclude deceased patients and patients with every stoma closed.</p>';
  }
  async function loadDashboard(){
    const request=++state.request;if(!state.user){const u=await getCurrentUserForAudit();state.user={...u,name:typeof attDisplayName==='function'?attDisplayName(u)||u.name:u.name};}
    renderDashboard();
    const reads=await Promise.allSettled([
      fetchAllRows(()=>SB.from('patients').select('*')),
      fetchAllRows(()=>SB.from('appointments').select('*').eq('appt_date',TODAY)),getReminderData(),fetchAllRows(()=>SB.from('clinic_pending_tasks').select('*').eq('is_completed',false))
    ]);if(request!==state.request)return;
    state.errors={};
    for(let i=0;i<reads.length;i++){
      const k=['patients','appointments','reminders','tasks'][i],r=reads[i];
      if(r.status==='rejected'||r.value.error){state.errors[k]=true;state[k]=k==='reminders'?null:[];}
      else state[k]=k==='reminders'?r.value:r.value.rows;
    }
    try{state.appointments=await enrichAppointments(state.appointments);}catch(_){state.errors.appointments=true;}
    if(request!==state.request)return;
    state.loaded=true;state.updated=new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/Malta',hour:'2-digit',minute:'2-digit'});renderDashboard();
  }
  function navigation(activeTab){
    // The original area tabs, page tabs and mobile drawer own navigation.
    // Keep save feedback independent of any particular navigation layout.
    renderStatus();
  }
  function init(){state.user=null;state.loaded=false;state.saveText='Ready';state.saveKind='neutral';navigation(currentTabName());watchWriters();window.ClinicTasks?.reset();}
  function boot(){
    window.addEventListener('offline',()=>connection('offline'));window.addEventListener('online',()=>connection('connecting'));
    document.getElementById('cw-dashboard')?.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.scope){state.scope=b.dataset.scope;renderDashboard();}
      if(b.hasAttribute('data-refresh'))loadDashboard();
      if(b.dataset.patient)openPatientRecord(b.dataset.patient);
      if(b.dataset.tab)switchTab(b.dataset.tab);
      if(b.dataset.jump)document.getElementById(b.dataset.jump==='tasks'?'cw-tasks-section':'cw-'+b.dataset.jump)?.scrollIntoView({behavior:'smooth',block:'start'});
      if(b.hasAttribute('data-reminders'))toggleReminderPanel();
    });
  }
  window.ClinicWorkspace={init,loadDashboard,renderDashboard,model,mine,appointmentMine,state,esc,arr,name,navigation,icon,contextHTML,loadContext,saveStatus,beginSave,endSave,connection};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
