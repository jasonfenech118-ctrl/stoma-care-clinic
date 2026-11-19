/* ESRF — Extra Supplies Requisition Form (Logistics Department, cost centre STO-01).
   The official form is kept as the ORIGINAL Excel file (assets/forms/esrf-sto-01.xlsx,
   logo and formatting included). On Send, that file is opened, the item rows, the
   date and the signature are written into its own cells, and the same workbook is
   downloaded — so Logistics receives their own form, not a re-drawn copy. An email
   draft then opens to logisticsdept.mdh@gov.mt (CC stomacare.mdh@gov.mt).
   The draft on screen is kept in this browser only (no patient data involved). */
(function esrfModule(root){
  'use strict';

  const TEMPLATE_URL='assets/forms/esrf-sto-01.xlsx?v=1';
  const SHEET_PATH='xl/worksheets/sheet1.xml';
  const WORKBOOK_PATH='xl/workbook.xml';
  const JSZIP_URL='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  const MAIL_TO='logisticsdept.mdh@gov.mt';
  const MAIL_CC='stomacare.mdh@gov.mt';
  const LS_KEY='clinic_esrf_draft';
  const FORM_ROWS=3;          // item rows printed on the form (rows 12–14)
  const FIRST_ITEM_ROW=12;
  const MAX_ITEMS=25;

  // ── Small helpers ─────────────────────────────────────────────────────────
  function pad(n){return String(n).padStart(2,'0');}
  function todayIso(d){d=d||new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function dmy(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));return m?`${m[3]}/${m[2]}/${m[1]}`:String(iso||'');}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function xmlEsc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');}
  function colNum(col){let n=0;for(const ch of col)n=n*26+(ch.charCodeAt(0)-64);return n;}

  // ── Draft model ───────────────────────────────────────────────────────────
  function blankItem(){return{code:'',desc:'',qty:'',reason:''};}
  function defaultDraft(){
    return{date:todayIso(),signer:'',delivery:'',items:[blankItem(),blankItem(),blankItem()]};
  }
  function normaliseDraft(d){
    const base=defaultDraft();
    if(!d||typeof d!=='object')return base;
    base.signer=String(d.signer||'');
    base.delivery=String(d.delivery||'');
    if(Array.isArray(d.items)&&d.items.length)
      base.items=d.items.slice(0,MAX_ITEMS).map(it=>({code:String(it&&it.code||''),desc:String(it&&it.desc||''),qty:String(it&&it.qty||''),reason:String(it&&it.reason||'')}));
    return base;   // the date is always today's — never a stale saved one
  }
  function filledItems(d){return(d.items||[]).filter(it=>(it.code+it.desc+it.qty+it.reason).trim());}

  // ── Excel: write into the original workbook's sheet XML ───────────────────
  // Shift every row at/after `from` down by `k` (cells, merges, dimension).
  function shiftRows(xml,from,k){
    if(!k)return xml;
    const bump=(col,row)=>col+(+row>=from?+row+k:+row);
    xml=xml.replace(/<row r="(\d+)"/g,(m,r)=>`<row r="${+r>=from?+r+k:r}"`);
    xml=xml.replace(/<c r="([A-Z]+)(\d+)"/g,(m,c,r)=>`<c r="${bump(c,r)}"`);
    xml=xml.replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g,(m,c1,r1,c2,r2)=>`<mergeCell ref="${bump(c1,r1)}:${bump(c2,r2)}"`);
    xml=xml.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/,(m,c1,r1,c2,r2)=>`<dimension ref="${bump(c1,r1)}:${bump(c2,r2)}"`);
    return xml;
  }
  function cellXml(ref,style,value){
    const s=style!=null?` s="${style}"`:'';
    if(value===''||value==null)return `<c r="${ref}"${s}/>`;
    if(typeof value==='number')return `<c r="${ref}"${s}><v>${value}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
  }
  // Set one cell's value, keeping the cell's own style. Adds the cell (in column
  // order) when the template row has none.
  function setCell(xml,ref,value,fallbackStyle){
    const row=+/\d+$/.exec(ref)[0],col=/^[A-Z]+/.exec(ref)[0];
    const cellRe=new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
    const m=cellRe.exec(xml);
    if(m){
      const st=/\ss="(\d+)"/.exec(m[1]);
      return xml.slice(0,m.index)+cellXml(ref,st?st[1]:fallbackStyle,value)+xml.slice(m.index+m[0].length);
    }
    const rowRe=new RegExp(`<row r="${row}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`);
    const rm=rowRe.exec(xml);
    if(!rm)throw new Error('ESRF template: row '+row+' not found');
    const open=rm[0].endsWith('/>')?rm[0].slice(0,-2)+'>':rm[0].slice(0,rm[0].indexOf('>')+1);
    let inner=rm[1]||'';
    const cells=inner.match(/<c r="[A-Z]+\d+"[\s\S]*?(?:\/>|<\/c>)/g)||[];
    const fresh=cellXml(ref,fallbackStyle,value);
    let placed=false;const out=[];
    cells.forEach(c=>{const cc=/<c r="([A-Z]+)/.exec(c)[1];if(!placed&&colNum(cc)>colNum(col)){out.push(fresh);placed=true;}out.push(c);});
    if(!placed)out.push(fresh);
    return xml.slice(0,rm.index)+open+out.join('')+'</row>'+xml.slice(rm.index+rm[0].length);
  }
  function qtyValue(v){const s=String(v==null?'':v).trim();if(s==='')return '';const n=Number(s);return Number.isFinite(n)&&/^\d+(\.\d+)?$/.test(s)?n:s;}
  // Pure: patch the template's sheet1.xml with the draft. Returns new XML.
  function patchSheetXml(xml,d){
    const items=filledItems(d);
    const extra=Math.max(0,items.length-FORM_ROWS);
    const afterItems=FIRST_ITEM_ROW+FORM_ROWS;                 // row 15 on the template
    if(extra){
      xml=shiftRows(xml,afterItems,extra);
      let rows='';
      for(let i=0;i<extra;i++){
        const r=afterItems+i;
        rows+=`<row r="${r}" spans="1:5" ht="30.75" customHeight="1">${cellXml('A'+r,33,'')}${cellXml('B'+r,29,'')}${cellXml('C'+r,27,'')}${cellXml('D'+r,21,'')}${cellXml('E'+r,27,'')}</row>`;
      }
      const at=xml.indexOf(`<row r="${afterItems+extra}"`);
      xml=xml.slice(0,at)+rows+xml.slice(at);
    }
    for(let i=0;i<Math.max(items.length,FORM_ROWS);i++){
      const r=FIRST_ITEM_ROW+i,it=items[i]||blankItem();
      xml=setCell(xml,'A'+r,it.code.trim(),33);
      xml=setCell(xml,'B'+r,it.desc.trim(),29);
      xml=setCell(xml,'C'+r,qtyValue(it.qty),27);
      xml=setCell(xml,'E'+r,it.reason.trim(),27);
    }
    if(String(d.delivery||'').trim())xml=setCell(xml,'E10',String(d.delivery).trim(),26);
    const sigRow=afterItems+extra+1;                          // row 16 on the template
    xml=setCell(xml,'B'+sigRow,'Signiture: '+String(d.signer||'').trim(),36);
    xml=setCell(xml,'E'+sigRow,dmy(d.date),24);
    return xml;
  }
  function patchWorkbookXml(xml,extra){
    if(!extra)return xml;
    return xml.replace(/(Print_Area"[^>]*>[^<]*?\$E\$)(\d+)/,(m,a,r)=>a+(+r+extra));
  }
  function fileName(d){return `Stoma Care - ESRF STO-01 - ${dmy(d.date).replace(/\//g,'-')}.xlsx`;}

  // ── Email ─────────────────────────────────────────────────────────────────
  function mailSubject(d){return `ESRF Stoma Care ${dmy(d.date)}`;}
  function mailBody(){
    // No sign-off name — Outlook appends the nurse's own signature block.
    return [
      'To whom it may concern,',
      '',
      'Kindly find attached the Extra Supplies Requisition Form (ESRF) for Stoma Care, cost centre STO-01.',
      '',
      'Kind regards,'
    ].join('\r\n');
  }
  function openMail(d){
    const href='mailto:'+MAIL_TO+'?cc='+encodeURIComponent(MAIL_CC)+
      '&subject='+encodeURIComponent(mailSubject(d))+'&body='+encodeURIComponent(mailBody(d));
    if(typeof root.openMailtoLink==='function')root.openMailtoLink(href);
    else{const a=root.document.createElement('a');a.href=href;root.document.body.appendChild(a);a.click();a.remove();}
  }

  // ── Build + download the filled original workbook ─────────────────────────
  function ensureJSZip(){
    if(root.JSZip)return Promise.resolve(root.JSZip);
    return new Promise((resolve,reject)=>{
      const s=root.document.createElement('script');
      s.src=JSZIP_URL;
      s.onload=()=>root.JSZip?resolve(root.JSZip):reject(new Error('Excel tools failed to load.'));
      s.onerror=()=>reject(new Error('Could not load the Excel tools — check the connection and try again.'));
      root.document.head.appendChild(s);
    });
  }
  async function buildBlob(d){
    const JSZip=await ensureJSZip();
    const res=await fetch(TEMPLATE_URL,{cache:'no-cache'});
    if(!res.ok)throw new Error('Could not open the ESRF form ('+res.status+').');
    const zip=await JSZip.loadAsync(await res.arrayBuffer());
    const extra=Math.max(0,filledItems(d).length-FORM_ROWS);
    zip.file(SHEET_PATH,patchSheetXml(await zip.file(SHEET_PATH).async('string'),d));
    zip.file(WORKBOOK_PATH,patchWorkbookXml(await zip.file(WORKBOOK_PATH).async('string'),extra));
    return zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);
    const a=root.document.createElement('a');a.href=url;a.download=name;
    root.document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }

  // ── Page ──────────────────────────────────────────────────────────────────
  let deps={getSigner:null};
  let state={draft:null};
  function save(){try{root.localStorage&&root.localStorage.setItem(LS_KEY,JSON.stringify(state.draft));}catch(e){}}
  function load(){try{const raw=root.localStorage&&root.localStorage.getItem(LS_KEY);return raw?normaliseDraft(JSON.parse(raw)):null;}catch(e){return null;}}
  function knownItems(){try{return(root.ClinicOrdering&&root.ClinicOrdering.PART1)||[];}catch(e){return[];}}

  function itemsHTML(d){
    return d.items.map((it,i)=>`<tr>
      <td><input type="text" list="esrf-codes" data-i="${i}" data-k="code" value="${esc(it.code)}" aria-label="Item code ${i+1}"></td>
      <td><input type="text" data-i="${i}" data-k="desc" value="${esc(it.desc)}" aria-label="Item description ${i+1}"></td>
      <td class="q"><input type="text" inputmode="numeric" data-i="${i}" data-k="qty" value="${esc(it.qty)}" aria-label="Quantity ${i+1}"></td>
      <td><input type="text" data-i="${i}" data-k="reason" value="${esc(it.reason)}" aria-label="Reason ${i+1}"></td>
      <td class="x"><button type="button" class="esrf-del" data-del="${i}" title="Remove this line" aria-label="Remove line ${i+1}">✕</button></td>
    </tr>`).join('');
  }
  function render(){
    const body=root.document.getElementById('esrf-body');if(!body)return;
    const d=state.draft;
    if(!d){body.innerHTML='<div class="ord-loading">Loading the ESRF…</div>';return;}
    const codes=knownItems().map(it=>`<option value="${esc(it.code)}">${esc(it.desc)}</option>`).join('');
    body.innerHTML=`
      <div class="ord-topbar">
        <h2>🧾 ESRF — Extra Supplies Requisition</h2>
        <div class="ord-actions">
          <button class="ord-btn" id="esrf-clear">↺ Clear</button>
          <button class="ord-btn" id="esrf-download">⬇ Download Excel</button>
          <button class="ord-btn ord-btn-primary" id="esrf-send">✉ Send email</button>
        </div>
      </div>
      <div id="esrf-note"></div>
      <div class="ord-head-grid">
        <label>Date (auto — today)<input type="date" id="esrf-date" value="${esc(d.date)}"></label>
        <label>Signature (auto — signed-in nurse)<input type="text" id="esrf-signer" value="${esc(d.signer)}"></label>
        <label>Scheduled delivery period &amp; day<input type="text" id="esrf-delivery" value="${esc(d.delivery)}" placeholder="optional"></label>
      </div>
      <p class="ord-note">Fills the <b>original Logistics ESRF Excel form</b> (Stoma Care, STO-01). <b>Send email</b> downloads the filled form and opens an email to <b>${esc(MAIL_TO)}</b>, CC <b>${esc(MAIL_CC)}</b> — attach the downloaded file and press send.</p>
      <datalist id="esrf-codes">${codes}</datalist>
      <table class="ord-table esrf-table"><thead><tr><th>Item code</th><th>Item description</th><th>Qty (APP)</th><th>Reason for extra supply</th><th></th></tr></thead>
        <tbody>${itemsHTML(d)}</tbody></table>
      <button class="ord-btn esrf-add" id="esrf-add" ${d.items.length>=MAX_ITEMS?'disabled':''}>＋ Add item</button>
      <p class="ord-subnote">The form has three item lines; extra lines are added to the Excel form automatically. “Approved EF” is left blank for Logistics.</p>`;
    wire();
  }
  function wire(){
    const doc=root.document,body=doc.getElementById('esrf-body');
    body.querySelectorAll('input[data-k]').forEach(inp=>inp.addEventListener('input',()=>{
      const i=+inp.dataset.i,k=inp.dataset.k;state.draft.items[i][k]=inp.value;
      if(k==='code'){                                   // known clinic item → fill its description
        const hit=knownItems().find(it=>it.code.toUpperCase()===inp.value.trim().toUpperCase());
        const descEl=body.querySelector(`input[data-i="${i}"][data-k="desc"]`);
        if(hit&&descEl&&!descEl.value.trim()){descEl.value=hit.desc;state.draft.items[i].desc=hit.desc;}
      }
      save();
    }));
    const hb=(id,key)=>{const el=doc.getElementById(id);if(el)el.addEventListener('input',()=>{state.draft[key]=el.value;save();});};
    hb('esrf-date','date');hb('esrf-signer','signer');hb('esrf-delivery','delivery');
    body.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{
      state.draft.items.splice(+b.dataset.del,1);if(!state.draft.items.length)state.draft.items.push(blankItem());save();render();
    }));
    const b=(id,fn)=>{const el=doc.getElementById(id);if(el)el.addEventListener('click',fn);};
    b('esrf-add',()=>{if(state.draft.items.length<MAX_ITEMS){state.draft.items.push(blankItem());save();render();}});
    b('esrf-clear',async()=>{if(root.confirm&&!root.confirm('Clear all ESRF lines?'))return;state.draft=defaultDraft();await autoSign();save();render();});
    b('esrf-download',()=>produce(false));
    b('esrf-send',()=>produce(true));
  }
  function note(html){const n=root.document.getElementById('esrf-note');if(n)n.innerHTML=html;}
  async function produce(withMail){
    const d=state.draft;
    if(!filledItems(d).length){note('<div class="ord-error">Add at least one item before sending the ESRF.</div>');return;}
    if(!String(d.signer||'').trim())await autoSign();
    note('<div class="ord-saved">Preparing the ESRF Excel form…</div>');
    try{
      downloadBlob(await buildBlob(d),fileName(d));
      if(withMail)openMail(d);
      note(withMail
        ?`<div class="ord-confirm"><b>The filled ESRF form was downloaded and an email draft opened.</b> Attach <b>${esc(fileName(d))}</b> to the email and press send.</div>`
        :`<div class="ord-saved">⬇ Downloaded <b>${esc(fileName(d))}</b>.</div>`);
    }catch(e){note('<div class="ord-error">Could not build the ESRF form: '+esc(e.message||e)+'</div>');}
  }
  async function autoSign(){
    try{if(deps.getSigner){const n=await deps.getSigner();if(n)state.draft.signer=n;}}catch(e){}
  }
  async function open(){
    state.draft=load()||defaultDraft();
    state.draft.date=todayIso();                       // date always automatic
    await autoSign();                                  // signature = whoever is signed in now
    save();render();
  }

  const api={init(d){deps=Object.assign(deps,d||{});},open,
    // pure helpers exposed for tests
    patchSheetXml,patchWorkbookXml,shiftRows,setCell,mailSubject,mailBody,fileName,defaultDraft,normaliseDraft,dmy,ensureJSZip,downloadBlob,
    MAIL_TO,MAIL_CC,TEMPLATE_URL};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ClinicESRF=api;
})(typeof window!=='undefined'?window:globalThis);
