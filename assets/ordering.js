/* Weekly stores ordering.
   Two official MDH order forms for the Stoma Care Clinic, filled in once a week,
   printed, and emailed to the disposables stores:
     • Part 1 — M.M.M.U. IRO Top-Up System List (disposables).
     • Part 2 — Cleaning Consumables Order List.
   The two forms are entered together on one page but exported as TWO separate
   Excel files, attached to one email to disposablessupplies.mdh@gov.mt (CC
   stomacare.mdh@gov.mt). The order is due every Saturday after 06:30; a reminder
   keeps appearing until it is marked sent, then stays quiet until next Saturday.
   State is shared in Supabase (table clinic_orders, one row per week-ending
   Saturday); if that table is not there yet it degrades to this browser only. */
(function orderingModule(root){
  'use strict';

  const TABLE='clinic_orders';
  const ORDER_TO='disposablessupplies.mdh@gov.mt';
  const ORDER_CC='stomacare.mdh@gov.mt';
  const DUE_HOUR=6, DUE_MIN=30;        // Saturday 06:30
  const LS_PREFIX='clinic_order_';     // localStorage fallback key prefix

  // Fixed identifiers taken from the official paper forms.
  const FORM_META={
    team:'Team 1 — Tuesday',
    location:'OUT PATIENTS LEVEL -1',
    ward:'STOMA CARE CLINIC',
    officer:'Jason Fenech',
    ext:'4431/2',
    costCentre:'STO-01',
    tel:'25454431/2',
    title1:'M.M.M.U. - IRO Top-Up System List, Disposables',
    line1:'STO-01     Stoma Care Clinic  Tel  25454431/2',
    title2:'CLEANING CONSUMABLES ORDER LIST'
  };

  // Part 1 — disposables (code, description, standing top-up quantity).
  const PART1=[{"code":"P2019","desc":"ALCOHOL WIPES","topup":"2"},{"code":"EQ02050","desc":"BASIC DRESSING PACK STERILE","topup":"18"},{"code":"F011","desc":"DRESSING STERILE - HYDROCOLLOID 10CM X 10CM","topup":"5"},{"code":"F012","desc":"DRESSING STERILE - HYDROCOLLOID 20CM X 20CM","topup":"5"},{"code":"F027","desc":"DRESSING STERILE - HYDROCOLLOID THIN FILM 5CM X 20CM","topup":"5"},{"code":"EQ07023","desc":"GLOVES - HYPOALLERGENIC LATEX EXAM SIZE MEDIUM","topup":"200"},{"code":"ICU014","desc":"GLOVES - HYPOALLERGENIC LATEX EXAM SIZE LARGE","topup":"200"},{"code":"EQ02033","desc":"LOW ADHERENT DRESSING STERILE - 5CM X 5CM","topup":"5"},{"code":"EQ12036","desc":"LANCET - BLOOD","topup":"50"},{"code":"EQ13096","desc":"GLUCOSE IN BLOOD MONITORING STRIPS","topup":"200"},{"code":"EQ17019","desc":"REMOVAL OF SUTURE PACK STERILE","topup":"1"},{"code":"EQ02037","desc":"SELF ADHESIVE FABRIC  ROLL - 10CM X 10M","topup":"1"},{"code":"EQ02038","desc":"SELF ADHESIVE FABRIC ROLL - 15CM X 10M","topup":"1"},{"code":"EQ02013","desc":"SWAB DISP NON WOVEN STERILE . 10 X 10","topup":"225"},{"code":"EQ03004","desc":"TAPE - HYPOALLERGIC SURGICAL","topup":"1"},{"code":"ICU025","desc":"SANITIZING WIPES (CLINELL SURFACE WIPES)","topup":"1"},{"code":"EQ13534","desc":"SURGICAL HAIR CLIPPER BLADE","topup":"10"},{"code":"P2020","desc":"ALCOHOL HAND RUB","topup":"1"},{"code":"P3021","desc":"SKIN CARE LOTION HIGH QUALITY NON - GREASY MOISTURIZING PERFUME FREE 500ML","topup":"1"},{"code":"EQ16162","desc":"ADHESIEVE REMOVER SPRAY","topup":"5"},{"code":"MASK005","desc":"MASK FACE","topup":"50"}];

  // Part 2 — cleaning consumables (code, description, unit). The official form
  // carries a few blank codes/units and a couple of repeated lines; kept as-is.
  const PART2=[{"code":"10FOIL-005","desc":"ALUMINIUM FOIL","unit":"PACK"},{"code":"15APRON015","desc":"APRONS DISPOSABLE APRONS FOR DISPENSERERS","unit":"Number"},{"code":"11BAGS-070","desc":"BAGS HOT WATER SOLUBLE","unit":"BAGS"},{"code":"11BAGS-040","desc":"BAGS PLASTIC CLEAR W/RED HD 165 X 230 X 25 (F/BLOOD SAMPLES)","unit":"BAGS"},{"code":"11BAGS-080","desc":"BAGS PLASTIC CLEAR 19\" X 21\" W/MDH PRINT","unit":""},{"code":"11BAGS-062","desc":"BAGS REFUSE TRANSPARENT 32\" X 40\" FOR DOMESTIC WASTE ONLY","unit":"BAGS"},{"code":"11BAGS-050","desc":"BAGS REFUSE YELLOW 32\" X 40\" FOR BIOHAZARD","unit":"BAGS"},{"code":"11BAGS-065","desc":"BAGS VOMITING 123mm X 80mm X 237mm","unit":"BAGS"},{"code":"01BINS002","desc":"BINS","unit":"NUMBER"},{"code":"CC-BLADE-001","desc":"BLADES FOR SAFETY RAZORS","unit":""},{"code":"01BOWLS007","desc":"BOWLS DISPOSABLE","unit":"NUMBER"},{"code":"15BRACE010","desc":"BRACELETS IDENTIFICATION ADULT","unit":"Number"},{"code":"15BRACE020","desc":"BRACELETS IDENTIFICATION ADULT ALLERGY RED","unit":"Number"},{"code":"15BRACE005","desc":"BRACELETS IDENTIFICATION PAEDIATRIC","unit":"Number"},{"code":"15BRACE015","desc":"BRACELETS IDENTIFICATION PAEDIATRIC ALLERGY RED","unit":"Number"},{"code":"03BROOM015","desc":"BROOM FIBRE","unit":"Number"},{"code":"03BRUSH015","desc":"BRUSHES SCRUBBING","unit":"Number"},{"code":"03BRUSH005","desc":"BRUSHES FOR BOTTLES","unit":"Number"},{"code":"15CAPS-015","desc":"CAPS FOR FEMALE NURSES ITEM A FOR LONG HAIR","unit":"Number"},{"code":"15CAPS-005","desc":"CAPS FOR FEMALE NURSES ITEM B FOR SHORT HAIR","unit":"Number"},{"code":"15CAPS-010","desc":"CAPS FOR MALE NURSES","unit":"Number"},{"code":"03CLOTH005","desc":"CLOTH  KITCHEN","unit":"Number"},{"code":"03DETER020","desc":"DETERGENT FLOOR X 5 LTRS","unit":"LTRS."},{"code":"03DETER025","desc":"DISH WASHING LIQUID X 5 LITRES","unit":"LTRS."},{"code":"01ENDM005","desc":"ENDS FOR COTTON MOPS 400gr","unit":"Number"},{"code":"15MASKS005","desc":"FACE MASKS DISPOSABLE C/W FILTER","unit":"Number"},{"code":"15FOAMS005","desc":"FOAM SHAVING","unit":""},{"code":"","desc":"FRENCH MOPS COMPLETE (60 WIDE)","unit":"Number"},{"code":"","desc":"FRENCH MOPS COMPLETE (40 WIDE)","unit":"Number"},{"code":"03POLIS","desc":"FURNITURE POLISH","unit":"Number"},{"code":"03CLEAN020","desc":"GLASS CLEANING LIQUID X 1000ML","unit":"Number"},{"code":"03GLOVE005","desc":"GLOVES RUBBER HOUSEHOLD","unit":"LARGE"},{"code":"15GOWNS005","desc":"GOWNS PLASTIC DISPOSABLE","unit":"Number"},{"code":"03DETER075","desc":"HAND & BODY WASH X 3.78 LTRS (F/OUTPATIENTS ONLY)","unit":"LTRS."},{"code":"03DETER030","desc":"HAND & BODY WASH X 5 LTRS","unit":"LTRS."},{"code":"03DETER032","desc":"HAND & BODY WASH X 500ML C/W DISPENSER PUMP (F/WARDS ONLY)","unit":"BOTTLES"},{"code":"03DETER105","desc":"HAND WASH SERAMAN SENSITIVE 1000ml","unit":""},{"code":"01HANDL005","desc":"HANDLES ALUMINUIM FOR MOPS","unit":"Number"},{"code":"","desc":"HYGEINE LIQUID X 5LTRS","unit":""},{"code":"15INCON005","desc":"INCONTINENCE BED PADS 40cm x 60cm","unit":"Number"},{"code":"15TOWEL005","desc":"INTERFOLD HAND TOWELS","unit":"SHEETS"},{"code":"01JUGSE010","desc":"JUGS ELECTRIC","unit":"NUMBER"},{"code":"01KNIVE030","desc":"KNIVES TABLE","unit":"Number"},{"code":"03MOPS010","desc":"KENTUCKY MOPS COTTON 400gr","unit":"Number"},{"code":"01MATCH005","desc":"MATCHES","unit":"Number"},{"code":"03MOPS020","desc":"MOP FLAT 60cm","unit":""},{"code":"03MOPS015","desc":"MOP FLAT 40cm","unit":""},{"code":"15NAPPI010","desc":"NAPPIES DISPOSABLE ADULT LARGE","unit":"Number"},{"code":"15NAPPI015","desc":"NAPPIES PAEDIATRIC 12 - 25 KILOS","unit":"NUMBER"},{"code":"15NAPPI020","desc":"NAPPIES PAEDIATRIC 2 - 5 KILOS","unit":"NUMBER"},{"code":"10CTIES010","desc":"NYLON CABLE TIES (F/TRANSPARENT & YELLOW REFUSE BAGS ONLY)","unit":"Number"},{"code":"CC-SHOE--001","desc":"OVERSHOES (ITU & THEATERS)","unit":""},{"code":"03PADS 005","desc":"PADS SCOURING","unit":""},{"code":"06PADLO005","desc":"PADLOCK BRASS 1\"","unit":""},{"code":"06PADLO010","desc":"PADLOCK BRASS 1.1/2\"","unit":""},{"code":"01PANS005","desc":"PANS DUST PLASTIC","unit":""},{"code":"12FOAM-010","desc":"PILLOWS SOFT SILICONISED FIBRE 50 X 70CM","unit":"Number"},{"code":"03DETER070","desc":"PINE DISINFECTANT X 5 LITRES","unit":"LTRS."},{"code":"01PLATE030","desc":"PLATES DISPOSABLE","unit":"NUMBER"},{"code":"03POWDE010","desc":"POWDER DETERGENT FOR AUTOMATIC WASHING MACHINE","unit":""},{"code":"03POWDE020","desc":"POWDER SCOURING VIM","unit":"Number"},{"code":"15SHEET005","desc":"SHEET COUCH ROLLS","unit":"Roll"},{"code":"03SHAMP005","desc":"SHAMPOO ADULT","unit":""},{"code":"03SHAMP010","desc":"SHAMPOO BABY","unit":""},{"code":"03SKINS005","desc":"SKINS CHAMOIS LEATHER","unit":"Number"},{"code":"03SOAP015","desc":"SOAP FOR BABY","unit":""},{"code":"03SOAP010","desc":"SOAP TOILET","unit":"Number"},{"code":"03SOAP005","desc":"SOAP LAUNDRY","unit":"Number"},{"code":"03SPONG010","desc":"SPONGES WIRE","unit":""},{"code":"03SPONG015","desc":"SPONGES BATH","unit":"Number"},{"code":"03SPONG005","desc":"SPONGES SCOURING","unit":"Number"},{"code":"08SPRAY005","desc":"SPRAY AIRFRESHENER 300ML","unit":"TINS"},{"code":"08SPRAY010","desc":"SPRAY INSECTICIDE","unit":"TINS"},{"code":"03SQUEE005","desc":"SQUEEGEES FLOOR 13\"LONG","unit":"Number"},{"code":"03SQUEE010","desc":"SQUEEGEES FLOOR 22\"LONG","unit":"Number"},{"code":"01STRAWS005","desc":"STRAWS DRINGING","unit":""},{"code":"03STEEL005","desc":"STEEL WOOL SMALL","unit":"PACK OF 10"},{"code":"03STICK005","desc":"STICKS FOR BROOMS/MOPS","unit":"Number"},{"code":"01STRET005","desc":"STRETCH AND SEAL","unit":"PACKS"},{"code":"03SWABS005","desc":"SWABS FLOOR","unit":"Number"},{"code":"15TAPE015","desc":"TAPE COTTON 1/2\"","unit":""},{"code":"03DETER005","desc":"THICK CLEANING BLEACH X 5 LITRES","unit":"LTRS."},{"code":"01THERMOS","desc":"THERMOS FLASKS","unit":"Number"},{"code":"03CLEAN015","desc":"TOILET CLEANER LIQUID ACID X 500ML","unit":"BOTTLES"},{"code":"01TORCH005","desc":"TORCHES HAND 2 CELL TYPE","unit":""},{"code":"CC-TWINE-001","desc":"TWINE","unit":"ROLL"},{"code":"15HOLDU005","desc":"UNIVERSAL ATTACHMENT FOR URINE & SECRE.","unit":""},{"code":"15APRON015","desc":"WHITE DISPOSABLE APRONS FOR DISPENSERS","unit":"Number"},{"code":"01WRING005","desc":"WRINGERS PLASTIC 4100P","unit":"Number"},{"code":"15APRON020","desc":"YELLOW DISPOSABLE APRONS FOR DISPENSERS","unit":"Number"},{"code":"15APRON015","desc":"WHITE DISPOSABLE APRONS FOR DISPENSERS","unit":"NUMBER"},{"code":"15TOWEL005","desc":"INTERFOLD HAND TOWELS","unit":"NUMBER"}];

  // ── Date helpers ──────────────────────────────────────────────────────────
  function pad(n){return String(n).padStart(2,'0');}
  function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  // The Saturday whose 06:30 deadline has most recently passed — the week the
  // order is currently for. Before 06:30 on a Saturday it is still last week's.
  function mostRecentDueSaturday(now){
    const d=new Date(now.getFullYear(),now.getMonth(),now.getDate(),now.getHours(),now.getMinutes(),0,0);
    const daysSinceSat=(d.getDay()+1)%7;                 // Sat→0, Sun→1, … Fri→6
    const sat=new Date(d.getFullYear(),d.getMonth(),d.getDate()-daysSinceSat);
    if(daysSinceSat===0){                                 // today is Saturday
      const past=d.getHours()>DUE_HOUR||(d.getHours()===DUE_HOUR&&d.getMinutes()>=DUE_MIN);
      if(!past)sat.setDate(sat.getDate()-7);
    }
    return ymd(sat);
  }
  function addDays(weekEnding,n){const d=new Date(weekEnding+'T12:00:00');d.setDate(d.getDate()+n);return ymd(d);}
  function niceDate(iso){
    const d=new Date(iso+'T12:00:00');
    if(Number.isNaN(d.getTime()))return iso||'';
    return d.toLocaleDateString('en-MT',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  }
  function fileDate(iso){return String(iso||'').replace(/-/g,'');}

  // ── Order model ───────────────────────────────────────────────────────────
  function defaultOrder(weekEnding){
    return {
      week_ending:weekEnding,
      header:{date:weekEnding,team:FORM_META.team,location:FORM_META.location,ward:FORM_META.ward,
        officer:FORM_META.officer,ext:FORM_META.ext,cost_centre:FORM_META.costCentre,remarks:FORM_META.team,
        your_ref:'',our_ref:''},
      part1:PART1.map(it=>it.topup||''),         // pre-filled standing top-up quantities
      part2:PART2.map(()=>''),                    // cleaning demand starts blank
      status:'draft',sent_at:null,sent_by:null
    };
  }
  function normaliseOrder(o,weekEnding){
    const base=defaultOrder(weekEnding);
    if(!o||typeof o!=='object')return base;
    base.header=Object.assign(base.header,o.header||{});
    if(Array.isArray(o.part1))base.part1=PART1.map((_,i)=>o.part1[i]==null?'':String(o.part1[i]));
    if(Array.isArray(o.part2))base.part2=PART2.map((_,i)=>o.part2[i]==null?'':String(o.part2[i]));
    base.status=o.status==='sent'?'sent':'draft';
    base.sent_at=o.sent_at||null;base.sent_by=o.sent_by||null;
    return base;
  }

  // ── Persistence (Supabase, with per-browser fallback) ─────────────────────
  let deps={db:null,ensureXLSX:null,getUser:null};
  function isMissingTable(e){return /clinic_orders|relation|does not exist|schema cache|could not find/i.test(String(e&&e.message||e||''));}
  function toRow(o){return{week_ending:o.week_ending,header:o.header,part1:o.part1,part2:o.part2,status:o.status,sent_at:o.sent_at,sent_by:o.sent_by,updated_at:new Date().toISOString()};}
  async function loadOrder(weekEnding){
    if(deps.db){
      try{
        const{data,error}=await deps.db.from(TABLE).select('*').eq('week_ending',weekEnding).maybeSingle();
        if(!error&&data)return normaliseOrder(data,weekEnding);
        if(error&&!isMissingTable(error))console.warn('[ordering] load',error.message||error);
      }catch(e){if(!isMissingTable(e))console.warn('[ordering] load',e);}
    }
    try{const raw=root.localStorage&&root.localStorage.getItem(LS_PREFIX+weekEnding);if(raw)return normaliseOrder(JSON.parse(raw),weekEnding);}catch(e){}
    return null;
  }
  async function saveOrder(o){
    let db=false;
    if(deps.db){
      try{
        const{error}=await deps.db.from(TABLE).upsert(toRow(o),{onConflict:'week_ending'});
        if(!error)db=true; else if(!isMissingTable(error))throw new Error(error.message||'save failed');
      }catch(e){if(!isMissingTable(e))throw e;}
    }
    if(!db){try{root.localStorage&&root.localStorage.setItem(LS_PREFIX+o.week_ending,JSON.stringify(o));}catch(e){}}
    return db;
  }

  // ── Excel export (two separate workbooks) ─────────────────────────────────
  function num(v){const s=String(v==null?'':v).trim();if(s==='')return '';const n=Number(s);return Number.isFinite(n)&&String(n)===s?n:s;}
  function buildPart1Aoa(o){
    const h=o.header||{};const rows=[];
    rows.push(['Your Ref:',h.your_ref||'','','Our Ref.',h.our_ref||'']);
    rows.push([h.team||FORM_META.team]);
    rows.push([h.location||FORM_META.location]);
    rows.push([]);
    rows.push([FORM_META.title1]);
    rows.push([FORM_META.line1]);
    rows.push(['DATE:',h.date||'']);
    rows.push([]);
    rows.push(['EQ Number','Item Description','Top Up Quantity','Required','Supplied']);
    PART1.forEach((it,i)=>rows.push([it.code,it.desc,num(it.topup),num(o.part1[i]),'']));
    rows.push([]);
    rows.push(['For Office Use Only:']);
    rows.push(['Prepared By:']);rows.push(['Issued By:']);rows.push(['Recd. By:']);
    rows.push(['Authorising Officer Dept:']);rows.push(['Signature:']);
    return rows;
  }
  function buildPart2Aoa(o){
    const h=o.header||{};const rows=[];
    rows.push([FORM_META.title2]);
    rows.push([]);
    rows.push(['Ward / Section:',h.ward||FORM_META.ward,'','Date:',h.date||'']);
    rows.push(['Name and Surname Officer I/c:',h.officer||FORM_META.officer,'','Ext. Nos:',h.ext||FORM_META.ext]);
    rows.push(['Remarks:',h.remarks||FORM_META.team,'','Cost Centre No:',h.cost_centre||FORM_META.costCentre]);
    rows.push([]);
    rows.push(['SLH General Stores Stock Codes','STOCK ITEM DESCRIPTION','UNIT','QUOTA','DEMAND','SUPPLY']);
    PART2.forEach((it,i)=>rows.push([it.code,it.desc,it.unit,'',num(o.part2[i]),'']));
    return rows;
  }
  function aoaToWorkbook(XLSX,aoa,sheetName,cols){
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    if(cols)ws['!cols']=cols.map(w=>({wch:w}));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,sheetName);
    return wb;
  }
  function part1FileName(o){return `Stoma Care — Disposables (MML) order — wk ${fileDate(o.week_ending)}.xlsx`;}
  function part2FileName(o){return `Stoma Care — Cleaning consumables order — wk ${fileDate(o.week_ending)}.xlsx`;}
  async function downloadWorkbooks(o){
    const XLSX=await deps.ensureXLSX();
    const wb1=aoaToWorkbook(XLSX,buildPart1Aoa(o),'Disposables',[14,56,15,11,11]);
    const wb2=aoaToWorkbook(XLSX,buildPart2Aoa(o),'Cleaning',[26,52,12,9,9,9]);
    XLSX.writeFile(wb1,part1FileName(o));
    XLSX.writeFile(wb2,part2FileName(o));
  }

  // ── Email draft ───────────────────────────────────────────────────────────
  function mailSubject(o){return `Stoma Care Clinic — Weekly stores order — week ending ${niceDate(o.week_ending)}`;}
  function mailBody(o){
    return [
      'Dear Disposables Supplies team,',
      '',
      'Please find the Stoma Care Clinic weekly stores order attached as two files:',
      '  1. Disposables — M.M.M.U. IRO top-up list',
      '  2. Cleaning consumables order list',
      '',
      'Cost centre STO-01 — Stoma Care Clinic (Team 1, Tuesday). Tel '+FORM_META.tel+'.',
      '',
      'Kind regards,',
      'Stoma Care Clinic',
      '',
      '— Please attach the two Excel files that were just downloaded to this email before sending.'
    ].join('\r\n');
  }
  function openMail(o){
    const href='mailto:'+ORDER_TO+'?cc='+encodeURIComponent(ORDER_CC)+
      '&subject='+encodeURIComponent(mailSubject(o))+'&body='+encodeURIComponent(mailBody(o));
    if(typeof root.openMailtoLink==='function')root.openMailtoLink(href);
    else{const a=root.document.createElement('a');a.href=href;root.document.body.appendChild(a);a.click();a.remove();}
  }

  // ── Printing ──────────────────────────────────────────────────────────────
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function printFormsHTML(o){
    const h=o.header||{};
    const rows1=PART1.map((it,i)=>`<tr><td>${esc(it.code)}</td><td class="d">${esc(it.desc)}</td><td class="n">${esc(it.topup)}</td><td class="n">${esc(o.part1[i])}</td><td></td></tr>`).join('');
    const rows2=PART2.map((it,i)=>`<tr><td>${esc(it.code)}</td><td class="d">${esc(it.desc)}</td><td>${esc(it.unit)}</td><td></td><td class="n">${esc(o.part2[i])}</td><td></td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Stoma Care — Weekly stores order</title>
      <style>
        *{font-family:Arial,Helvetica,sans-serif;}
        body{margin:16px;color:#111;font-size:11px;}
        h1{font-size:14px;margin:0 0 2px;} h2{font-size:12px;margin:0 0 8px;}
        .meta{margin:4px 0 8px;font-size:11px;} .meta b{display:inline-block;min-width:90px;}
        table{border-collapse:collapse;width:100%;margin-bottom:6px;}
        th,td{border:1px solid #333;padding:3px 5px;text-align:left;vertical-align:top;}
        th{background:#eee;font-size:10px;} td.n{text-align:center;width:52px;} td.d{width:auto;}
        .foot{margin-top:6px;font-size:11px;} .foot div{margin:3px 0;}
        .page-break{page-break-before:always;}
        @media print{body{margin:8mm;}}
      </style></head><body onload="window.print()">
      <h1>${esc(FORM_META.title1)}</h1>
      <div class="meta">${esc(FORM_META.line1)} &nbsp; · &nbsp; ${esc(h.team||FORM_META.team)} · ${esc(h.location||FORM_META.location)}<br/>
        <b>Date:</b> ${esc(niceDate(h.date||o.week_ending))}</div>
      <table><thead><tr><th>EQ Number</th><th>Item Description</th><th>Top-up</th><th>Required</th><th>Supplied</th></tr></thead><tbody>${rows1}</tbody></table>
      <div class="foot"><div><b>For Office Use Only</b></div><div>Prepared By: __________  Issued By: __________  Recd. By: __________</div>
        <div>Authorising Officer Dept: __________  Signature: __________</div></div>
      <div class="page-break"></div>
      <h1>${esc(FORM_META.title2)}</h1>
      <div class="meta"><b>Ward / Section:</b> ${esc(h.ward||FORM_META.ward)} &nbsp; <b>Date:</b> ${esc(niceDate(h.date||o.week_ending))}<br/>
        <b>Officer I/c:</b> ${esc(h.officer||FORM_META.officer)} &nbsp; <b>Ext:</b> ${esc(h.ext||FORM_META.ext)}<br/>
        <b>Remarks:</b> ${esc(h.remarks||FORM_META.team)} &nbsp; <b>Cost Centre:</b> ${esc(h.cost_centre||FORM_META.costCentre)}</div>
      <table><thead><tr><th>Stock Code</th><th>Stock Item Description</th><th>Unit</th><th>Quota</th><th>Demand</th><th>Supply</th></tr></thead><tbody>${rows2}</tbody></table>
      </body></html>`;
  }
  function printForms(o){
    const w=root.open('','_blank');
    if(!w){root.alert&&root.alert('Please allow pop-ups to print the order.');return;}
    w.document.open();w.document.write(printFormsHTML(o));w.document.close();
  }

  // ── Due state (for the Saturday reminder) ─────────────────────────────────
  // Returns the reminder item while this week's order is still unsent, else [].
  async function dueReminder(today){
    try{
      const dueSat=mostRecentDueSaturday(new Date());
      const o=await loadOrder(dueSat);
      if(o&&o.status==='sent')return [];
      return [{kind:'mml-order',eff:today,weekEnding:dueSat}];
    }catch(e){return [];}
  }

  // ── Page rendering ────────────────────────────────────────────────────────
  let state={order:null,dirty:false,pendingSend:false};
  function current(){return state.order;}
  function setDeps(d){deps=Object.assign(deps,d||{});}

  function bannerHTML(o){
    if(o.status==='sent'){
      const by=o.sent_by?(' by '+esc(o.sent_by)):'';
      return `<div class="ord-banner ord-sent">✅ Sent for week ending <b>${esc(niceDate(o.week_ending))}</b>${by}. The next order is due on the coming Saturday.</div>`;
    }
    return `<div class="ord-banner ord-due">📦 Weekly stores order for week ending <b>${esc(niceDate(o.week_ending))}</b> — not sent yet. Fill in the quantities, then <b>Send email</b>.</div>`;
  }
  function headerHTML(o){
    const h=o.header||{};
    return `<div class="ord-head-grid">
      <label>Order date<input type="date" id="ord-date" value="${esc(h.date||'')}"></label>
      <label>Officer I/c<input type="text" id="ord-officer" value="${esc(h.officer||'')}"></label>
      <label>Ext. Nos<input type="text" id="ord-ext" value="${esc(h.ext||'')}"></label>
      <label>Remarks<input type="text" id="ord-remarks" value="${esc(h.remarks||'')}"></label>
    </div>`;
  }
  function part1HTML(o){
    const rows=PART1.map((it,i)=>`<tr><td class="c">${esc(it.code)}</td><td>${esc(it.desc)}</td><td class="n">${esc(it.topup)}</td>
      <td class="q"><input type="number" min="0" inputmode="numeric" data-part="1" data-i="${i}" value="${esc(o.part1[i])}" aria-label="Required ${esc(it.desc)}"></td></tr>`).join('');
    return `<table class="ord-table"><thead><tr><th>EQ Number</th><th>Item Description</th><th>Top-up</th><th>Required</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function part2HTML(o){
    const rows=PART2.map((it,i)=>`<tr><td class="c">${esc(it.code)}</td><td>${esc(it.desc)}</td><td class="u">${esc(it.unit)}</td>
      <td class="q"><input type="number" min="0" inputmode="numeric" data-part="2" data-i="${i}" value="${esc(o.part2[i])}" aria-label="Demand ${esc(it.desc)}"></td></tr>`).join('');
    return `<table class="ord-table"><thead><tr><th>Stock Code</th><th>Stock Item Description</th><th>Unit</th><th>Demand</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function render(){
    const body=root.document.getElementById('ordering-body');
    if(!body)return;
    const o=state.order;
    if(!o){body.innerHTML='<div class="ord-loading">Loading the weekly order…</div>';return;}
    body.innerHTML=`
      <div class="ord-topbar">
        <h2>📦 Weekly stores order</h2>
        <div class="ord-actions">
          <button class="ord-btn" id="ord-save">💾 Save draft</button>
          <button class="ord-btn" id="ord-print">🖨 Print</button>
          <button class="ord-btn ord-btn-primary" id="ord-send">✉ Send email</button>
        </div>
      </div>
      ${bannerHTML(o)}
      <div id="ord-send-note"></div>
      ${headerHTML(o)}
      <p class="ord-note">Emails to <b>${esc(ORDER_TO)}</b>, CC <b>${esc(ORDER_CC)}</b>. A web page cannot attach files to an email for you — <b>Send email</b> downloads the two Excel files and opens a ready email; attach both files and press send, then mark it as sent.</p>
      <details class="ord-section" open><summary>1 · Disposables — M.M.M.U. IRO top-up list <span class="ord-count">${PART1.length} items</span></summary>${part1HTML(o)}</details>
      <details class="ord-section"><summary>2 · Cleaning consumables order list <span class="ord-count">${PART2.length} items</span></summary>${part2HTML(o)}</details>
    `;
    wire();
  }
  function wire(){
    const body=root.document.getElementById('ordering-body');if(!body)return;
    body.querySelectorAll('input[data-part]').forEach(inp=>{
      inp.addEventListener('input',()=>{
        const part=inp.getAttribute('data-part'),i=+inp.getAttribute('data-i');
        const v=inp.value;
        if(part==='1')state.order.part1[i]=v; else state.order.part2[i]=v;
        state.dirty=true;
      });
    });
    const hb=(id,key)=>{const el=root.document.getElementById(id);if(el)el.addEventListener('input',()=>{state.order.header[key]=el.value;state.dirty=true;});};
    hb('ord-date','date');hb('ord-officer','officer');hb('ord-ext','ext');hb('ord-remarks','remarks');
    const b=(id,fn)=>{const el=root.document.getElementById(id);if(el)el.addEventListener('click',fn);};
    b('ord-save',onSave);b('ord-print',()=>printForms(state.order));b('ord-send',onSend);
  }
  function note(html){const n=root.document.getElementById('ord-send-note');if(n)n.innerHTML=html;}
  async function onSave(){
    try{await saveOrder(state.order);state.dirty=false;note('<div class="ord-saved">💾 Draft saved.</div>');}
    catch(e){note('<div class="ord-error">Could not save: '+esc(e.message||e)+'</div>');}
  }
  async function onSend(){
    note('<div class="ord-saved">Preparing the two Excel files…</div>');
    try{
      await downloadWorkbooks(state.order);
      openMail(state.order);
      state.pendingSend=true;
      note(`<div class="ord-confirm"><b>Two Excel files were downloaded and an email draft opened.</b>
        Attach <b>both</b> files to the email and press send. Once it has gone:
        <div class="ord-confirm-act"><button class="ord-btn ord-btn-primary" id="ord-mark-sent">✓ Mark as sent</button>
        <button class="ord-btn" id="ord-not-yet">Not yet</button></div></div>`);
      const b=(id,fn)=>{const el=root.document.getElementById(id);if(el)el.addEventListener('click',fn);};
      b('ord-mark-sent',markSent);b('ord-not-yet',()=>note(''));
    }catch(e){note('<div class="ord-error">Could not build the Excel files: '+esc(e.message||e)+'</div>');}
  }
  async function markSent(){
    let who='';try{if(deps.getUser){const u=await deps.getUser();who=(u&&(u.name||u.full_name||u.email))||'';}}catch(e){}
    state.order.status='sent';state.order.sent_at=new Date().toISOString();state.order.sent_by=who||null;state.pendingSend=false;
    try{await saveOrder(state.order);}catch(e){}
    render();
    if(typeof root.refreshReminders==='function'){try{root.refreshReminders();}catch(e){}}
  }

  async function open(){
    render();   // show loading
    const dueSat=mostRecentDueSaturday(new Date());
    let week=dueSat;
    const dueOrder=await loadOrder(dueSat);
    // Once the due week is sent, prepare the coming Saturday instead.
    if(dueOrder&&dueOrder.status==='sent')week=addDays(dueSat,7);
    const existing=week===dueSat?dueOrder:await loadOrder(week);
    state.order=existing||defaultOrder(week);
    state.dirty=false;state.pendingSend=false;
    render();
  }

  const api={
    init:setDeps,open,dueReminder,
    // pure helpers / data exposed for tests
    mostRecentDueSaturday,addDays,defaultOrder,normaliseOrder,
    buildPart1Aoa,buildPart2Aoa,part1FileName,part2FileName,mailSubject,mailBody,
    PART1,PART2,FORM_META,ORDER_TO,ORDER_CC
  };
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ClinicOrdering=api;
})(typeof window!=='undefined'?window:globalThis);
