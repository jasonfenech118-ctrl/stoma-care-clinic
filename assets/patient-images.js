/* Patient images — pictures saved to a patient and linked to where they belong:
   an inpatient episode or encounter, a follow-up visit, a correspondence record
   or a stoma.

   • A small 📷 button on each of those adds pictures to it (camera or gallery on
     a phone). Pictures are shrunk before upload (longest side 1600 px, JPEG).
   • Once a patient has at least one picture, a 📷 Images button appears with the
     patient's actions. Until then it is hidden. Each linked place also shows how
     many pictures it has (🖼 2).
   • The Images window shows every picture with its source; one tap on the source
     goes straight to that episode, encounter, visit, correspondence or stoma.

   Pictures are kept in a PRIVATE storage area of the clinic's Supabase
   (bucket "patient-images"): only signed-in staff can see them, through links
   that expire after an hour. Every upload and delete is in the audit trail.
   Set up once with sql/add-patient-images.sql. */
(function(global){
  'use strict';
  const TABLE='patient_images',BUCKET='patient-images',MAX_SIDE=1600,QUALITY=0.82;
  const db=()=>(typeof SB!=='undefined'&&SB)||global.SB;
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=iso=>{if(!iso)return '';const s=String(iso).slice(0,10);if(typeof global.fmtShortDate==='function')return global.fmtShortDate(s);const [y,m,d]=s.split('-');return d+'/'+m+'/'+y;};
  const today=()=>(typeof TODAY!=='undefined'&&TODAY)||new Date().toISOString().slice(0,10);
  const KIND={
    episode:{icon:'🛏',name:'Inpatient episode'},encounter:{icon:'📝',name:'Inpatient encounter'},
    appointment:{icon:'🕘',name:'Follow-up visit'},correspondence:{icon:'✉️',name:'Correspondence'},
    stoma:{icon:'🟣',name:'Stoma'},email:{icon:'📧',name:'Email'}
  };
  const st={pid:null,patient:null,rows:[],loaded:false,available:true,error:'',links:new Map(),urls:new Map(),host:null,seq:0,
    pick:null,view:null};
  // TESTING: only the administrators (Jason, Jacqueline) see pictures until the
  // move to Dataverse. Set FOR_EVERYONE to true to open them to all nurses.
  const FOR_EVERYONE=false;
  const enabled=()=>FOR_EVERYONE||!!(global.ClinicAccount&&typeof global.ClinicAccount.isAdmin==='function'&&global.ClinicAccount.isAdmin());
  const isImage=r=>/^image\//.test(String(r&&(r.mime||r.type)||''));
  const splitKey=k=>{const s=String(k||''),i=s.indexOf(':');return i<0?{kind:s,id:''}:{kind:s.slice(0,i),id:s.slice(i+1)};};
  const keyOf=r=>r.link_kind+':'+r.link_id;
  const sorted=list=>list.slice().sort((a,b)=>String(b.taken_on||'').localeCompare(String(a.taken_on||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  function missing(err){const m=String(err&&err.message||err||'');return /patient_images|does not exist|relation|schema cache|bucket not found|not found/i.test(m);}
  const SETUP_MSG='Pictures need a one-time set-up. Ask Jason to run <strong>sql/add-patient-images.sql</strong> in Supabase, then press ↻ Refresh.';
  function msg(text,ok){const el=document.getElementById('pi-msg');if(el)el.innerHTML=text?'<div class="registry-lookup-note'+(ok?'':' error')+'" style="margin:8px 0;">'+text+'</div>':'';}

  /* ---------- loading ---------- */
  function mount(host,patient){
    if(!patient)return;
    const pid=String(patient.id);
    // (The places' names in st.links are kept: they are drawn just before this.)
    if(st.pid!==pid){st.pid=pid;st.rows=[];st.loaded=false;st.urls=new Map();}
    st.patient=patient;st.host=host||st.host;
    if(!enabled())return;
    paint();load();
  }
  async function load(){
    const pid=st.pid,seq=++st.seq;if(!pid||!db())return;
    let res;
    try{
      res=typeof global.fetchAllRows==='function'
        ?await global.fetchAllRows(()=>db().from(TABLE).select('*').eq('patient_id',pid))
        :await db().from(TABLE).select('*').eq('patient_id',pid).then(r=>({rows:r.data||[],error:r.error}));
    }catch(e){res={rows:[],error:e};}
    if(seq!==st.seq||pid!==st.pid)return;
    st.loaded=true;
    if(res.error){st.available=!missing(res.error);st.error=st.available?String(res.error.message||res.error):'';st.rows=[];}
    else{st.available=true;st.error='';st.rows=sorted(res.rows||[]);}
    paint();
  }
  const countFor=key=>st.rows.filter(r=>keyOf(r)===key).length;

  /* ---------- the buttons: 📷 on each linked place, 📷 Images on the profile ---------- */
  function slotInner(key){
    const n=countFor(key);
    return '<button type="button" class="pi-add" data-pi-key="'+esc(key)+'" title="Add a picture here" aria-label="Add a picture to this '+esc((KIND[splitKey(key).kind]||{}).name||'record')+'" onclick="PatientImages.add(this.dataset.piKey)">📷</button>'
      +(n?'<button type="button" class="pi-view" data-pi-key="'+esc(key)+'" title="See the pictures saved here" onclick="PatientImages.gallery(this.dataset.piKey)">🖼 '+n+'</button>':'');
  }
  // Called while a record is drawn: remembers what the place is called and
  // returns its buttons (refreshed in place once the pictures are loaded).
  function slotHTML(key,label,date){
    if(!enabled())return '';
    st.links.set(key,{label:String(label||''),date:String(date||'').slice(0,10)});
    return '<span class="pi-slot" data-pi-key="'+esc(key)+'">'+slotInner(key)+'</span>';
  }
  function paint(){
    if(!enabled()){const b=document.getElementById('pi-profile-btn');if(b)b.remove();return;}
    document.querySelectorAll('.pi-slot').forEach(el=>{el.innerHTML=slotInner(el.dataset.piKey);});
    // The patient's 📷 Images button: only there once a picture is saved.
    const actions=document.querySelector('#page-patient-record .pd-home-actions')||st.host;
    let btn=document.getElementById('pi-profile-btn');
    const n=st.rows.length;
    if(!n){if(btn)btn.remove();return;}
    if(!btn&&actions){btn=document.createElement('button');btn.type='button';btn.id='pi-profile-btn';btn.className='psm-btn psm-btn-primary pi-profile-btn';
      btn.onclick=()=>gallery(null);actions.appendChild(btn);}
    if(btn)btn.textContent='📷 Images · '+n;
  }

  /* ---------- adding pictures ---------- */
  function add(key){
    const link=st.links.get(key)||{label:'',date:''};
    const k=KIND[splitKey(key).kind]||{icon:'📷',name:'Record'};
    const mb=document.getElementById('mb');if(!mb)return;
    st.pick={key,files:[],urls:[]};
    mb.className='mb pi-modal';
    mb.innerHTML='<h2>📷 Add pictures</h2>'
      +'<div class="pi-to">'+k.icon+' <strong>'+esc(k.name)+'</strong>'+(link.label?' · '+esc(link.label):'')+'</div>'
      +(st.available?'':'<div class="ch-missing">'+SETUP_MSG+'</div>')
      +'<label class="pi-choose">📷 Take or choose pictures<input type="file" accept="image/*" multiple hidden onchange="PatientImages.picked(this.files);this.value=\'\'"></label>'
      +'<div id="pi-picked" class="pi-picked"></div>'
      // A visit's or encounter's own date; a stoma photo is taken today.
      +'<div class="pi-fields"><label>Date taken<input type="date" id="pi-date" value="'+esc(splitKey(key).kind!=='stoma'&&link.date&&link.date<=today()?link.date:today())+'" max="'+esc(today())+'"></label>'
      +'<label class="pi-wide">Caption <small>(optional)</small><input type="text" id="pi-caption" maxlength="300" placeholder="e.g. Peristomal skin, day 3"></label></div>'
      +'<p class="pi-note">Pictures are shrunk before saving and kept privately for this patient — only signed-in staff can see them.</p>'
      +'<div id="pi-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="PatientImages.cancelPick()">Cancel</button><button class="btn-save" id="pi-save" onclick="PatientImages.savePicked()" disabled>Save</button></div>';
    if(typeof global.openMo==='function')global.openMo();
  }
  function picked(list){
    if(!st.pick||!list)return;
    Array.from(list).forEach(f=>{if(/^image\//.test(f.type)||/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name)){const u=URL.createObjectURL(f);st.pick.files.push(f);st.pick.urls.push(u);}});
    drawPicked();
  }
  function drawPicked(){
    const host=document.getElementById('pi-picked'),p=st.pick;if(!host||!p)return;
    host.innerHTML=p.files.map((f,i)=>'<span class="pi-thumb"><img src="'+p.urls[i]+'" alt=""><button type="button" title="Remove" aria-label="Remove '+esc(f.name)+'" onclick="PatientImages.unpick('+i+')">✕</button></span>').join('');
    const b=document.getElementById('pi-save');if(b){b.disabled=!p.files.length;b.textContent=p.files.length?'Save '+p.files.length+' picture'+(p.files.length===1?'':'s'):'Save';}
  }
  function unpick(i){const p=st.pick;if(!p)return;try{URL.revokeObjectURL(p.urls[i]);}catch(e){}p.files.splice(i,1);p.urls.splice(i,1);drawPicked();}
  function cancelPick(){if(st.pick)st.pick.urls.forEach(u=>{try{URL.revokeObjectURL(u);}catch(e){}});st.pick=null;if(typeof global.closeModal==='function')global.closeModal();}
  // Shrink to at most 1600 px on the longest side, as a JPEG.
  function shrink(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{
        const k=Math.min(1,MAX_SIDE/Math.max(img.naturalWidth,img.naturalHeight));
        const w=Math.max(1,Math.round(img.naturalWidth*k)),h=Math.max(1,Math.round(img.naturalHeight*k));
        const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
        x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);
        c.toBlob(b=>{URL.revokeObjectURL(url);b?resolve({blob:b,width:w,height:h}):reject(new Error('could not be converted'));},'image/jpeg',QUALITY);
      };
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('this picture type could not be opened'));};
      img.src=url;
    });
  }
  const uuid=()=>global.crypto&&global.crypto.randomUUID?global.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
  async function who(){try{const u=await global.getCurrentUserForAudit();return String(u&&(u.name||u.email)||'');}catch(e){return '';}}
  async function savePicked(){
    const p=st.pick;if(!p||!p.files.length)return;
    if(!st.available){msg(SETUP_MSG);return;}
    const btn=document.getElementById('pi-save');if(btn){btn.disabled=true;}
    const {kind,id}=splitKey(p.key),link=st.links.get(p.key)||{};
    const taken=(document.getElementById('pi-date')||{}).value||today(),caption=((document.getElementById('pi-caption')||{}).value||'').trim();
    const name=await who();let saved=0;
    for(let i=0;i<p.files.length;i++){
      if(btn)btn.textContent='Saving '+(i+1)+' of '+p.files.length+'…';
      let out;try{out=await shrink(p.files[i]);}catch(e){msg('“'+esc(p.files[i].name)+'”: '+esc(e.message)+'.');if(btn){btn.disabled=false;btn.textContent='Try again';}return;}
      const path=st.pid+'/'+uuid()+'.jpg';
      const up=await db().storage.from(BUCKET).upload(path,out.blob,{contentType:'image/jpeg',upsert:false});
      if(up.error){msg(missing(up.error)?SETUP_MSG:'Could not upload: '+esc(up.error.message||up.error));if(btn){btn.disabled=false;btn.textContent='Try again';}return;}
      const row={patient_id:st.pid,link_kind:kind,link_id:id,link_label:link.label||'',taken_on:taken,caption,storage_path:path,
        file_name:p.files[i].name.replace(/\.[a-z0-9]+$/i,'')+'.jpg',mime:'image/jpeg',size_bytes:out.blob.size,width:out.width,height:out.height,created_by_name:name};
      const ins=await db().from(TABLE).insert([row]);
      if(ins.error){try{await db().storage.from(BUCKET).remove([path]);}catch(e){}msg(missing(ins.error)?SETUP_MSG:'Could not save: '+esc(ins.error.message||ins.error));if(btn){btn.disabled=false;btn.textContent='Try again';}return;}
      saved++;
    }
    try{global.logAudit&&global.logAudit({action:'create',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Added '+saved+' picture'+(saved===1?'':'s')+' ('+((KIND[kind]||{}).name||kind)+(link.label?': '+link.label:'')+')'});}catch(e){}
    p.urls.forEach(u=>{try{URL.revokeObjectURL(u);}catch(e){}});st.pick=null;
    if(typeof global.closeModal==='function')global.closeModal();
    await load();
    if(typeof global.showToast==='function')global.showToast('📷 '+saved+' picture'+(saved===1?'':'s')+' saved');
  }

  /* ---------- saved from elsewhere (an email's attachments) ---------- */
  // A picture is shrunk like any other; a file (PDF, Word …) is kept as it is,
  // up to 10 MB. Returns {ok} or {error}.
  const FILE_TYPES=/^(?:image\/(?:jpeg|png|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.ms-excel|text\/plain)$/;
  async function saveBlob(blob,o){
    o=o||{};if(!st.pid||!db())return {error:'No patient open.'};
    const {kind,id}=splitKey(o.key||'');const name=String(o.name||'attachment');
    let body=blob,type=String(o.type||blob.type||'application/octet-stream').toLowerCase(),w=null,h=null,fileName=name;
    try{
      if(/^image\//.test(type)){const out=await shrink(blob);body=out.blob;type='image/jpeg';w=out.width;h=out.height;fileName=name.replace(/\.[a-z0-9]+$/i,'')+'.jpg';}
      else if(!FILE_TYPES.test(type))return {error:name+': this kind of file is not kept.'};
      else if(blob.size>10*1024*1024)return {error:name+': larger than 10 MB.'};
    }catch(e){return {error:name+': '+e.message};}
    const ext=(fileName.match(/\.([a-z0-9]{1,5})$/i)||[,'bin'])[1].toLowerCase();
    const path=st.pid+'/'+uuid()+'.'+ext;
    const up=await db().storage.from(BUCKET).upload(path,body,{contentType:type,upsert:false});
    if(up.error)return {error:missing(up.error)?'Pictures are not set up yet (run sql/add-patient-images.sql).':String(up.error.message||up.error)};
    const row={patient_id:st.pid,link_kind:kind,link_id:id,link_label:String(o.label||''),taken_on:o.taken||today(),caption:String(o.caption||'').slice(0,300),storage_path:path,
      file_name:fileName,mime:type,size_bytes:body.size,width:w,height:h,created_by_name:o.who||await who()};
    const ins=await db().from(TABLE).insert([row]);
    if(ins.error){try{await db().storage.from(BUCKET).remove([path]);}catch(e){}return {error:String(ins.error.message||ins.error)};}
    return {ok:true};
  }

  /* ---------- seeing them ---------- */
  async function signed(paths){
    const need=paths.filter(p=>{const c=st.urls.get(p);return !c||c.exp<Date.now();});
    if(need.length){
      const r=await db().storage.from(BUCKET).createSignedUrls(need,3600);
      (r.data||[]).forEach((x,i)=>{if(x&&x.signedUrl)st.urls.set(x.path||need[i],{url:x.signedUrl,exp:Date.now()+50*60*1000});});
    }
    return p=>(st.urls.get(p)||{}).url||'';
  }
  function sourceChip(r){
    const k=KIND[r.link_kind]||{icon:'📷',name:'Patient'};
    return '<button type="button" class="pi-source" data-pi-key="'+esc(keyOf(r))+'" title="Go to it" onclick="PatientImages.go(this.dataset.piKey)">'+k.icon+' '+esc(k.name)+(r.link_label?' · '+esc(r.link_label):'')+' ›</button>';
  }
  async function gallery(filterKey){
    const mb=document.getElementById('mb');if(!mb)return;
    const list=st.rows.filter(r=>!filterKey||keyOf(r)===filterKey);
    st.view={filter:filterKey||null,list,index:-1};
    mb.className='mb mb-wide pi-modal';
    const p=st.patient||{};
    const head='<h2>📷 Images · '+esc([p.first_name,p.surname].filter(Boolean).join(' '))+'</h2>'
      +(filterKey?'<div class="pi-filter">Showing the pictures of '+esc(((KIND[splitKey(filterKey).kind]||{}).name||'this record').toLowerCase())+((st.links.get(filterKey)||{}).label?' · '+esc(st.links.get(filterKey).label):'')
        +' <button type="button" class="pi-link" onclick="PatientImages.gallery(null)">Show all '+st.rows.length+'</button></div>':'');
    if(!list.length){mb.innerHTML=head+'<p class="ch-empty">No pictures.</p><div class="mact"><button class="btn-cancel" onclick="closeModal()">Close</button></div>';if(typeof global.openMo==='function')global.openMo();return;}
    mb.innerHTML=head+'<p class="pi-note">Loading pictures…</p>';
    if(typeof global.openMo==='function')global.openMo();
    let url;try{url=await signed(list.map(r=>r.storage_path));}catch(e){url=()=>'';}
    if(!st.view||st.view.list!==list)return;
    mb.innerHTML=head
      +'<div class="pi-grid">'+list.map((r,i)=>'<figure class="pi-tile"><button type="button" class="pi-tile-img" onclick="PatientImages.show('+i+')" aria-label="Open '+(isImage(r)?'picture':'file')+'">'
        +(!isImage(r)?'<span class="pi-file">📄<small>'+esc(r.file_name||'File')+'</small></span>':url(r.storage_path)?'<img src="'+esc(url(r.storage_path))+'" alt="'+esc(r.caption||'Patient picture')+'" loading="lazy">':'<span>Picture unavailable</span>')+'</button>'
        +'<figcaption><span class="pi-date">'+esc(fmt(r.taken_on||r.created_at))+'</span>'+(r.caption?'<span class="pi-cap">'+esc(r.caption)+'</span>':'')+sourceChip(r)+'</figcaption></figure>').join('')+'</div>'
      +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Close</button></div>';
  }
  async function show(i){
    const v=st.view;if(!v||!v.list[i])return;v.index=i;
    const r=v.list[i],mb=document.getElementById('mb');if(!mb)return;
    let url;try{url=await signed([r.storage_path]);}catch(e){url=()=>'';}
    let dl='';try{const d=await db().storage.from(BUCKET).createSignedUrl(r.storage_path,600,{download:r.file_name||'picture.jpg'});dl=d&&d.data&&d.data.signedUrl||'';}catch(e){}
    if(!st.view||st.view.index!==i)return;
    mb.className='mb mb-wide pi-modal';
    mb.innerHTML='<h2>'+(isImage(r)?'📷 ':'📄 ')+esc(fmt(r.taken_on||r.created_at))+(r.caption?' · '+esc(r.caption):'')+'</h2>'
      +(isImage(r)?'<div class="pi-big"><img src="'+esc(url(r.storage_path))+'" alt="'+esc(r.caption||'Patient picture')+'"></div>'
        :'<div class="pi-big pi-big-file"><span class="pi-file">📄<small>'+esc(r.file_name||'File')+' · '+Math.max(1,Math.round((r.size_bytes||0)/1024))+' KB</small></span>'+(dl?'<a class="btn-save" href="'+esc(dl)+'" download>⬇ Open / download</a>':'')+'</div>')
      +'<div class="pi-meta">'+sourceChip(r)+'<span>Added by '+esc(r.created_by_name||'—')+' · '+esc(fmt(r.created_at))+'</span></div>'
      +'<div id="pi-msg"></div>'
      +'<div class="mact pi-acts"><button class="btn-cancel" onclick="PatientImages.gallery(PatientImages._state.view&&PatientImages._state.view.filter)">‹ All pictures</button>'
      +'<button class="btn-cancel" '+(i>0?'':'disabled')+' onclick="PatientImages.show('+(i-1)+')">‹ Previous</button>'
      +'<button class="btn-cancel" '+(i<v.list.length-1?'':'disabled')+' onclick="PatientImages.show('+(i+1)+')">Next ›</button>'
      +'<button class="btn-cancel" onclick="PatientImages.caption('+i+')">✏️ Caption</button>'
      +(dl?'<a class="btn-cancel pi-dl" href="'+esc(dl)+'" download>⬇ Download</a>':'')
      +'<button class="btn-cancel pi-del" onclick="PatientImages.remove('+i+')">🗑 Delete</button></div>';
  }
  async function caption(i){
    const r=st.view&&st.view.list[i];if(!r)return;
    const next=prompt('Caption for this picture:',r.caption||'');if(next==null)return;
    const res=await db().from(TABLE).update({caption:next.trim().slice(0,300)}).eq('id',r.id);
    if(res.error){msg('Could not save the caption: '+esc(res.error.message||res.error));return;}
    r.caption=next.trim().slice(0,300);show(i);
  }
  async function remove(i){
    const r=st.view&&st.view.list[i];if(!r)return;
    if(!confirm('Delete this picture'+(r.caption?' ('+r.caption+')':'')+'? This cannot be undone.'))return;
    const del=await db().from(TABLE).delete().eq('id',r.id);
    if(del.error){msg('Could not delete: '+esc(del.error.message||del.error));return;}
    try{await db().storage.from(BUCKET).remove([r.storage_path]);}catch(e){}
    try{global.logAudit&&global.logAudit({action:'delete',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Deleted a picture ('+((KIND[r.link_kind]||{}).name||r.link_kind)+(r.link_label?': '+r.link_label:'')+')'});}catch(e){}
    const filter=st.view.filter;
    await load();
    if(!st.rows.length||(filter&&!countFor(filter))){if(typeof global.closeModal==='function')global.closeModal();return;}
    gallery(filter);
  }
  // Straight to where the picture belongs.
  function go(key){
    const {kind,id}=splitKey(key);
    if(typeof global.closeModal==='function')global.closeModal();
    if(kind==='stoma'&&typeof global.openStomaModal==='function'){global.openStomaModal(st.pid,id);return;}
    if(kind==='encounter'&&typeof global.openEncounter==='function'&&global.JasonEncounters){global.openEncounter(st.pid,id);return;}
    // Episodes, visits and correspondence: open the care history at that row.
    if(typeof global.patientDashboardOpen==='function')global.patientDashboardOpen('history');
    setTimeout(()=>{
      const slot=Array.from(document.querySelectorAll('.pi-slot')).find(el=>el.dataset.piKey===key);
      const row=slot&&(slot.closest('tr')||slot.closest('details')||slot.parentElement);
      for(let d=slot&&slot.closest('details');d;d=d.parentElement&&d.parentElement.closest('details'))d.open=true;
      if(row){row.scrollIntoView({behavior:'smooth',block:'center'});row.classList.add('pi-flash');setTimeout(()=>row.classList.remove('pi-flash'),2600);}
    },250);
  }

  global.PatientImages={enabled,mount,reload:load,slotHTML,paint,saveBlob,add,picked,unpick,cancelPick,savePicked,gallery,show,caption,remove,go,_state:st};
})(window);
