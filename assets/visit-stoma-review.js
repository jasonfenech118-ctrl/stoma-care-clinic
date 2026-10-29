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
    const box=document.getElementById('mb2');box.className='mb';
    box.innerHTML='<h2>Complication bible</h2><p>Save a term for all stoma types. It will be underlined automatically when written in a clinical review.</p><label for="vsr-bible-term">Complication term</label><input id="vsr-bible-term" type="text" maxlength="150" placeholder="Write a complication term"><p id="vsr-bible-message" role="status"></p><div class="mact"><button type="button" class="btn-cancel" id="vsr-bible-close">Close</button><button type="button" class="btn-save" id="vsr-bible-save">Save term</button></div>';
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
