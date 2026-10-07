/* The stoma assessment in the Complete visit → Clinical review step (every nurse). One
   column per stoma, named by its type (End Colostomy …): colour / appearance,
   function / output, peristomal skin (Healthy skin, or the findings — each also
   recorded as a complication of that stoma), a "Rod present" tick with its
   planned removal date (loop stomas, at the stoma's first assessment only), and
   free clinical notes. Colour, output and skin lists take "+ Add other…".
   Saved on the appointment (stoma_assessment) as signed versions V1, V2 … —
   {schema:2,current:[rows],versions:[{version,saved_at,author_name,author_email,
   stomas}]}; older visits hold a plain array. It can be edited only on the day
   it was first recorded; edits show in red against the previous version. A rod
   change is also written to the patient, as the ward encounter does. */
(function(){
  'use strict';
  const HEALTHY='Healthy skin';
  const FALLBACK={colour:['Healthy pink','Dusky','Aubergine colour','Necrotic'],
    output:['Nil','Flatus present','Bilious effluent','Liquid stools','Semi-formed stools','Blood','Hemoserous fluid'],
    skin:[HEALTHY,'Irritation','Excoriation','Fungal infection','Psoriasis','Eczema','Dermatitis','Metaplasia','Ulcerated','Varices','Bluish discolouration']};
  let draft=null,baseline=null,host=null;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=x=>JSON.parse(JSON.stringify(x));
  const list=x=>Array.isArray(x)?x:[];
  const lower=x=>String(x||'').trim().toLowerCase();
  const JE=()=>window.JasonEncounters;
  const options=field=>JE()?.options?JE().options(field):FALLBACK[field];
  const skinName=t=>JE()?.skinName?JE().skinName(t):(options('skin').find(k=>lower(k)===lower(t))||'');
  const isSkinProblem=t=>JE()?.isSkinProblem?JE().isSkinProblem(t):(!!skinName(t)&&lower(t)!==lower(HEALTHY));
  // A rod is only ever used with a loop stoma — never an end stoma or a urostomy.
  const rodCapable=type=>typeof stomaTypeCanHaveRod==='function'?stomaTypeCanHaveRod(type):/loop|transverse/i.test(String(type||''));
  const rodAsked=s=>rodCapable(s?.type)&&s?.rod_asked===true;
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
    const loops=present.filter(x=>rodCapable(x.typeLabel||x.type));
    let comps=[];try{comps=typeof parseComplications==='function'?parseComplications(p):[];}catch(_){}
    return present.map(s=>{
      const was=prior.find(x=>x.uid===s.uid)||{};
      const own=rodCapable(s.typeLabel||s.type||was.type)&&(p?.rod_stoma_uid===s.uid||(!p?.rod_stoma_uid&&(present.length===1||(loops.length===1&&loops[0].uid===s.uid))));
      // An open skin complication on this stoma pre-fills the skin finding.
      const openSkin=[...new Set(comps.filter(c=>c.status!=='resolved'&&isSkinProblem(c.text)&&(c.stoma_uid===s.uid||(!c.stoma_uid&&!c.stoma&&present.length===1))).map(c=>skinName(c.text)))];
      const skin=was.skin?copy(was.skin):{status:openSkin.length?'Not healthy':'',problems:openSkin};
      const rod=was.rod||{status:own?(p.rod_removed_date?'Removed':p.rod_removal_date?'In place':'Not recorded'):'Not recorded',
        due:own?(p.rod_removal_date||''):'',removed:own?(p.rod_removed_date||''):''};
      return {uid:s.uid,type:s.typeLabel||s.type||was.type||'Stoma',colour:was.colour||'',output:list(was.output),skin,rod:copy(rod),
        rod_asked:typeof was.rod_asked==='boolean'?was.rod_asked:undefined,notes:was.notes||''};
    });
  }
  // The rod question belongs to a stoma's FIRST assessment (a rod is only placed
  // at surgery): any earlier encounter or visit assessment of it means no.
  async function assessedBefore(appt,patient){
    const seen=new Set();
    try{const {data}=await SB.from('encounters').select('assessment').eq('patient_id',String(patient?.id||''));
      list(data).forEach(r=>{let a=r?.assessment;if(typeof a==='string'){try{a=JSON.parse(a);}catch(_){a={};}}list(a?.snapshot?.stomas).forEach(x=>x?.uid&&seen.add(x.uid));});}catch(_){}
    try{const {data}=await SB.from('appointments').select('id,appt_date,stoma_assessment').eq('patient_id',patient?.id).lte('appt_date',String(appt?.appt_date||today()));
      list(data).filter(r=>String(r.id)!==String(appt?.id)).forEach(r=>parseList(r.stoma_assessment).forEach(x=>x?.uid&&seen.add(x.uid)));}catch(_){}
    return seen;
  }
  async function mount(el,{appt,patient,resume}={}){
    host=el||null;if(!host)return;
    if(!enabled()){host.innerHTML='';return;}
    // Returning from the appliance picker rebuilds the modal; keep what was typed.
    if(!(resume&&draft&&draft.apptId===String(appt?.id))){
      const vs=versionsOf(appt);
      draft={apptId:String(appt?.id||''),patientId:String(patient?.id||''),stomas:seed(appt,patient),versions:copy(vs),
        locked:!editableToday(appt),day:recordedDay(appt),compare:vs.length?copy(list(vs[vs.length-1].stomas)):null,signer:''};
      baseline=copy(draft);
    }
    if(!host.dataset.vsrBound){host.dataset.vsrBound='1';host.addEventListener('change',change);host.addEventListener('input',input);host.addEventListener('click',click);}
    render();
    const mine=draft,loads=[];
    if(JE()?.loadOptions)loads.push(Promise.resolve(JE().loadOptions()).catch(()=>false));
    // The automatic signature: the signed-in nurse's name.
    if(typeof getCurrentUserForAudit==='function')loads.push(Promise.resolve(getCurrentUserForAudit()).then(u=>{mine.signer=(typeof attDisplayName==='function'?attDisplayName(u):'')||u?.email||'';}).catch(()=>{}));
    if(mine.stomas.some(s=>typeof s.rod_asked!=='boolean'&&rodCapable(s.type))){
      loads.push(assessedBefore(appt,patient).then(seen=>{mine.stomas.forEach(s=>{if(typeof s.rod_asked!=='boolean')s.rod_asked=!seen.has(s.uid);});
        baseline?.stomas?.forEach(s=>{const d=mine.stomas.find(x=>x.uid===s.uid);if(d)s.rod_asked=d.rod_asked;});}));
    }
    await Promise.all(loads);
    if(draft===mine&&host?.isConnected!==false)render();
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
  const skinValues=k=>k?.status==='Healthy'?[HEALTHY]:list(k?.problems);
  function columnHTML(s,all){
    const ref=' data-uid="'+esc(s.uid)+'"',old=draft.compare?draft.compare.find(x=>x.uid===s.uid)||{}:null;
    const colourChanged=old&&(old.colour||'')!==(s.colour||'');
    const colour='<select data-vsr="colour"'+ref+(colourChanged?' class="jenc-changed"':'')+' aria-label="Colour / appearance"><option value="">— not recorded —</option>'+
      [...new Set(options('colour').concat(s.colour?[s.colour]:[]))].map(c=>'<option value="'+esc(c)+'"'+(c===s.colour?' selected':'')+'>'+esc(c)+'</option>').join('')+
      '<option value="__add__">＋ Add other…</option></select>'+(colourChanged?'<div class="jenc-previous">Previously: '+esc(old.colour||'not recorded')+'</div>':'');
    const output=menu('output',list(s.output),options('output'),ref,'— not recorded —',old?list(old.output):null);
    const skin='<div class="jenc-fields jenc-skin">'+field('Peristomal skin',menu('skin',skinValues(s.skin),options('skin'),ref,'— not recorded —',old?skinValues(old.skin):null))+'</div>';
    let rod='';
    if(rodAsked(s)){
      const r=s.rod||{},on=r.status==='In place',was=baseline?.stomas?.find(x=>x.uid===s.uid)?.rod||{};
      const rodChanged=old&&rodText(old.rod)!==rodText(s.rod);
      rod='<div class="jenc-rod'+(rodChanged?' jenc-changed':'')+'"><label class="jenc-check"><input type="checkbox" data-vsr="rod"'+ref+(on?' checked':'')+'> Rod present</label>';
      if(on)rod+=field('Planned removal date *','<input type="date" data-vsr="rod-due"'+ref+' value="'+esc(r.due||'')+'">');
      else if(r.status==='Removed'&&was.status==='In place')rod+=field('Rod removed on','<input type="date" data-vsr="rod-removed"'+ref+' value="'+esc(r.removed||today())+'" max="'+esc(today())+'">');
      else if(r.status==='Removed')rod+='<div class="jenc-meta">Rod removed'+(r.removed?' '+esc(r.removed):'')+'.</div>';
      if(rodChanged)rod+='<div class="jenc-previous">Previously: '+esc(rodText(old.rod))+'</div>';
      rod+='</div>';
    }
    const notes=field(nameOf(s,all)+' — clinical notes','<textarea data-vsr="notes"'+ref+' rows="3" placeholder="Write your observations, care provided or patient concerns…">'+esc(s.notes||'')+'</textarea>'+
      '<div class="jenc-previous vsr-note-diff" data-uid="'+esc(s.uid)+'">'+noteDiff(s)+'</div>');
    return '<div class="jenc-stoma-col"><h4 class="jenc-stoma-title">'+esc(nameOf(s,all))+'</h4><div class="jenc-fields">'+field('Colour / appearance',colour)+field('Function / output',output)+'</div>'+skin+rod+notes+'</div>';
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
      out+=line('Clinical notes',o&&a!==b&&JE()?.diffHTML?JE().diffHTML(a,b,true):esc(b||'—'));
      return '<div class="jenc-stoma-col"><h4 class="jenc-stoma-title">'+esc(s.name||nameOf(s,all))+'</h4>'+out+'</div>';
    }).join('')+'</div>';
  }
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
      '<div id="vsr-error" class="registry-lookup-note error" hidden style="margin-top:8px;"></div>'+
      (all.length?'<div class="jenc-signature">Signature will be recorded automatically'+(draft.signer?': '+esc(draft.signer):'')+'</div>':'');
  }
  function find(el){return draft?.stomas.find(s=>s.uid===el.dataset.uid);}
  // "Healthy skin" stands alone; ticking any finding clears it.
  function setSkin(s,values,value,checked){
    const v=checked&&value===HEALTHY?[HEALTHY]:list(values).filter(x=>x!==HEALTHY);
    s.skin=v.includes(HEALTHY)?{status:'Healthy',problems:[]}:{status:v.length?'Not healthy':'',problems:v};
  }
  function setOutput(s,values,value,checked){s.output=checked&&value==='Nil'?['Nil']:list(values).filter(x=>x!=='Nil');}
  function reopen(kind,s){const next=[...host.querySelectorAll('[data-vsr="'+kind+'"]')].find(x=>x.dataset.uid===s.uid);if(next)next.closest('details').open=true;}
  function skinChanged(){if(typeof window.onVisitSkinChange==='function')window.onVisitSkinChange();}
  function change(e){
    const el=e.target,kind=el.dataset?.vsr;
    const s=kind&&find(el);if(!s)return;
    if(kind==='colour'){if(el.value==='__add__'){addOther('colour',s);return;}s.colour=el.value;}
    else if(kind==='output'){const v=list(s.output).filter(x=>x!==el.value);if(el.checked)v.push(el.value);setOutput(s,v,el.value,el.checked);}
    else if(kind==='skin'){const v=skinValues(s.skin).filter(x=>x!==el.value);if(el.checked)v.push(el.value);setSkin(s,v,el.value,el.checked);}
    else if(kind==='rod'){
      const was=baseline?.stomas?.find(x=>x.uid===s.uid)?.rod||{};
      if(el.checked)s.rod={status:'In place',due:s.rod?.due||(was.status==='In place'?was.due:'')||'',removed:''};
      else if(was.status==='In place')s.rod={status:'Removed',due:was.due||'',removed:today()};
      else s.rod=was.status==='Removed'?copy(was):{status:'Not recorded',due:'',removed:''};
    }else if(kind==='rod-due')s.rod.due=el.value;
    else if(kind==='rod-removed')s.rod.removed=el.value;
    else return;
    render();
    if(kind==='output'||kind==='skin')reopen(kind,s);
    if(kind==='skin')skinChanged();
  }
  function click(e){
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
    const el=e.target;if(el.dataset?.vsr!=='notes')return;const s=find(el);if(!s)return;s.notes=el.value;
    const d=[...host.querySelectorAll('.vsr-note-diff')].find(x=>x.dataset.uid===s.uid);if(d)d.innerHTML=noteDiff(s);
  }
  // Called before leaving Clinical review: a ticked rod needs its removal date.
  function validate(){
    if(!enabled()||!draft||draft.locked||!host?.isConnected)return true;
    const missing=draft.stomas.filter(s=>rodAsked(s)&&s.rod?.status==='In place'&&!s.rod.due);
    const err=host.querySelector('#vsr-error');
    if(missing.length){if(err){err.hidden=false;err.textContent='Choose the planned rod removal date for '+missing.map(s=>nameOf(s,draft.stomas)).join(', ')+'.';}return false;}
    if(err)err.hidden=true;return true;
  }
  function payloadFor(apptId){
    if(!enabled()||!draft||draft.locked||draft.apptId!==String(apptId))return null;
    return draft.stomas.map(s=>({uid:s.uid,type:s.type,name:nameOf(s,draft.stomas),colour:s.colour,output:list(s.output),skin:copy(s.skin||{status:'',problems:[]}),
      rod:rodAsked(s)?copy(s.rod||{}):{status:'Not recorded',due:'',removed:''},rod_asked:rodAsked(s),notes:String(s.notes||'')}));
  }
  // The patient's rod fields, when a rod was ticked, unticked or re-dated here.
  function rodPatchFor(apptId){
    if(!payloadFor(apptId))return null;
    const changed=draft.stomas.filter(s=>rodAsked(s)&&JSON.stringify(s.rod)!==JSON.stringify(baseline?.stomas?.find(b=>b.uid===s.uid)?.rod));
    if(!changed.length)return null;
    const inPlace=draft.stomas.filter(s=>rodAsked(s)&&s.rod?.status==='In place').sort((a,b)=>String(a.rod.due).localeCompare(String(b.rod.due)));
    const r=inPlace[0]||changed[0];
    return {rod_stoma_uid:r.uid,rod_removal_date:r.rod.due||null,rod_removed_date:r.rod.status==='Removed'?(r.rod.removed||today()):null};
  }
  function summaryLines(rows){
    return list(rows).map(s=>{
      const parts=[];
      if(s.colour)parts.push('colour: '+String(s.colour).toLowerCase());
      if(list(s.output).length)parts.push('output: '+s.output.join(', '));
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
    const rows=payloadFor(apptId)||[];
    return {problems:rows.flatMap(r=>r.skin?.status==='Not healthy'?list(r.skin.problems).map(text=>({uid:r.uid,text})):[]),
      healthy:rows.filter(r=>r.skin?.status==='Healthy').map(r=>r.uid),single:rows.length===1?rows[0].uid:''};
  }
  // What to store: the earlier versions plus this one, signed — or null when
  // nothing changed (or the review is locked).
  function storedFor(apptId,rows,author){
    if(!draft||draft.locked||draft.apptId!==String(apptId)||!rows)return null;
    const vs=copy(draft.versions||[]),last=vs[vs.length-1];
    if(last&&JSON.stringify(list(last.stomas))===JSON.stringify(rows))return null;
    vs.push({version:(Number(last?.version)||0)+1,saved_at:new Date().toISOString(),author_name:String(author?.name||''),author_email:String(author?.email||''),stomas:copy(rows)});
    return {schema:2,current:copy(rows),versions:vs};
  }
  // The rows to show for this visit: what is being edited, or the locked record.
  function currentRows(apptId){
    if(!draft||draft.apptId!==String(apptId))return null;
    return draft.locked?list(draft.versions[draft.versions.length-1]?.stomas):payloadFor(apptId);
  }
  function clear(){draft=null;baseline=null;}
  window.VisitStomaReview={enabled,mount,validate,payloadFor,rodPatchFor,summaryLines,skinFor,isSkinProblem,clear,storedFor,currentRows,
    rowsOf,versionsOf,editableToday,recordedDay,reviewHTML,stamp,get state(){return draft;}};
})();
