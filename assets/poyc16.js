/* POYC 16 — "Request Form for the supply of Free Drugs in terms of Schedule V
   (Part II) of Social Security Act (2012)", the Pharmacy Of Your Choice form.

   The official fillable PDF is kept exactly as issued
   (assets/forms/poyc16-schedule-v-request.pdf). Opened from the 📋 Schedule 5
   window, the app writes the patient's details, the Schedule V condition, the
   duration, the applicant (doctor) and any extra items into the form's OWN
   fields — in this browser, nothing is uploaded — and opens the filled form to
   print or save. The form keeps its Reset and Email buttons; the doctor signs
   and stamps it. The Strength and Dosage columns are for POYC records only and
   are left blank.

   The condition is suggested from the reason for the stoma written in the
   record (the operation, its indication, the case summary's diagnosis); it is
   only ticked when the record says so, and can be changed before filling.
   Names and addresses keep their Maltese letters (ħ, ġ, ż, ċ) through an
   embedded font (assets/fonts, SIL Open Font License). */
(function(root){
  'use strict';
  const FORM_URL='assets/forms/poyc16-schedule-v-request.pdf?v=1';
  const FONT_URL='assets/fonts/LiberationSans-Regular.ttf?v=1';
  const PDFLIB_URL='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  const FONTKIT_URL='https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
  // This device only: the last duration used and each applicant's registration
  // number — no patient data is kept.
  const LS_KEY='clinic_poyc16';

  // The Schedule V conditions a stoma is requested under: the form's tick-box,
  // its printed label, and the words in the record that point to it.
  const CONDITIONS=[
    {f:'Mal',label:'Malignant Diseases',re:/\b(cancer|carcinoma|malignan\w*|neoplas\w*|tumou?r|adenocarcinoma|lymphoma|sarcoma|metasta\w*|ca\.?\s+(?:of\s+the\s+)?(?:rectum|colon|bladder|sigmoid|caecum|cecum|anus|anal|ovary|cervix|prostate|bowel))\b/i},
    {f:'Inf',label:'Inflammatory Bowel Disease',re:/\b(crohn'?s?|ulcerative\s+colitis|inflammatory\s+bowel|ibd)\b/i},
    {f:'D',label:'Diverticular Disease requiring Stoma Care',re:/\bdiverticul\w*/i},
    {f:'Imperforate Anus',label:'Imperforate Anus',re:/\b(imperforate\s+anus|anorectal\s+malformation)\b/i},
    {f:'Hirschsprungs D',label:'Hirschsprung’s Disease',re:/\bhirschsprung/i},
    {f:'Smal',label:'Small Intestinal Failure',re:/\b(short\s+bowel|intestinal\s+failure)\b/i},
    {f:'Spinal Cord Pathologies',label:'Spinal Cord Pathologies',re:/\b(spinal\s+cord|spina\s+bifida|paraplegi\w*|tetraplegi\w*|quadriplegi\w*|cauda\s+equina)\b/i}
  ];
  // Page 2: the items the form already lists (Drug01–Drug06).
  const STANDARD=['Flanges','Pouches','Adhesive remover','Deodorizing agent','Non sterile gauze','Stoma accessories as necessary'];

  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  const isoToday=()=>(typeof TODAY!=='undefined'&&TODAY)||(d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()))(new Date());
  const dmy=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||''));return m?m[3]+'/'+m[2]+'/'+m[1]:'';};
  function loadStore(){try{const v=JSON.parse(root.localStorage.getItem(LS_KEY)||'{}');return v&&typeof v==='object'?v:{};}catch(e){return {};}}
  function saveStore(v){try{root.localStorage.setItem(LS_KEY,JSON.stringify(v));}catch(e){}}
  const regKey=n=>String(n||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();

  // ── The reason for the stoma, as written in the record ───────────────────
  function sources(p){
    const out=[],add=(text,from,strong)=>{text=String(text||'').trim();if(text)out.push({text,from,strong});};
    try{(root.patientStomaList?root.patientStomaList(p):[]).filter(x=>x.present).forEach(x=>{add(x.operation,'the stoma’s operation',true);add(x.indication,'the stoma’s indication',true);});}catch(e){}
    add(p.procedure_performed,'the procedure on the patient card',true);
    let hist=[];try{const CH=root.ClinicalHistory;hist=CH&&CH.entries?CH.entries(p.id):[];}catch(e){hist=[];}
    const newest=(a,b)=>String(b.entry_date||'').localeCompare(String(a.entry_date||''));
    const secOf=(e,label)=>{const m=String(e.result||'').split(/^§ /m).find(x=>x.toLowerCase().startsWith(label.toLowerCase()));return m?m.slice(label.length).trim():'';};
    hist.filter(e=>e.category==='consult').sort(newest).forEach(e=>{add(secOf(e,'Indications'),'the operation note’s indication',true);add(e.title,'the operation note',true);});
    hist.filter(e=>e.category==='case').sort(newest).forEach(e=>add(e.title,'the case summary’s diagnosis',true));
    hist.filter(e=>e.category==='surgery').sort(newest).forEach(e=>add(e.title,'a performed procedure',true));
    // Past history only when nothing about the stoma itself names a condition.
    hist.filter(e=>e.category==='case').sort(newest).forEach(e=>add(secOf(e,'Past medical history'),'the past medical history',false));
    return out;
  }
  function suggest(p){
    const src=sources(p),hit=new Map();
    const scan=list=>list.forEach(s=>CONDITIONS.forEach(c=>{if(!hit.has(c.f)){const m=s.text.match(c.re);if(m)hit.set(c.f,{from:s.from,word:m[0]});}}));
    scan(src.filter(s=>s.strong));
    if(!hit.size)scan(src.filter(s=>!s.strong));
    return hit;
  }
  function stomaKinds(p){
    let present=[];try{present=root.stomasPresentOn?root.stomasPresentOn(p,isoToday()):[];}catch(e){present=[];}
    const kinds=new Set();
    present.forEach(s=>{const t=String(s.type||s.typeLabel||s.label||'').toLowerCase();if(/uro|conduit/.test(t))kinds.add('uro');else if(t)kinds.add('bowel');});
    return kinds;
  }

  // ── The window ──────────────────────────────────────────────────────────
  // The app's open patient and Schedule 5 window (top-level lets of index.html).
  const appPatient=()=>typeof clrState!=='undefined'&&clrState?clrState.patient:null;
  const fromSchedule5=()=>typeof s5State!=='undefined'&&!!s5State;
  let cur=null;
  function open(){
    const p=appPatient();if(!p){alert('Open a patient first.');return;}
    const mb=root.document.getElementById('mb');if(!mb)return;
    const store=loadStore(),hits=suggest(p),kinds=stomaKinds(p);
    const applicant=String(p.consultant||'').toUpperCase().replace(/\s+/g,' ').trim();
    cur={pid:String(p.id)};
    const v={name:[p.first_name,p.surname].filter(Boolean).join(' '),dob:dmy(p.date_of_birth),
      address:[p.address,p.locality].map(x=>String(x||'').trim()).filter(Boolean).join(', '),id:p.id_card||'',tel:p.phone_number||'',
      duration:store.duration||'',applicant,reg:(store.reg||{})[regKey(applicant)]||'',date:isoToday(),
      // A urostomy only: no deodorizing agent, and night drainage bags are added.
      std:STANDARD.map(x=>!(x==='Deodorizing agent'&&kinds.has('uro')&&!kinds.has('bowel'))),
      extra:kinds.has('uro')?'Night drainage bags':''};
    const f=(id,label,val,attrs)=>'<div class="fg"><label for="pq-'+id+'">'+esc(label)+'</label><input id="pq-'+id+'" value="'+esc(val)+'"'+(attrs||'')+'></div>';
    const why=[...hits.entries()].map(([k,h])=>{const c=CONDITIONS.find(x=>x.f===k);return '<b>'+esc(c.label)+'</b> — “'+esc(h.word)+'” in '+esc(h.from);}).join('<br>');
    mb.className='mb mb-wide pq-modal';
    mb.innerHTML='<h2>📄 POYC 16 — Schedule V request form</h2>'
      +'<p class="report-note" style="margin:4px 0 10px;line-height:1.55;">The official POYC form, filled in from this patient’s record. Check the details, then open it to print or save; the doctor signs and stamps it. Nothing is uploaded.</p>'
      +'<div class="pq-grid">'+f('name','Patient name',v.name)+f('dob','Date of birth',v.dob,' placeholder="dd/mm/yyyy"')+f('address','Address',v.address)+f('id','ID card no.',v.id)+f('tel','Telephone no.',v.tel)+'</div>'
      +'<div class="pq-sec">Schedule V condition</div>'
      +'<div class="pq-conds">'+CONDITIONS.map(c=>'<label><input type="checkbox" class="pq-cond" value="'+esc(c.f)+'"'+(hits.has(c.f)?' checked':'')+'> '+esc(c.label)+'</label>').join('')+'</div>'
      +'<p class="pq-why">'+(why?'Ticked from the record: '+why+'.':'The record does not name the condition — tick it here.')+' Any other condition can be ticked on the form itself.</p>'
      +'<div class="pq-grid">'+f('duration','Duration of Schedule V entitlement',v.duration,' placeholder="e.g. Permanent"')+f('date','Date','',' type="date"')+'</div>'
      +'<label class="pq-check"><input type="checkbox" id="pq-accept"> Previously approved treatment may be added to the patient’s entitlement document</label>'
      +'<div class="pq-sec">Applicant (the doctor who signs)</div>'
      +'<div class="pq-grid">'+f('applicant','Name (in block letters)',v.applicant,' style="text-transform:uppercase"')+f('reg','Medical Registration No.',v.reg)+'</div>'
      +'<div class="pq-sec">Items (page 2)</div>'
      +'<div class="pq-conds">'+STANDARD.map((x,i)=>'<label><input type="checkbox" class="pq-std" data-i="'+i+'"'+(v.std[i]?' checked':'')+'> '+esc(x)+'</label>').join('')+'</div>'
      +'<div class="fg"><label for="pq-extra">Other items, one per line</label><textarea id="pq-extra" rows="2" placeholder="e.g. Night drainage bags">'+esc(v.extra)+'</textarea></div>'
      +'<p class="pq-why">Strength and dosage are for POYC records only, so they stay blank.</p>'
      +'<p class="pq-msg" id="pq-msg" role="status"></p>'
      +'<div class="mact"><button class="btn-cancel" onclick="'+(fromSchedule5()?'renderScheduleFiveEditor()':'closeModal()')+'">'+(fromSchedule5()?'← Back':'Close')+'</button>'
      +'<button class="btn-save" onclick="Poyc16.download(this)">⬇ Download</button><button class="btn-save" onclick="Poyc16.fill(this)">📄 Open the filled form</button></div>';
    const d=root.document.getElementById('pq-date');if(d)d.value=v.date;
    // The registration number follows the applicant's name typed.
    const ap=root.document.getElementById('pq-applicant'),rg=root.document.getElementById('pq-reg');
    if(ap&&rg)ap.addEventListener('change',()=>{const r=(loadStore().reg||{})[regKey(ap.value)];if(r&&!rg.value)rg.value=r;});
    if(!root.document.querySelector('.mo.open')&&root.openMo)root.openMo();
  }
  function read(){
    const g=id=>{const el=root.document.getElementById('pq-'+id);return el?String(el.value||'').trim():'';};
    return {name:g('name'),dob:g('dob'),address:g('address'),id:g('id'),tel:g('tel'),duration:g('duration'),date:g('date'),
      applicant:g('applicant').toUpperCase(),reg:g('reg'),accept:!!(root.document.getElementById('pq-accept')||{}).checked,
      conds:[...root.document.querySelectorAll('.pq-cond:checked')].map(x=>x.value),
      std:STANDARD.map((x,i)=>!!(root.document.querySelector('.pq-std[data-i="'+i+'"]')||{}).checked),
      extra:g('extra').split('\n').map(x=>x.trim()).filter(Boolean)};
  }
  function remember(v){
    const s=loadStore();s.duration=v.duration;s.reg=s.reg||{};if(v.applicant&&v.reg)s.reg[regKey(v.applicant)]=v.reg;saveStore(s);
  }

  // ── Filling the official PDF ────────────────────────────────────────────
  function loadScript(src,ok){
    if(ok())return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const s=root.document.createElement('script');s.src=src;
      s.onload=()=>ok()?resolve():reject(new Error('The PDF tools did not load.'));
      s.onerror=()=>reject(new Error('Could not load the PDF tools — check the connection and try again.'));
      root.document.head.appendChild(s);
    });
  }
  // Without the embedded font the form's own font is used, which has no
  // Maltese ħ ġ ż ċ: they are written without the mark rather than failing.
  const PLAIN={'Ħ':'H','ħ':'h','Ġ':'G','ġ':'g','Ż':'Z','ż':'z','Ċ':'C','ċ':'c'};
  const plain=s=>String(s||'').replace(/[ĦħĠġŻżĊċ]/g,c=>PLAIN[c]).replace(/[^\x20-\x7E -ÿ]/g,'');
  async function build(v){
    await loadScript(PDFLIB_URL,()=>!!root.PDFLib);
    try{await loadScript(FONTKIT_URL,()=>!!root.fontkit);}catch(e){}
    const res=await fetch(FORM_URL,{cache:'no-cache'});if(!res.ok)throw new Error('The blank form could not be opened ('+res.status+').');
    const doc=await root.PDFLib.PDFDocument.load(await res.arrayBuffer());
    let font=null;
    if(root.fontkit){try{const fr=await fetch(FONT_URL);if(fr.ok){doc.registerFontkit(root.fontkit);font=await doc.embedFont(await fr.arrayBuffer(),{subset:true});}}catch(e){font=null;}}
    const form=doc.getForm(),txt=s=>font?String(s||''):plain(s);
    const set=(n,val)=>{try{form.getTextField(n).setText(txt(val));}catch(e){}};
    const tick=(n,on)=>{try{const c=form.getCheckBox(n);if(on)c.check();else c.uncheck();}catch(e){}};
    set('PatientName',v.name);set('DOB',v.dob);set('Address',v.address);set('IDNo',v.id);set('TelNo',v.tel);
    set('Duration_SchV_Entitlement',v.duration);set('ConsultantName',v.applicant);set('MedRegNo',v.reg);set('Date',dmy(v.date));
    CONDITIONS.forEach(c=>tick(c.f,v.conds.includes(c.f)));
    tick('CheckBox1',v.accept);
    STANDARD.forEach((x,i)=>set('Drug'+pad(i+1),v.std[i]?x:''));
    for(let i=0;i<11;i++)set('Drug'+pad(i+7),v.extra[i]||'');
    if(font)form.updateFieldAppearances(font);
    return doc.save();
  }
  const fileName=v=>'POYC16 Schedule V request'+(v.id?' '+v.id.replace(/[^A-Za-z0-9]/g,''):'')+'.pdf';
  const msg=t=>{const el=root.document.getElementById('pq-msg');if(el)el.textContent=t||'';};
  function check(v){
    if(!v.name||!v.id){msg('Fill in the patient’s name and ID card number first.');return false;}
    if(!v.conds.length&&!confirm('No Schedule V condition is ticked. Fill the form anyway (and tick it on the form)?'))return false;
    return true;
  }
  async function fill(btn){
    const v=read();if(!check(v))return;remember(v);
    // Opened now, while the tap still counts, so a pop-up blocker lets it through.
    const w=root.open('','_blank');
    try{if(w)w.document.write('<p style="font:16px Arial,sans-serif;margin:24px">Filling the POYC 16 form…</p>');}catch(e){}
    if(btn)btn.disabled=true;msg('Filling the form…');
    try{
      const bytes=await build(v),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      if(w)w.location.href=url;else save(bytes,v);
      msg(w?'The filled form opened in a new tab — print it or save it from there.':'Downloaded the filled form.');
      try{root.logAudit&&root.logAudit({action:'export',entity:'patient',entity_id:cur&&cur.pid,patient_id:cur&&cur.pid,summary:'Filled the POYC 16 Schedule V request form'});}catch(e){}
    }catch(e){if(w)try{w.close();}catch(_){}msg('Could not fill the form: '+(e&&e.message||e));}
    finally{if(btn)btn.disabled=false;}
  }
  function save(bytes,v){
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=root.document.createElement('a');
    a.href=url;a.download=fileName(v);root.document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function download(btn){
    const v=read();if(!check(v))return;remember(v);
    if(btn)btn.disabled=true;msg('Filling the form…');
    try{save(await build(v),v);msg('Downloaded “'+fileName(v)+'”.');}
    catch(e){msg('Could not fill the form: '+(e&&e.message||e));}
    finally{if(btn)btn.disabled=false;}
  }
  const css=root.document.createElement('style');
  css.textContent='.pq-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 12px}'
    +'.pq-sec{font-weight:800;color:var(--teal,#0d7377);margin:12px 0 6px}'
    +'.pq-conds{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:4px 12px;font-size:14px}'
    +'.pq-conds label,.pq-check{display:flex;align-items:center;gap:7px;cursor:pointer}'
    +'.pq-check{margin:4px 0 2px;font-size:14px}'
    +'.pq-why{margin:6px 0;font-size:12.5px;color:#475569;line-height:1.5}'
    +'.pq-msg{margin:6px 0 0;font-weight:700;color:#0f766e;min-height:1em}'
    +'.pq-modal textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border,#cbd5e1);border-radius:9px;font:inherit}';
  root.document.head.appendChild(css);
  root.Poyc16={open,fill,download,_suggest:suggest,_build:build,CONDITIONS};
})(window);
