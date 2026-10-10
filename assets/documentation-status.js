/* Automatic chronology, shared across all episodes. A date match is evidence
   of electronic coverage, never proof that a physical paper file does not exist. */
(function(g){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):null;
 function classify(e,asOf=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Malta'})){
   if(!e)return {status:'unconfirmed',label:'Documentation dates unconfirmed',reason:'The electronic history could not be checked.'};
   const s=date(e.surgery_date),ep=date(e.first_episode_date),enc=date(e.first_encounter_date);
   const entered=[date(e.first_episode_entered_date),date(e.first_encounter_entered_date)];
   if(!s)return {status:'unconfirmed',label:'Documentation dates incomplete',reason:'The first surgery date is not recorded.'};
   if(s>asOf)return {status:'pending',label:'Awaiting electronic history',reason:'Surgery is in the future; electronic coverage from surgery cannot yet be established.'};
   if([ep,enc,...entered].some(d=>d&&d>s))return {status:'earlier_history',label:'Earlier history to check',reason:'Electronic documentation begins or was entered after surgery. Earlier history may be held in a paper file.'};
   if(!ep||!enc||entered.some(d=>!d))return {status:'pending',label:'Awaiting electronic history',reason:'A dated first episode and first saved encounter are needed to establish electronic coverage.'};
   return {status:'electronic',label:'Electronic from surgery',reason:'The first episode and encounter were dated and entered on or before surgery. This does not confirm whether a separate paper file exists.'};
 }
 function evidence(p){return p?.documentation_dates||null;}
 function badgeHTML(p){const d=classify(evidence(p));return '<span class="documentation-badge documentation-'+d.status+'" title="'+esc(d.reason)+'">'+esc(d.label)+'</span>';}
 function cardHTML(p){
   const e=evidence(p),d=classify(e);
   const names=[['Surgery',e?.surgery_date],['First episode',e?.first_episode_date],['First encounter',e?.first_encounter_date],['Episode entered',e?.first_episode_entered_date],['Encounter entered',e?.first_encounter_entered_date]];
   const fmt=v=>date(v)?new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Not recorded';
   return '<aside class="documentation-card" aria-label="Documentation record"><div><strong>Documentation record</strong> '+badgeHTML(p)+' <small>Automatic · based on dates</small></div><p>'+esc(d.reason)+'</p><dl>'+names.map(([n,v])=>'<div><dt>'+n+'</dt><dd>'+esc(fmt(v))+'</dd></div>').join('')+'</dl></aside>';
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
