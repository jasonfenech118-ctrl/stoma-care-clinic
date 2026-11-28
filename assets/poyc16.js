/* POYC 16 — "Request Form for the supply of Free Drugs in terms of Schedule V
   (Part II) of Social Security Act (2012)", the Pharmacy Of Your Choice form.

   The official fillable PDF is kept exactly as issued
   (assets/forms/poyc16-schedule-v-request.pdf). Opened from the 📋 Schedule 5
   window, the app writes the patient's details, the
   duration, the applicant (doctor) and any extra items into the form's OWN
   fields — in this browser, nothing is uploaded — and opens the filled form to
   print or save. The form keeps its Reset and Email buttons; the doctor signs
   and stamps it. The Strength and Dosage columns are for POYC records only and
   are left blank.

   The Schedule V condition is left for the doctor to tick.
   Names and addresses keep their Maltese letters (ħ, ġ, ż, ċ) through an
   embedded font (assets/fonts, SIL Open Font License). */
(function(root){
  'use strict';
  const FORM_URL='assets/forms/poyc16-schedule-v-request.pdf?v=1';
  const FONT_URL='assets/fonts/LiberationSans-Regular.ttf?v=1';
  const SERIF_URL='assets/fonts/LiberationSerif-Regular.ttf?v=1',SERIF_BOLD_URL='assets/fonts/LiberationSerif-Bold.ttf?v=1';
  const LOGO_URL='assets/mater-dei-logo.png';
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
    const store=loadStore(),kinds=stomaKinds(p);
    const applicant=String(p.consultant||'').toUpperCase().replace(/\s+/g,' ').trim();
    cur={pid:String(p.id)};
    // The Schedule 5 pages as edited in the 📋 Schedule 5 window (quantities included).
    const s5=fromSchedule5()&&s5State.pages&&s5State.pages.length?s5State:null;
    const v={name:[p.first_name,p.surname].filter(Boolean).join(' '),dob:dmy(p.date_of_birth),
      address:[p.address,p.locality].map(x=>String(x||'').trim()).filter(Boolean).join(', '),id:p.id_card||'',tel:p.phone_number||'',
      duration:store.duration||'',applicant,reg:(store.reg||{})[regKey(applicant)]||'',date:isoToday(),
      // A urostomy only: no deodorizing agent, and night drainage bags are added.
      std:STANDARD.map(x=>!(x==='Deodorizing agent'&&kinds.has('uro')&&!kinds.has('bowel'))),
      extra:kinds.has('uro')?'Night drainage bags':''};
    const f=(id,label,val,attrs)=>'<div class="fg"><label for="pq-'+id+'">'+esc(label)+'</label><input id="pq-'+id+'" value="'+esc(val)+'"'+(attrs||'')+'></div>';
    mb.className='mb mb-wide pq-modal';
    mb.innerHTML='<h2>📄 POYC 16 — Schedule V request form</h2>'
      +'<p class="report-note" style="margin:4px 0 10px;line-height:1.55;">The official POYC form, filled in from this patient’s record. Check the details, then open it to print or save; the doctor signs and stamps it. Nothing is uploaded.</p>'
      +'<div class="pq-grid">'+f('name','Patient name',v.name)+f('dob','Date of birth',v.dob,' placeholder="dd/mm/yyyy"')+f('address','Address',v.address)+f('id','ID card no.',v.id)+f('tel','Telephone no.',v.tel)+'</div>'
      +'<p class="pq-why">The Schedule V condition is left blank on the form — the doctor ticks it.</p>'
      +'<div class="pq-grid">'+f('duration','Duration of Schedule V entitlement',v.duration,' placeholder="e.g. Permanent"')+f('date','Date','',' type="date"')+'</div>'
      +'<label class="pq-check"><input type="checkbox" id="pq-accept"> Previously approved treatment may be added to the patient’s entitlement document</label>'
      +'<div class="pq-sec">Applicant (the doctor who signs)</div>'
      +'<div class="pq-grid">'+f('applicant','Name (in block letters)',v.applicant,' style="text-transform:uppercase"')+f('reg','Medical Registration No.',v.reg)+'</div>'
      +'<div class="pq-sec">Items (page 2)</div>'
      +'<div class="pq-conds">'+STANDARD.map((x,i)=>'<label><input type="checkbox" class="pq-std" data-i="'+i+'"'+(v.std[i]?' checked':'')+'> '+esc(x)+'</label>').join('')+'</div>'
      +'<div class="fg"><label for="pq-extra">Other items, one per line</label><textarea id="pq-extra" rows="2" placeholder="e.g. Night drainage bags">'+esc(v.extra)+'</textarea></div>'
      +'<p class="pq-why">Strength and dosage are for POYC records only, so they stay blank.</p>'
      +'<div class="pq-sec">Print or download</div>'
      +'<div class="pq-conds pq-what" role="radiogroup" aria-label="What to print or download">'
        +'<label><input type="radio" name="pq-what" value="both"'+(s5?' checked':' disabled')+'> POYC 16 form + Schedule 5 page'+(s5&&s5.pages.length>1?'s':'')+' (together)</label>'
        +'<label><input type="radio" name="pq-what" value="poyc"'+(s5?'':' checked')+'> POYC 16 form only</label>'
        +'<label><input type="radio" name="pq-what" value="s5"'+(s5?'':' disabled')+'> Schedule 5 page'+(s5&&s5.pages.length>1?'s':'')+' only</label></div>'
      +'<p class="pq-msg" id="pq-msg" role="status"></p>'
      +'<div class="mact"><button class="btn-cancel" onclick="'+(fromSchedule5()?'renderScheduleFiveEditor()':'closeModal()')+'">'+(fromSchedule5()?'← Back':'Close')+'</button>'
      +'<button class="btn-save" onclick="Poyc16.download(this)">⬇ Download</button><button class="btn-save" onclick="Poyc16.fill(this)">🖨 Open to print</button></div>';
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
      std:STANDARD.map((x,i)=>!!(root.document.querySelector('.pq-std[data-i="'+i+'"]')||{}).checked),
      extra:g('extra').split('\n').map(x=>x.trim()).filter(Boolean),
      what:(root.document.querySelector('input[name="pq-what"]:checked')||{}).value||'poyc'};
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
  async function fetchBytes(url){try{const r=await fetch(url);return r.ok?await r.arrayBuffer():null;}catch(e){return null;}}
  async function build(v){
    await loadScript(PDFLIB_URL,()=>!!root.PDFLib);
    try{await loadScript(FONTKIT_URL,()=>!!root.fontkit);}catch(e){}
    const s5=fromSchedule5()?s5State:null;
    if(v.what==='s5'){const doc=await root.PDFLib.PDFDocument.create();await addSchedule5(doc,s5);return doc.save();}
    const doc=await buildPoyc(v);
    if(v.what==='both'&&s5)await addSchedule5(doc,s5);
    return doc.save();
  }
  async function buildPoyc(v){
    const res=await fetch(FORM_URL,{cache:'no-cache'});if(!res.ok)throw new Error('The blank form could not be opened ('+res.status+').');
    const doc=await root.PDFLib.PDFDocument.load(await res.arrayBuffer());
    let font=null;
    if(root.fontkit){try{const fr=await fetch(FONT_URL);if(fr.ok){doc.registerFontkit(root.fontkit);font=await doc.embedFont(await fr.arrayBuffer(),{subset:true});}}catch(e){font=null;}}
    const form=doc.getForm(),txt=s=>font?String(s||''):plain(s);
    const set=(n,val)=>{try{form.getTextField(n).setText(txt(val));}catch(e){}};
    const tick=(n,on)=>{try{const c=form.getCheckBox(n);if(on)c.check();else c.uncheck();}catch(e){}};
    set('PatientName',v.name);set('DOB',v.dob);set('Address',v.address);set('IDNo',v.id);set('TelNo',v.tel);
    set('Duration_SchV_Entitlement',v.duration);set('ConsultantName',v.applicant);set('MedRegNo',v.reg);set('Date',dmy(v.date));
    tick('CheckBox1',v.accept);
    STANDARD.forEach((x,i)=>set('Drug'+pad(i+1),v.std[i]?x:''));
    for(let i=0;i<11;i++)set('Drug'+pad(i+7),v.extra[i]||'');
    if(font)form.updateFieldAppearances(font);
    return doc;
  }
  /* The Schedule 5 pharmacy-items page(s), drawn as A4 PDF pages with the same
     content and layout as the 📋 Schedule 5 print: the Mater Dei logo, the
     patient line, the items and quantities, the notes and the hospital footer. */
  async function addSchedule5(doc,s5){
    if(!s5||!s5.pages||!s5.pages.length)throw new Error('There is no Schedule 5 page for this patient.');
    const L=root.PDFLib;let reg=null,bold=null,sans=null;
    if(root.fontkit){
      const [a,b,c]=await Promise.all([fetchBytes(SERIF_URL),fetchBytes(SERIF_BOLD_URL),fetchBytes(FONT_URL)]);
      try{if(a&&b&&c){doc.registerFontkit(root.fontkit);reg=await doc.embedFont(a,{subset:true});bold=await doc.embedFont(b,{subset:true});sans=await doc.embedFont(c,{subset:true});}}catch(e){reg=bold=sans=null;}
    }
    const t=s=>reg?String(s||''):plain(s);
    if(!reg){reg=await doc.embedFont(L.StandardFonts.TimesRoman);bold=await doc.embedFont(L.StandardFonts.TimesRomanBold);sans=await doc.embedFont(L.StandardFonts.Helvetica);}
    let logo=null;const lb=await fetchBytes(LOGO_URL);if(lb){try{logo=await doc.embedPng(lb);}catch(e){logo=null;}}
    const mm=x=>x*72/25.4,W=595.28,H=841.89,X0=mm(18),X1=W-mm(18),black=L.rgb(0,0,0),navy=L.rgb(0,0,.5);
    const dob=/^\d{4}-\d{2}-\d{2}$/.test(s5.dob||'')?s5.dob.split('-').reverse().join('/'):'';
    const wrap=(text,font,size,width)=>{const words=t(text).split(/\s+/),out=[];let line='';
      words.forEach(w=>{const tryL=line?line+' '+w:w;if(font.widthOfTextAtSize(tryL,size)>width&&line){out.push(line);line=w;}else line=tryL;});if(line)out.push(line);return out;};
    s5.pages.forEach(pg=>{
      const page=doc.addPage([W,H]);let y=H-mm(16);
      if(logo){const w=153.75,h=w*logo.height/logo.width;page.drawImage(logo,{x:X0,y:y-h,width:w,height:h});y-=h+4;}
      page.drawLine({start:{x:X0,y},end:{x:X1,y},thickness:1,color:navy});y-=28;
      const sz=11.5;
      // Patient line: name in bold, then ID, DOB, telephone.
      let x=X0;const seg=(s,f)=>{page.drawText(s,{x,y,size:sz,font:f,color:black});x+=f.widthOfTextAtSize(s,sz);};
      seg(t(s5.name||'Patient'),bold);seg('   ID No: '+t(s5.id||''),reg);if(dob)seg('   DOB: '+dob,reg);if(s5.phone)seg('   Tel: '+t(s5.phone),reg);
      y-=30;
      const head='Items from pharmacy: – ';page.drawText(head,{x:X0,y,size:sz,font:bold});
      const hx=X0+bold.widthOfTextAtSize(head,sz),title=t(pg.title||'');page.drawText(title,{x:hx,y,size:sz,font:bold});
      page.drawLine({start:{x:hx,y:y-1.5},end:{x:hx+bold.widthOfTextAtSize(title,sz),y:y-1.5},thickness:.7});
      y-=26;
      const colW=(X1-X0)*.52;
      (pg.rows||[]).filter(r=>String(r[0]||'').trim()||String(r[1]||'').trim()).forEach(r=>{
        const a=wrap(r[0],reg,sz,colW-22),b=wrap(r[1],reg,sz,(X1-X0)-colW);
        page.drawText('•',{x:X0,y,size:sz,font:reg});
        const n=Math.max(a.length,b.length,1);
        for(let i=0;i<n;i++){if(a[i])page.drawText(a[i],{x:X0+12,y:y-i*14,size:sz,font:reg});if(b[i])page.drawText(b[i],{x:X0+colW+14,y:y-i*14,size:sz,font:reg});}
        y-=n*14+8;
      });
      y-=14;
      const para=(s,f,gap)=>{wrap(s,f,sz,X1-X0).forEach(l=>{page.drawText(l,{x:X0,y,size:sz,font:f});y-=14;});y-=gap;};
      para('Other items are to be ordered only on the advice of a Stoma Care Nurse.',bold,6);
      para('Any increase in quantity of items listed above needs a special request.',bold,14);
      const u='Items are obtained from:';page.drawText(u,{x:X0,y,size:sz,font:bold});page.drawLine({start:{x:X0,y:y-1.5},end:{x:X0+bold.widthOfTextAtSize(u,sz),y:y-1.5},thickness:.7});y-=18;
      para('Support Room at Outpatient’s Pharmacy - Tel: 25456533',reg,2);
      para('Pharmacist in charge: Ms. M’Rose Gatt',reg,0);
      // Footer pinned to the bottom.
      const fy=mm(14),fs=9.5,lines=[['Mater Dei Hospital',true],['Triq Id-Donaturi Tad-Demm, Msida. Malta MSD 2090',false],['Tel: +356 25450000  www.materdeihospital.org.mt',false]];
      page.drawLine({start:{x:X0,y:fy+3*12+4},end:{x:X1,y:fy+3*12+4},thickness:.7,color:L.rgb(.6,.64,.68)});
      lines.forEach(([s,b],i)=>{const f=b?bold:sans,w=f.widthOfTextAtSize(s,fs);page.drawText(s,{x:(W-w)/2,y:fy+(2-i)*12,size:fs,font:f});});
    });
  }
  const fileName=v=>(v.what==='s5'?'Schedule 5':v.what==='both'?'POYC16 + Schedule 5':'POYC16 Schedule V request')+(v.id?' '+v.id.replace(/[^A-Za-z0-9]/g,''):'')+'.pdf';
  const msg=t=>{const el=root.document.getElementById('pq-msg');if(el)el.textContent=t||'';};
  function check(v){
    if(!v.name||!v.id){msg('Fill in the patient’s name and ID card number first.');return false;}
    return true;
  }
  async function fill(btn){
    const v=read();if(!check(v))return;remember(v);
    // Opened now, while the tap still counts, so a pop-up blocker lets it through.
    const w=root.open('','_blank');
    try{if(w)w.document.write('<p style="font:16px Arial,sans-serif;margin:24px">Preparing the PDF…</p>');}catch(e){}
    if(btn)btn.disabled=true;msg('Filling the form…');
    try{
      const bytes=await build(v),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      if(w)w.location.href=url;else save(bytes,v);
      msg(w?'It opened in a new tab — print it or save it from there.':'Downloaded “'+fileName(v)+'”.');
      try{root.logAudit&&root.logAudit({action:'export',entity:'patient',entity_id:cur&&cur.pid,patient_id:cur&&cur.pid,summary:v.what==='s5'?'Printed the Schedule 5 page':'Filled the POYC 16 Schedule V request form'+(v.what==='both'?' with the Schedule 5 page':'')});}catch(e){}
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
