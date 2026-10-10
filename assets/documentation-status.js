/* Automatic chronology, shared across all episodes. A date match is evidence
   of electronic coverage, never proof that a physical paper file does not exist. */
(function(g){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):null;
 function classify(e,asOf=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Malta'})){
   if(!e)return {status:'unconfirmed',label:'History not checked',reason:'The system could not check when electronic notes began. Try refreshing the patient record.'};
   const s=date(e.surgery_date),ep=date(e.first_episode_date),enc=date(e.first_encounter_date);
   const entered=[date(e.first_episode_entered_date),date(e.first_encounter_entered_date)];
   if(!s)return {status:'unconfirmed',label:'Surgery date missing',reason:'Add the first surgery date so the system can check when electronic notes began.'};
   if(s>asOf)return {status:'pending',label:'Electronic history incomplete',reason:'Surgery has not taken place yet. The system will check the record history after surgery.'};
   if([ep,enc,...entered].some(d=>d&&d>s))return {status:'earlier_history',label:'Check for earlier paper notes',reason:'Electronic notes were started or added after surgery. Check for earlier notes in a paper file.'};
   if(!ep||!enc||entered.some(d=>!d))return {status:'pending',label:'Electronic history incomplete',reason:'The first episode or saved encounter is missing a date or has not been recorded yet.'};
   return {status:'electronic',label:'Electronic notes from surgery',reason:'Electronic notes begin from surgery. A separate paper file may still exist.'};
 }
 function evidence(p){return p?.documentation_dates||null;}
 function badgeHTML(p){const d=classify(evidence(p));return '<span class="documentation-badge documentation-'+d.status+'" title="'+esc(d.reason)+'">'+esc(d.label)+'</span>';}
 function cardHTML(p){
   const e=evidence(p),d=classify(e);
   const names=[['Surgery',e?.surgery_date],['First electronic episode',e?.first_episode_date],['First electronic notes',e?.first_encounter_date],['Episode added to system',e?.first_episode_entered_date],['Notes added to system',e?.first_encounter_entered_date]];
   const fmt=v=>date(v)?new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Not recorded';
   return '<aside class="documentation-card" aria-label="Patient records"><div><strong>Patient records</strong> '+badgeHTML(p)+' <small>Automatically checked from dates</small></div><p>'+esc(d.reason)+'</p><dl>'+names.map(([n,v])=>'<div><dt>'+n+'</dt><dd>'+esc(fmt(v))+'</dd></div>').join('')+'</dl></aside>';
 }
 async function enrich(result,db){
   if(result?.error||!db?.rpc)return result;
   const key=Array.isArray(result?.rows)?'rows':'data',value=result?.[key];
   const rows=Array.isArray(value)?value:value?[value]:[];
   const ids=[...new Set(rows.map(p=>String(p.id||'')).filter(Boolean))];
   if(!ids.length)return result;
   try{
     // One bounded lookup per patient batch. A failed lookup stays unconfirmed.
     const q=db.rpc('patient_documentation_dates',{p_patient_ids:ids});
     let timer;const controller=new AbortController();
     try{
       const request=typeof q.abortSignal==='function'?q.abortSignal(controller.signal):q;
       const response=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Documentation lookup timed out'));},6000);})]);
       if(response.error)throw response.error;
       const byId=new Map((response.data||[]).map(e=>[String(e.patient_id),e]));
       rows.forEach(p=>{p.documentation_dates=byId.get(String(p.id))||null;});
     }finally{clearTimeout(timer);}
   }catch(_){rows.forEach(p=>{p.documentation_dates=null;});}
   return result;
 }
 g.DocumentationStatus={classify,badgeHTML,cardHTML,enrich};
})(window);
