/* One read-only chronology from the existing patient and clinical records. */
(function(){
  'use strict';
  const list=x=>Array.isArray(x)?x:[];
  const parse=x=>{if(typeof x==='string'){try{return JSON.parse(x);}catch(_){return {};}}return x||{};};
  const esc=x=>ClinicWorkspace.esc(x);
  let state={patient:null,events:[],stomas:[],type:'all',stoma:'all',query:''};
  function versions(e){const a=parse(e.assessment);return list(a.versions).length?a.versions:[{version:1,saved_at:e.created_at,author_name:e.created_by_name,snapshot:a.snapshot||a,report:e.nursing_report}];}
  function build(p,records=[],appointments=[],encounters=[]){
    const stomas=stomaTimeline(p),events=[],seen=new Set();
    const add=e=>{if(seen.has(e.id))return;seen.add(e.id);events.push({scope:[],detail:'',author:'',...e});};
    const scopeFor=r=>{
      if(r.stoma_uid)return [r.stoma_uid];
      if(r.stoma_code){const s=stomas.find(x=>x.code===r.stoma_code);if(s)return [s.uid];}
      const matches=stomas.filter(s=>String(s.type||'').trim().toLowerCase()===String(r.stoma_type||'').trim().toLowerCase());
      return matches.length===1?[matches[0].uid]:[];
    };
    stomas.forEach(s=>{
      add({id:'formed:'+s.uid,date:s.formed,type:'operation',title:(s.origin==='refashion'?'Refashioned: ':'Stoma formed: ')+(s.typeLabel||s.type||'Stoma'),scope:[s.uid],detail:[s.location,s.findings].filter(Boolean).join('\n')});
      if(s.ended||s.endedUnknown)add({id:'ended:'+s.uid,date:s.endedUnknown?null:s.ended,type:'operation',title:(s.endedBy==='refashioned'?'Superseded by refashioning: ':s.endedBy==='replaced'?'Replaced: ':'Closed / reversed: ')+(s.typeLabel||s.type||'Stoma'),scope:[s.uid]});
    });
    if(isFistulaPatient(p)&&p.fistula_operation_date)add({id:'fistula-op',date:p.fistula_operation_date,type:'operation',title:isBaggingPatient(p)?'Drain / wound procedure':'Fistula operation',detail:fistulaOpText(p)});
    if(p.fistula_closed_date)add({id:'fistula-close',date:p.fistula_closed_date,type:'ward',title:'Case closed',detail:p.fistula_closed_reason});
    records.filter(r=>r.kind==='episode').forEach(r=>{
      add({id:'admit:'+r.id,date:r.record_date,type:'ward',title:'Admission · '+(r.episode_ref||recCode(r)||'Episode'),detail:[r.title,r.detail,r.notes].filter(Boolean).join('\n')});
      if(r.discharge_date)add({id:'discharge:'+r.id,date:r.discharge_date,type:'ward',title:'Discharged · '+(r.episode_ref||recCode(r)||'Episode')});
      parseEpisodeApplianceRows(r).forEach((a,i)=>add({id:'episode-appliance:'+r.id+':'+i,date:a.changed_on||r.record_date,type:'appliance',title:'Recorded appliance setup',scope:scopeFor(a),detail:[list(a.appliances).join(', '),list(a.accessories).length?'Accessories: '+a.accessories.join(', '):''].filter(Boolean).join('\n'),author:a.changed_by}));
    });
    appointments.forEach(a=>{
      const details=[appointmentNurseLabel(a),a.clinical_notes||a.notes].filter(Boolean).join('\n');
      add({id:'appointment:'+a.id,date:a.appt_date,time:String(a.appt_slot||'').slice(0,5),type:'appointment',title:'Appointment · '+statusLabel(a.status,a),detail:details,appointment:a});
      if(a.status==='attended')list(parse(a.stoma_appliances)).forEach((r,i)=>add({id:'visit-appliance:'+a.id+':'+i,date:a.appt_date,type:'appliance',title:'Appliance recorded at clinic visit',scope:scopeFor(r),detail:[list(r.appliances).join(', '),list(r.accessories).join(', ')].filter(Boolean).join('\n')}));
    });
    encounters.forEach(e=>{
      const vs=versions(e),v=vs.at(-1),snapshot=parse(v.snapshot),scope=list(snapshot.stomas).map(s=>s.uid).filter(Boolean);
      add({id:'encounter:'+e.id,date:e.encounter_date||String(e.created_at||'').slice(0,10),type:'encounter',title:'Encounter · V'+(v.version||1),author:v.author_name||e.created_by_name,detail:v.report||e.nursing_report,scope,encounter:e,versions:vs});
    });
    if(p.deceased_date)add({id:'outcome-deceased',date:p.deceased_date,type:'outcome',title:'Deceased'});
    for(const [key,title] of [['discharged_gozo_date','Transferred to Gozo'],['relocated_overseas_date','Relocated overseas']])if(p[key])add({id:'outcome:'+key,date:p[key],type:'outcome',title});
    events.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.time||'').localeCompare(String(a.time||''))||a.id.localeCompare(b.id));
    return {events,stomas};
  }
  function scopedReport(v,uid){
    if(uid==='all')return v.report||'';
    const s=list(parse(v.snapshot).stomas).find(s=>s.uid===uid);if(!s)return '';
    return [s.type,[s.colour,...list(s.output)].filter(Boolean).join(' · '),s.skin?.status,list(s.skin?.problems).join(', '),s.notes,list(s.appliances).join(', '),list(s.accessories).join(', ')].filter(Boolean).join('\n');
  }
  function filtered(s=state){
    const q=s.query.trim().toLowerCase();return s.events.filter(e=>(s.type==='all'||s.type===e.type)&&(s.stoma==='all'||!e.scope.length||e.scope.includes(s.stoma))&&(!q||[e.title,e.detail,e.author].join(' ').toLowerCase().includes(q)));
  }
  function render(){
    const host=document.getElementById('cw-timeline-list');if(!host)return;
    const rows=filtered();host.innerHTML=rows.length?'<ol class="cw-timeline">'+rows.map(e=>{
      const scope=e.scope.map(id=>state.stomas.find(s=>s.uid===id)).filter(Boolean).map(s=>s.code+' · '+(s.typeLabel||s.type)).join(' / ');
      let detail=e.detail;
      if(e.encounter&&state.stoma!=='all')detail=scopedReport(e.versions.at(-1),state.stoma);
      return '<li><div class="cw-timeline-date">'+esc(e.date?fmtShortDate(e.date):'Date not recorded')+(e.time?' · '+esc(e.time):'')+'</div><div class="cw-timeline-content"><div class="cw-timeline-title"><h3>'+esc(e.title)+'</h3><span class="cw-type">'+esc(e.type)+'</span></div><p class="cw-timeline-meta">'+esc(scope||'Patient-wide event')+(e.author?' · '+esc(e.author):'')+'</p>'+
        (detail?'<details><summary>View details</summary><div class="cw-timeline-detail">'+esc(detail)+'</div></details>':'')+
        (e.encounter?'<button type="button" class="cw-link" data-encounter="'+esc(e.encounter.id)+'">Open signed encounter</button>'+ (e.versions.length>1?'<details><summary>'+e.versions.length+' saved versions</summary>'+e.versions.map(v=>'<section class="cw-version"><strong>V'+esc(v.version)+'</strong> · '+esc(v.author_name||'Author not recorded')+' · '+esc(v.saved_at?new Date(v.saved_at).toLocaleString('en-GB',{timeZone:'Europe/Malta'}):'Time not recorded')+'<div class="cw-timeline-detail">'+esc(scopedReport(v,state.stoma))+'</div></section>').join('')+'</details>':''):'')+
        (e.appointment&&e.appointment.stoma_assessment?visitReviewButtonHTML(e.appointment):'')+'</div></li>';
    }).join('')+'</ol>':'<p class="cw-empty">No events match these filters.</p>';
    const count=document.getElementById('cw-timeline-count');if(count)count.textContent=rows.length+' events';
  }
  function attach(){
    const p=clrState.patient;if(!p)return;
    const same=state.patient?.id===p.id,{events,stomas}=build(p,clrState.rows,clrState.appts,clrState.encounters);
    state={patient:p,events,stomas,type:same?state.type:'all',stoma:same&&stomas.some(s=>s.uid===state.stoma)?state.stoma:'all',query:same?state.query:''};
    const nav=document.querySelector('#page-patient-record .psm-tabs');if(!nav)return;
    const button=document.createElement('button');button.type='button';button.id='psm-tab-timeline';button.className='psm-tab psm-tab-timeline';button.setAttribute('role','tab');button.setAttribute('aria-selected','false');button.innerHTML='<span class="psm-tab-icon">'+ClinicWorkspace.icon('today')+'</span><span class="psm-tab-label">Timeline</span>';button.onclick=()=>switchPatientPanel('timeline');nav.append(button);
    const section=document.createElement('section');section.id='psm-timeline';section.className='psm-panel';section.hidden=true;
    section.innerHTML='<div class="psm-sec-head"><h3>Clinical timeline</h3><span id="cw-timeline-count" class="psm-badge"></span></div><div class="cw-card"><p class="cw-scope-note">Newest first. Patient-wide admissions and appointments remain visible when filtering by stoma. Recorded setups show the appliance as documented at that time.</p><div class="cw-timeline-filters"><label>Event type<select id="cw-timeline-type">'+[['all','All events'],['operation','Operations'],['ward','Admissions / discharges'],['encounter','Encounters'],['appointment','Appointments'],['appliance','Appliance records'],['outcome','Outcomes']].map(([v,n])=>'<option value="'+v+'" '+(v===state.type?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label>Stoma<select id="cw-timeline-stoma"><option value="all">All stomas</option>'+stomas.map(s=>'<option value="'+esc(s.uid)+'" '+(s.uid===state.stoma?'selected':'')+'>'+esc(s.code+' · '+(s.typeLabel||s.type||'Stoma'))+'</option>').join('')+'</select></label><label>Search history<input id="cw-timeline-query" type="search" value="'+esc(state.query)+'" placeholder="Finding, appliance or nurse"></label></div><div id="cw-timeline-list"></div></div>';
    nav.after(section);
    section.addEventListener('change',e=>{if(e.target.id==='cw-timeline-type')state.type=e.target.value;if(e.target.id==='cw-timeline-stoma')state.stoma=e.target.value;render();});
    section.addEventListener('input',e=>{if(e.target.id==='cw-timeline-query'){state.query=e.target.value;render();}});
    section.addEventListener('click',e=>{const b=e.target.closest('[data-encounter]');if(b)openEncounter(p.id,b.dataset.encounter);});render();
  }
  window.ClinicTimeline={attach,render,build,filtered,scopedReport};
})();
