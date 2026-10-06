/* Jason's stoma assessment in the Complete visit → Clinical review step. One
   column per stoma, named by its type (End Colostomy …): colour / appearance,
   function / output, a single "Rod present" tick with its planned removal date,
   and free clinical notes. Saved on the appointment (stoma_assessment); a rod
   change is also written to the patient, as the ward encounter does. */
(function(){
  'use strict';
  const FALLBACK_COLOURS=['Healthy pink','Dusky','Aubergine colour','Necrotic'];
  const FALLBACK_OUTPUTS=['Nil','Flatus present','Bilious effluent','Liquid stools','Semi-formed stools','Blood','Hemoserous fluid'];
  let draft=null,baseline=null,host=null;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=x=>JSON.parse(JSON.stringify(x));
  const list=x=>Array.isArray(x)?x:[];
  const colours=()=>window.JasonEncounters?.colours||FALLBACK_COLOURS;
  const outputs=()=>window.JasonEncounters?.outputs||FALLBACK_OUTPUTS;
  const today=()=>typeof TODAY==='string'?TODAY:new Date().toISOString().slice(0,10);
  const enabled=()=>typeof isEncounterUser==='function'&&isEncounterUser();
  const titleCase=x=>String(x||'Stoma').replace(/(^|[\s\-\/(])([a-z])/g,(m,a,b)=>a+b.toUpperCase());
  function nameOf(s,all){
    if(window.JasonEncounters?.stomaName)return window.JasonEncounters.stomaName(s,all);
    const t=titleCase(s?.type),twins=list(all).filter(x=>titleCase(x.type)===t);
    return twins.length>1?t+' ('+(twins.indexOf(s)+1)+')':t;
  }
  function saved(appt){let v=appt?.stoma_assessment;if(typeof v==='string'){try{v=JSON.parse(v);}catch(_){v=null;}}return list(v);}
  function seed(appt,p){
    const date=String(appt?.appt_date||today()).slice(0,10);
    let present=[];
    try{present=stomasPresentOn(p,date).filter(s=>!s.ended||String(s.ended)>date);}catch(_){}
    const prior=saved(appt);
    // Stomas recorded on the visit before stay, even if the stoma list changed since.
    prior.forEach(x=>{if(x?.uid&&!present.some(s=>s.uid===x.uid))present.push({uid:x.uid,type:x.type});});
    const loops=present.filter(x=>typeof stomaTypeCanHaveRod==='function'&&stomaTypeCanHaveRod(x.typeLabel||x.type));
    return present.map(s=>{
      const was=prior.find(x=>x.uid===s.uid)||{};
      const own=p?.rod_stoma_uid===s.uid||(!p?.rod_stoma_uid&&(present.length===1||(loops.length===1&&loops[0].uid===s.uid)));
      const rod=was.rod||{status:own?(p.rod_removed_date?'Removed':p.rod_removal_date?'In place':'Not recorded'):'Not recorded',
        due:own?(p.rod_removal_date||''):'',removed:own?(p.rod_removed_date||''):''};
      return {uid:s.uid,type:s.typeLabel||s.type||was.type||'Stoma',colour:was.colour||'',output:list(was.output),rod:copy(rod),notes:was.notes||''};
    });
  }
  function mount(el,{appt,patient,resume}={}){
    host=el||null;if(!host)return;
    if(!enabled()){host.innerHTML='';return;}
    // Returning from the appliance picker rebuilds the modal; keep what was typed.
    if(!(resume&&draft&&draft.apptId===String(appt?.id))){
      draft={apptId:String(appt?.id||''),patientId:String(patient?.id||''),stomas:seed(appt,patient)};
      baseline=copy(draft);
    }
    if(!host.dataset.vsrBound){host.dataset.vsrBound='1';host.addEventListener('change',change);host.addEventListener('input',input);}
    render();
  }
  function field(label,inner){return '<div class="jenc-field"><label>'+esc(label)+'</label>'+inner+'</div>';}
  function columnHTML(s,all){
    const ref=' data-uid="'+esc(s.uid)+'"';
    const colour='<select data-vsr="colour"'+ref+' aria-label="Colour / appearance"><option value="">— not recorded —</option>'+
      [...new Set(colours().concat(s.colour?[s.colour]:[]))].map(c=>'<option value="'+esc(c)+'"'+(c===s.colour?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select>';
    const out=list(s.output),choices=[...new Set(outputs().concat(out))];
    const output='<details class="jenc-multi"><summary>'+(out.length?esc(out.join(', ')):'— not recorded —')+'</summary><div class="jenc-menu">'+
      choices.map(v=>'<label><input type="checkbox" data-vsr="output"'+ref+' value="'+esc(v)+'"'+(out.includes(v)?' checked':'')+'>'+esc(v)+'</label>').join('')+'</div></details>';
    const r=s.rod||{},on=r.status==='In place',was=baseline?.stomas?.find(x=>x.uid===s.uid)?.rod||{};
    let rod='<div class="jenc-rod"><label class="jenc-check"><input type="checkbox" data-vsr="rod"'+ref+(on?' checked':'')+'> Rod present</label>';
    if(on)rod+=field('Planned removal date *','<input type="date" data-vsr="rod-due"'+ref+' value="'+esc(r.due||'')+'">');
    else if(r.status==='Removed'&&was.status==='In place')rod+=field('Rod removed on','<input type="date" data-vsr="rod-removed"'+ref+' value="'+esc(r.removed||today())+'" max="'+esc(today())+'">');
    else if(r.status==='Removed')rod+='<div class="jenc-meta">Rod removed'+(r.removed?' '+esc(r.removed):'')+'.</div>';
    rod+='</div>';
    const notes=field(nameOf(s,all)+' — clinical notes','<textarea data-vsr="notes"'+ref+' rows="3" placeholder="Write your observations, care provided or patient concerns…">'+esc(s.notes||'')+'</textarea>');
    return '<div class="jenc-stoma-col"><h4 class="jenc-stoma-title">'+esc(nameOf(s,all))+'</h4><div class="jenc-fields">'+field('Colour / appearance',colour)+field('Function / output',output)+'</div>'+rod+notes+'</div>';
  }
  function render(){
    if(!host||!draft)return;
    const all=draft.stomas;
    host.innerHTML='<div class="edit-seen-section">Stoma assessment</div>'+(all.length
      ?'<div class="jenc-stoma-grid vsr-grid" style="--jenc-cols:'+Math.min(all.length,3)+'">'+all.map(s=>columnHTML(s,all)).join('')+'</div>'
      :'<div class="report-note">No stoma is recorded for this patient. Add it in the patient record to assess it here.</div>')+
      '<div id="vsr-error" class="registry-lookup-note error" hidden style="margin-top:8px;"></div>';
  }
  function find(el){return draft?.stomas.find(s=>s.uid===el.dataset.uid);}
  function change(e){
    const el=e.target,kind=el.dataset?.vsr,s=kind&&find(el);if(!s)return;
    if(kind==='colour')s.colour=el.value;
    else if(kind==='output'){
      let v=list(s.output).filter(x=>x!==el.value);if(el.checked)v.push(el.value);
      s.output=el.checked&&el.value==='Nil'?['Nil']:v.filter(x=>x!=='Nil');
    }else if(kind==='rod'){
      const was=baseline?.stomas?.find(x=>x.uid===s.uid)?.rod||{};
      if(el.checked)s.rod={status:'In place',due:s.rod?.due||(was.status==='In place'?was.due:'')||'',removed:''};
      else if(was.status==='In place')s.rod={status:'Removed',due:was.due||'',removed:today()};
      else s.rod=was.status==='Removed'?copy(was):{status:'Not recorded',due:'',removed:''};
    }else if(kind==='rod-due')s.rod.due=el.value;
    else if(kind==='rod-removed')s.rod.removed=el.value;
    else return;
    const reopen=kind==='output';render();
    if(reopen){const next=[...host.querySelectorAll('[data-vsr="output"]')].find(x=>x.dataset.uid===s.uid);if(next)next.closest('details').open=true;}
  }
  function input(e){const el=e.target;if(el.dataset?.vsr!=='notes')return;const s=find(el);if(s)s.notes=el.value;}
  // Called before leaving Clinical review: a ticked rod needs its removal date.
  function validate(){
    if(!enabled()||!draft||!host?.isConnected)return true;
    const missing=draft.stomas.filter(s=>s.rod?.status==='In place'&&!s.rod.due);
    const err=host.querySelector('#vsr-error');
    if(missing.length){if(err){err.hidden=false;err.textContent='Choose the planned rod removal date for '+missing.map(s=>nameOf(s,draft.stomas)).join(', ')+'.';}return false;}
    if(err)err.hidden=true;return true;
  }
  function payloadFor(apptId){
    if(!enabled()||!draft||draft.apptId!==String(apptId))return null;
    return draft.stomas.map(s=>({uid:s.uid,type:s.type,name:nameOf(s,draft.stomas),colour:s.colour,output:list(s.output),rod:copy(s.rod||{}),notes:String(s.notes||'')}));
  }
  // The patient's rod fields, when a rod was ticked, unticked or re-dated here.
  function rodPatchFor(apptId,patient){
    if(!payloadFor(apptId))return null;
    const changed=draft.stomas.filter(s=>JSON.stringify(s.rod)!==JSON.stringify(baseline?.stomas?.find(b=>b.uid===s.uid)?.rod));
    if(!changed.length)return null;
    const inPlace=draft.stomas.filter(s=>s.rod?.status==='In place').sort((a,b)=>String(a.rod.due).localeCompare(String(b.rod.due)));
    const r=inPlace[0]||changed[0];
    return {rod_stoma_uid:r.uid,rod_removal_date:r.rod.due||null,rod_removed_date:r.rod.status==='Removed'?(r.rod.removed||today()):null};
  }
  function summaryLines(rows){
    return list(rows).map(s=>{
      const parts=[];
      if(s.colour)parts.push('colour: '+String(s.colour).toLowerCase());
      if(list(s.output).length)parts.push('output: '+s.output.join(', '));
      if(s.rod?.status==='In place')parts.push('rod present'+(s.rod.due?' (removal '+s.rod.due+')':''));
      if(s.rod?.status==='Removed')parts.push('rod removed'+(s.rod.removed?' '+s.rod.removed:''));
      if(String(s.notes||'').trim())parts.push('notes: '+String(s.notes).trim());
      return {name:s.name||titleCase(s.type),text:parts.join('; ')||'No assessment recorded'};
    });
  }
  function clear(){draft=null;baseline=null;}
  window.VisitStomaReview={enabled,mount,validate,payloadFor,rodPatchFor,summaryLines,clear,get state(){return draft;}};
})();
