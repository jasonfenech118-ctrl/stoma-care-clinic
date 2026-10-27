/* One current directory only. Workbook bytes stay in memory and are never uploaded. */
window.SurgicalRotation=(()=>{
  let db,reader,current=null,pending=null,busy=false,loaded=false;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  function parse(rows,merges=[]){
    const header=rows.findIndex(row=>row.some(v=>/^consultants?$/i.test(clean(v)))&&row.some(v=>/^FYs?$/i.test(clean(v))));
    if(header<0)throw Error('Expected the rotation columns: Consultants, Resident Specialist, HSTs, BSTs and FYs.');
    const columns=rows[header].slice(0,5).map(clean);
    if(columns.length!==5||!/^consultants?$/i.test(columns[0])||!/^resident specialist/i.test(columns[1])||!/^HSTs?$/i.test(columns[2])||!/^BSTs?$/i.test(columns[3])||!/^FYs?$/i.test(columns[4]))throw Error('The five rotation columns have changed. Keep the original column order.');
    const sections=[];let section;
    for(let r=header+1;r<rows.length;r++){
      const row=Array.from({length:5},(_,c)=>clean(rows[r]?.[c]));
      if(!row.some(Boolean))continue;
      if(/secretary|coordinator/i.test(row[0])||/^HDU\s*\/\s*ITU/i.test(row[0])){
        section={name:row[0].replace(/\s*(secretary.*|coordinator.*)$/i,'').trim()||row[0],contact:row.slice(1).filter(Boolean).join(' · '),rows:[]};
        sections.push(section);continue;
      }
      // Excel vertical merges explicitly indicate doctors shared by several teams.
      for(let c=0;c<5;c++)if(!row[c]){
        const m=merges.find(m=>m.s.c===c&&m.e.c===c&&m.s.r<r&&m.e.r>=r&&m.s.r>header);
        if(m)row[c]=clean(rows[m.s.r]?.[c]);
      }
      if(!section){section={name:'Surgery',contact:'',rows:[]};sections.push(section);}
      section.rows.push(row);
    }
    const count=sections.reduce((n,s)=>n+s.rows.length,0);
    if(!count||!sections.some(s=>s.rows.some(row=>row.some(v=>/\d{4,}/.test(v)))))throw Error('No rotation teams with contact numbers were found.');
    if(count>1000)throw Error('This sheet has too many rotation rows.');
    return {title:rows.slice(0,header).flat().map(clean).filter(Boolean).join(' · ')||'Surgical Rotation',columns,sections};
  }
  function message(text,error=false){$('sr-status').textContent=text;$('sr-status').style.color=error?'#b91c1c':'#475569';}
  function draw(){
    const data=current?.data,q=clean($('sr-search').value).toLowerCase();
    $('sr-meta').textContent=current?'Updated '+new Date(current.updated_at).toLocaleString('en-GB',{timeZone:'Europe/Malta'})+(current.updated_by?' · '+current.updated_by:''):'';
    if(!data){$('sr-list').innerHTML='<p>No surgical rotation has been uploaded yet.</p>';return;}
    let shown=0;
    $('sr-list').innerHTML='<h3>'+esc(data.title)+'</h3>'+data.sections.map(s=>{
      const all=clean(s.name+' '+s.contact).toLowerCase().includes(q);
      const rows=s.rows.filter(r=>all||r.join(' ').toLowerCase().includes(q));
      if(!rows.length&&!all)return '';shown+=rows.length;
      return '<section class="sr-section"><h3>'+esc(s.name)+'</h3>'+(s.contact?'<p><b>Secretary / coordinator:</b> '+esc(s.contact)+'</p>':'')+'<div class="sr-scroll"><table><thead><tr>'+data.columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c||'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section>';
    }).join('')+(!shown?'<p>No matching doctors, specialties or numbers.</p>':'');
  }
  async function refresh(){
    if(busy)return;message('Loading current rotation…');
    try{const {data,error}=await db.from('surgical_rotation_current').select('data,updated_at,updated_by,revision').eq('id',1).maybeSingle();if(error)throw error;current=data;loaded=true;draw();message('');}
    catch(e){message('Could not load the current rotation. '+e.message,true);}
  }
  async function receive(file){
    if(!file||busy)return;
    pending=null;$('sr-preview').hidden=true;
    if(!/\.xlsx$/i.test(file.name)){message('Choose an Excel .xlsx file.',true);return;}
    if(file.size>5*1024*1024){message('Choose a file smaller than 5 MB.',true);return;}
    busy=true;message('Checking the Excel file…');
    try{
      const XLSX=await reader(),book=XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:false,cellHTML:false});
      const candidates=[];
      for(const name of book.SheetNames){const sheet=book.Sheets[name];const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:true});if(rows.some(r=>r.some(v=>/^consultants?$/i.test(clean(v)))))candidates.push({rows,merges:sheet['!merges']||[]});}
      if(candidates.length!==1)throw Error('Use a workbook containing exactly one surgical rotation sheet.');
      pending=parse(candidates[0].rows,candidates[0].merges);
      const n=pending.sections.reduce((n,s)=>n+s.rows.length,0);
      $('sr-preview-text').textContent=pending.title+' — '+n+' team rows across '+pending.sections.length+' specialties. Replacing will remove all previous doctors, assignments and numbers.';
      $('sr-preview').hidden=false;message('Check the new rotation below, then select Replace current rotation.');
      $('sr-preview-data').innerHTML=pending.sections.map(s=>'<h4>'+esc(s.name)+'</h4><div class="sr-scroll"><table><thead><tr>'+pending.columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+s.rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c||'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>').join('');
    }catch(e){pending=null;message('File not imported. '+e.message,true);}
    finally{busy=false;$('sr-file').value='';}
  }
  async function replace(){
    if(!pending||busy||!loaded)return;busy=true;$('sr-replace').disabled=true;message('Replacing the current rotation…');
    try{
      const who=await getDischargeSigner();
      const {data,error}=await db.rpc('replace_surgical_rotation',{rotation:pending,expected_revision:current?.revision||0,actor_name:who});
      if(error)throw error;
      current=data;pending=null;$('sr-preview').hidden=true;$('sr-preview-data').innerHTML='';$('sr-search').value='';draw();message('Rotation replaced. Previous doctors and numbers have been removed.');
    }catch(e){message('Not replaced. '+e.message,true);}
    finally{busy=false;$('sr-replace').disabled=false;}
  }
  function cancel(){if(busy)return;pending=null;$('sr-preview').hidden=true;$('sr-preview-data').innerHTML='';message('');}
  function open(context){
    db=context.db;reader=context.readExcel;
    if(!$('sr-file')){
      $('page-surgical-rotation').innerHTML='<div class="sr-shell"><h2>Surgical Rotation</h2><p>Current doctors, team assignments and contact numbers.</p><div id="sr-drop" class="sr-drop"><b>Drop the latest Excel file here</b><p>or <label class="btn-add" for="sr-file" tabindex="0">Choose Excel file</label><input id="sr-file" type="file" accept=".xlsx" aria-label="Upload surgical rotation"></p><small>Each update replaces the complete rotation. Uploaded files and previous versions are not retained by the app.</small></div><p id="sr-status" role="status" aria-live="polite"></p><div id="sr-preview" class="sr-section" hidden><h3>Review replacement</h3><p id="sr-preview-text"></p><div id="sr-preview-data"></div><button id="sr-replace" class="btn-add">Replace current rotation</button> <button id="sr-cancel" class="btn-add">Cancel</button></div><div class="sr-tools"><input id="sr-search" type="search" placeholder="Search doctors, specialty or number…" aria-label="Search surgical rotation"><button id="sr-refresh" class="btn-add">Refresh</button></div><p id="sr-meta"></p><div id="sr-list"></div></div>';
      $('sr-file').onchange=e=>receive(e.target.files[0]);$('sr-replace').onclick=replace;$('sr-cancel').onclick=cancel;$('sr-refresh').onclick=refresh;$('sr-search').oninput=draw;
      const drop=$('sr-drop');for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('sr-over');});
      drop.addEventListener('dragleave',()=>drop.classList.remove('sr-over'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('sr-over');if(e.dataTransfer.files.length!==1){message('Drop one Excel file at a time.',true);return;}receive(e.dataTransfer.files[0]);});
    }
    refresh();
  }
  return {open,parse};
})();
