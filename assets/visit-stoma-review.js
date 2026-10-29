/* Free-text clinical review in Complete visit, one editor per stoma.
   Font size, undo/redo and plain-text lists are retained with each review.
   Complication catalogue terms are underlined as mentions, never diagnoses.
   Legacy colour/output/skin/rod assessments remain readable.
   Saved on the appointment (stoma_assessment) as signed versions V1, V2 … —
   {schema:2,current:[rows],versions:[{version,saved_at,author_name,author_email,
   stomas}]}; older visits hold a plain array. It can be edited only on the day
   it was first recorded; edits show in red against the previous version.
   Rod management stays in handover; existing visit rod history is retained. */
(function(){
  'use strict';

  const layoutStyle=document.createElement('style');
  layoutStyle.textContent=`
    #page-patient-record .psm-upcoming-surgery{display:none!important}
    #page-patient-record .pd-planned-dates{font-size:14px;font-weight:700;color:#0d7377;line-height:1.6;padding-top:10px}

    #page-patient-record .pd-identity-surgery{border-top:0!important;padding-top:0!important}

    #page-patient-record .pd-contact-line{font-size:14px;line-height:1.5;color:#1a2e4a;overflow-wrap:anywhere;font-weight:600}
    #page-patient-record .pd-contact-locality{display:flex;gap:7px;align-items:center}
    @media(max-width:650px){#page-patient-record .pd-contact-line{font-size:12px}}

    #page-patient-record .psm-surg-snapshot{display:none!important}
    #page-patient-record .pd-identity-columns{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;align-items:start!important}
    #page-patient-record .pd-identity-columns>*{min-width:0!important}
    #page-patient-record .pd-identity-columns .psm-name{font-size:clamp(14px,2vw,22px)!important;overflow-wrap:anywhere!important}

    #page-patient-record .pd-identity-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;width:100%}
    #page-patient-record .pd-identity-columns dl{display:grid;gap:12px;margin:14px 0 0}
    #page-patient-record .pd-identity-clinical{border-left:1px solid #d6dde5;padding-left:24px;min-width:0}
    #page-patient-record .pd-identity-clinical dl{margin-top:0}
    #page-patient-record .pd-identity-field dt{font-size:11px;font-weight:800;text-transform:uppercase;color:#43566b;margin-bottom:3px}
    #page-patient-record .pd-identity-field dd{margin:0;font-size:14px;line-height:1.5;font-weight:600;color:#1a2e4a;overflow-wrap:anywhere;white-space:pre-wrap}
    #page-patient-record .pd-identity-surgery{display:grid;gap:12px;padding-top:12px;border-top:1px solid #e2e8f0}
    @media(max-width:650px){#page-patient-record .pd-identity-columns{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:12px!important}#page-patient-record .pd-identity-clinical{padding-left:12px!important}#page-patient-record .pd-identity-columns .psm-head-main{flex-wrap:wrap!important}#page-patient-record .pd-identity-columns .psm-name{font-size:clamp(14px,3.6vw,20px)!important}#page-patient-record .pd-identity-columns .psm-id{font-size:12px!important}#page-patient-record .pd-identity-field dd{font-size:12px!important}#page-patient-record .pd-identity-field dt{font-size:10px!important}#page-patient-record .pd-identity-columns dl{gap:9px!important}}

    #page-patient-record .pd-page .psm-head{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:16px!important;border:1px solid #d6dde5!important;border-radius:10px!important;padding:16px!important;background:#fff!important}
    #page-patient-record .psm-head>.pd-patient-details{width:100%!important;box-sizing:border-box;min-width:0}
    #page-patient-record .psm-head>.pd-patient-details .psm-sec-head{display:none!important}
    #page-patient-record .psm-head>.pd-patient-details .psm-card{border:0!important;box-shadow:none!important;background:transparent!important;padding:0!important}

    /* Compact, responsive patient details at the top of the dashboard. */
    #page-patient-record .pd-page{padding-top:12px!important}
    #page-patient-record .pd-page .psm{gap:12px!important}
    #page-patient-record .pd-page .psm-head{padding:12px 0!important}
    #page-patient-record .pd-page .psm-head-copy{gap:5px!important}
    #page-patient-record .pd-patient-details .psm-sec-head{margin:0 0 6px!important}
    #page-patient-record .pd-patient-details .psm-card{padding:12px 14px!important;margin:0!important}
    #page-patient-record .pd-patient-details .psm-dgrid-flow{display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:10px 16px!important;align-items:start!important}
    #page-patient-record .pd-patient-details .psm-ditem{grid-column:auto!important;min-width:0!important;gap:3px!important}
    #page-patient-record .pd-patient-details .psm-ditem.wide:not(.psm-loc-item){grid-column:span 2!important;order:2}
    #page-patient-record .pd-patient-details .psm-ditem dd{margin:0!important;font-size:14px!important;line-height:1.45!important;overflow-wrap:anywhere}
    #page-patient-record .pd-patient-details .psm-loc-item{background:transparent!important;border:0!important;padding:0!important;border-radius:0!important}
    #page-patient-record .pd-patient-details .psm-loc-item .psm-loc-name{font-size:14px!important}
    #page-patient-record .pd-patient-details .psm-loc-val{gap:6px!important}
    #page-patient-record .pd-patient-details .psm-audit{margin-top:8px!important;padding-top:6px!important;font-size:11px!important}
    @media(max-width:1000px){#page-patient-record .pd-patient-details .psm-dgrid-flow{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
    @media(max-width:600px){#page-patient-record .pd-patient-details .psm-dgrid-flow{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px 12px!important}#page-patient-record .pd-page .psm-head-main{gap:10px!important}}

    #mb:has(#es-stepper){box-sizing:border-box!important;width:min(960px,calc(100vw - 24px))!important;max-width:calc(100vw - 24px)!important;min-width:0!important;max-height:calc(100dvh - 24px)!important;overflow:auto!important;padding:clamp(14px,3vw,28px)!important}
    #mb:has(#es-stepper) .es-summary,#mb:has(#es-stepper) .es-pane{min-width:0!important;max-width:100%!important;overflow-wrap:anywhere}
    #es-stepper{display:flex!important;overflow-x:auto!important;max-width:100%!important;gap:8px!important}
    #es-stepper .es-step{flex:0 0 auto!important;min-height:48px}
    #mb:has(#es-stepper) .jenc-stoma-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))!important;min-width:0!important;gap:16px!important}
    #mb:has(#es-stepper) .jenc-stoma-col{box-sizing:border-box!important;width:100%!important;min-width:0!important}
    #mb:has(#es-stepper) .vsr-editor{width:100%!important;box-sizing:border-box!important}
    #mb:has(#es-stepper) .vsr-toolbar>*{min-width:0!important}
    @media(max-width:600px){#mb:has(#es-stepper) .mact{display:flex!important;flex-wrap:wrap!important;gap:12px!important}#mb:has(#es-stepper) .mact button{flex:1 1 100%!important;min-height:48px!important;margin:0!important}#mb:has(#es-stepper) .es-summary-details{grid-template-columns:minmax(90px,32%) minmax(0,1fr)!important}}
    #mb2.vsr-bible{box-sizing:border-box!important;width:min(560px,calc(100vw - 24px))!important;max-width:calc(100vw - 24px)!important;padding:28px!important;max-height:calc(100dvh - 32px)!important;overflow-y:auto!important}
    #mb2.vsr-bible h2{margin:0 0 22px!important;padding:0 0 18px!important;line-height:1.3!important}
    #mb2.vsr-bible>p{margin:0 0 24px!important;line-height:1.65!important}
    #mb2.vsr-bible .fg{display:flex!important;flex-direction:column!important;gap:12px!important;margin:0 0 24px!important;width:100%!important}
    #mb2.vsr-bible .fg label{display:block!important;margin:0!important;line-height:1.5!important}
    #mb2.vsr-bible input{display:block!important;width:100%!important;min-width:0!important;min-height:52px!important;font-size:16px!important;padding:14px!important;box-sizing:border-box!important}
    #mb2.vsr-bible .mact{display:flex!important;gap:14px!important;margin:24px 0 0!important;padding:0!important;background:transparent!important;flex-wrap:wrap!important}
    #mb2.vsr-bible .mact button{min-height:48px!important;margin:0!important;flex:1!important;padding:12px 20px!important}
    #mb2.vsr-bible #vsr-bible-message:empty{display:none!important}
    .vsr-toolbar{gap:10px!important;margin:14px 0 18px!important}
    .vsr-toolbar button{min-height:42px!important;padding:10px 12px!important}
    @media(max-width:600px){#mb2.vsr-bible{padding:24px!important}.vsr-bible .mact{flex-direction:column!important}.vsr-bible .mact button{width:100%!important;flex:auto!important}.vsr-toolbar{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.vsr-toolbar label{grid-column:1/-1!important}.vsr-toolbar button{white-space:normal!important}.jenc-stoma-col{min-width:0!important}}
  `;
  document.head.appendChild(layoutStyle);

  // Integrate demographics into the patient identity header after each page render.
  function integratePatientIdentity(){
    const page=document.querySelector('#page-patient-record .pd-page');
    if(!page)return;
    const head=page.querySelector('.psm-head'),details=page.querySelector('.pd-patient-details');
    page.querySelector('.psm-page-bar')?.remove();
    page.querySelectorAll('#pd-history .psm-next').forEach(card=>card.closest('.psm-card')?.remove());
    // Planned reversal dates are managed only by the combined planning button.
    const outcome=page.querySelector('#psm-outcomes');
    if(outcome){
      const input=outcome.querySelector('#cro-proprev');
      const card=input?.closest('.psm-card');
      if(card){
        const heading=card.previousElementSibling;
        if(heading?.classList.contains('psm-sec-head')&&heading.textContent.trim()==='Reversal planning')heading.remove();
        card.remove();
      }
      const summary=outcome.closest('details.pd-section')?.querySelector(':scope > summary');
      if(summary&&summary.textContent!=='Outcome')summary.textContent='Outcome';
    }
    page.querySelectorAll('.psm-surg-snapshot,.psm-upcoming-surgery').forEach(el=>el.remove());
    const actions=page.querySelector('.pd-home-actions');
    if(actions){
      const hasOpenEpisode=typeof clrState!=='undefined'&&typeof openEpisodeIn==='function'&&!!openEpisodeIn(clrState.rows||[]);
      actions.querySelectorAll('button').forEach(button=>{
        const action=button.getAttribute('onclick')||'';
        if(action.includes('openInpatientVisit()')||action.includes("patientDashboardOpen('history')")){
          button.hidden=hasOpenEpisode;
          button.style.display=hasOpenEpisode?'none':'';
        }
      });
    }
    if(actions&&!actions.dataset.combinedDates){
      actions.dataset.combinedDates='1';
      actions.querySelectorAll('button').forEach(btn=>{const action=btn.getAttribute('onclick')||'';if(action.includes('openSurgeryDateModal')||action.includes("patientDashboardOpen('outcomes')"))btn.remove();});
      const plan=document.createElement('button');plan.type='button';plan.className='psm-btn';plan.textContent='Plan surgery / reversal';plan.onclick=()=>openCombinedPlanDate();actions.append(plan);
    }
    const currentPatient=typeof clrState!=='undefined'?clrState.patient:null;
    if(head&&currentPatient){
      const values=[currentPatient.upcoming_surgery_date?'Planned surgery: '+fmtShortDate(currentPatient.upcoming_surgery_date):'',currentPatient.proposed_reversal_date?'Planned reversal: '+fmtShortDate(currentPatient.proposed_reversal_date):''].filter(Boolean).join(' · ');
      let dates=head.querySelector('.pd-planned-dates');
      if(values&&!dates){dates=document.createElement('div');dates.className='pd-planned-dates';head.append(dates);}
      if(dates&&dates.textContent!==values)dates.textContent=values;
      if(dates)dates.hidden=!values;
    }
    const overview=page.querySelector('#psm-demographics');
    if(overview&&!overview.dataset.absorbed){
      const history=page.querySelector('#pd-history'),stomas=page.querySelector('#psm-stomas');
      if(history&&stomas){
        overview.dataset.absorbed='1';
        const next=overview.querySelector('.psm-next')?.closest('.psm-card');
        if(next)next.remove();
        const remaining=document.createElement('div');remaining.className='pd-retained-patient-info';
        while(overview.firstChild)remaining.append(overview.firstChild);
        stomas.append(remaining);
        const group=overview.closest('details.pd-section');
        // Retain the panel ID for existing callers, without another overview group.
        overview.hidden=true;page.querySelector('.psm').append(overview);
        if(group)group.remove();
      }
    }
    if(head&&details&&details.parentElement!==head)head.append(details);
    if(!head||!details||details.dataset.twoColumns)return;
    const p=typeof clrState!=='undefined'?clrState.patient:null;if(!p)return;
    details.dataset.twoColumns='1';
    const identity=head.querySelector('.psm-head-main');
    const field=(label,value)=>'<div class="pd-identity-field"><dt>'+htmlSafe(label)+'</dt><dd>'+htmlSafe(String(value||'Not recorded'))+'</dd></div>';
    const audit=details.querySelector('.psm-audit')?.outerHTML||'';
    let surgeries=[];try{surgeries=patientStomaList(p);}catch(_){}
    const operation=s=>s.operation||(s.uid==='base'&&typeof patientOperationText==='function'?patientOperationText(p):'')||s.comments||'';
    const surgical=surgeries.length?surgeries.map(st=>'<div class="pd-identity-surgery">'+field('Consultant',st.consultant)+field('Surgery date (performed)',st.formed_date?fmtShortDate(st.formed_date):'')+field('Stoma type',st.type)+field('Operation performed',operation(st))+'</div>').join(''):field('Surgery date (performed)',p.surgery_date?fmtShortDate(p.surgery_date):'')+field('Stoma type',p.stoma_type)+field('Operation performed',p.procedure_performed||p.findings);
    details.innerHTML='<div class="pd-identity-columns"><div class="pd-identity-contact"><div class="pd-identity-name"></div><dl>'+'<div class="pd-contact-line" aria-label="Address">'+htmlSafe(p.address||'Not recorded')+'</div><div class="pd-contact-line pd-contact-locality" aria-label="Locality">'+(p.locality&&typeof localityFlagHTML==='function'?localityFlagHTML(p.locality,'small',false):'')+'<span>'+htmlSafe(p.locality||'Not recorded')+'</span></div><div class="pd-contact-line" aria-label="Telephone">'+htmlSafe(p.phone_number||'Not recorded')+'</div>'+(p.date_of_birth?'<div class="pd-contact-line">DOB '+htmlSafe(String(p.date_of_birth).slice(0,10).split('-').reverse().join('/'))+'</div>':'')+'</dl></div><div class="pd-identity-clinical"><dl>'+surgical+'</dl></div></div>'+audit;
    if(identity)details.querySelector('.pd-identity-name').append(identity);
  }
  const identityObserver=new MutationObserver(()=>integratePatientIdentity());
  function watchPatientIdentity(){
    const page=document.getElementById('page-patient-record');
    if(page){identityObserver.observe(page,{childList:true,subtree:true});integratePatientIdentity();}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchPatientIdentity,{once:true});else watchPatientIdentity();

  // Consultant belongs to the stoma's operation. Additional stomas do not inherit
  // a patient-level consultant unless they were formed in that same initial surgery.
  const originalStomaList=window.patientStomaList;
  window.patientStomaList=function(p){
    const rows=originalStomaList(p);
    const list=v=>{if(typeof v==='string'){try{v=JSON.parse(v);}catch(_){v=[];}}return Array.isArray(v)?v:[];};
    return rows.map(st=>{
      if(st.slot==='base')return {...st,consultant:p.consultant||null};
      const [kind,uid]=String(st.slot||'').split(':');
      const col={initial:'initial_stomas',refashion:'extra_refashionings',later:'extra_stomas'}[kind];
      const raw=list(p[col]).find(x=>String(x.uid||'')===uid);
      const consultant=raw&&Object.prototype.hasOwnProperty.call(raw,'consultant')?raw.consultant:(kind==='initial'?p.consultant:null);
      return {...st,consultant:consultant||null};
    });
  };
  const originalOpenStoma=window.openStomaModal;
  window.openStomaModal=async function(patientId,slot){
    const result=await originalOpenStoma(patientId,slot);
    if(typeof stomaModalCtx==='undefined'||String(stomaModalCtx?.patientId)!==String(patientId)||stomaModalCtx?.slot!==slot)return result;
    const anchor=document.getElementById('sm-operation');if(!anchor||document.getElementById('sm-consultant'))return result;
    const st=stomaBySlot(stomaModalCtx.pat,slot),field=document.createElement('div');field.className='fg';
    field.innerHTML='<label for="sm-consultant">Consultant for this stoma / operation</label><input id="sm-consultant" type="text" autocomplete="off">';
    field.querySelector('input').value=st?.consultant||'';
    anchor.closest('.fg')?.before(field);return result;
  };
  const originalReadStoma=window.readStomaModal;
  window.readStomaModal=function(){const f=originalReadStoma();const input=document.getElementById('sm-consultant');if(input)f.consultant=input.value.trim()||null;return f;};
  const originalStomaPayload=window.stomaPayloadFor;
  window.stomaPayloadFor=function(p,slot,f){
    const payload=originalStomaPayload(p,slot,f);
    if(!payload||!Object.prototype.hasOwnProperty.call(f,'consultant'))return payload;
    if(slot==='base'){payload.consultant=f.consultant;return payload;}
    const [kind,uid]=slot.split(':'),col={initial:'initial_stomas',refashion:'extra_refashionings',later:'extra_stomas'}[kind];
    if(col&&Array.isArray(payload[col]))payload[col]=payload[col].map(st=>String(st.uid||'')===uid?{...st,consultant:f.consultant}:st);
    return payload;
  };

  function openCombinedPlanDate(){
    const p=clrState.patient;if(!p)return;
    const box=document.getElementById('mb');box.className='mb';
    const reversal=typeof canPlanReversal==='function'&&canPlanReversal(p);
    box.innerHTML='<h2>Plan surgery / reversal</h2><div class="fg"><label for="pd-plan-kind">Date type</label><select id="pd-plan-kind"><option value="surgery">Surgery</option>'+(reversal?'<option value="reversal">Planned reversal</option>':'')+'</select></div><div class="fg"><label for="pd-plan-date">Planned date</label><input type="date" id="pd-plan-date"></div><p>The saved date appears on the patient profile. Leave the date blank to clear the selected plan.</p><div id="pd-plan-error" role="status"></div><div class="mact"><button type="button" class="btn-cancel" id="pd-plan-close">Cancel</button><button type="button" class="btn-save" id="pd-plan-save">Save date</button></div>';
    const kind=document.getElementById('pd-plan-kind'),date=document.getElementById('pd-plan-date'),save=document.getElementById('pd-plan-save');
    const fill=()=>{date.value=(kind.value==='surgery'?p.upcoming_surgery_date:p.proposed_reversal_date)||'';};
    kind.onchange=fill;fill();document.getElementById('pd-plan-close').onclick=()=>closeModal();
    save.onclick=async()=>{
      const field=kind.value==='reversal'?'proposed_reversal_date':'upcoming_surgery_date',value=date.value||null;
      save.disabled=true;
      try{
        const result=await updatePatientTolerant(p.id,{[field]:value});
        if(result.error)throw result.error;
        if(result.dropped?.includes(field))throw new Error('The selected date could not be saved. Please contact the app administrator.');
        p[field]=value;
        try{await refreshReminders();}catch(_){}
        closeModal();await openPatientRecord(p.id,{fromBack:true});
      }catch(e){document.getElementById('pd-plan-error').textContent='Could not save: '+(e.message||e);}
      finally{save.disabled=false;}
    };
    openMo();
  }
  const HEALTHY='Healthy skin',NOT_ASSESSED='Not assessed — flange in situ';
  const FALLBACK={colour:['Healthy pink','Dusky','Aubergine colour','Necrotic'],
    output:['Nil','Flatus present','Bilious effluent','Liquid stools','Semi-formed stools','Blood','Hemoserous fluid'],
    skin:[HEALTHY,'Irritation','Excoriation','Fungal infection','Psoriasis','Eczema','Dermatitis','Metaplasia','Ulcerated','Varices','Bluish discolouration']};
  let draft=null,host=null;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=x=>JSON.parse(JSON.stringify(x));
  const list=x=>Array.isArray(x)?x:[];
  const lower=x=>String(x||'').trim().toLowerCase();
  const JE=()=>window.JasonEncounters;
  const options=field=>JE()?.options?JE().options(field):FALLBACK[field];
  const skinName=t=>JE()?.skinName?JE().skinName(t):(options('skin').find(k=>lower(k)===lower(t))||'');
  const isSkinProblem=t=>JE()?.isSkinProblem?JE().isSkinProblem(t):(!!skinName(t)&&lower(t)!==lower(HEALTHY));
  // Older visit reviews can still display the rod information recorded then.
  const rodCapable=type=>typeof stomaTypeCanHaveRod==='function'?stomaTypeCanHaveRod(type):/loop|transverse/i.test(String(type||''));
  // Copy only fields already saved on this visit; new visits record no rod decision.
  const rodHistory=s=>({...(s.rod!==undefined?{rod:copy(s.rod)}:{}),
    ...(typeof s.rod_asked==='boolean'?{rod_asked:s.rod_asked}:{})});
  const today=()=>typeof TODAY==='string'?TODAY:new Date().toISOString().slice(0,10);
  const enabled=()=>typeof isEncounterUser==='function'&&isEncounterUser();
  const titleCase=x=>String(x||'Stoma').replace(/(^|[\s\-\/(])([a-z])/g,(m,a,b)=>a+b.toUpperCase());
  function nameOf(s,all){
    if(JE()?.stomaName)return JE().stomaName(s,all);
    const t=titleCase(s?.type),twins=list(all).filter(x=>titleCase(x.type)===t);
    return twins.length>1?t+' ('+(twins.indexOf(s)+1)+')':t;
  }
  function stored(v){if(typeof v==='string'){try{v=JSON.parse(v);}catch(_){v=null;}}return v;}
  function rowsOf(v){v=stored(v);return Array.isArray(v)?v:list(v?.current);}
  const parseList=rowsOf;
  const maltaDay=x=>{const v=String(x||'');if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;try{return new Date(v).toLocaleDateString('en-CA',{timeZone:'Europe/Malta'});}catch(_){return v.slice(0,10);}};
  function versionsOf(appt){
    const v=stored(appt?.stoma_assessment);
    if(Array.isArray(v))return v.length?[{version:1,saved_at:appt?.outcome_recorded_at||appt?.appt_date||'',author_name:appt?.outcome_recorded_by_name||'',author_email:appt?.outcome_recorded_by_email||'',stomas:v}]:[];
    return list(v?.versions);
  }
  // A visit review can be edited only on the day it was first recorded.
  function recordedDay(appt){const vs=versionsOf(appt);return vs.length?maltaDay(vs[0].saved_at||appt?.appt_date):'';}
  function editableToday(appt){const day=recordedDay(appt);return !day||day===today();}
  const rodText=r=>r?.status==='In place'?'Present'+(r.due?' · removal '+r.due:''):r?.status==='Removed'?'Removed'+(r.removed?' '+r.removed:''):'Not present';
  function seed(appt,p){
    const date=String(appt?.appt_date||today()).slice(0,10);
    let present=[];
    try{present=stomasPresentOn(p,date).filter(s=>!s.ended||String(s.ended)>date);}catch(_){}
    const prior=parseList(appt?.stoma_assessment);
    // Stomas recorded on the visit before stay, even if the stoma list changed since.
    prior.forEach(x=>{if(x?.uid&&!present.some(s=>s.uid===x.uid))present.push({uid:x.uid,type:x.type});});
    let comps=[];try{comps=typeof parseComplications==='function'?parseComplications(p):[];}catch(_){}
    if(!present.length)present.push({uid:"unassigned",type:"Clinical review"});
    return present.map(s=>{
      const was=prior.find(x=>x.uid===s.uid)||{};
      // An open skin complication on this stoma pre-fills the skin finding.
      const openSkin=[...new Set(comps.filter(c=>c.status!=='resolved'&&isSkinProblem(c.text)&&(c.stoma_uid===s.uid||(!c.stoma_uid&&!c.stoma&&present.length===1))).map(c=>skinName(c.text)))];
      const skin=was.skin?copy(was.skin):{status:'',problems:[]};
      return {uid:s.uid,type:s.typeLabel||s.type||was.type||'Stoma',colour:was.colour||'',output:list(was.output),skin,
        ...rodHistory(was),notes:was.notes||'',notes_font_size:Number(was.notes_font_size)||14};
    });
  }
  async function mount(el,{appt,patient,resume}={}){
    host=el||null;if(!host)return;
    // Patient complications are managed from the patient record, outside this review.
    host.closest('#es-pane-2')?.querySelectorAll('details').forEach(section=>{
      if(section.querySelector('summary')?.textContent.trim()==='Recorded patient complications')section.remove();
    });
    if(!enabled()){host.innerHTML='';return;}
    // Returning from the appliance picker rebuilds the modal; keep what was typed.
    if(!(resume&&draft&&draft.apptId===String(appt?.id))){
      const vs=versionsOf(appt);
      histories.clear();
      draft={apptId:String(appt?.id||''),patientId:String(patient?.id||''),stomas:seed(appt,patient),versions:copy(vs),
        locked:!editableToday(appt),day:recordedDay(appt),compare:vs.length?copy(list(vs[vs.length-1].stomas)):null,signer:''};
    }
    if(!host.dataset.vsrBound){host.dataset.vsrBound='1';host.addEventListener('change',change);host.addEventListener('input',input);host.addEventListener('click',click);host.addEventListener('scroll',e=>{if(e.target.dataset?.vsr==='notes'){const s=find(e.target);if(s)repaint(e.target,s);}},true);host.addEventListener('keydown',e=>{if(e.target.dataset?.vsr==='notes'&&(e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();command(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo',find(e.target),e.target);}});}
    draft.stomas.forEach(history);
    render();
    const mine=draft,loads=[];
    if(typeof loadComplicationTypes==='function')loads.push(Promise.resolve(loadComplicationTypes()).catch(()=>false));
    if(JE()?.loadOptions)loads.push(Promise.resolve(JE().loadOptions()).catch(()=>false));
    // The automatic signature: the signed-in nurse's name.
    if(typeof getCurrentUserForAudit==='function')loads.push(Promise.resolve(getCurrentUserForAudit()).then(u=>{mine.signer=(typeof attDisplayName==='function'?attDisplayName(u):'')||u?.email||'';}).catch(()=>{}));
    await Promise.all(loads);
    if(draft===mine&&host?.isConnected!==false){if(host.contains(document.activeElement)&&document.activeElement?.dataset?.vsr==='notes')refreshHighlights();else render();}
  }
  function field(label,inner){return '<div class="jenc-field"><label>'+esc(label)+'</label>'+inner+'</div>';}
  const addBtn=(f,ref)=>'<button type="button" class="jenc-add-opt" data-vsr-add="'+f+'"'+ref+'>＋ Add other…</button>';
  // Picked values; with an earlier version, new ones are red and removed ones struck through.
  function listText(values,oldValues){
    const shown=values.map(v=>oldValues&&!oldValues.includes(v)?'<span class="jenc-change">'+esc(v)+'</span>':esc(v));
    if(oldValues)oldValues.filter(v=>!values.includes(v)).forEach(v=>shown.push('<del class="jenc-deleted">'+esc(v)+'</del>'));
    return shown.join(', ');
  }
  function menu(kind,values,choices,ref,placeholder,oldValues){
    const opts=[...new Set(choices.concat(values))];
    return '<details class="jenc-multi"><summary>'+((values.length||oldValues?.length)?listText(values,oldValues):placeholder)+'</summary><div class="jenc-menu">'+
      opts.map(v=>'<label><input type="checkbox" data-vsr="'+kind+'"'+ref+' value="'+esc(v)+'"'+(values.includes(v)?' checked':'')+'>'+esc(v)+'</label>').join('')+addBtn(kind,ref)+'</div></details>';
  }
  const skinValues=k=>k?.status==='Healthy'?[HEALTHY]:k?.status==='Not assessed'?[NOT_ASSESSED]:list(k?.problems);
  function terms(){
    const names=typeof complicationTypesList!=='undefined'?complicationTypesList:[];
    return [...new Set(names.concat(['Prolapse','Retraction','Stenosis','Mucocutaneous separation','Parastomal hernia','High output','Bleeding','Granuloma','Dermatitis','Excoriation','Necrosis','Fungal infection']))].filter(Boolean).sort((a,b)=>b.length-a.length);
  }
  function highlighted(text){
    const choices=terms().map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    if(!choices.length)return esc(text);
    const re=new RegExp('(?<![\\p{L}\\p{N}_])('+choices.join('|')+')(?![\\p{L}\\p{N}_])','giu');
    let out='',last=0;
    for(const m of String(text).matchAll(re)){out+=esc(String(text).slice(last,m.index))+'<span class="vsr-term">'+esc(m[0])+'</span>';last=m.index+m[0].length;}
    return out+esc(String(text).slice(last));
  }
  function columnHTML(s,all){
    const ref=' data-uid="'+esc(s.uid)+'"';
    return '<div class="jenc-stoma-col"><h4 class="jenc-stoma-title">'+esc(nameOf(s,all))+'</h4>'+
      '<div class="vsr-toolbar" role="toolbar" aria-label="Clinical review formatting">'+
      '<label>Font size <select data-vsr="font"'+ref+' aria-label="Font size">'+[12,14,16,18,20,24].map(n=>'<option'+(n===s.notes_font_size?' selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
      ['undo','redo','bullets','numbered','complications'].map(k=>'<button type="button" data-vsr-command="'+k+'"'+ref+'>'+({undo:'↶ Undo',redo:'↷ Redo',bullets:'• Bullets',numbered:'1. Numbered list',complications:'⚠ Complication bible'}[k])+'</button>').join('')+'</div>'+
      '<label>Clinical review — free text</label><div class="vsr-editor" style="--vsr-font:'+s.notes_font_size+'px"><div class="vsr-overlay" aria-hidden="true">'+highlighted(s.notes||'')+'\n</div>'+
      '<textarea data-vsr="notes"'+ref+' aria-label="'+esc(nameOf(s,all))+' clinical review" rows="8" spellcheck="false" placeholder="Write the clinical review, observations and care provided…">'+esc(s.notes||'')+'</textarea></div>'+
      '<div class="jenc-previous vsr-note-diff"'+ref+'>'+noteDiff(s)+'</div></div>';
  }
  function repaint(el,s){
    const overlay=el.previousElementSibling;
    if(overlay){overlay.style.width=el.clientWidth?el.clientWidth+'px':'100%';overlay.innerHTML=highlighted(s.notes||'')+'\n';overlay.scrollTop=el.scrollTop;overlay.scrollLeft=el.scrollLeft;}
  }
  const histories=new Map();
  function history(s){const key=draft.apptId+':'+s.uid;if(!histories.has(key))histories.set(key,{items:[s.notes||''],at:0});return histories.get(key);}
  function remember(s){const h=history(s);if(h.items[h.at]===s.notes)return;h.items=h.items.slice(0,h.at+1);h.items.push(s.notes);h.at++;}
  function command(k,s,el){
    const h=history(s);
    if(k==='undo'||k==='redo'){h.at=Math.max(0,Math.min(h.items.length-1,h.at+(k==='undo'?-1:1)));s.notes=h.items[h.at];el.value=s.notes;}
    else {
      const start=el.value.lastIndexOf('\n',el.selectionStart-1)+1;
      let end=el.value.indexOf('\n',el.selectionEnd);if(end<0)end=el.value.length;
      const lines=el.value.slice(start,end).split('\n');
      const marked=lines.every(x=>k==='bullets'?/^• /.test(x):/^\d+\. /.test(x));
      const next=lines.map((x,i)=>marked?x.replace(k==='bullets'?/^• /:/^\d+\. /,''):(k==='bullets'?'• ':String(i+1)+'. ')+x.replace(/^(?:• |\d+\. )/,'')).join('\n');
      el.value=el.value.slice(0,start)+next+el.value.slice(end);s.notes=el.value;remember(s);el.setSelectionRange(start,start+next.length);
    }
    repaint(el,s);const diff=el.closest('.jenc-stoma-col').querySelector('.vsr-note-diff');if(diff)diff.innerHTML=noteDiff(s);el.focus();
  }
  function noteDiff(s){
    const old=draft?.compare?draft.compare.find(x=>x.uid===s.uid):null;if(!old)return '';
    const a=String(old.notes||''),b=String(s.notes||'');if(a===b)return '';
    return 'Changes: '+(JE()?.diffHTML?JE().diffHTML(a,b,true):'<span class="jenc-change">'+esc(b)+'</span>');
  }
  function stamp(x){try{return new Date(x).toLocaleString('en-GB',{timeZone:'Europe/Malta',dateStyle:'medium',timeStyle:'short'});}catch(_){return String(x||'');}}
  // Read-only review: one column per stoma. With the previous version, what
  // changed is red and what was removed is struck through.
  function reviewHTML(rows,prev){
    const all=list(rows);
    if(!all.length)return '<div class="report-note">No stoma assessment was recorded at this visit.</div>';
    return '<div class="jenc-stoma-grid vsr-grid" style="--jenc-cols:'+Math.min(all.length,3)+'">'+all.map(s=>{
      const o=prev?list(prev).find(x=>x.uid===s.uid)||{}:null;
      const line=(label,html,changed)=>'<div class="vsr-line"><span class="vsr-label">'+esc(label)+'</span><span class="vsr-val'+(changed?' jenc-change':'')+'">'+(html||'—')+'</span></div>';
      let out=line('Colour / appearance',esc(s.colour||'Not recorded'),o&&(o.colour||'')!==(s.colour||''));
      out+=line('Function / output',listText(list(s.output),o?list(o.output):null)||'Not recorded');
      out+=line('Peristomal skin',listText(skinValues(s.skin),o?skinValues(o.skin):null)||'Not recorded');
      if(s.rod_asked!==false&&rodCapable(s.type)&&(s.rod?.status&&s.rod.status!=='Not recorded'||o&&o.rod?.status&&o.rod.status!=='Not recorded'))
        out+=line('Rod',esc(rodText(s.rod)),o&&rodText(o.rod)!==rodText(s.rod));
      const a=String(o?.notes||''),b=String(s.notes||'');
      out+=line('Clinical notes',o&&a!==b&&JE()?.diffHTML?JE().diffHTML(a,b,true):'<span style="white-space:pre-wrap;font-size:'+(Number(s.notes_font_size)||14)+'px">'+highlighted(b||'—')+'</span>');
      return '<div class="jenc-stoma-col"><h4 class="jenc-stoma-title">'+esc(s.name||nameOf(s,all))+'</h4>'+out+'</div>';
    }).join('')+'</div>';
  }
  window.addEventListener('resize',()=>refreshHighlights());
  function render(){
    if(!host||!draft)return;
    const all=draft.stomas;
    if(draft.locked){
      const last=draft.versions[draft.versions.length-1]||{};
      host.innerHTML='<div class="edit-seen-section">Stoma assessment</div><div class="vsr-locked">🔒 Recorded '+esc(draft.day)+' — a visit review can be edited only on the day it was recorded.</div>'+
        reviewHTML(last.stomas,null)+(last.author_name?'<div class="jenc-signature">Signed by: '+esc(last.author_name)+(last.saved_at?' · '+esc(stamp(last.saved_at)):'')+' · V'+esc(last.version||1)+'</div>':'');
      return;
    }
    host.innerHTML='<div class="edit-seen-section">Stoma assessment'+(draft.versions.length?' <span class="vsr-badge">Editing V'+(draft.versions.length+1)+' · changes in red</span>':'')+'</div>'+(all.length
      ?'<div class="jenc-stoma-grid vsr-grid" style="--jenc-cols:'+Math.min(all.length,3)+'">'+all.map(s=>columnHTML(s,all)).join('')+'</div>'
      :'<div class="report-note">No stoma is recorded for this patient. Add it in the patient record to assess it here.</div>')+
      (all.length?'<div class="jenc-signature">Signature will be recorded automatically'+(draft.signer?': '+esc(draft.signer):'')+'</div>':'');
    refreshHighlights();
  }
  function find(el){return draft?.stomas.find(s=>s.uid===el.dataset.uid);}
  // "Healthy skin" stands alone; ticking any finding clears it.
  function setSkin(s,values,value,checked){
    const standalone=[HEALTHY,NOT_ASSESSED];
    const v=checked&&standalone.includes(value)?[value]:list(values).filter(x=>!standalone.includes(x));
    s.skin=v.includes(HEALTHY)?{status:'Healthy',problems:[]}:v.includes(NOT_ASSESSED)?{status:'Not assessed',problems:[]}:{status:v.length?'Not healthy':'',problems:v};
  }
  function setOutput(s,values,value,checked){s.output=checked&&value==='Nil'?['Nil']:list(values).filter(x=>x!=='Nil');}
  function reopen(kind,s){const next=[...host.querySelectorAll('[data-vsr="'+kind+'"]')].find(x=>x.dataset.uid===s.uid);if(next)next.closest('details').open=true;}
  function skinChanged(){if(typeof window.onVisitSkinChange==='function')window.onVisitSkinChange();}
  function change(e){
    const el=e.target,kind=el.dataset?.vsr;
    if(kind==='font'){const s=find(el);if(s){s.notes_font_size=Number(el.value);el.closest('.jenc-stoma-col').querySelector('.vsr-editor').style.setProperty('--vsr-font',s.notes_font_size+'px');}return;}
    const s=kind&&find(el);if(!s)return;
    if(kind==='colour'){if(el.value==='__add__'){addOther('colour',s);return;}s.colour=el.value;}
    else if(kind==='output'){const v=list(s.output).filter(x=>x!==el.value);if(el.checked)v.push(el.value);setOutput(s,v,el.value,el.checked);}
    else if(kind==='skin'){const v=skinValues(s.skin).filter(x=>x!==el.value);if(el.checked)v.push(el.value);setSkin(s,v,el.value,el.checked);}
    else return;
    render();
    if(kind==='output'||kind==='skin')reopen(kind,s);
    if(kind==='skin')skinChanged();
  }
  function openBible(){
    const box=document.getElementById('mb2');box.className='mb vsr-bible';
    box.innerHTML='<h2>Complication bible</h2><p>Save a term for all stoma types. It will be underlined automatically when written in a clinical review.</p><div class="fg" style="margin:18px 0 12px"><label for="vsr-bible-term" style="display:block;margin-bottom:8px">Complication term</label><input id="vsr-bible-term" type="text" maxlength="150" placeholder="Write a complication term" style="display:block;width:100%;box-sizing:border-box;min-height:46px;padding:10px 12px;font-size:16px;border:1px solid #cbd5e1;border-radius:8px"></div><p id="vsr-bible-message" role="status"></p><div class="mact"><button type="button" class="btn-cancel" id="vsr-bible-close">Close</button><button type="button" class="btn-save" id="vsr-bible-save">Save term</button></div>';
    document.getElementById('vsr-bible-close').onclick=()=>closeMo2();
    const save=document.getElementById('vsr-bible-save'),input=document.getElementById('vsr-bible-term'),msg=document.getElementById('vsr-bible-message');
    save.onclick=async()=>{
      const name=input.value.trim();if(!name){msg.textContent='Write a term first.';return;}
      if(terms().some(t=>lower(t)===lower(name))){msg.textContent='This term is already recognised for all stomas.';return;}
      save.disabled=true;
      try{const result=await insertComplicationType(name,'all');if(result.error)throw result.error;await loadComplicationTypes();refreshHighlights();input.value='';msg.textContent='Saved for all stoma types.';}
      catch(e){msg.textContent='Could not save: '+(e.message||e);}
      finally{save.disabled=false;}
    };
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(!save.disabled)save.click();}};
    openMo2();input.focus();
  }
  function click(e){
    const control=e.target.closest?.('[data-vsr-command]');
    if(control){const s=find(control);if(!s)return;const k=control.dataset.vsrCommand;if(k==='complications'){openBible();return;}const el=control.closest('.jenc-stoma-col').querySelector('textarea');command(k,s,el);return;}
    const btn=e.target.closest?.('[data-vsr-add]');if(!btn)return;const s=find(btn);if(s)addOther(btn.dataset.vsrAdd,s);
  }
  // "+ Add other…": the new wording joins the list for good and is chosen here.
  async function addOther(fieldName,s){
    const label={colour:'colour / appearance',output:'function / output',skin:'peristomal skin finding'}[fieldName];if(!label)return;
    let raw='';try{raw=window.prompt('Add another '+label+' to the list:')||'';}catch(_){}
    const name=JE()?.addOption?await JE().addOption(fieldName,raw,draft?.signer):String(raw||'').trim();
    if(name){
      if(fieldName==='colour')s.colour=name;
      if(fieldName==='output')setOutput(s,list(s.output).filter(x=>x!==name).concat(name),name,true);
      if(fieldName==='skin')setSkin(s,skinValues(s.skin).filter(x=>x!==name).concat(name),name,true);
    }
    render();
    if(name&&fieldName==='skin')skinChanged();
  }
  function input(e){
    const el=e.target;if(el.dataset?.vsr!=='notes')return;const s=find(el);if(!s)return;history(s);s.notes=el.value;remember(s);repaint(el,s);
    const d=[...host.querySelectorAll('.vsr-note-diff')].find(x=>x.dataset.uid===s.uid);if(d)d.innerHTML=noteDiff(s);
  }
  function payloadFor(apptId){
    if(!enabled()||!draft||draft.locked||draft.apptId!==String(apptId))return null;
    return draft.stomas.map(s=>({uid:s.uid,type:s.type,name:nameOf(s,draft.stomas),colour:s.colour,output:list(s.output),skin:copy(s.skin||{status:'',problems:[]}),
      ...rodHistory(s),notes:String(s.notes||''),notes_font_size:s.notes_font_size||14}));
  }
  function summaryLines(rows){
    return list(rows).map(s=>{
      const parts=[];
      if(s.colour)parts.push('colour: '+String(s.colour).toLowerCase());
      if(list(s.output).length)parts.push('output: '+s.output.join(', '));
      if(s.skin?.status==='Not assessed')parts.push('peristomal skin: '+NOT_ASSESSED);
      if(s.skin?.status==='Healthy')parts.push('peristomal skin: healthy');
      if(s.skin?.status==='Not healthy')parts.push('peristomal skin: not healthy'+(list(s.skin.problems).length?' ('+s.skin.problems.join(', ')+')':''));
      if(s.rod_asked!==false&&s.rod?.status==='In place')parts.push('rod present'+(s.rod.due?' (removal '+s.rod.due+')':''));
      if(s.rod_asked!==false&&s.rod?.status==='Removed')parts.push('rod removed'+(s.rod.removed?' '+s.rod.removed:''));
      if(String(s.notes||'').trim())parts.push('notes: '+String(s.notes).trim());
      return {name:s.name||titleCase(s.type),text:parts.join('; ')||'No assessment recorded'};
    });
  }
  // The skin findings ticked at this visit, each tied to its stoma — they are
  // recorded as complications; stomas with Healthy skin resolve their open ones.
  function skinFor(apptId){
    const rows=[];
    return {problems:rows.flatMap(r=>r.skin?.status==='Not healthy'?list(r.skin.problems).map(text=>({uid:r.uid,text})):[]),
      healthy:rows.filter(r=>r.skin?.status==='Healthy').map(r=>r.uid),single:rows.length===1?rows[0].uid:''};
  }
  // What to store: the earlier versions plus this one, signed — or null when
  // nothing changed (or the review is locked).
  function storedFor(apptId,rows,author){
    if(!draft||draft.locked||draft.apptId!==String(apptId)||!rows)return null;
    const vs=copy(draft.versions||[]),last=vs[vs.length-1];
    const comparable=items=>list(items).map(s=>({...s,notes_font_size:Number(s.notes_font_size)||14}));
    if(last&&JSON.stringify(comparable(last.stomas))===JSON.stringify(comparable(rows)))return null;
    vs.push({version:(Number(last?.version)||0)+1,saved_at:new Date().toISOString(),author_name:String(author?.name||''),author_email:String(author?.email||''),stomas:copy(rows)});
    return {schema:2,current:copy(rows),versions:vs};
  }
  // The rows to show for this visit: what is being edited, or the locked record.
  function currentRows(apptId){
    if(!draft||draft.apptId!==String(apptId))return null;
    return draft.locked?list(draft.versions[draft.versions.length-1]?.stomas):payloadFor(apptId);
  }
  // In the visit "Seen" modal the stoma assessment is OPTIONAL — unlike the
  // inpatient stoma assessment, a visit can be completed (Seen) with colour,
  // function / output or peristomal skin left blank. So validate never blocks
  // navigation or saving; it only clears any stale required-field message.
  function validate(apptId){
    const error=host?.querySelector('.vsr-required-error');
    if(error){error.hidden=true;error.textContent='';}
    return true;
  }
  function clear(){draft=null;histories.clear();}
  function refreshHighlights(){host?.querySelectorAll('textarea[data-vsr="notes"]').forEach(el=>{const s=find(el);if(s)repaint(el,s);});}
  window.VisitStomaReview={highlighted,refreshHighlights,validate,enabled,mount,payloadFor,summaryLines,skinFor,isSkinProblem,clear,storedFor,currentRows,
    rowsOf,versionsOf,editableToday,recordedDay,reviewHTML,stamp,get state(){return draft;}};
})();
