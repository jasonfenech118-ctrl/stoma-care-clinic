/* Government Printing Press order (Stoma Care, cost centre STO-01).
   Ordered every third week of the month. The ORIGINAL Excel form is kept as
   assets/forms/printing-press-sto-01.xlsx; on Send / Download the date, the
   officer (the signed-in nurse) and each item's DEMAND are written into its own
   cells and that same workbook is produced. Send email downloads an Outlook
   draft (.eml) addressed to the Printing Press with the Excel already attached.
   The draft on screen is kept in this browser only (no patient data). */
(function printingPressModule(root){
  'use strict';
  const TEMPLATE_URL='assets/forms/printing-press-sto-01.xlsx?v=1';
  const SHEET_PATH='xl/worksheets/sheet1.xml';
  const MAIL_TO=['edwin.bartolo@gov.mt','mark-jason.ciantar@gov.mt'];
  const MAIL_CC='stomacare.mdh@gov.mt';
  const LS_KEY='clinic_printing_press_draft';
  const FIRST_ROW=6;
  // The items exactly as the official form lists them (rows 6–19).
  const ITEMS=[
    ['MDH001','PINK FOLDER'],['MDH003','LAB FORM YELLOW / BLACK STRIPE'],['MDH004','LAB FORM GREEN'],
    ['MDH005','CONSULTATION FORM'],['MDH006','LETTER HEAD A5'],['MDH007','LETTER HEAD A6'],
    ['MDH008','PINK FORM BLOODS'],['MDH009','MEDICINE CARDS'],['MDH017','CONTINUATION SHEET'],
    ['MDH077','CPSU ORDERING BOOK'],['MDH200','A6 ENVELOPES'],['MDH201','A5 ENVELOPES'],
    ['MDH202','A4 ENVELOPES'],['MDH204','DL ENVELOPES WITH WINDOW']
  ].map(([code,desc])=>({code,desc}));

  function pad(n){return String(n).padStart(2,'0');}
  function todayIso(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function dmy(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));return m?`${m[3]}/${m[2]}/${m[1]}`:String(iso||'');}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function E(){return root.ClinicESRF;}   // shared Excel helpers (setCell, JSZip loader, download)

  function defaultDraft(){return{date:todayIso(),officer:'',demand:ITEMS.map(()=>'')};}
  function normalise(d){
    const b=defaultDraft();if(!d||typeof d!=='object')return b;
    if(Array.isArray(d.demand))b.demand=ITEMS.map((_,i)=>String(d.demand[i]==null?'':d.demand[i]));
    b.officer=String(d.officer||'');return b;      // the date is always today's
  }
  function ordered(d){return ITEMS.map((it,i)=>({...it,qty:String(d.demand[i]||'').trim()})).filter(x=>x.qty);}

  // Pure: write the date, officer and demands into the template's sheet XML.
  function patchSheetXml(xml,d){
    const set=E().setCell;
    const val=v=>{const s=String(v||'').trim();return /^\d+(\.\d+)?$/.test(s)?Number(s):s;};
    xml=set(xml,'D2',dmy(d.date),44);
    xml=set(xml,'B3',String(d.officer||'').trim(),15);
    ITEMS.forEach((_,i)=>{xml=set(xml,'E'+(FIRST_ROW+i),val(d.demand[i]),11);});   // clears the old sample demand too
    return xml;
  }
  function fileName(d){return `STO-01 Printing Press ${dmy(d.date).replace(/\//g,'-')}.xlsx`;}
  async function buildFile(d){
    const JSZip=await E().ensureJSZip();
    const res=await fetch(TEMPLATE_URL,{cache:'no-cache'});
    if(!res.ok)throw new Error('Could not open the Printing Press form ('+res.status+').');
    const zip=await JSZip.loadAsync(await res.arrayBuffer());
    zip.file(SHEET_PATH,patchSheetXml(await zip.file(SHEET_PATH).async('string'),d));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    return new File([blob],fileName(d),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }

  function mailSubject(d){return `Printing Press order — Stoma Care STO-01 — ${dmy(d.date)}`;}
  function mailBody(d){
    // No sign-off name — Outlook appends the nurse's own signature block.
    return ['To whom it may concern,','',
      'Kindly find attached the Government Printing Press order for Stoma Care (cost centre STO-01).','',
      'Kind regards,'].join('\r\n');
  }
  // An unsent Outlook draft (.eml) with To / Cc / subject / message and the Excel attached.
  async function emlDraft(d,file){
    const b64=s=>btoa(unescape(encodeURIComponent(s)));
    const wrap=s=>s.replace(/.{1,76}/g,'$&\r\n');
    const buf=new Uint8Array(await file.arrayBuffer());
    let bin='';for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));
    const boundary='----=_StomaCare_'+Math.random().toString(36).slice(2);
    const name='=?UTF-8?B?'+b64(file.name)+'?=';
    const eml=['X-Unsent: 1','To: '+MAIL_TO.join(', '),'Cc: '+MAIL_CC,'Subject: =?UTF-8?B?'+b64(mailSubject(d))+'?=','MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,
      'Content-Type: text/plain; charset="utf-8"','Content-Transfer-Encoding: base64','',wrap(b64(mailBody(d))),
      '--'+boundary,'Content-Type: '+file.type+'; name="'+name+'"','Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="'+name+'"','',wrap(btoa(bin)),'--'+boundary+'--',''].join('\r\n');
    return new File([eml],`Email to Printing Press ${dmy(d.date).replace(/\//g,'-')}.eml`,{type:'message/rfc822'});
  }
  function plainMail(d){
    const href='mailto:'+MAIL_TO.join(',')+'?cc='+encodeURIComponent(MAIL_CC)+'&subject='+encodeURIComponent(mailSubject(d))+'&body='+encodeURIComponent(mailBody(d));
    if(typeof root.openMailtoLink==='function')root.openMailtoLink(href);
    else{const a=root.document.createElement('a');a.href=href;root.document.body.appendChild(a);a.click();a.remove();}
  }

  // ── Page ──
  let deps={getSigner:null},state={draft:null,busy:false};
  function save(){try{root.localStorage&&root.localStorage.setItem(LS_KEY,JSON.stringify(state.draft));}catch(e){}}
  function load(){try{const raw=root.localStorage&&root.localStorage.getItem(LS_KEY);return raw?normalise(JSON.parse(raw)):null;}catch(e){return null;}}
  function note(html){const n=root.document.getElementById('pp-note');if(n)n.innerHTML=html;}
  function render(){
    const body=root.document.getElementById('pp-body');if(!body)return;
    const d=state.draft;if(!d){body.innerHTML='<div class="ord-loading">Loading…</div>';return;}
    body.innerHTML=`
      <div class="ord-topbar"><h2>🖨️ Government Printing Press</h2>
        <div class="ord-actions">
          <button class="ord-btn pp-act" id="pp-clear">↺ Clear</button>
          <button class="ord-btn pp-act" id="pp-download">⬇ Download Excel</button>
          <button class="ord-btn ord-btn-primary pp-act" id="pp-send">✉ Send email</button>
        </div></div>
      <div id="pp-note"></div>
      <div class="ord-head-grid">
        <label>Date (auto — today)<input type="date" id="pp-date" value="${esc(d.date)}"></label>
        <label>Name and Surname Officer I/c (auto — signed-in nurse)<input type="text" id="pp-officer" value="${esc(d.officer)}"></label>
      </div>
      <p class="ord-note">Ordered <b>every third week of the month</b>. Fills the <b>original Printing Press Excel form</b> (Stoma Care, STO-01). <b>Send email</b> downloads an Outlook email draft to <b>${esc(MAIL_TO.join(' and '))}</b>, CC <b>${esc(MAIL_CC)}</b>, with the form <b>already attached</b> — open it from the browser’s downloads and press Send.</p>
      <table class="ord-table pp-table"><thead><tr><th>Stock code</th><th>Item description</th><th>Demand</th></tr></thead><tbody>
        ${ITEMS.map((it,i)=>`<tr><td class="c">${esc(it.code)}</td><td>${esc(it.desc)}</td>
          <td class="q pp-q"><input type="text" data-i="${i}" value="${esc(d.demand[i])}" placeholder="e.g. 2 or 1 box" aria-label="Demand ${esc(it.desc)}"></td></tr>`).join('')}
      </tbody></table>
      <p class="ord-subnote">Leave an item blank if it is not needed. Unit, quota and supply are left for the Printing Press. Draft not opening? <a href="#" id="pp-plain">Use a plain email and attach the downloaded Excel</a>.</p>`;
    body.querySelectorAll('input[data-i]').forEach(inp=>inp.addEventListener('input',()=>{state.draft.demand[+inp.dataset.i]=inp.value;save();}));
    const hb=(id,k)=>{const el=root.document.getElementById(id);if(el)el.addEventListener('input',()=>{state.draft[k]=el.value;save();});};
    hb('pp-date','date');hb('pp-officer','officer');
    const b=(id,fn)=>{const el=root.document.getElementById(id);if(el)el.addEventListener('click',fn);};
    b('pp-clear',async()=>{if(root.confirm&&!root.confirm('Clear all Printing Press quantities?'))return;state.draft=defaultDraft();await autoSign();save();render();});
    b('pp-download',()=>produce('download'));
    b('pp-send',()=>produce('send'));
    b('pp-plain',e=>{e.preventDefault();produce('plain');});
  }
  function lock(on){state.busy=on;root.document.querySelectorAll('#pp-body .pp-act').forEach(x=>x.disabled=on);}
  async function produce(mode){
    const d=state.draft;if(state.busy)return;
    if(!ordered(d).length){note('<div class="ord-error">Enter a demand for at least one item first.</div>');return;}
    if(!String(d.officer||'').trim())await autoSign();
    lock(true);note('<div class="ord-saved">Preparing the Printing Press form…</div>');
    try{
      const file=await buildFile(d);
      if(mode==='send'){
        E().downloadBlob(await emlDraft(d,file),`Email to Printing Press ${dmy(d.date).replace(/\//g,'-')}.eml`);
        note(`<div class="ord-confirm"><b>The email draft was downloaded with the form attached.</b> Open it from the browser’s downloads (top right) — it opens in Outlook addressed to ${esc(MAIL_TO.join(' and '))}, CC ${esc(MAIL_CC)}. Press <b>Send</b>.</div>`);
      }else if(mode==='plain'){
        E().downloadBlob(file,file.name);plainMail(d);
        note(`<div class="ord-confirm">A plain email opened and <b>${esc(file.name)}</b> was downloaded — attach it and press Send.</div>`);
      }else{
        E().downloadBlob(file,file.name);note(`<div class="ord-saved">⬇ Downloaded <b>${esc(file.name)}</b>.</div>`);
      }
    }catch(e){note('<div class="ord-error">Could not build the form: '+esc(e.message||e)+'</div>');}
    finally{lock(false);}
  }
  async function autoSign(){try{if(deps.getSigner){const n=await deps.getSigner();if(n)state.draft.officer=n;}}catch(e){}}
  async function open(){
    state.draft=load()||defaultDraft();
    state.draft.date=todayIso();      // date is always automatic
    await autoSign();                 // officer = whoever is signed in now
    save();render();
  }
  const api={init(d){deps=Object.assign(deps,d||{});},open,patchSheetXml,mailSubject,mailBody,fileName,ITEMS,MAIL_TO,MAIL_CC};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ClinicPrintingPress=api;
})(typeof window!=='undefined'?window:globalThis);
