(function(global){
  'use strict';
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const PAGE_SIZE=100,READ_SIZE=200;
  const state={selected:new Set(),source:[],rows:[],year:'all',month:'all',groupBy:'month',page:0,busy:false,active:false,contextKey:null,message:'',error:false};
  let config={};
  const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const name=p=>`${p.first_name||''} ${p.surname||''}`.trim()||'Unnamed patient';
  const deceased=p=>config.isDeceased(p);
  function deathDate(p){
    const value=String(p.deceased_date||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
    const date=new Date(value+'T12:00:00Z');
    return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value?value:'';
  }
  function groupKey(p){const date=deathDate(p);return date?date.slice(0,state.groupBy==='year'?4:7):'unknown';}
  function groupLabel(key){return key==='unknown'?'Date of death not recorded':key.length===4?key:MONTHS[Number(key.slice(5))-1]+' '+key.slice(0,4);}
  function sortRows(rows){
    return rows.slice().sort((a,b)=>{
        const ak=groupKey(a),bk=groupKey(b);
        return (ak===bk?0:ak==='unknown'?1:bk==='unknown'?-1:bk.localeCompare(ak))
          ||String(a.surname||'').localeCompare(String(b.surname||''))||String(a.first_name||'').localeCompare(String(b.first_name||''))||String(a.id).localeCompare(String(b.id));
      });
  }
  function filterRows(rows){
    return sortRows(rows.filter(p=>deceased(p)&&
      (state.year==='all'||(state.year==='unknown'?!deathDate(p):deathDate(p).slice(0,4)===state.year))&&
      (state.month==='all'||(state.month==='unknown'?!deathDate(p):deathDate(p).slice(5,7)===state.month))));
  }
  function groups(rows){
    const result=new Map();
    rows.forEach(p=>{const key=groupKey(p);if(!result.has(key))result.set(key,[]);result.get(key).push(p);});
    return result;
  }
  function configure(options){config=options;}
  function hide(){
    state.active=false;state.contextKey=null;
    const host=document.getElementById('pd-deceased-controls');if(host)host.hidden=true;
    const table=document.getElementById('pd-table');if(table)table.classList.remove('pd-deceased-table');
    const body=document.getElementById('pd-tbody');if(body){body.onclick=null;body.onchange=null;}
    state.selected.clear();state.message='';
  }
  function setFilter(key,value){
    if(state.busy)return;
    state[key]=value;state.page=0;state.message='';
    if(key==='year'&&value==='unknown')state.month='all';
    if(key==='month'&&value==='unknown')state.year='all';
    config.rerender();
  }
  function selectRows(rows,checked){rows.forEach(p=>checked?state.selected.add(String(p.id)):state.selected.delete(String(p.id)));}
  function selectedRows(){return state.rows.filter(p=>state.selected.has(String(p.id)));}
  function selectionState(rows){const n=rows.filter(p=>state.selected.has(String(p.id))).length;return {checked:!!rows.length&&n===rows.length,mixed:n>0&&n<rows.length};}
  function redraw(){if(state.active)render(state.source);}
  function notice(message,error=false){state.message=message;state.error=error;redraw();}
  function toolbar(){
    const host=document.getElementById('pd-deceased-controls');if(!host)return;
    host.hidden=false;
    const years=[...new Set(state.source.map(deathDate).filter(Boolean).map(d=>d.slice(0,4)))].sort().reverse();
    if(state.year!=='all'&&state.year!=='unknown'&&!years.includes(state.year))years.push(state.year);
    const option=(value,label,chosen)=>`<option value="${esc(value)}"${value===chosen?' selected':''}>${esc(label)}</option>`;
    host.innerHTML=`<div class="pd-deceased-filters">
      <label>Year of death <select data-filter="year"${state.busy?' disabled':''}>${option('all','All years',state.year)}${years.map(y=>option(y,y,state.year)).join('')}${option('unknown','Date not recorded',state.year)}</select></label>
      <label>Month of death <select data-filter="month"${state.busy?' disabled':''}>${option('all','All months',state.month)}${MONTHS.map((m,i)=>option(String(i+1).padStart(2,'0'),m,state.month)).join('')}${option('unknown','Date not recorded',state.month)}</select></label>
      <label>Group by <select data-filter="groupBy"${state.busy?' disabled':''}>${option('month','Month',state.groupBy)}${option('year','Year',state.groupBy)}</select></label>
    </div><div class="pd-deceased-actions">
      <label class="pd-deceased-select-all"><input type="checkbox" data-action="all"${!state.rows.length||state.busy?' disabled':''}> Select all filtered patients</label>
      <span class="pd-deceased-selected" aria-live="polite">${state.selected.size} selected · ${state.rows.length} deceased patient${state.rows.length===1?'':'s'}</span>
      <button type="button" class="ncb-btn" data-action="clear"${!state.selected.size||state.busy?' disabled':''}>Clear selection</button>
      <button type="button" class="ncb-btn pd-deceased-export" data-action="export"${!state.selected.size||state.busy?' disabled':''}>Save selected as HTML</button>
      <button type="button" class="ncb-btn pd-deceased-minimise" data-action="minimise"${!state.selected.size||state.busy?' disabled':''}>Minimise stored data</button>
    </div><p class="pd-deceased-help">Select patients on the left, a whole ${state.groupBy}, or all filtered patients across every page. HTML saves their records and available siting photographs. Minimising saves a compact summary and removes the stored siting photographs.</p>
    <div class="pd-deceased-message${state.error?' error':''}" role="status" aria-live="polite">${esc(state.message)}</div>`;
    const all=host.querySelector('[data-action="all"]'),sel=selectionState(state.rows);all.checked=sel.checked;all.indeterminate=sel.mixed;
    host.onchange=e=>{if(e.target.dataset.filter)setFilter(e.target.dataset.filter,e.target.value);else if(e.target.dataset.action==='all'&&!state.busy){selectRows(state.rows,e.target.checked);redraw();}};
    host.onclick=e=>{const action=e.target.closest('button')?.dataset.action;if(!action||state.busy)return;
      if(action==='clear'){state.selected.clear();redraw();}else if(action==='export')exportSelected();else if(action==='minimise')minimiseSelected();};
  }
  function render(rows,contextKey){
    state.active=true;
    if(contextKey!==undefined&&contextKey!==state.contextKey){state.page=0;state.contextKey=contextKey;}
    const focused=document.activeElement;
    const focusKey=['filter','action','select','group'].find(key=>focused?.dataset?.[key]);
    const focusValue=focusKey?focused.dataset[focusKey]:null;
    state.source=rows;
    // Build the filters first, as a refreshed owner/search view may have lost a year.
    toolbar();state.rows=filterRows(rows);
    const eligible=new Set(state.rows.map(p=>String(p.id)));
    for(const id of state.selected)if(!eligible.has(id))state.selected.delete(id);
    config.onFilteredCount?.(state.rows.length);
    state.page=Math.min(state.page,Math.max(0,Math.ceil(state.rows.length/PAGE_SIZE)-1));
    toolbar();
    const table=document.getElementById('pd-table'),body=document.getElementById('pd-tbody');if(!table||!body)return;
    table.classList.add('pd-deceased-table');
    table.querySelector('thead tr').innerHTML='<th class="pd-deceased-checkbox">Select</th><th>Patient</th><th>ID Card</th><th>Date of death</th><th>Date of Birth</th><th>Surgery Date</th><th>Stoma Type</th><th>Operation Performed</th><th>Findings</th><th>Actions</th>';
    const allGroups=groups(state.rows),pageRows=state.rows.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE);
    const cell=(v,n)=>{const text=String(v||'').trim();return text?`<span class="pd-text" title="${esc(text)}">${esc(n&&text.length>n?text.slice(0,n-1)+'…':text)}</span>`:'<span class="pd-dash">—</span>';};
    const dateCell=v=>cell(v?config.formatDate(v):'');
    body.innerHTML=[...groups(pageRows)].map(([key,patients])=>`<tr class="pd-deceased-group"><td class="pd-deceased-checkbox"><input type="checkbox" data-group="${esc(key)}" aria-label="Select ${esc(groupLabel(key))}"${state.busy?' disabled':''}></td><th colspan="9" scope="rowgroup">${esc(groupLabel(key))}<span>${allGroups.get(key).length} patient${allGroups.get(key).length===1?'':'s'}${allGroups.get(key).length!==patients.length?' · continued across pages':''}</span></th></tr>`+patients.map(p=>`<tr class="pd-click-row pd-row-deceased pd-row-complete${p.archived?' pd-row-archived':''}" data-patient="${esc(p.id)}" title="Click to open patient card">
      <td class="pd-deceased-checkbox"><input type="checkbox" data-select="${esc(p.id)}" aria-label="Select ${esc(name(p))}"${state.selected.has(String(p.id))?' checked':''}${state.busy?' disabled':''}></td>
      <td>${config.avatar(p,name(p))}</td><td class="pd-deceased-id">${cell(p.id_card)}</td><td>${dateCell(deathDate(p))}</td><td>${dateCell(p.date_of_birth)}</td><td>${dateCell(config.surgeryDate(p))}</td><td>${cell(config.stomaType(p),28)}</td><td>${cell(p.procedure_performed,32)}</td><td>${cell(p.findings,40)}</td>
      <td><div class="pd-actions"><button type="button" class="ncb-btn" data-action="history">History</button>${p.minimised_at?'<span class="pd-deceased-done">✓ Minimised</span><button type="button" class="ncb-btn" data-action="summary">View saved summary</button>':`<button type="button" class="ncb-btn pd-deceased-minimise" data-action="minimise-one"${state.busy?' disabled':''}>Minimise stored data</button>`}${p.archived?'<button type="button" class="ncb-btn" data-action="restore">Restore</button>':''}</div></td></tr>`).join('')).join('')||'<tr><td colspan="10" class="empty">No deceased patients match these filters.</td></tr>';
    body.querySelectorAll('[data-group]').forEach(input=>{const sel=selectionState(allGroups.get(input.dataset.group)||[]);input.checked=sel.checked;input.indeterminate=sel.mixed;});
    body.onchange=e=>{if(state.busy)return;const target=e.target;
      if(target.dataset.group)selectRows(allGroups.get(target.dataset.group)||[],target.checked);
      else if(target.dataset.select){const p=state.rows.find(p=>String(p.id)===target.dataset.select);if(p)selectRows([p],target.checked);}
      else return;redraw();};
    body.onclick=e=>{
      if(e.target.closest('.pd-deceased-checkbox')){e.stopPropagation();return;}
      const row=e.target.closest('[data-patient]');if(!row)return;
      const id=row.dataset.patient,p=state.rows.find(p=>String(p.id)===id),action=e.target.closest('button')?.dataset.action;
      if(action){e.stopPropagation();if(action==='history')config.openHistory(id);else if(action==='summary')viewSummary(id);else if(action==='minimise-one'&&!state.busy)minimiseOne(id);else if(action==='restore')config.restore(id,name(p));}
      else config.openPatient(id);
    };
    config.pager(state.rows.length,PAGE_SIZE,state.page,d=>{if(!state.busy){state.page+=d;redraw();}});
    if(focusKey){const next=[...document.querySelectorAll('[data-'+focusKey+']')].find(el=>el.dataset[focusKey]===focusValue&&!el.disabled);next?.focus({preventScroll:true});}
  }
  function missingTable(error){return error?.code==='42P01'||error?.code==='PGRST205';}
  async function readRows(table,filter,options={}){
    const result=[];let start=0;
    for(;;){
      let query=config.db().from(table).select(options.columns||'*');query=filter(query);
      const {data,error}=await query.order(options.order||'id',{ascending:true}).range(start,start+READ_SIZE-1);
      if(error){if(options.optional&&missingTable(error))return {rows:[],unavailable:true};throw new Error(`Could not read ${options.label||table}: ${error.message||error.code}`);}
      result.push(...(data||[]));if((data||[]).length<READ_SIZE)break;start+=READ_SIZE;
    }
    return {rows:result,unavailable:false};
  }
  async function readLinked(table,column,ids,options={}){
    const rows=[];
    for(let i=0;i<ids.length;i+=100){const part=await readRows(table,q=>q.in(column,ids.slice(i,i+100)),options);if(part.unavailable)return part;rows.push(...part.rows);}
    return {rows,unavailable:false};
  }
  async function loadBundle(patientId,photos=true){
    const {data:patient,error}=await config.db().from('patients').select('*').eq('id',patientId).maybeSingle();
    if(error||!patient)throw new Error('Could not read the selected patient record. '+(error?.message||'Refresh the registry and try again.'));
    if(!deceased(patient))throw new Error('A selected patient is no longer deceased. Refresh the registry before continuing.');
    const tables=[['appointments','Appointments'],['clinical_records','Clinical records'],['encounters','Encounters'],['patient_communications','Community and patient communications']];
    const parts=await Promise.allSettled(tables.map(([table,label])=>readRows(table,q=>q.eq('patient_id',patientId),{label,optional:true})));
    const sections=[];
    parts.forEach((part,i)=>{if(part.status==='rejected')throw part.reason;sections.push({key:tables[i][0],label:tables[i][1],...part.value});});
    const sitings=await readRows('siting_sessions',q=>q.eq('patient_id',patientId),{label:'Siting sessions',optional:photos});
    const byCard=patient.id_card?await readRows('siting_sessions',q=>q.eq('id_card',patient.id_card),{label:'Siting sessions',optional:photos}):{rows:[]};
    // A legacy siting may have no registry link. Never take a session explicitly
    // linked to a different patient just because an ID-card value happens to match.
    const sessions=[...new Map([...sitings.rows,...byCard.rows.filter(r=>!r.patient_id||String(r.patient_id)===String(patientId))].map(r=>[String(r.id),r])).values()];
    sections.push({key:'siting_sessions',label:'Siting sessions and assessments',rows:sessions,unavailable:sitings.unavailable||byCard.unavailable});
    const ids=sessions.map(r=>String(r.id));
    const images=await readLinked('siting_images','siting_id',ids,{columns:photos?'*':'siting_id',order:'siting_id',label:'Siting photographs',optional:photos});
    if(photos){
      sections.push({key:'siting_images',label:'Siting photographs',...images});
      sections.push({key:'operations_no_stoma',label:'Operations without a stoma',...await readLinked('operations_no_stoma','siting_session_id',ids,{label:'Operations without a stoma',optional:true})});
    }
    return {patient,sections,photoIds:images.rows.map(r=>String(r.siting_id))};
  }
  function label(key){return ({id:'Record ID',id_card:'ID card',date_of_birth:'Date of birth',deceased_date:'Date of death',minimised_at:'Stored data minimised on',image_data:'Siting photograph'})[key]||key.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());}
  function valueHTML(value,key){
    if(value==null||value==='')return '<em>Not recorded</em>';
    if(key==='image_data')return /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(String(value))?`<img class="siting-photo" src="${esc(value)}" alt="Stored stoma-siting photograph">`:'<p>Photograph could not be displayed.</p><pre>'+esc(value)+'</pre>';
    if(typeof value==='string'&&/^[\[{]/.test(value.trim())){try{return valueHTML(JSON.parse(value),key);}catch(e){}}
    if(Array.isArray(value))return value.length?'<ol>'+value.map(v=>'<li>'+valueHTML(v,'')+'</li>').join('')+'</ol>':'<em>None recorded</em>';
    if(typeof value==='object')return recordHTML(value);
    return typeof value==='boolean'?(value?'Yes':'No'):'<span class="record-value">'+esc(value)+'</span>';
  }
  function recordHTML(record){return '<dl>'+Object.entries(record).map(([key,value])=>`<div><dt>${esc(label(key))}</dt><dd>${key==='minimised_archive'&&value?'<details><summary>Saved compact summary</summary><pre>'+esc(value)+'</pre></details>':valueHTML(value,key)}</dd></div>`).join('')+'</dl>';}
  function archiveHTML(bundles){
    const sorted=sortRows(bundles.map(b=>b.patient)),byId=new Map(bundles.map(b=>[String(b.patient.id),b]));
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Deceased patient records</title><style>
      body{font:14px/1.6 system-ui,Arial,sans-serif;color:#172b42;background:#f4f6f8;margin:0;padding:28px}main{max-width:1100px;margin:auto}h1{margin:0}h2{margin-top:32px;border-bottom:2px solid #334155;padding-bottom:8px}h3{font-size:20px}h4{font-size:15px;margin-bottom:8px}.meta{color:#526175}.patient{background:#fff;border:1px solid #dce2e8;border-radius:10px;padding:22px;margin:20px 0;break-before:page}.record{border-top:1px solid #dce2e8;padding:10px 0}dl{margin:0}dl>div{display:grid;grid-template-columns:210px 1fr;gap:12px;padding:6px 0;border-bottom:1px solid #edf0f3}dt{font-weight:600;color:#526175}dd{margin:0;min-width:0;overflow-wrap:anywhere}.record-value,pre{white-space:pre-wrap}pre{font:12px/1.5 monospace;overflow-wrap:anywhere}.siting-photo{max-width:100%;max-height:650px}em{color:#7a8491}ol{padding-left:20px}a{color:#0d7377}@media(max-width:650px){body{padding:14px}dl>div{grid-template-columns:1fr;gap:2px}.patient{padding:14px}}@media print{body{background:#fff;padding:0}.patient{border:0;padding:0}.siting-photo{max-height:500px}}
      </style></head><body><main><h1>Deceased patient records</h1><p class="meta">${bundles.length} selected patient${bundles.length===1?'':'s'} · Saved ${esc(new Date().toLocaleString('en-GB'))} · Grouped by date of death</p><p>This file contains the selected records and available siting photographs at the time of export.</p><nav aria-label="Selected patients">${sorted.map(p=>`<a href="#patient-${esc(p.id)}">${esc(name(p))} (${esc(p.id_card||'ID not recorded')})</a>`).join(' · ')}</nav>
      ${[...groups(sorted)].map(([key,patients])=>`<h2>${esc(groupLabel(key))}</h2>`+patients.map(p=>{const bundle=byId.get(String(p.id));return `<article class="patient" id="patient-${esc(p.id)}"><h3>${esc(name(p))}</h3><p class="meta">${esc(p.id_card||'ID not recorded')} · ${deathDate(p)?'Deceased '+esc(config.formatDate(deathDate(p))):'Date of death not recorded'}</p><h4>Patient details and stoma history</h4>${recordHTML(p)}${bundle.sections.map(section=>`<section><h4>${esc(section.label)} (${section.rows.length})</h4>${section.unavailable?'<p>This section was not available in the database at the time of export.</p>':section.rows.length?section.rows.map((record,i)=>`<div class="record"><b>Record ${i+1}</b>${recordHTML(record)}</div>`).join(''):'<p><em>None recorded.</em></p>'}</section>`).join('')}</article>`;}).join('')).join('')}
      </main></body></html>`;
  }
  function download(html,filename){
    const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();global.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function exportSelected(){
    if(state.busy)return;
    const patients=selectedRows().slice();if(!patients.length)return;
    state.busy=true;notice(`Preparing ${patients.length} selected patient record${patients.length===1?'':'s'}…`);
    try{
      const bundles=[];
      for(const p of patients){bundles.push(await loadBundle(p.id));notice(`Preparing HTML · ${bundles.length} of ${patients.length} patients`);}
      (config.download||download)(archiveHTML(bundles),'deceased-patients-'+new Date().toISOString().slice(0,10)+'.html');
      notice(`Saved ${bundles.length} selected patient record${bundles.length===1?'':'s'} as HTML.`);
    }catch(error){notice('HTML was not saved. '+error.message,true);}
    finally{state.busy=false;redraw();}
  }
  async function minimiseBundle(bundle,who){
    const {patient:pat,photoIds,sections}=bundle,id=String(pat.id),db=config.db();
    // Re-read after confirmation; a corrected outcome must not be minimised.
    const {data:fresh,error:readError}=await db.from('patients').select('*').eq('id',id).maybeSingle();
    if(readError||!fresh||!deceased(fresh))throw new Error('The patient record changed or could not be verified. Refresh and try again.');
    if(pat.updated_at&&fresh.updated_at!==pat.updated_at)throw new Error('The patient record changed. Refresh and try again.');
    if(fresh.minimised_at&&!photoIds.length){config.onMinimised?.(fresh);return 0;}
    const count=key=>sections.find(s=>s.key===key)?.rows.length||0;
    const summary=fresh.minimised_archive&&!photoIds.length?fresh.minimised_archive:config.summary(fresh,{photoCount:photoIds.length,apptCount:count('appointments'),encounterCount:count('encounters'),episodeCount:sections.find(s=>s.key==='clinical_records')?.rows.filter(r=>r.kind==='episode').length||0,generatedBy:who});
    // Include every required column before removing photographs. Completion is
    // stamped only after deletion succeeds, so a failure can be retried.
    let save=db.from('patients').update({minimised_archive:summary,minimised_by:who,minimised_at:null}).eq('id',id);
    if(fresh.updated_at)save=save.eq('updated_at',fresh.updated_at);
    const {data:saved,error:saveError}=await save.select('id,minimised_archive').maybeSingle();
    if(saveError||!saved?.minimised_archive)throw new Error('Could not save the compact summary. '+(saveError?.message||'The record changed; refresh and try again.')+' Nothing was removed. If the minimised columns are missing, run sql/add-deceased-minimise.sql.');
    let removed=0;
    const stamp=new Date().toISOString();
    try{
      for(let i=0;i<photoIds.length;i+=100){
        const batch=photoIds.slice(i,i+100),{data:deleted,error:deleteError}=await db.from('siting_images').delete().in('siting_id',batch).select('siting_id');
        removed+=(deleted||[]).length;
        if(deleteError||(deleted||[]).length!==batch.length)throw new Error('The compact summary was saved, but not all siting photographs could be removed. '+(deleteError?.message||'Refresh and retry this patient.'));
      }
      const {data:stamped,error:stampError}=await db.from('patients').update({minimised_at:stamp,minimised_by:who}).eq('id',id).select('id,minimised_at').maybeSingle();
      if(stampError||!stamped?.minimised_at)throw new Error('The photographs were removed and the summary saved, but the completion date could not be saved. Refresh and retry this patient.');
    }catch(error){
      if(removed)await config.audit({action:'update',entity:'patient',entity_id:id,patient_id:id,patient_name:name(pat),summary:`Deceased record minimisation needs retry — removed ${removed} siting photographs; compact summary saved`,details:{removed_photos:removed,completed:false}});
      throw error;
    }
    config.onMinimised?.({...fresh,minimised_archive:summary,minimised_by:who,minimised_at:stamp});
    await config.audit({action:'update',entity:'patient',entity_id:id,patient_id:id,patient_name:name(pat),summary:`Minimised deceased record — removed ${removed} siting photograph${removed===1?'':'s'} to free space`,details:{removed_photos:removed}});
    return removed;
  }
  async function minimisePatients(patients){
    if(state.busy||!patients.length)return;
    state.busy=true;notice('Checking selected deceased records and stored photographs…');
    let completed=0,removed=0,failed=[];
    try{
      const bundles=[];
      for(const p of patients)bundles.push(await loadBundle(p.id,false));
      const n=bundles.reduce((sum,b)=>sum+b.photoIds.length,0);
      if(!global.confirm(`Minimise stored data for ${bundles.length} selected deceased patient${bundles.length===1?'':'s'}?\n\nThis permanently removes ${n} stored stoma-siting photograph${n===1?'':'s'}. A compact summary is saved for each patient first. Their clinical records are kept.\n\nSave selected as HTML first if you want a copy of the photographs. Photograph removal cannot be undone.`)){notice('Minimisation cancelled.');return;}
      const who=await config.auditName();
      for(const bundle of bundles){
        try{removed+=await minimiseBundle(bundle,who);completed++;state.selected.delete(String(bundle.patient.id));}
        catch(error){failed.push(name(bundle.patient)+': '+error.message);}
        notice(`Minimising stored data · ${completed+failed.length} of ${bundles.length} patients`);
      }
      await config.refresh();
      notice(`${completed} patient${completed===1?'':'s'} minimised.`+(failed.length?' '+failed.length+' could not be completed. '+failed.join(' '):` ${removed} photograph${removed===1?'':'s'} removed.`),!!failed.length);
    }catch(error){notice('Minimisation did not start. '+error.message,true);}
    finally{state.busy=false;redraw();}
  }
  function minimiseSelected(){return minimisePatients(selectedRows().slice());}
  function minimiseOne(id){const p=state.rows.find(p=>String(p.id)===String(id));return p?minimisePatients([p]):Promise.resolve();}
  async function viewSummary(id){
    const target=config.download?null:global.open('','_blank');
    if(!config.download&&!target){const message='Please allow pop-ups to view the saved summary.';if(state.active)notice(message,true);else global.alert(message);return;}
    if(target){target.opener=null;target.document.body.textContent='Loading saved summary…';}
    try{
      const {data,error}=await config.db().from('patients').select('minimised_archive').eq('id',id).maybeSingle();
      if(error||!data?.minimised_archive)throw new Error('The saved summary could not be loaded.');
      if(config.download){config.download(data.minimised_archive,'deceased-patient-summary.html');return;}
      const safe=data.minimised_archive.replace(/<head>/i,'<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">');
      const url=URL.createObjectURL(new Blob([safe],{type:'text/html;charset=utf-8'}));target.location.replace(url);global.setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){if(target)target.close();if(state.active)notice(error.message,true);else global.alert(error.message);}
  }
  global.DeceasedRegistry={configure,render,hide,exportSelected,minimiseSelected,minimiseOne,viewSummary};
})(window);
