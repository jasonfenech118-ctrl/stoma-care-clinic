/* The patient profile's hospital-record tabs: Performed procedures (with the
   Patient consultation notes), Medical imaging results and iCM notes. Each is
   copied from the matching table or note in the hospital system and pasted in
   one go; fixed rules here sort it into dated entries and keep only the columns
   the tab needs. Everything runs in the browser: the pasted text never leaves
   the app or the clinic's own database (no AI, no outside service). Nothing is
   saved until a nurse has checked the organised rows; anything the rules are
   not sure about is flagged, never guessed. */
(function(global){
  'use strict';

  /* ------------------------------------------------------------------ *
   * Categories: the tabs, each matching a table in the hospital system
   * ------------------------------------------------------------------ */
  const CATS={
    surgery:{label:'Performed procedures',icon:'🏥',
      placeholder:'Copy the whole Performed Procedures table from the hospital system (Procedures › Performed Procedures) and paste it here in one go.\nDate, Consultant and Procedure are kept; OP Note, Age, Theatre and Source are left out.'},
    consult:{label:'Patient consultation',icon:'📋',
      placeholder:'Open the visit in the hospital system (Hospital Events › Patient Consultation › Open past visit), select the whole note, copy it and paste it here.\nThe ID and name are only used to check it is the right patient, and are not saved.'},
    imaging:{label:'Medical imaging results',icon:'🩻',
      placeholder:'Copy the whole Medical Imaging Results table from the hospital system (Investigations › Medical Imaging Results) and paste it here in one go.\nDate, Test and Report are kept.'},
    poyc:{label:'Entitlement CARE (POYC)',icon:'💊',
      placeholder:'Copy the whole Entitlement CARE (POYC) table from the hospital system (Medications › Entitlement CARE (POYC)) and paste it here in one go.\nDescription and Prescription are kept; ATC Code and Dosage Regimen are left out.'},
    ecg:{label:'ECG',icon:'🫀',
      placeholder:'Open the ECG in the hospital system, select all the text of the report (Ctrl+A), copy it and paste it here.\nThe date and time, measurements, axis, statements and verdict printed by the cardiograph are kept. The name and ID are only used to check it is the right patient, and are never saved.'},
    case:{label:'Case summaries',icon:'🗂️',
      placeholder:'Open the Case Summary in the hospital system, select the whole report (Ctrl+A), copy it and paste it here.\nThe dates, consultant, ward, diagnosis and every section are set out. The name, ID card, date of birth and address are only used to check it is the right patient, and are never saved.'},
    lab:{label:'Lab results',icon:'🧪',
      placeholder:'Open Lab Results in the hospital system (iCM - All Investigations Results), select the whole table, copy it and paste it here — a page at a time is fine.\nDate & time, Panel, Test, Result, Flag, Normal range and Unit are kept.'},
    doc_icm:{label:'iCM notes',icon:'📄',
      placeholder:'Copy the whole iCM Notes table from the hospital system (Patient Documentation › iCM Notes) and paste it here in one go.\nType, Note and Created On are kept; Created By is left out.'},
    // Tabs that were removed. Anything saved under them is kept in the database
    // but no longer shown or offered.
    notes:{label:'Patient notes',icon:'📝',legacy:true,placeholder:''},
    doc_onco:{label:'Oncology / Haematology / Palliative care notes',icon:'📄',legacy:true,placeholder:''},
    doc_ccp:{label:'CCP – Practice nurse review notes',icon:'📄',legacy:true,placeholder:''},
    treatment:{label:'Treatment',icon:'💊',legacy:true,placeholder:''}
  };
  const CAT_KEYS=['surgery','consult','imaging','ecg','doc_icm','poyc','case','lab'];
  // Notes keep a whole note together (author + text).
  const isNoteCat=c=>c==='notes'||String(c||'').startsWith('doc_');

  /* ------------------------------------------------------------------ *
   * Dates — day-first (Malta / UK), with the precision that was given
   * ------------------------------------------------------------------ */
  const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const MONTH='(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const TIME='(?:[,\\s]+(?:at\\s+)?(\\d{1,2})[:.](\\d{2})(?::\\d{2})?\\s*([ap]\\.?m\\.?)?(?![\\d]))?';
  const DATE_PATTERNS=[
    {kind:'iso',re:new RegExp('\\b(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:[T ](\\d{1,2}):(\\d{2})(?::\\d{2})?)?(?![\\d])','i')},
    {kind:'dmy',re:new RegExp('\\b(\\d{1,2})[/.\\-](\\d{1,2})[/.\\-](\\d{4}|\\d{2})(?![\\d]|[/.\\-]\\d)'+TIME,'i')},
    {kind:'dMy',re:new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?[\\s\\-/.]*'+MONTH+'\\.?(?:[\\s,\\-/.]+|\\s*\')(\\d{4}|\\d{2})(?![\\d])'+TIME,'i')},
    {kind:'Mdy',re:new RegExp('\\b'+MONTH+'\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?![\\d])'+TIME,'i')},
    {kind:'My',re:new RegExp('\\b'+MONTH+'\\.?(?:\\s+(\\d{4})|\\s*[\\-/\']\\s*(\\d{4}|\\d{2}))(?![\\d])','i')},
    {kind:'my',re:/\b(\d{1,2})[\/.\-](\d{4})(?![\d]|[\/.\-]\d)/}
  ];
  function thisYear(){return new Date().getFullYear();}
  function fullYear(y,flags){
    if(String(y).length===2){flags.push('two_digit_year');const n=+y,cur=thisYear()%100;return n<=cur?2000+n:1900+n;}
    return +y;
  }
  function isoOf(y,m,d){return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
  function validDay(y,m,d){
    if(!(y>=1900&&y<=thisYear()+2)||!(m>=1&&m<=12)||!(d>=1&&d<=31))return false;
    const t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d;
  }
  function timeOf(h,mi,ap){
    if(h==null||mi==null)return '';
    let hh=+h;const mm=+mi;if(mm>59)return '';
    if(ap){const p=String(ap).toLowerCase().replace(/\./g,'');if(p==='pm'&&hh<12)hh+=12;if(p==='am'&&hh===12)hh=0;}
    if(hh>23)return '';
    return String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
  }
  // Turn one regex match into a date, or null when it is not a real date.
  function fromMatch(kind,m){
    const flags=[];let y,mo,d=1,precision='day',time='';
    if(kind==='iso'){y=+m[1];mo=+m[2];d=+m[3];time=timeOf(m[4],m[5]);}
    else if(kind==='dmy'){
      d=+m[1];mo=+m[2];y=fullYear(m[3],flags);
      if(mo>12&&d<=12){const t=d;d=mo;mo=t;flags.push('swapped');}
      time=timeOf(m[4],m[5],m[6]);
    }
    else if(kind==='dMy'){d=+m[1];mo=MON[m[2].slice(0,3).toLowerCase()];y=fullYear(m[3],flags);time=timeOf(m[4],m[5],m[6]);}
    else if(kind==='Mdy'){mo=MON[m[1].slice(0,3).toLowerCase()];d=+m[2];y=+m[3];time=timeOf(m[4],m[5],m[6]);}
    else if(kind==='My'){mo=MON[m[1].slice(0,3).toLowerCase()];y=fullYear(m[2]||m[3],flags);precision='month';}
    else if(kind==='my'){mo=+m[1];y=+m[2];precision='month';}
    if(!validDay(y,mo,d))return null;
    return {iso:isoOf(y,mo,d),precision,time,flags,text:m[0].trim(),index:m.index,length:m[0].length};
  }
  // The earliest (then longest) date anywhere in the text.
  function findDate(text){
    let best=null;const s=String(text||'');
    DATE_PATTERNS.forEach(p=>{
      const re=new RegExp(p.re.source,'gi');let m;
      while((m=re.exec(s))){
        const r=fromMatch(p.kind,m);
        if(r&&(!best||r.index<best.index||(r.index===best.index&&r.length>best.length)))best=r;
        if(r)break;
        re.lastIndex=m.index+1;
      }
    });
    return best;
  }
  // A line that STARTS with a date (after any bullet, numbering, weekday or
  // "Date:" label) opens a new entry. Returns the date and the text after it.
  const BULLET=/^\s*(?:[-*•·▪◦>–]+\s*|\(?\d{1,3}[.)]\s+|\(?[a-z][.)]\s+)/i;
  const LEAD_LABEL=/^(?:date(?:\s*(?:&|and)\s*time)?|dated|on|d\.?o\.?s\.?|performed(?:\s+on)?|done(?:\s+on)?)\s*[:\-]?\s*/i;
  const WEEKDAY=/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i;
  function lineStartDate(line){
    let s=String(line||'').replace(BULLET,'');
    s=s.replace(LEAD_LABEL,'').replace(WEEKDAY,'');
    const lead=String(line||'').length-s.length;
    // A date range at the start ("03/2023 – 08/2023") keeps its start date and
    // leaves the end in the text.
    const d=findDate(s.slice(0,40));
    if(d&&d.index<=1){
      let rest=s.slice(d.index+d.length);
      const range=rest.match(/^\s*(?:-|–|—|to|until|till)\s*/i);
      let rangeText='';
      if(range){const e=findDate(rest.slice(range[0].length,range[0].length+30));if(e&&e.index===0){rangeText=rest.slice(0,range[0].length+e.length).trim();rest=rest.slice(range[0].length+e.length);}}
      return {date:d,rest:cleanLead(rest),rangeText,offset:lead};
    }
    const y=s.match(/^(?:c\.?\s*|circa\s+|~\s*|in\s+)?((?:19|20)\d{2})(?![\d])(?!\s*[/.\-]\s*\d)/i);
    if(y&&+y[1]<=thisYear()+1){
      return {date:{iso:y[1]+'-01-01',precision:'year',time:'',flags:[],text:y[0].trim(),index:0,length:y[0].length},rest:cleanLead(s.slice(y[0].length)),rangeText:'',offset:lead};
    }
    return null;
  }
  // A year that ends a short list line: "Total knee replacement 2017".
  function trailingYear(line){
    const s=String(line||'');if(s.length>160)return null;
    const m=s.match(/(?:^|[\s,\-–(])((?:19|20)\d{2})\s*[.)]?\s*$/);
    if(!m||+m[1]>thisYear()+1)return null;
    const text=m[0].replace(/^[\s,\-–(]+/,'').trim();
    return {iso:m[1]+'-01-01',precision:'year',time:'',flags:[],text,index:s.length-m[0].length,length:m[0].length};
  }
  // Take a date out of a line when it sits at the end, in brackets or after "on".
  function removeDate(line,dateText){
    const esc=String(dateText).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return String(line).replace(new RegExp('\\s*[\\(\\[,\\-–—]?\\s*(?:on\\s+|in\\s+|dated\\s+)?'+esc+'\\s*[\\)\\]]?'),' ').replace(/\s{2,}/g,' ').trim();
  }
  function cleanLead(s){return String(s||'').replace(/^[\s,:;|\-–—.)\]]+/,'').trim();}

  /* ------------------------------------------------------------------ *
   * Who / where
   * ------------------------------------------------------------------ */
  // Titles as written in letters and in capitals (hospital lists: "DR SURNAME").
  const TITLE_WORD='(?:Dr|DR|Mr|MR|Mrs|MRS|Ms|Miss|MISS|Prof|PROF|Professor|PROFESSOR|Sr|Sister|SISTER|Nurse|NURSE|SN)';
  const CAP='[A-Z][A-Za-z\'’\\-]+';
  const INITIALS='(?:[A-Z]\\.?\\s*){0,2}';
  const NAME_RE=new RegExp('\\b'+TITLE_WORD+'\\.?\\s+'+INITIALS+CAP+'(?:\\s+(?!(?:and|on|at|to|for|the|in|of|with)\\b)'+CAP+'){0,2}','g');
  const HOSP_RE=/\b(Mater Dei(?:\s+Hospital)?|MDH|SAMOC|Sir Anthony Mamo Oncology Cent(?:re|er)|Boffa(?:\s+Hospital)?|Karin Grech(?:\s+Hospital)?|Gozo General(?:\s+Hospital)?|Gozo Hospital|St\.?\s+James(?:\s+Hospital)?|Saint James(?:\s+Hospital)?|St\.?\s+Luke'?s(?:\s+Hospital)?|Mount Carmel(?:\s+Hospital)?|Rehabilitation Hospital Karin Grech|Day Care Unit|private(?:\s+hospital|\s+clinic)?|abroad|UK|London|Italy)\b/gi;
  const SURNAME_FIRST=new RegExp('^'+CAP+',\\s*'+CAP+'(?:\\s+'+CAP+'){0,2}$');
  const TITLED_ONLY=new RegExp('^(?:'+TITLE_WORD+'|MS)\\.?\\s+'+INITIALS+CAP+'(?:\\s+'+CAP+'){0,3}\\.?$');
  const BY_LABEL=/^(?:by|reported by|requested by|referred by|consultant|surgeon|operator|author|provider|signed by|seen by|written by|radiologist|reporting radiologist|oncologist|clinician|nurse|doctor)\s*[:\-]\s*(.{2,80})$/i;
  // A line that is only a name / place (no clinical words).
  function sourceLine(line){
    const s=String(line||'').trim();if(!s||s.length>80)return '';
    const b=s.match(BY_LABEL);if(b)return b[1].trim();
    if(TITLED_ONLY.test(s)||SURNAME_FIRST.test(s))return s;
    const h=s.replace(HOSP_RE,'').replace(/[\s,·()\-–]+/g,'');
    if(!h&&/[A-Za-z]/.test(s))return s;
    return '';
  }
  function inlineSources(text){
    const out=[];const s=String(text||'');
    (s.match(NAME_RE)||[]).forEach(n=>out.push(n.trim()));
    (s.match(HOSP_RE)||[]).forEach(n=>{if(!/^(UK|London|Italy|abroad|private)$/i.test(n)||/\(/.test(s))out.push(n.trim());});
    return out;
  }
  function uniq(list){const seen=new Set();return list.filter(x=>{const k=String(x).toLowerCase().replace(/\s+/g,' ');if(!x||seen.has(k))return false;seen.add(k);return true;});}

  /* ------------------------------------------------------------------ *
   * Classification
   * ------------------------------------------------------------------ */
  // Each type: [name, words (any case), abbreviations (CAPITALS only — so "Mr",
  // "us" or "pet" in ordinary text are never mistaken for MR, US or PET)].
  const IMAGING_TYPES=[
    ['PET-CT',null,/\bPET(?:[\s\-\/]*CT)?\b/],
    ['CT',/computed tomography|\bct[\s\-]?scan|\bct\s+(?:abdo|chest|thorax|pelvis|head|brain|colonograph|urogra|kub|neck|angio)/i,/\bCT[A-Z]{0,3}\b|\bCTAP\b|\bCTPA\b|\bCTC\b/],
    ['MRI',/magnetic resonance|\bmri\b/i,/\bMRI\b|\bMRCP\b|\bMR\s+(?:scan|pelvis|abdomen|liver|brain|spine|enterograph|imaging|rectum|prostate)/],
    ['Ultrasound',/ultrasound|sonograph|doppler|endoanal|transrectal|\buss\b/i,/\bUSS?\b|\bEUS\b/],
    ['X-ray',/x[\s\-]?ray|radiograph/i,/\bXR\b|\bCXR\b|\bAXR\b/],
    ['Contrast study',/contrast (?:study|enema|swallow|meal)|gastrografin|barium|loopogram|pouchogram|fluoroscop|sinogram|fistulogram|defaecogra|defecogra/i,null],
    ['Endoscopy',/colonoscop|sigmoidoscop|flex(?:i(?:ble)?)?[\s\-]?sig|gastroscop|endoscop|cystoscop|capsule endoscop|proctoscop|pouchoscop|\bgastro\b(?![\s\-]?(?:enter|intest|oesoph))/i,/\bOGD\b|\bERCP\b/],
    ['Nuclear medicine',/bone scan|nuclear medicine|scintigra|isotope/i,/\bMAG[\s\-]?3\b|\bDMSA\b|\bSPECT\b/],
    ['Mammogram',/mammogra/i,null],
    ['DEXA',/bone densit/i,/\bDEXA\b|\bDXA\b/],
    ['Echocardiogram',/\becho(?:cardiogra\w*)?\b/i,/\bTTE\b|\bTOE\b/],
    ['Angiogram',/angiogra/i,null]
  ];
  const TREATMENT_TYPES=[
    ['Chemoradiotherapy',/chemo[\s\-]?radi|long[\s\-]course/i,/\bCRT\b/],
    ['Radiotherapy',/radiotherap|radiation therap|\d+(?:\.\d+)?\s?Gy\b|\bfractions?\b|short[\s\-]course|brachytherap|stereotactic/i,/\bRT\b|\bDXT\b|\bSCRT\b|\bSBRT\b/],
    ['Chemotherapy',/chemo|folfox|folfiri|folfirinox|folfoxiri|capox|xelox|capiri|capecitabine|xeloda|fluorouracil|oxaliplatin|irinotecan|cisplatin|carboplatin|gemcitabine|paclitaxel|docetaxel|mitomycin|etoposide|cyclophosphamide|doxorubicin|\b\d+\s*cycles?\b|\bcycles?\s*\d/i,/\b5[\s\-]?FU\b|\bC\d+D\d+\b/],
    ['Immunotherapy',/immunotherap|pembrolizumab|keytruda|nivolumab|opdivo|ipilimumab|atezolizumab|durvalumab|cemiplimab/i,null],
    ['Targeted therapy',/bevacizumab|avastin|cetuximab|erbitux|panitumumab|vectibix|trastuzumab|herceptin|aflibercept|regorafenib|encorafenib|imatinib|sunitinib|lonsurf|trifluridine/i,null],
    ['Hormone therapy',/tamoxifen|letrozole|anastrozole|exemestane|zoladex|goserelin|leuprorelin|bicalutamide|enzalutamide|abiraterone|hormone therap/i,null],
    ['Biologic / IBD',/infliximab|remicade|adalimumab|humira|vedolizumab|entyvio|ustekinumab|stelara|azathioprine|mercaptopurine|mesalazine|pentasa|asacol|methotrexate|tofacitinib|upadacitinib|risankizumab|biologic/i,null],
    ['Steroids',/prednisolone|prednisone|dexamethasone|hydrocortisone|methylprednisolone|budesonide|steroid/i,null],
    ['Antibiotics',/antibiotic|co[\s\-]?amoxiclav|augmentin|metronidazole|flagyl|ciprofloxacin|piperacillin|tazocin|meropenem|ceftriaxone|cefuroxime|gentamicin|vancomycin|clarithromycin|amoxicillin|flucloxacillin|doxycycline|nitrofurantoin|trimethoprim|teicoplanin|clindamycin/i,null],
    ['Blood transfusion',/transfus|packed (?:red )?cells|units? of blood|platelet transfus/i,/\bPRBC\b|\bFFP\b/],
    ['Iron infusion',/iron infusion|ferinject|monofer|venofer|\biv iron\b/i,null],
    ['Nutrition',/parenteral nutrition|enteral|nasogastric feed|\bng feed|dietary supplement/i,/\bTPN\b|\bPN\b|\bPEG\b/],
    ['Anticoagulation',/warfarin|apixaban|rivaroxaban|edoxaban|dabigatran|enoxaparin|clexane|heparin|anticoagul/i,null]
  ];
  const typeHit=(t,s)=>!!((t[1]&&t[1].test(s))||(t[2]&&t[2].test(s)));
  const SURGERY_RE=/ectomy|otomy|ostomy|plasty|pexy|rrhaph|resection|excision|repair|anastomos|laparotom|laparoscop|operation|surgery|surgical|procedure|amputation|graft|fixation|replacement|debridement|drainage|incision|biopsy|appendic|cholecyst|herni|bypass|stent|transplant|reconstruction|closure|ligation|examination under anaesthe|polypectomy|hartmann|whipple|nissen|fundoplication|ivor lewis|adhesiolysis|cataract|arthroscop/i;
  const SURGERY_ABBR=/\bTURP\b|\bTURBT\b|\bEUA\b|\bTEMS?\b|\bTAMIS\b|\bLAR\b|\bAPER?\b|\bTME\b|\bPCNL\b/;
  const isSurgery=s=>SURGERY_RE.test(s)||SURGERY_ABBR.test(s);
  const STOMA_RE=/\bstoma|ileostom|colostom|urostom|ileal conduit|jejunostom|hartmann|mucous fistula|loop (?:ileo|colo)|reversal of (?:the )?(?:loop |end )?(?:ileo|colo|stoma)|closure of (?:the )?(?:loop |end )?(?:ileo|colo|stoma)|refashion/i;
  function surgeryType(text){
    const s=String(text||'');const parts=[];
    if(/robot|da vinci/i.test(s))parts.push('Robotic');
    else if(/laparoscop|\blap\b|keyhole|\bVATS\b|thoracoscop/i.test(s))parts.push('Laparoscopic');
    else if(/arthroscop/i.test(s))parts.push('Arthroscopic');
    else if(/endoscop|cystoscop|colonoscop|sigmoidoscop|flex(?:i(?:ble)?)?[\s\-]?sig|gastroscop|\bOGD\b|\bgastro\b|\bTURP\b|\bTURBT\b|\bERCP\b|hysteroscop|ureteroscop|\bTEMS?\b|\bTAMIS\b/i.test(s))parts.push('Endoscopic');
    else if(/\bopen\b|laparotom|thoracotom|sternotom/i.test(s))parts.push('Open');
    if(/emergen|urgent|\bacute\b/i.test(s))parts.push('Emergency');
    else if(/elective/i.test(s))parts.push('Elective');
    return parts.join(' · ');
  }
  function firstType(list,text){const s=String(text||'');const hit=list.find(t=>t.length>2?typeHit(t,s):t[1].test(s));return hit?hit[0]:'';}
  const NOTE_ROLES=[
    ['Doctor',/\bD[Rr]\b|doctor|DOCTOR|consultant|CONSULTANT|registrar|\bSHO\b|\bHO\b|resident|surgeon|SURGEON|\bM[Rr]\.?\s+[A-Z]|\bM[Ss]\.?\s+[A-Z]|\bP[Rr][Oo][Ff]/],
    ['Nurse',/nurse|\bSN\b|staff nurse|charge nurse|nursing|\bDN\b|comcare|stoma care|\bNO\b|sister/i],
    ['Dietitian',/dietit|dietic/i],['Physiotherapist',/physio/i],['Occupational therapist',/occupational therap|\bOT\b/],
    ['Psychologist',/psycholog/i],['Social worker',/social work/i],['Pharmacist',/pharmac/i]
  ];
  const NOTE_KINDS=[
    ['Discharge summary',/discharge summary|discharge letter/i],['Operation note',/operation note|op note|operative note/i],
    ['MDT',/\bMDT\b|multidisciplinary/i],['Clinic letter',/clinic letter|outpatient|\bOPD\b|clinic review/i],
    ['Ward round',/ward round|\bWR\b/],['Referral',/referr/i],['Telephone call',/telephone|phone call|\btel\b|called/i],
    ['Admission',/admitted|admission/i]
  ];
  function noteType(source,text){
    const head=String(source||'')+' '+String(text||'').slice(0,200);
    const role=firstType(NOTE_ROLES,head),kind=firstType(NOTE_KINDS,String(text||'').slice(0,300));
    return [kind,role].filter(Boolean).join(' · ');
  }
  // Does this entry clearly belong to the other list tab? Only a procedure that
  // is really a scan, or a "scan" that is really an operation, is moved.
  function suggestCategory(cat,title,text){
    if(cat!=='surgery'&&cat!=='imaging')return '';
    const t=String(title||'').trim();if(!t)return '';
    const img=IMAGING_TYPES.some(x=>x[0]!=='Endoscopy'&&typeHit(x,t))&&!/biopsy|polypectomy|resection|excision|dilat|guided|drain/i.test(t);
    const sur=isSurgery(t);
    if(cat==='surgery'&&!sur&&img)return 'imaging';
    if(cat==='imaging'&&!img&&sur)return 'surgery';
    return '';
  }

  function typeFor(cat,title,text,source){
    if(cat==='imaging')return firstType(IMAGING_TYPES,title)||firstType(IMAGING_TYPES,text);
    if(cat==='treatment')return firstType(TREATMENT_TYPES,title)||firstType(TREATMENT_TYPES,text);
    if(cat==='doc_onco')return [firstType(TREATMENT_TYPES,String(title||'')+' '+String(text||'')),noteType(source,text)].filter(Boolean).join(' · ');
    if(cat==='surgery')return surgeryType(String(title||'')+' '+String(text||''));
    return noteType(source,text);
  }

  /* ------------------------------------------------------------------ *
   * Splitting an entry into "what was done" and "the result"
   * ------------------------------------------------------------------ */
  const TITLE_LABELS=['operation performed','procedure performed','procedure','operation','surgery','examination','exam','investigation','study','test','scan','treatment','regimen','intervention','drug','medication','therapy','modality'];
  const RESULT_LABELS=['results?','findings?','impressions?','conclusions?','outcome','report','opinion','summary','histology','histopathology','pathology','diagnosis','response','comments?','plan','recommendations?','complications?','toxicity','side effects','indication','clinical details','clinical history','clinical information','technique','reason','dose','cycles?','status','notes?','comparison','compared with','previous','prior','clinical indication','request','history'];
  const LABEL_RE=new RegExp('(^|\\n|[.;]\\s+)\\s*('+TITLE_LABELS.concat(RESULT_LABELS).sort((a,b)=>b.length-a.length).join('|')+')(?:\\s*:|\\s+[\\-–—]\\s+)\\s*','gi');
  const isTitleLabel=l=>TITLE_LABELS.includes(String(l).toLowerCase());
  const LABEL_START=new RegExp('^\\s*(?:'+TITLE_LABELS.concat(RESULT_LABELS).join('|')+')\\s*[:\\-–—]','i');
  const startsWithLabel=l=>LABEL_START.test(String(l||''));
  const SPLIT_RE=/\s+[\-–—]\s+|:\s+|;\s+/;
  function tidy(s){return String(s||'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}
  function stripSourceParen(title,sources){
    title=String(title||'').replace(new RegExp('\\s*[,\\-–]?\\s*('+TITLE_WORD+'\\.?\\s+'+INITIALS+CAP+'(?:\\s+'+CAP+'){0,2})\\s*$'),(m,name)=>{
      // Only when something clinical is left in front of the name.
      return m.length<String(title).length-2?(sources.push(name.trim()),''):m;
    });
    return String(title||'').replace(/\s*\(([^()]{2,80})\)\s*$/,(m,inner)=>{
      const left=inner.replace(NAME_RE,'').replace(HOSP_RE,'').replace(/[\s,;·&\-–]+|\band\b/gi,'');
      if(!left){sources.push(...inline(inner));return '';}
      return m;
    }).trim();
    function inline(x){const o=inlineSources(x);return o.length?o:[x.trim()];}
  }
  function fieldsFrom(cat,firstText,moreLines){
    const sources=[];const kept=[];
    [firstText].concat(moreLines||[]).forEach((l,i)=>{
      const line=String(l==null?'':l);
      const src=line.trim()?sourceLine(line):'';
      if(src&&!(i===0&&!isNoteCat(cat)&&!moreLines.some(x=>String(x).trim()))){sources.push(src);return;}
      kept.push(line);
    });
    while(kept.length&&!String(kept[0]).trim())kept.shift();
    while(kept.length&&!String(kept[kept.length-1]).trim())kept.pop();
    const text=kept.join('\n');
    // Names / places in the first and last lines and in brackets.
    const firstLine=String(kept[0]||''),lastLine=String(kept[kept.length-1]||'');
    sources.push(...inlineSources(firstLine));
    if(kept.length>1)sources.push(...inlineSources(lastLine));
    (text.match(/\(([^()]{2,80})\)/g)||[]).forEach(p=>sources.push(...inlineSources(p)));
    let title='',result='';
    if(isNoteCat(cat)){
      result=tidy(text);
      title='';
    }else{
      const labels=[];let m;LABEL_RE.lastIndex=0;
      while((m=LABEL_RE.exec(text))){labels.push({label:m[2],start:m.index,contentStart:m.index+m[0].length});}
      if(labels.length){
        const pre=text.slice(0,labels[0].start).trim();
        const parts=labels.map((l,i)=>({label:l.label,content:tidy(text.slice(l.contentStart,i+1<labels.length?labels[i+1].start:text.length)).replace(/[.;]\s*$/,'')}));
        const t=parts.find(p=>isTitleLabel(p.label)&&p.content);
        const res=[];
        if(t){title=t.content.split('\n')[0];const restT=t.content.split('\n').slice(1).join(' ').trim();if(restT)res.push(restT);if(pre)res.unshift(pre);}
        else if(pre){const pl=pre.split('\n');title=pl[0];const r=pl.slice(1).join(' ').trim();if(r)res.push(r);}
        parts.filter(p=>p!==t&&p.content).forEach(p=>res.push(p.label.charAt(0).toUpperCase()+p.label.slice(1).toLowerCase()+': '+p.content.replace(/\n+/g,' ')));
        result=res.join('\n');
      }else{
        const lines=kept.map(x=>String(x).trim()).filter(Boolean);
        if(lines.length>1&&lines[0].length<=160){title=lines[0];result=lines.slice(1).join(' ');}
        else{
          const one=lines.join(' ');
          let sm=one.match(SPLIT_RE);
          // "Chemotherapy: CAPOX x 8 cycles" — a bare category word before the
          // colon is part of the title, not a separate "what was done".
          if(sm&&/^:/.test(sm[0].trim())&&(cat==='treatment'||cat==='surgery')&&/^(?:chemo(?:therapy)?|radiotherapy|immunotherapy|surgery|operation|procedure|treatment|therapy)$/i.test(one.slice(0,sm.index).trim()))sm=null;
          if(sm&&sm.index>=3&&sm.index<=160&&one.slice(sm.index+sm[0].length).trim()){
            title=one.slice(0,sm.index).trim();result=one.slice(sm.index+sm[0].length).trim();
          }else{
            const dot=one.search(/\.\s+[A-Z]/);
            if(dot>=3&&dot<=160){title=one.slice(0,dot).trim();result=one.slice(dot+1).trim();}
            else title=one;
          }
        }
        // A "result" that is only a name / place is the source.
        if(result&&sourceLine(result)){sources.push(sourceLine(result));result='';}
      }
      title=stripSourceParen(tidy(title).replace(/[.;,]\s*$/,''),sources);
      result=tidy(result);
    }
    return {title,result,source:uniq(sources.map(s=>s.replace(/^[\s,(]+|[\s,)]+$/g,''))).join(' · ')};
  }

  /* ------------------------------------------------------------------ *
   * Splitting the pasted lump into entries
   * ------------------------------------------------------------------ */
  const SPACE_LIKE=new RegExp('['+String.fromCharCode(0xa0,0x2007,0x202f)+']','g');
  const ZERO_WIDTH=new RegExp('['+String.fromCharCode(0x200b,0x200c,0x200d,0xfeff)+']','g');
  const LINE_SEP=new RegExp('['+String.fromCharCode(0x2028,0x2029)+']','g');
  function normalise(text){
    return String(text||'').replace(/\r\n?/g,'\n').replace(SPACE_LIKE,' ').replace(ZERO_WIDTH,'').replace(LINE_SEP,'\n');
  }
  function isHeading(line){
    const s=String(line||'').trim();
    if(!s||s.length>70||findDate(s))return false;
    if(/^(?:past\s+)?(?:surgical|medical|operative|operation|imaging|radiology|treatment|oncology|drug|medication|nursing|clinical)\s+(?:history|list|report|notes?|summary|record)s?\s*:?$/i.test(s))return true;
    if(/:$/.test(s)&&s.split(/\s+/).length<=5)return true;
    if(/^[A-Z0-9 &\/\-()]+$/.test(s)&&/[A-Z]{3}/.test(s)&&s.split(/\s+/).length<=5&&!/\d/.test(s))return true;
    return false;
  }
  function freeEntries(text,cat){
    const lines=text.split('\n');
    const anyStart=lines.some(l=>l.trim()&&lineStartDate(l.trim()));
    const out=[];
    if(anyStart){
      let cur=null;
      lines.forEach(raw=>{
        const line=raw.trim();
        if(!line){if(cur)cur.more.push('');return;}
        const st=lineStartDate(line);
        if(st){cur={date:st.date,rangeText:st.rangeText,first:st.rest,more:[],raw:[raw]};out.push(cur);return;}
        // A date-shaped start that is not a real date (e.g. 31/02/2020) still
        // starts its own entry, flagged for checking.
        const bare=line.replace(BULLET,'');
        const bad=bare.match(/^(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})(?![\d])/);
        if(bad){cur={date:null,badDate:bad[1],rangeText:'',first:cleanLead(bare.slice(bad[0].length)),more:[],raw:[raw]};out.push(cur);return;}
        // In a list (not notes), a line with its own date further along is a new
        // entry rather than more of the one above — unless it is a labelled line
        // such as "Findings: …" that belongs to the entry above.
        if(!isNoteCat(cat)&&cur&&line.length<=220&&!startsWithLabel(line)){
          const d=findDate(line);
          // Only when the date ENDS the line ("2 units PRBC 04/04/2020") or is
          // followed by a dash / colon ("CT abdomen 05/01/2024 – no recurrence"):
          // a date inside a sentence ("Previous CT 12/01/2023 showed …") is
          // report text and stays with the entry above.
          const after=line.slice(d?d.index+d.length:0);
          if(d&&(/^[\s.)\]]*$/.test(after)||/^\s*[\-–—:|]\s+\S/.test(after))){cur={date:d,rangeText:'',first:removeDate(line,d.text),more:[],raw:[raw]};out.push(cur);return;}
        }
        if(!cur){if(isHeading(line))return;cur={date:null,rangeText:'',first:line,more:[],raw:[raw]};out.push(cur);return;}
        cur.more.push(raw);cur.raw.push(raw);
      });
      return out;
    }
    // No line starts with a date: notes stay as one block per paragraph; lists
    // split per paragraph when there are blank lines, else one entry per line.
    const paras=text.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
    let blocks=isNoteCat(cat)||paras.length>1?paras:text.split('\n').map(l=>l.trim()).filter(Boolean);
    // "appendicectomy 2015, cholecystectomy 2018": one line holding several dated
    // items is split at the commas / semicolons between them.
    if(!isNoteCat(cat))blocks=blocks.flatMap(b=>{
      if(b.includes('\n'))return [b];
      const chunks=b.split(/\s*;\s*|,\s+(?=[A-Za-z])/).map(x=>x.trim()).filter(Boolean);
      const dated=chunks.filter(c=>findDate(c)||trailingYear(c));
      return chunks.length>1&&dated.length>=2&&dated.length>=chunks.length-1?chunks:[b];
    });
    blocks.forEach(b=>{
      const bl=b.split('\n');
      if(bl.length===1&&isHeading(bl[0]))return;
      let d=findDate(b);
      let first=bl[0],more=bl.slice(1);
      if(!d){
        // A year on its own: "(2017)", "in 2015", "since 2019".
        const y=b.match(/\(\s*((?:19|20)\d{2})\s*\)|\b(?:in|since|year|during)\s+((?:19|20)\d{2})(?![\d])/i);
        if(y&&+(y[1]||y[2])<=thisYear()+1)d={iso:(y[1]||y[2])+'-01-01',precision:'year',time:'',flags:[],text:y[0],index:y.index,length:y[0].length};
        else if(!isNoteCat(cat)){const t=trailingYear(bl[0]);if(t)d=t;}
      }
      if(d){
        if(first.includes(d.text))first=removeDate(first,d.text);else more=more.map(x=>x.includes(d.text)?removeDate(x,d.text):x);
      }
      out.push({date:d,rangeText:'',first,more,raw:bl});
    });
    return out;
  }
  // Tables copied from a web page or Excel arrive as tab-separated columns.
  const HEADER_ROLES=[
    // Columns with nothing to keep (e.g. the hospital's "OP Note" link and "Age").
    ['ignore',/^(?:op\.?\s*notes?|age|age at \w+|#|no\.?|view|actions?|select)$/i],
    ['date',/^(?:date|time|when)\b|date\s*(?:&|and)\s*time|\bdate$|performed on|done on|start date|scan date|exam date|^created(?:\s+on)?$|date created|entered on|recorded on|written on|^on$/i],
    ['type',/^type$|category|class|modality|kind/i],
    ['source',/provider|doctor|consultant|clinician|surgeon|author|^by$|staff|requested|reported|radiologist|location|department|hospital|ward|unit|site|specialty|centre|center|written by|signed|created by|entered by|recorded by|^user$/i],
    ['result',/result|report|finding|impression|conclusion|outcome|comment|summary|response|details|status|note|text|description of findings/i],
    ['title',/procedure|operation|surgery|exam|investigation|study|test|description|name|treatment|regimen|drug|medication|intervention|event|title|item|subject|order/i]
  ];
  function headerRole(cell){const c=String(cell||'').trim();if(!c||c.length>40)return null;const h=HEADER_ROLES.find(([,re])=>re.test(c));return h?h[0]:null;}
  function tableEntries(text,cat){
    // A cell holding line breaks (a long note) arrives over several lines, so
    // lines are joined until the row has as many columns as the table — the
    // header row's, or the most common count.
    const lines=text.split('\n').filter(l=>l.trim());
    if(!lines.length)return [];
    const tabsIn=l=>(l.match(/\t/g)||[]).length;
    const firstCells=lines[0].split('\t').map(c=>c.trim());
    const looksHeader=firstCells.filter(c=>headerRole(c)).length>=Math.min(2,firstCells.filter(Boolean).length)&&!findDate(firstCells.join(' '));
    let expected=looksHeader?tabsIn(lines[0]):0;
    if(!expected){const n={};lines.forEach(l=>{const t=tabsIn(l);if(t)n[t]=(n[t]||0)+1;});expected=+Object.keys(n).sort((a,b)=>n[b]-n[a]||b-a)[0]||0;}
    const joined=[];let buf='';
    lines.forEach(l=>{
      buf=buf?buf+'\n'+l:l;
      if(tabsIn(buf)>=expected){joined.push(buf);buf='';}
    });
    if(buf)joined.push(buf);
    const rows=joined.map(l=>l.split('\t').map(c=>c.trim()));
    let header=null;
    const r0=rows[0],named=r0.filter(Boolean);
    const hits=r0.filter(c=>headerRole(c)).length;
    if(hits>=Math.min(2,named.length)&&!findDate(r0.join(' ')))header=rows.shift();
    const width=Math.max(...rows.map(r=>r.length),header?header.length:0);
    const roles=new Array(width).fill(null),names=new Array(width).fill('');
    if(header){header.forEach((h,i)=>{roles[i]=headerRole(h)||'extra';names[i]=h;});}
    else{
      const share=(i,fn)=>{const cells=rows.map(r=>r[i]||'').filter(Boolean);return cells.length?cells.filter(fn).length/cells.length:0;};
      let dateCol=-1,best=0;
      for(let i=0;i<width;i++){const s=share(i,c=>!!lineStartDate(c));if(s>best&&s>=0.5){best=s;dateCol=i;}}
      if(dateCol>=0)roles[dateCol]='date';
      for(let i=0;i<width;i++)if(roles[i]==null&&share(i,c=>/^\d{1,3}$/.test(c.trim()))>=0.8)roles[i]='ignore';
      for(let i=0;i<width;i++)if(roles[i]==null&&share(i,c=>!!sourceLine(c))>=0.6)roles[i]='source';
      const free=[];for(let i=0;i<width;i++)if(roles[i]==null&&rows.some(r=>(r[i]||'').trim()))free.push(i);
      const avg=i=>{const c=rows.map(r=>r[i]||'').filter(Boolean);return c.reduce((a,x)=>a+x.length,0)/(c.length||1);};
      if(free.length===1)roles[free[0]]=isNoteCat(cat)?'result':'title';
      else if(free.length>1){
        roles[free[0]]='title';
        const longest=free.slice(1).sort((a,b)=>avg(b)-avg(a))[0];roles[longest]='result';
        free.forEach(i=>{if(roles[i]==null)roles[i]='extra';});
      }
    }
    const dateCol=roles.indexOf('date');
    const out=[];let cur=null;
    rows.forEach(r=>{
      const dateCell=dateCol>=0?(r[dateCol]||''):'';
      const st=dateCell?lineStartDate(dateCell):null;
      const d=st?st.date:(dateCell?findDate(dateCell):null);
      const filled=r.filter(Boolean);
      if(!filled.length)return;
      if(dateCol>=0&&!d&&cur){
        // A wrapped cell on its own line: part of the row above.
        cur.cont.push(filled.join(' '));cur.raw.push(r.join('\t'));return;
      }
      cur={date:d,cells:r,cont:[],raw:[r.join('\t')]};out.push(cur);
    });
    return out.map(e=>{
      const get=role=>e.cells.map((c,i)=>roles[i]===role?c:'').filter(Boolean);
      const extras=e.cells.map((c,i)=>roles[i]==='extra'&&c?(names[i]?names[i]+': ':'')+c:'').filter(Boolean);
      let title=get('title').join(' · '),result=get('result').concat(extras).concat(e.cont).join('\n');
      const sources=get('source');
      if(!isNoteCat(cat)&&!title&&result){const f=fieldsFrom(cat,result,[]);title=f.title;result=f.result;if(f.source)sources.push(f.source);}
      if(isNoteCat(cat)&&title&&!result){result=title;title='';}
      return {date:e.date,rangeText:'',typeCell:get('type').join(' '),table:true,title,result,source:uniq(sources).join(' · '),raw:e.raw};
    });
  }

  /* ------------------------------------------------------------------ *
   * The hospital system's own tables, copied straight off the screen
   * ------------------------------------------------------------------ */
  // A table cell holding only a date (and maybe a time): "20/11/2026", "23/09/2026 10:15:00".
  const DATE_CELL=/^\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:\d{4}|\d{2})(?:\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s*[ap]\.?m\.?)?)?$/i;
  function cellDate(c){const s=String(c||'').trim();if(!DATE_CELL.test(s))return null;const x=lineStartDate(s);return x?x.date:null;}
  const cellsOf=l=>String(l).split('\t').map(c=>c.trim());
  const firstFilled=cells=>cells.findIndex(c=>c);
  // Bits of the hospital screen that come along with a copied table.
  const NOISE_LINE=/^(?:show more than \d+ months?|no data to display|enter text to search\.*|open past visit|drag a column header.*)$/i;
  // Column names, when the header row was copied too.
  const HOSP_HEAD={
    date:/^(?:date(?:\s*(?:&|and)\s*time)?|created\s+on)$/i,
    consultant:/^(?:consultant|surgeon|provider(?:\s+display\s+name)?)$/i,
    procedure:/^(?:procedures?|operations?)$/i,
    test:/^(?:test|exam(?:ination)?|investigation)$/i,
    report:/^(?:reports?|results?)$/i,
    speciality:/^(?:case\s+)?special(?:i)?ty$/i,
    form:/^form\s+type$/i,
    type:/^type$/i,note:/^notes?$/i,by:/^created\s+by$/i,
    ignore:/^(?:op\.?\s*notes?|age|theatre|source|clinic)$/i
  };
  function headerKeys(cells){
    const out=cells.map(c=>Object.keys(HOSP_HEAD).find(k=>HOSP_HEAD[k].test(c))||null);
    return out.filter(Boolean).length>=2?out:null;
  }
  // Which table the rows came from, judged by what is in them (so a table pasted
  // in the wrong tab still lands in the right one).
  function hospitalLayout(rows,header,cat){
    if(header){
      if(header.includes('test')||header.includes('report'))return 'imaging';
      if(header.includes('procedure'))return 'surgery';
      if(header.includes('form')||header.includes('speciality'))return 'consult';
    }
    const after=(r,k)=>r.cells[r.di+k]||'';
    const half=Math.ceil(rows.length/2);
    if(rows.some(r=>r.cells.some(c=>/^exam performed\b|\breported by\s*:|surgical procedure that does not require a radiological report/i.test(c))))return 'imaging';
    if(rows.filter(r=>/^\d{1,3}$/.test(after(r,2))||/^OSR$/i.test(r.cells[r.cells.length-1])).length>=half)return 'surgery';
    if(rows.filter(r=>/\bform\b/i.test(after(r,3))||/\d{1,2}:\d{2}/.test(r.cells[r.di])).length>=half)return 'consult';
    return cat==='imaging'||cat==='consult'?cat:'surgery';
  }
  /* Performed Procedures (OP Note · Date · Consultant · Age · Procedures · Theatre
     · Source), Medical Imaging Results (Date · Test · Report) and the Patient
     Consultation list (Date & Time · Provider · Case Speciality · Form Type ·
     Clinic). Each row starts at its date cell, wherever the copy started (with
     or without the empty OP Note cell or the header) and however it ended (a
     last row cut short). Only the needed columns are kept. */
  function hospitalRows(text,cat){
    let header=null,headerDi=-1,cur=null;const rows=[];
    text.split('\n').forEach(raw=>{
      const line=raw.replace(/\s+$/,'');if(!line.trim()||NOISE_LINE.test(line.trim()))return;
      const cells=cellsOf(line);
      const hk=headerKeys(cells);
      if(hk&&hk.includes('date')){header=hk;headerDi=hk.indexOf('date');cur=null;return;}
      const fi=firstFilled(cells);
      const d=fi>=0&&cells.length>1?cellDate(cells[fi]):null;
      if(d){cur={di:fi,cells,date:d,cont:[],raw:[line]};rows.push(cur);return;}
      // A cell that ran over more than one line belongs to the row above.
      if(cur){cur.cont.push(cells.filter(Boolean));cur.raw.push(line);}
    });
    if(!rows.length)return null;
    const layout=hospitalLayout(rows,header,cat);
    const off=k=>header&&header.indexOf(k)>=0?header.indexOf(k)-headerDi:null;
    const entries=rows.map(r=>{
      const at=k=>k==null?'':(r.cells[r.di+k]||'');
      const from=k=>r.cells.slice(r.di+k).filter(Boolean);
      let title='',result='',source='',type='';
      if(layout==='surgery'){
        let oc=off('consultant'),op=off('procedure');
        if(oc==null)oc=1;
        // The Age column (a number) sits between the consultant and the procedure.
        if(op==null){op=oc+1;if(/^\d{1,3}$/.test(at(op))||(!at(op)&&at(op+1)))op++;}
        source=at(oc);title=at(op);
        r.cont.forEach(c=>{if(c[0]&&!/^(?:theatre\b|endoscopy\b|kgh\b|osr$|\d{1,2}$)/i.test(c[0]))title=(title+' '+c[0]).trim();});
      }else if(layout==='imaging'){
        let ot=off('test'),orp=off('report');
        if(ot==null)ot=1;
        title=at(ot);result=from(orp==null?ot+1:orp).join(' ');
        r.cont.forEach(c=>{if(c.length)result+=(result?'\n':'')+c.join(' ');});
      }else{
        let oc=off('consultant'),os=off('speciality'),of=off('form');
        if(oc==null)oc=1;if(os==null)os=oc+1;if(of==null)of=os+1;
        source=at(oc);title=at(os);type=at(of);
        const clinic=from(of+1).join(' ');
        result=clinic?'§ Clinic\n'+clinic:'';
      }
      return {date:r.date,rangeText:'',table:true,hospital:true,category:layout,typeCell:type,title:tidy(title),result:String(result).trim(),source:tidy(source),raw:r.raw};
    });
    return {layout,entries};
  }
  /* iCM Notes (Type · Note · Created On · Created By). A note can run over many
     lines; it ends at the line carrying its Created On date. Created By is left out. */
  function icmRows(text){
    const recs=[];let buf=[];
    const endsAt=line=>{const cells=line.split('\t');if(cells.length<2)return -1;
      for(let i=cells.length-1;i>=1&&i>=cells.length-2;i--){if(cellDate(cells[i]))return i;}return -1;};
    text.split('\n').forEach(raw=>{
      const t=raw.trim();
      if(!buf.length&&!t)return;
      if(NOISE_LINE.test(t))return;
      const hk=headerKeys(cellsOf(raw));if(hk&&(hk.includes('note')||hk.includes('by')))return;
      buf.push(raw);
      const k=endsAt(raw);
      if(k>=0){
        const cells=raw.split('\t');
        recs.push({head:buf.slice(0,-1).concat([cells.slice(0,k).join('\t')]).join('\n'),dateCell:cells[k].trim()});buf=[];
      }
    });
    if(buf.some(l=>l.trim()))recs.push({head:buf.join('\n'),dateCell:''});
    return recs.map(r=>{
      let type='',note=r.head.replace(/^\s*\n/,'');
      const tab=note.indexOf('\t');
      if(tab>=0){const first=note.slice(0,tab).trim();if(first.length<=40&&!first.includes('\n')){type=first;note=note.slice(tab+1);}}
      note=note.split('\n').map(l=>l.replace(/\t+/g,' ').replace(/ {2,}/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();
      const x=r.dateCell?lineStartDate(r.dateCell):null;
      return {date:x?x.date:null,rangeText:'',table:true,hospital:true,category:'doc_icm',typeCell:type,title:'',result:note,source:'',
        raw:[[type,note.replace(/\n/g,' '),r.dateCell].filter(Boolean).join('\t')]};
    }).filter(r=>r.result||r.typeCell);
  }

  /* Entitlement CARE (POYC): Description · Prescription · ATC Code · Dosage
     Regimen. A medicine has no date; each row is found by its ATC code (or, when
     only the first columns were copied, by its tab), and only Description and
     Prescription are kept. Wrapped Dosage Regimen lines are ignored. */
  const ATC_CELL=/^[A-Z]\d{2}[A-Z]{0,2}\d{0,2}$/;
  function poycRows(text){
    const out=[];
    const lines=text.split('\n').filter(l=>l.trim()&&!NOISE_LINE.test(l.trim()));
    const tabbed=lines.filter(l=>l.includes('\t'));
    const withAtc=tabbed.some(l=>cellsOf(l).some(c=>ATC_CELL.test(c)));
    lines.forEach(raw=>{
      const cells=cellsOf(raw);
      if(cells.some(c=>/^description$/i.test(c))&&cells.some(c=>/^prescription$/i.test(c)))return;   // the header row
      if(!raw.includes('\t')){if(!tabbed.length){const t=raw.trim();if(t)out.push({desc:t,presc:'',raw});}return;}
      const atc=cells.findIndex(c=>ATC_CELL.test(c));
      if(withAtc&&atc<0)return;   // the rest of a wrapped Dosage Regimen
      const before=(atc>=0?cells.slice(0,atc):cells).filter(Boolean);
      if(!before.length)return;
      out.push({desc:before[0],presc:before.slice(1).join(' '),raw:before.join('\t')});
    });
    const today=(typeof global.TODAY==='string'&&global.TODAY)||new Date().toISOString().slice(0,10);
    return out.map(r=>({date:{iso:today,precision:'day',time:'',flags:[],text:''},rangeText:'',table:true,hospital:true,category:'poyc',
      typeCell:'',title:tidy(r.desc),result:tidy(r.presc),source:'',raw:[r.raw]}));
  }

  /* ECG: the text of the cardiograph's report, as copied from the PDF opened in
     the hospital system (select all, copy). Only what the machine printed is
     kept: the date and time, the measurements and axis, its statements and
     verdict, whether it was confirmed, and the previous study it compared
     against. The PDF, the patient's name and ID are not kept (the ID only checks
     the patient), and the app adds no reading of its own. */
  // QTc as printed: plain, or with its formula (Bazett, Fridericia, Hodges).
  const ECG_MEAS=['HR','RR','PR','QRSD','QT','QTc','QTcB','QTcF','QTcH'],ECG_AXES=['P','QRS','T'];
  const ECG_STAMP=/\b\d{1,2}-[A-Za-z]{3}-\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?/g;
  // Right-hand column of the report, cut off a statement copied onto its line.
  const ECG_RIGHT=/\s+(?:Oper|ECG\s+Type|Barrier|AECubic|Order\s*#|Reason|Ministry\s+of\s+Health|Mater\s+Dei)\b.*$/i;
  function looksEcg(text){
    const t=String(text||'');
    return (/\bQTc[BFH]?\b|\bQT\/QTc/i.test(t))&&/\b(?:HR|PR|QRSD|Vent(?:\.|ricular)?\s*rate)\b/i.test(t)&&/\bECG\b|\b12\s*Lead\b|--\s*AXIS\s*--/i.test(t);
  }
  // A minus copied from a PDF is often the typographic one (−42).
  const ecgDash=t=>String(t||'').replace(/[\u2212\u2012\u2013]/g,'-');
  // "HR 72" pairs, or (copied as columns) a run of label lines and a run of
  // number lines in the same order.
  function ecgValues(part,names){
    const out={};part=ecgDash(part);
    // "HR 72", "HR: 72", "PR 121 ms" — the label exactly (QTc is not QTcB).
    names.forEach(k=>{
      const m=part.match(new RegExp('(?:^|[ \\t])'+(k==='QTc'?'QT[cC]':k)+'(?:[ \\t]*[:=][ \\t]*|[ \\t]+)(-?\\d{1,4})(?:[ \\t]*(?:ms|msec|bpm|deg|°))?(?=[ \\t,;]|$)','m'));
      if(m)out[k]=m[1];
    });
    // The wording some cardiographs print: "Vent. rate 72 BPM", "PR interval 121 ms",
    // "QRS duration 96 ms", "QT/QTc 528/579 ms", "P-R-T axes 91 -28 10".
    const w=(re,f)=>{const m=part.match(re);if(m)f(m);};
    if(names.includes('HR')){
      w(/Vent(?:\.|ricular)?\s*rate\s*:?\s*(\d{2,3})/i,m=>{if(out.HR==null)out.HR=m[1];});
      w(/\bPR\s+interval\s*:?\s*(\d{2,3})/i,m=>{if(out.PR==null)out.PR=m[1];});
      w(/\bQRS\s+duration\s*:?\s*(\d{2,3})/i,m=>{if(out.QRSD==null)out.QRSD=m[1];});
      w(/\bQT\s*\/\s*QTc([BFH]?)\s*:?\s*(\d{3})\s*\/\s*(\d{3})/i,m=>{if(out.QT==null)out.QT=m[2];const k='QTc'+m[1].toUpperCase();if(out[k]==null)out[k]=m[3];});
    }
    if(names.includes('QRS'))w(/P-R-T\s+ax[ie]s\s*:?\s*(-?\d{1,3})\s+(-?\d{1,3})\s+(-?\d{1,3})/i,m=>{out.P=out.P||m[1];out.QRS=out.QRS||m[2];out.T=out.T||m[3];});
    if(Object.keys(out).length<2){
      Object.keys(out).forEach(k=>delete out[k]);
      const labs=[],nums=[];
      part.split('\n').map(l=>l.trim()).forEach(l=>{
        if(!l)return;
        const toks=l.split(/\s+/);
        if(toks.every(x=>names.some(k=>k.toLowerCase()===x.toLowerCase())))toks.forEach(x=>labs.push(names.find(k=>k.toLowerCase()===x.toLowerCase())));
        else if(toks.every(x=>/^-?\d{1,4}$|^\$$/.test(x)))toks.filter(x=>x!=='$').forEach(x=>nums.push(x));
      });
      if(labs.length&&nums.length>=labs.length)labs.forEach((k,i)=>{out[k]=nums[i];});
    }
    return out;
  }
  function ecgOne(seg,pre){
    const stamp=(seg.match(ECG_STAMP)||[])[0]||'';
    const d=stamp?findDate(stamp):null;
    // Keep the time to the second, as printed: it tells two ECGs apart.
    const sec=stamp.match(/(\d{1,2}):(\d{2}):(\d{2})$/);
    if(d&&sec)d.time=sec[1].padStart(2,'0')+':'+sec[2]+':'+sec[3];
    const idm=(pre+'\n'+seg).match(/\b(\d{3,8}[A-Z])\b/);
    const prevM=seg.match(/Previous\s+Study\s*:?\s*(\d{1,2}-[A-Za-z]{3}-\d{4})(?:\s+(\d{1,2}:\d{2})(?::\d{2})?)?\s*-?\s*((?:Otherwise\s+normal|Abnormal|Borderline|Normal)\b)?\s*((?:Un)?confirmed\b)?/i);
    const body=seg.replace(/Previous\s+Study\s*:?[^\n]*/ig,'');
    const axisAt=body.search(/--\s*AXIS\s*--/i);
    const meas=ecgValues(axisAt>=0?body.slice(0,axisAt):body,ECG_MEAS);
    let axes=axisAt>=0?ecgValues(body.slice(axisAt).replace(/--\s*AXIS\s*--/i,''),ECG_AXES):{};
    if(Object.keys(axes).length<2){const a2=ecgValues(body,ECG_AXES);if(Object.keys(a2).length>=2)axes=a2;}
    const statements=[],ls=body.split('\n');
    ls.forEach((l,i)=>{
      l=l.replace(/\t/g,' ');
      let m=l.match(/(?:^|\s)(?:\$\s*)?\.\s+([A-Za-z(][^\n]*?)\s*$/);
      if(!m&&/^\s*(?:\$\s*)?\.\s*$/.test(l)&&/^\s*[A-Za-z(]/.test(ls[i+1]||''))m=[l,ls[i+1].trim()];
      if(!m)return;
      const x=m[1].replace(/\s*\.{3,}.*$/,'').replace(ECG_RIGHT,'').replace(/\s+/g,' ').trim();
      if(x&&!statements.includes(x))statements.push(x);
    });
    const v=body.match(/-\s*((?:OTHERWISE\s+NORMAL|ABNORMAL|BORDERLINE|NORMAL)\s+ECG)\s*-/i)||body.match(/\b((?:OTHERWISE\s+NORMAL|ABNORMAL|BORDERLINE|NORMAL)\s+ECG)\b/i);
    const verdict=v?v[1].toLowerCase().replace(/^\w/,c=>c.toUpperCase()).replace(/\becg\b/,'ECG'):'';
    const by=body.match(/\bConfirmed\s+By\s*:?\s*([A-Za-z][^\n]{0,60})/i);
    const status=by?'Confirmed by '+by[1].replace(ECG_RIGHT,'').trim():/\bUnconfirmed\b/i.test(body)?'Unconfirmed':/\bConfirmed\b/i.test(body)?'Confirmed':'';
    const ml=ECG_MEAS.filter(k=>meas[k]!=null).map(k=>k+' '+meas[k]).join(' · ');
    const al=ECG_AXES.filter(k=>axes[k]!=null).map(k=>k+' '+axes[k]).join(' · ');
    let prev='';
    if(prevM){const pd=findDate(prevM[1]);prev=[(pd?pd.iso.split('-').reverse().join('/'):prevM[1])+(prevM[2]?' '+prevM[2]:''),[prevM[3],prevM[4]].filter(Boolean).join(', ').toLowerCase().replace(/^\w/,c=>c.toUpperCase())].filter(Boolean).join(' — ');}
    const result=[ml&&'§ Measurements\n'+ml,al&&'§ Axis\n'+al,statements.length&&'§ Interpretation\n'+statements.join('\n'),prev&&'§ Previous study\n'+prev].filter(Boolean).join('\n');
    const raw=[stamp,ml&&'Measurements: '+ml,al&&'Axis: '+al].concat(statements).concat([verdict,status,prev&&'Previous study: '+prev]).filter(Boolean);
    return {date:d,rangeText:'',table:true,hospital:true,category:'ecg',typeCell:status,title:verdict,result,source:'',raw,
      idSeen:idm?idm[1]:'',partial:!verdict||Object.keys(meas).length<3||!statements.length};
  }
  const ECG_NOT_ACQ=/(?:Previous\s+Study|Confirmed|Overread|Edited|Printed|Order(?:ed)?|Requested|Received|Reported|Approved|Modified|Signed)\b[^\n]{0,80}$/i;
  function ecgRows(text){
    const t=ecgDash(text);
    // One report per acquisition stamp. The "Previous Study:", confirmation,
    // print and order stamps are not one, and every page of a report repeats its
    // stamp — those pages are joined into the one report.
    const starts=[];let m;const re=new RegExp(ECG_STAMP.source,'g');
    while((m=re.exec(t))){
      const ls=t.lastIndexOf('\n',m.index)+1;
      if(ECG_NOT_ACQ.test(t.slice(ls,m.index))||/Previous\s+Study\s*:?\s*$/i.test(t.slice(Math.max(0,m.index-40),m.index)))continue;
      if(starts.some(s=>s.at===ls))continue;
      const k=m[0].toLowerCase().replace(/\s+/g,' ').match(/^(\d{1,2}-[a-z]{3}-\d{4} \d{1,2}:\d{2})(:\d{2})?/);
      starts.push({at:ls,min:k?k[1].replace(/^0/,''):m[0],sec:k&&k[2]||''});
    }
    if(!starts.length)return looksEcg(t)?[ecgOne(t,'')]:[];
    const groups=[];
    starts.forEach((s,i)=>{
      const seg=t.slice(s.at,i+1<starts.length?starts[i+1].at:t.length);
      const pre=i===0?t.slice(0,s.at):t.slice(starts[i-1].at,s.at).split('\n').slice(-4).join('\n');
      // Same minute, and the seconds agree (or one page prints none): the same report.
      const g=groups.find(x=>x.min===s.min&&(!x.sec||!s.sec||x.sec===s.sec));
      if(g){g.seg+='\n'+seg;if(!g.sec)g.sec=s.sec;}else groups.push({min:s.min,sec:s.sec,seg,pre});
    });
    return groups.map(g=>ecgOne(g.seg,g.pre)).filter(r=>r.title||r.result);
  }

  /* Lab results (Lab Results › iCM - All Investigations Results): Date · Profile
     Name · Item Name · Result · Status · Range & UOM, copied a page at a time.
     Kept as Date & time · Panel · Test · Result · Flag · Normal range · Unit;
     the "Profile Name: …" group rows, the header, paging and search lines are
     left out. A test the system has never seen joins the blood investigations
     list when it is saved (the lab_test_catalogue view). */
  const LAB_HEAD={date:/^date(?:\s*(?:&|and)\s*time)?$/i,panel:/^(?:profile(?:\s+name)?|panel|test\s+group)$/i,
    test:/^(?:item(?:\s+name)?|test(?:\s+name)?|investigation)$/i,result:/^(?:results?|value)$/i,
    flag:/^(?:status|flag)$/i,range:/^(?:range(?:\s*(?:&|and)\s*uom)?|reference\s+range|normal\s+range)$/i,unit:/^(?:uom|units?)$/i};
  const LAB_NOISE=/^(?:page\s+\d+\s+of\s+\d+.*|lab\s+results|lis\s*-.*|show\s+lis.*|icm\s*-\s*all\s+investigations\s+results|trend\s+view.*|show more than \d+ months?|search\s*clear|enter text to search\.*|no data to display)$/i;
  function looksLab(text){
    const t=String(text||'');
    return /\bItem\s+Name\b/i.test(t)&&/\bProfile\s+Name\b/i.test(t)||/\bRange\s*&\s*UOM\b/i.test(t);
  }
  // "3.90 - 5.40 x10^12/L" → range "3.90 - 5.40", unit "x10^12/L"; "<5 mg/L" → "<5", "mg/L".
  function splitRange(v){
    const s=String(v||'').replace(/\s+/g,' ').trim();
    const m=s.match(/^((?:[<>≤≥]=?\s*)?-?\d+(?:[.,]\d+)?(?:\s*(?:-|–|to)\s*-?\d+(?:[.,]\d+)?)?)\s*(.*)$/i);
    return m?{range:m[1].replace(/\s*(-|–|to)\s*/i,' - ').trim(),unit:m[2].trim()}:{range:'',unit:s};
  }
  function labRows(text){
    const out=[];let cols=null,panel='';
    String(text||'').split('\n').forEach(raw=>{
      const line=raw.replace(/ /g,' ');const t=line.trim();
      if(!t||LAB_NOISE.test(t))return;
      const g=t.match(/^Profile\s+Name\s*:\s*(.+)$/i);if(g){panel=g[1].trim();return;}
      let cells=line.includes('\t')?cellsOf(line):t.split(/\s{2,}/).map(x=>x.trim());
      // The header row: remember the column order.
      const hk=cells.map(c=>Object.keys(LAB_HEAD).find(k=>LAB_HEAD[k].test(c))||null);
      if(hk.filter(Boolean).length>=3){cols=hk;return;}
      const di=cells.findIndex(c=>cellDate(c));
      if(di<0)return;
      cells=cells.slice(di);
      // Without a header: Date, Panel, Test, Result, then Status and Range & UOM
      // (an empty Status can be lost when the copy has no tabs).
      const STATUS=/^(?:H|L|HH|LL|A|AA|\*+|high|low|abnormal|critical|panic|positive|negative)$/i;
      const key=cols?cols.slice(cols.indexOf('date')>=0?cols.indexOf('date'):0):
        cells.length>=6?['date','panel','test','result','flag','range']
        :cells.length===5?(STATUS.test(cells[4])?['date','panel','test','result','flag']:['date','panel','test','result','range'])
        :['date','panel','test','result'];
      const get=k=>{const i=key.indexOf(k);return i>=0?String(cells[i]||'').trim():'';};
      const d=cellDate(cells[0]);
      const r=splitRange(get('range'));
      const unit=get('unit')||r.unit;
      const row={date:d,rangeText:'',table:true,hospital:true,category:'lab',typeCell:get('panel')||panel,title:get('test'),result:get('result'),source:'',
        labFlag:get('flag'),labRange:r.range,labUnit:unit,raw:[cells.filter(Boolean).join('\t')]};
      if(row.title||row.result)out.push(row);
    });
    return out;
  }

  /* Case summaries (the hospital's discharge Case Summary report), copied whole.
     Kept: admission and discharge dates, consultant, ward, diagnosis, the
     clinical course, past medical history, medications on admission, past
     surgical history, social history, allergies, plan, treatment on discharge,
     surgical interventions, adverse reactions, complications, investigations,
     follow-up and who signed it. Left out: the name, ID card, date of birth,
     age and address (the ID only checks the patient), and the print stamps. */
  const CASE_MAIN=[
    ['diagnosis',/^Diagnos[ie]s\b\s*:?\s*(.*)$/i,false],
    ['clinical',/^Clinical\s+Details?\b\s*:?\s*(.*)$/i,false],
    ['treatment',/^Treatment\s+on\s+Discharge\b(.*)$/i,false],
    ['interventions',/^Surgical\s+Intervention(?:\/\s*s|s|\(s\))?\b\s*:?\s*(.*)$/i,false],
    ['adverse',/^Adverse\s+Reactions?\b\s*:?\s*(.*)$/i,false],
    ['complications',/^Complications?\s*:?\s*(.*)$/i,true],
    ['investigations',/^Investigations?\s*:?\s*(.*)$/i,true],
    ['followup',/^Follow[\s\-]*up\s*:?\s*(.*)$/i,true],
    ['pending',/^Pending\s*Investigations?\s*:?\s*(.*)$/i,true],
    ['further',/^Further\s+Information(?:\s+to\s+Patient\s*\/?\s*Carer)?\s*:?\s*(.*)$/i,true],
    ['signature',/^Signature\s*:?\s*(.*)$/i,true]
  ];
  // Headings inside Clinical Details: "Past medical history:", "Medications:" …
  const CASE_SUB=[
    ['pmh',/^(?:past\s+medical\s+history|pmh(?:x)?|medical\s+history|co-?morbidities|background)\s*(?::\s*(.*)|$)/i,'Past medical history'],
    ['meds',/^(?:medications?|drug\s+history|dhx|regular\s+medications?|current\s+medications?|medications?\s+on\s+admission)\s*(?::\s*(.*)|$)/i,'Medications on admission'],
    ['psh',/^(?:past\s+surgical\s+history|psh(?:x)?|surgical\s+history)\s*(?::\s*(.*)|$)/i,'Past surgical history'],
    ['social',/^(?:social\s+history|shx|social)\s*(?::\s*(.*)|$)/i,'Social history'],
    ['allergies',/^(?:allerg(?:y|ies)|known\s+allergies|nkda)\s*(?::\s*(.*)|$)/i,'Allergies'],
    ['family',/^(?:family\s+history|fhx)\s*(?::\s*(.*)|$)/i,'Family history'],
    ['functional',/^(?:functional\s+(?:history|status)|baseline\s+function)\s*(?::\s*(.*)|$)/i,'Functional status'],
    ['plan',/^(?:plan|management\s+plan|discharge\s+plan)\s*(?::\s*(.*)|$)/i,'Plan']
  ];
  const CASE_DATE='(\\d{1,2}[\\-\\/ ](?:[A-Za-z]{3,9}|\\d{1,2})[\\-\\/ ]\\d{2,4})';
  function looksCase(text){
    const t=String(text||'');
    return /\bCase\s+Summary\b/i.test(t)&&/\b(?:Admission\s+Date|Treatment\s+on\s+Discharge|Clinical\s+Details)\b/i.test(t)
      ||/\bAdmission\s+Date\b/i.test(t)&&/\bDischarge\s+Date\b/i.test(t)&&/\bClinical\s+Details\b/i.test(t);
  }
  const caseISO=v=>{const d=v?findDate(v):null;return d?d.iso:'';};
  const dmy=iso=>iso?iso.split('-').reverse().join('/'):'';
  function caseRows(text){
    const lines=String(text||'').split('\n').map(l=>l.replace(/ /g,' ').replace(/[ \t]+$/,''));
    // One report per "Case Summary" heading (or the whole paste).
    const starts=[];lines.forEach((l,i)=>{if(/^\s*Case\s+Summary\s*$/i.test(l))starts.push(i);});
    if(!starts.length||starts[0]>0&&lines.slice(0,starts[0]).some(l=>/Admission\s+Date/i.test(l)))starts.unshift(0);
    return starts.map((b,i)=>caseOne(lines.slice(b,i+1<starts.length?starts[i+1]:lines.length))).filter(Boolean);
  }
  function caseOne(lines){
    const parts={header:[]};let cur='header',at=-1;
    lines.forEach(raw=>{
      const t=raw.trim();
      if(/^(?:Case\s+Summary|Printed\s+On\b.*|\d+\s*\/\s*\d+|Medical\s+Reg\.?\s*No\.?.*)$/i.test(t))return;
      for(let k=0;k<CASE_MAIN.length;k++){
        const [key,re,strict]=CASE_MAIN[k];
        if(k<=at)continue;
        const m=t.match(re);if(!m)continue;
        // Inside the clinical details, a plain word like "Complications" only
        // starts its section when it stands alone on its line.
        if(strict&&(cur==='clinical'||cur==='diagnosis')&&!/^\S+(?:\s+\S+){0,4}\s*:?\s*$/.test(t)&&!/\t/.test(raw))continue;
        cur=key;at=k;parts[key]=[];
        let rest=(m[1]||'').trim();
        if(key==='treatment')rest=rest.replace(/^(?:\s*(?:Dosage|Frequency|Period|Comments?))+\s*$/i,'');
        if(rest)parts[key].push(rest);
        return;
      }
      (parts[cur]=parts[cur]||[]).push(raw);
    });
    const head=parts.header.join('\n');
    const grab=re=>{const m=head.match(re);return m?m[1].replace(/\s+/g,' ').trim():'';};
    const idSeen=grab(/Hospital\s+ID\s*:?\s*(\d{3,8}[A-Za-z])\b/i)||grab(/\b(\d{4,8}[A-Z])\b/);
    const consultant=grab(/Consultant\s*:?\s*([^\t\n]+?)(?=\s+Ward\b|\t|\n|$)/i);
    const ward=grab(/(?:^|\n|\t)\s*Ward\s*:?\s*([^\t\n]+?)(?=\s+Admission\s+Date\b|\s{2,}|\t|\n|$)/i);
    const adm=caseISO(grab(new RegExp('Admission\\s+Date\\s*:?\\s*'+CASE_DATE,'i')));
    const dis=caseISO(grab(new RegExp('Discharge\\s+Date\\s*:?\\s*'+CASE_DATE,'i')));
    const txt=k=>(parts[k]||[]).map(x=>x.trim()).filter(Boolean);
    const diagnosis=txt('diagnosis').join(' ').replace(/\s+/g,' ');
    // Clinical details: the headed lists apart from the running course.
    const sub={},course=[];let into=null,para=[];
    const flush=()=>{if(para.length){course.push(para.join(' ').replace(/\s+/g,' '));para=[];}};
    (parts.clinical||[]).forEach(raw=>{
      const t=raw.trim();
      if(!t){flush();into=null;return;}
      const h=CASE_SUB.map(([k,re,name])=>{const m=t.match(re);return m&&t.length<=120?{k,name,rest:(m[1]||'').trim()}:null;}).find(Boolean);
      if(h&&(/:/.test(t)||t.split(/\s+/).length<=4)){
        flush();into=h.k;sub[into]=sub[into]||[];
        if(h.rest){if(h.k==='meds'&&/allerg|nkda/i.test(h.rest))(sub.allergies=sub.allergies||[]).push(h.rest.replace(/^allergic\s+to\s+/i,'').replace(/^./,c=>c.toUpperCase()));else sub[into].push(h.rest);}
        return;
      }
      const item=t.match(/^(?:[-•*·▪]|\d{1,2}[.)])\s*(.+)$/);
      if(into&&(item||sub[into].length===0||into==='social'||into==='functional')){sub[into].push((item?item[1]:t).trim());return;}
      if(into&&!item){into=null;}
      para.push(t);
    });
    flush();
    // Treatment on discharge: Name · Dosage · Frequency · Period · Comments.
    const DOSE=/^(\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ug|ml|mL|units?|iu|IU|tabs?|tablets?|caps?|capsules?|puffs?|drops?|sachets?|%)\b\.?|\d+\s*x\s*\S+)$/i;
    const FREQ=/^(?:daily|od|om|on|bd|bid|tds|tid|qds|qid|prn|nocte|mane|stat|weekly|monthly|alternate\s+days|[a-z]{2,4}\/prn|once|twice|\d+\s*hourly|every\s+\S+)$/i;
    const meds=[];
    txt('treatment').forEach(t=>{
      let c=/\t/.test(t)?t.split('\t').map(x=>x.trim()):t.split(/\s{2,}/).map(x=>x.trim());
      if(c.length<3){
        const m=t.match(/^(.+?)\s+(\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ug|ml|mL|units?|iu|IU|tabs?|tablets?|caps?|puffs?|drops?|sachets?|%))\s+(\S+)\s+(Indefinite|\d+\s*(?:days?|weeks?|months?)|Until\s+\S+|Stat|\S+)?\s*(.*)$/i);
        c=m?[m[1],m[2],m[3],m[4]||'',m[5]||'']:[t];
      }
      if(c.length>=3&&(DOSE.test(c[1])||FREQ.test(c[2])))meds.push({name:c[0],dose:c[1]||'',freq:c[2]||'',period:c[3]||'',comment:c.slice(4).filter(Boolean).join(' ')});
      else if(meds.length)meds[meds.length-1].comment=(meds[meds.length-1].comment+' '+t).trim();
    });
    // Copied from the screen, the table can come one cell per line: a medicine,
    // then its dosage, frequency, period and comment on the lines below.
    if(!meds.length){
      const HEAD=/^(?:drug|medicine|medication|name|dosage|dose|frequency|period|duration|comments?)$/i;
      const DOSE2=/^\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ug|ml|mL|units?|iu|IU|tabs?|tablets?|caps?|capsules?|puffs?|drops?|sachets?|%|mmol)\b\.?(?:\s*\/\s*\S+)?$/i;
      const PER=/^(?:indefinite(?:ly)?|ongoing|continue|lifelong|\d+\s*(?:days?|weeks?|months?)|until\s+.+|stat|as\s+required|prn)$/i;
      const cells=[].concat(...txt('treatment').map(t=>t.split(/\t+/).map(x=>x.trim()).filter(Boolean))).filter(c=>!HEAD.test(c));
      const isVal=c=>DOSE2.test(c)||FREQ.test(c);
      let cur=null;
      cells.forEach((c,i)=>{
        if(cur&&!cur.dose&&DOSE2.test(c)){cur.dose=c;return;}
        if(cur&&!cur.freq&&FREQ.test(c)){cur.freq=c;return;}
        if(cur&&!cur.period&&PER.test(c)){cur.period=c;return;}
        // A new medicine is a name followed by its dose or frequency; anything else is a comment.
        if(!cur||isVal(cells[i+1]||'')){cur={name:c,dose:'',freq:'',period:'',comment:''};meds.push(cur);return;}
        cur.comment=(cur.comment+' '+c).trim();
      });
      if(meds.length&&!meds[0].dose&&!meds[0].freq)meds.length=0;
    }
    // Surgical interventions: "Laparotomy with adhesiolysis 17/08/2026 00:00:00".
    const interventions=txt('interventions').map(t=>{const m=t.match(/^(.*?)\s*(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s*$/);return m?(m[1].trim()||'Intervention')+' · '+m[2]:t;});
    // Investigations: "date time · test · result", a report carrying on below its row.
    const inv=[];
    (parts.investigations||[]).forEach(raw=>{
      const t=raw.trim();if(!t)return;
      const m=t.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})(?::\d{2})?\s+(.*)$/);
      if(m){
        let rest=m[3],cells=rest.split(/\t+|\s{2,}/).map(x=>x.trim()).filter(Boolean);
        if(cells.length<2){const r=rest.match(/^(.+?)\s+([<>]?-?\d[\d.,]*\s*[A-Za-z%µ\/\^\d.]*(?:\/[A-Za-z0-9.\^]+)*)$/);cells=r?[r[1],r[2]]:[rest];}
        const [d,mo,y]=m[1].split('/');
        inv.push({when:m[1]+' '+m[2],key:y+'-'+mo.padStart(2,'0')+'-'+d.padStart(2,'0')+' '+m[2].padStart(5,'0'),text:cells.join(' · ')});
      }else if(inv.length)inv[inv.length-1].text+=' '+t;
    });
    inv.sort((a,b)=>a.key.localeCompare(b.key));
    const sig=txt('signature').filter(t=>!/^(?:Medical\s+Reg|Printed\s+On)/i.test(t)).slice(0,2).join(', ');
    const adverse=txt('adverse');
    if(!adm&&!diagnosis&&!course.length&&!meds.length)return null;
    const days=adm&&dis?Math.round((Date.parse(dis)-Date.parse(adm))/864e5):null;
    const S=[];const add=(name,lines)=>{lines=(lines||[]).map(x=>String(x).trim()).filter(Boolean);if(lines.length)S.push('§ '+name+'\n'+lines.join('\n'));};
    add('Dates',[(adm?'Admitted '+dmy(adm):'Admission date not found')+(dis?' · Discharged '+dmy(dis):'')+(days!=null?' ('+days+' day'+(days===1?'':'s')+')':'')]);
    add('Clinical course',course);
    CASE_SUB.forEach(([k,,name])=>{if(k!=='allergies'&&k!=='plan')add(name,sub[k]);});
    add('Allergies',[].concat(sub.allergies||[],adverse).filter((x,i,a)=>a.findIndex(y=>y.toLowerCase()===x.toLowerCase())===i));
    add('Plan',sub.plan);
    add('Treatment on discharge',meds.map(m=>[m.name,m.dose,m.freq,m.period,m.comment].filter(Boolean).join(' · ')));
    add('Surgical interventions',interventions);
    add('Complications',txt('complications'));
    add('Investigations',inv.map(x=>x.when+' · '+x.text));
    add('Follow-up',txt('followup'));
    add('Pending investigations',txt('pending'));
    add('Further information',txt('further'));
    add('Signed by',sig?[sig]:[]);
    return {date:adm?findDate(dmy(adm)):null,rangeText:'',table:true,hospital:true,category:'case',typeCell:ward,title:diagnosis,result:S.join('\n'),source:consultant,
      raw:[adm&&'Admission '+dmy(adm),dis&&'Discharge '+dmy(dis),consultant&&'Consultant: '+consultant,ward&&'Ward: '+ward,diagnosis&&'Diagnosis: '+diagnosis].filter(Boolean),
      idSeen,partial:!adm||!diagnosis};
  }


  /* ------------------------------------------------------------------ *
   * A Patient Consultation note (e.g. a Procedure Report), opened with
   * "Open past visit": label : value lines, set out section by section.
   * ------------------------------------------------------------------ */
  // [key, label, how, shown as]. how: skip = never kept (identifiers, case and
  // visit numbers, bed, theatre); date; by; one = a short value; list = one item
  // per line; text = free text keeping its line breaks.
  const CONSULT_FIELDS=[
    ['id','ID(?:\\s*Card)?(?:\\s*No\\.?)?|ID\\s+Number','skip'],
    ['patient_name','Patient(?:\'s)?\\s+Name','skip'],
    ['age','Age','skip'],
    ['case_no','Case\\s*(?:#|No\\.?|Number)','skip'],
    ['visit_no','Visit\\s*(?:#|No\\.?|Number)','skip'],
    ['ext_ref','External\\s+Ref(?:erence)?(?:\\s*(?:#|No\\.?))?','skip'],
    ['clinic','Clinic|Ward|Bed','skip'],
    ['theatre','Operating\\s+Theatre(?:\\s+Used)?|Theatre(?:\\s+Used)?','skip'],
    ['datetime','Date\\s*\\/\\s*Time|Date\\s*(?:&|and)\\s*Time|Date\\s+of\\s+(?:Operation|Procedure|Surgery|Visit|Consultation)|Date','date'],
    ['consultation_by','Consultation\\s+By|Seen\\s+By','by'],
    ['consultant','Consultant','one','Consultant'],
    ['form_type','Form\\s+Type','one','Form type'],
    ['case_specialty','Case\\s+Special(?:i)?ty','one','Case speciality'],
    ['speciality','Special(?:i)?ty','one','Speciality'],
    ['anaesthesia','(?:Type\\s+of\\s+)?An(?:a)?esthe(?:s)?ia(?:\\s+Type)?','one','Anaesthesia'],
    ['side','Side','one','Side'],
    ['procedures_performed','Procedure\\s*\\/\\s*s\\s+Performed|Procedure\\(s\\)\\s+Performed|Procedures?\\s+Performed|Operations?\\s+Performed','one','Procedure/s performed'],
    ['indications','Indications?','text','Indications'],
    ['operating_surgeons','Operating\\s+Surgeon\\s*(?:\\/\\s*s|\\(s\\)|s)?','list','Operating surgeon/s'],
    // Assistant surgeons, anaesthetists and theatre nurses are left out.
    ['assistant_surgeons','Assistant\\s+Surgeon\\s*(?:\\/\\s*s|\\(s\\)|s)?|Assistants?','skip'],
    ['anaesthetists','An(?:a)?esthetist\\s*(?:\\/\\s*s|\\(s\\)|s)?|Anaesthesiologists?','skip'],
    ['nurses','(?:Scrub|Circulating|Theatre|Assisting|Anaesthetic|Recovery)\\s+Nurse\\s*(?:\\/\\s*s|\\(s\\)|s)?|Nurses?','skip'],
    ['findings','Operation\\s+Findings|Operative\\s+Findings|Findings','text','Operation findings'],
    ['procedure','Procedure\\s+Details?|Operative\\s+Procedure|Operation\\s+Details|Procedure','text','Procedure'],
    ['closure','Closure','text','Closure'],
    ['blood_loss','Estimated\\s+Blood\\s+Loss|Blood\\s+Loss|EBL','one','Blood loss'],
    ['complications','Complications?','text','Complications'],
    ['drains','Drains?','one','Drains'],
    ['biopsy','Biops(?:y|ies)|Specimens?|Histology','list','Biopsy'],
    ['implants','Implants?|Prosthes[ie]s','text','Implants'],
    ['postop','Post[\\s\\-]*Op(?:erative)?\\s+Instructions|Postoperative\\s+Instructions|Post[\\s\\-]*Op(?:erative)?\\s+Plan','text','Post-operative instructions'],
    ['diagnosis','Diagnos[ie]s','text','Diagnosis'],
    ['plan','(?:Management\\s+)?Plan','text','Plan'],
    ['history','History|Presenting\\s+Complaint','text','History'],
    ['examination','(?:On\\s+)?Examination','text','Examination'],
    ['comments','Comments?|Remarks?|Notes?','text','Notes']
  ];
  const CONSULT_LABELS=CONSULT_FIELDS.map(f=>({key:f[0],how:f[2],name:f[3]||'',
    re:new RegExp('^(?:'+f[1]+')\\s*:\\s*(.*)$','i'),bare:new RegExp('^(?:'+f[1]+')\\s*:?\\s*$','i')}));
  // Labels the hospital prints without a colon ("Date/Time  26/11/2026", "Visit#  1").
  const NOCOLON=new RegExp('^(Date\\s*\\/\\s*Time|Date\\s*&\\s*Time|Visit\\s*#|Case\\s*#|External\\s+Ref(?:erence)?)\\s+(\\S.{0,60})$','i');
  // The order the sections are shown in (anything else follows as it came).
  const CONSULT_ORDER=['case_specialty','speciality','indications','diagnosis','history','examination','operating_surgeons','assistant_surgeons','anaesthetists','nurses',
    'anaesthesia','side','findings','procedure','closure','blood_loss','complications','drains','biopsy','implants','postop','plan','comments'];
  // A whole cell that is just "Some label:" — kept as its own section, unless it
  // looks like personal details.
  const GENERIC_LABEL=/^([A-Z][A-Za-z][A-Za-z\/#&()'’ \-]{0,38}):\s*$/;
  const PRIVATE_LABEL=/\b(?:id|name|surname|address|tel|telephone|phone|mobile|dob|birth|nationality|locality|town|e-?mail|age|gender|sex|ref(?:erence)?|case|visit|bed|room|ward)\b|#/i;
  function consultLabel(cell,generic){
    // A whole table cell holding only a label (with or without its colon).
    const nc=cell.match(NOCOLON);
    for(const L of CONSULT_LABELS){
      const m=cell.match(L.re);
      if(m){
        // An identifier-type label with a long value is ordinary text, not a label.
        if((L.how==='skip'||L.how==='date'||L.how==='by')&&m[1].length>80)return null;
        if(L.how==='date'&&m[1]&&!findDate(m[1]))return null;
        return {L,value:m[1].trim()};
      }
      // A line or cell that is only a known label, with or without its colon
      // ("Date/Time", "Visit#", "Assisting Nurse/s"); its value follows.
      if(L.bare.test(cell))return {L,value:''};
      if(nc&&L.bare.test(nc[1])&&(L.how!=='date'||findDate(nc[2])))return {L,value:nc[2].trim()};
    }
    const g=generic?cell.match(GENERIC_LABEL):null;
    if(g&&g[1].split(/\s+/).length<=5){const name=g[1].trim();return {L:{key:'x:'+name.toLowerCase(),how:PRIVATE_LABEL.test(name)?'skip':'text',name},value:''};}
    return null;
  }
  // "Operating Theatre Used: Theatre 09 (I)   Speciality: General Surgery" copied
  // without tabs: two label / value pairs on one line.
  function splitPairs(line){
    const re=/(\s{2,})(?=[A-Z][A-Za-z\/#&()' \-]{1,38}:)|(\s+)(?=(?:Speciality|Specialty|Side)\s*:)/g;
    const parts=[];let last=0,m;
    while((m=re.exec(line))){
      // "Case Specialty:" is one label, not "Case" + "Specialty:".
      if(m[2]!==undefined&&/\bCase$/i.test(line.slice(0,m.index)))continue;
      parts.push(line.slice(last,m.index));last=m.index+m[0].length;
    }
    parts.push(line.slice(last));
    return parts.map(x=>x.trim());
  }
  // "Procedure Report Date/Time 21/11/2026 Visit# 1 External Reference 5182…"
  // copied as one run of text: split before each label printed without a colon.
  const INLINE_LABEL=/\s+(?=(?:Date\s*\/\s*Time|Date\s*&\s*Time|Visit\s*#|Case\s*#|External\s+Ref(?:erence)?)(?:\s*:|\s+\d|\s*$)|Consultation\s+By\s*:)/gi;
  function noteCells(raw){
    const cells=raw.includes('\t')?cellsOf(raw):splitPairs(raw.trim());
    return [].concat(...cells.map(c=>c?c.split(INLINE_LABEL):[c]));
  }
  // A label the screen wraps onto two lines ("Post-Operative / Instructions:").
  function joinWrappedLabels(text){
    return String(text||'')
      .replace(/(Post[ \t\-]*Op(?:erative)?)[ \t]*\n[ \t]*(Instructions\s*:)/gi,'$1 $2')
      .replace(/(Operating[ \t]+Theatre)[ \t]*\n[ \t]*(Used\s*:)/gi,'$1 $2')
      .replace(/(Procedure\s*\/\s*s)[ \t]*\n[ \t]*(Performed\s*:)/gi,'$1 $2');
  }
  // Headings written inside a section that belong to it: "PLAN:" inside the
  // post-operative instructions is part of them, not a Plan section of its own.
  const INSIDE={postop:new Set(['plan','comments','drains'])};
  const CORE_CONSULT=new Set(['form_type','consultant','procedures_performed','findings','anaesthesia','case_specialty','consultation_by','operating_surgeons','visit_no','case_no','ext_ref','assistant_surgeons','postop']);
  function looksConsultNote(text){
    const keys=new Set();
    joinWrappedLabels(text).split('\n').forEach(l=>{
      noteCells(l).forEach(c=>{if(!c)return;const lab=consultLabel(c);if(lab&&CORE_CONSULT.has(lab.L.key))keys.add(lab.L.key);});
    });
    return keys.size>=3;
  }
  const STAFF_NO=/\s+\(?\d{3,6}\)?\s*$/;
  function consultNotes(text){
    const notes=[];let note=null,field=null;
    const start=()=>{note={fields:[],byKey:{},idSeen:'',date:null,by:'',content:false,headerIds:[]};notes.push(note);field=null;};
    const preIds=[];
    const open=L=>{
      if(['id','patient_name','case_no'].includes(L.key)&&note&&note.content)start();
      if(!note)start();
      let f=note.byKey[L.key];
      if(!f){f={key:L.key,how:L.how,name:L.name,lines:[]};note.byKey[L.key]=f;note.fields.push(f);}
      else if(f.how==='text'&&f.lines.length)f.lines.push('');
      field=f;return f;
    };
    const add=(f,value,sameLine)=>{
      const v=String(value||'').trim();if(!v)return;
      if(f.how==='date'){if(!note.date){const d=findDate(v);if(d)note.date=d;}return;}
      if(f.how==='skip'){if(f.key==='id'&&!note.idSeen)note.idSeen=v.split(/\s+/)[0];return;}
      if(f.how==='by'){note.by=note.by||v;return;}
      note.content=true;
      if(sameLine&&f.lines.length)f.lines[f.lines.length-1]+=' '+v;else f.lines.push(v);
    };
    joinWrappedLabels(text).split('\n').forEach(raw=>{
      const hasTab=raw.includes('\t');
      const cells=noteCells(raw);
      if(cells.every(c=>!c)){if(field&&field.how==='text'&&field.lines.length)field.lines.push('');return;}
      let lineField=null;
      cells.forEach(c=>{
        if(!c)return;
        const lab=consultLabel(c,hasTab);
        if(lab&&field&&INSIDE[field.key]&&INSIDE[field.key].has(lab.L.key)){add(field,c,lineField===field);lineField=field;return;}
        if(lab){const f=open(lab.L);add(f,lab.value,false);lineField=f;return;}
        // Before the first label: the screen's own header (name, ID, age). Never
        // kept — an ID in it is only used for the patient check.
        if(!note){const m=c.match(/\b(\d{1,7}[A-Z])\b/);if(m)preIds.push(m[1]);return;}
        if(!field)return;
        add(field,c,lineField===field);lineField=field;
      });
    });
    return notes.filter(n=>n.content).map((n,i)=>{
      const val=f=>{
        if(!f)return '';
        let lines=f.lines.slice();
        if(f.how==='list')lines=lines.map(x=>x.replace(STAFF_NO,'').replace(/\s{2,}/g,' ').trim()).filter(Boolean);
        if(f.how==='one')return tidy(lines.join(' '));
        return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
      };
      const get=k=>val(n.byKey[k]);
      const form=get('form_type'),caseSp=get('case_specialty'),proc=get('procedures_performed');
      const ops=val(n.byKey.operating_surgeons);
      // The note's own Consultant; when it is blank the app fills it from the
      // stoma on the profile (organise), else Consultation By, else the surgeon.
      const noted=get('consultant');
      const consultant=noted||n.by||(ops?ops.split('\n')[0]:'');
      const title=proc||(caseSp&&caseSp!==form?caseSp:'')||get('speciality');
      const skipKeys=new Set(['consultant','form_type','procedures_performed']);
      if(caseSp&&(caseSp===form||caseSp===title))skipKeys.add('case_specialty');
      if(!proc&&title&&title===get('speciality'))skipKeys.add('speciality');
      const shown=n.fields.filter(f=>(f.how==='one'||f.how==='list'||f.how==='text')&&!skipKeys.has(f.key)&&val(f));
      shown.sort((a,b)=>{const ia=CONSULT_ORDER.indexOf(a.key),ib=CONSULT_ORDER.indexOf(b.key);
        return (ia<0?99:ia)-(ib<0?99:ib)||n.fields.indexOf(a)-n.fields.indexOf(b);});
      const result=shown.map(f=>'§ '+f.name+'\n'+val(f)).join('\n');
      const raw=[noted?'Consultant: '+noted:n.by?'Consultation by: '+n.by:'',form&&'Form type: '+form,title&&'Procedure/s performed: '+title].filter(Boolean)
        .concat(shown.map(f=>f.name+': '+val(f)));
      return {date:n.date,rangeText:'',table:true,hospital:true,category:'consult',typeCell:form,title,result,source:consultant,raw,
        consultantFrom:noted?'note':consultant?'by':'',
        idSeen:n.idSeen||(i===0?preIds[0]||'':'')};
    });
  }

  /* ------------------------------------------------------------------ *
   * parse(): the whole lump → reviewed-ready rows
   * ------------------------------------------------------------------ */
  function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
  /* The same entry pasted twice is skipped: same tab, same date (and time for
     a note), the same procedure / test / type and the same start of its
     report or note. A POYC medicine is the same whatever day the list was
     copied. */
  function fingerprint(cat,iso,title,result,time,type){
    // A lab result is the same result when it is the same test of the same panel
    // taken at the same date and time.
    // A case summary is the same admission when it has the same admission date.
    if(cat==='case'&&iso)return 'case|'+iso;
    if(cat==='lab'&&iso)return 'lab|'+iso+'|'+String(time||'').slice(0,5)+'|'+norm(type).slice(0,60)+'|'+norm(title).slice(0,80);
    if(cat==='poyc')return 'poyc||'+(norm(title)+'|'+norm(result)).slice(0,120);
    // An ECG is the same ECG when it has the same date and time (as printed, to
    // the second), whatever its wording — e.g. the same ECG once confirmed.
    if(cat==='ecg'&&iso)return 'ecg|'+iso+'|'+String(time||'').slice(0,8);
    if(cat==='doc_icm'||cat==='notes'||cat==='ecg')return cat+'|'+(iso||'')+'|'+String(time||'').slice(0,5)+'|'+norm(title).slice(0,40)+'|'+norm(result).slice(0,200);
    return cat+'|'+(iso||'')+'|'+norm(title).slice(0,80)+'|'+norm(result).slice(0,120);
  }
  // Every way a saved entry could be recognised: its stored fingerprint (from
  // whichever version of the rules saved it) and today's rules.
  function savedKeys(entries){
    const keys=new Set();
    (entries||[]).forEach(e=>{if(e.fingerprint)keys.add(e.fingerprint);
      keysOf(e.category,String(e.entry_date||'').slice(0,10),e.title,e.result,e.entry_time,e.entry_type).forEach(k=>keys.add(k));});
    return keys;
  }
  // The keys an entry is known by once saved. An ECG is also known by its date
  // and minute, so one typed in without seconds still matches the pasted report.
  function keysOf(cat,iso,title,result,time,type){
    const out=[fingerprint(cat,iso,title,result,time,type)];
    if(cat==='ecg'&&iso){const t=String(time||''),m=t.slice(0,5);out.push('ecg|'+iso+'|'+m+'|any');if(t.length<8)out.push('ecg|'+iso+'|'+m+'|*');}
    return out;
  }
  // Already in the set? For an ECG: the same date and time to the second, or to
  // the minute when either of the two has no seconds.
  function isDup(set,cat,iso,title,result,time,type){
    if(set.has(fingerprint(cat,iso,title,result,time,type)))return true;
    if(cat==='ecg'&&iso){const t=String(time||''),m=t.slice(0,5);return set.has('ecg|'+iso+'|'+m+(t.length>=8?'|*':'|any'));}
    return false;
  }
  function parse(text,cat,opts){
    opts=opts||{};cat=CAT_KEYS.includes(cat)?cat:'surgery';
    let clean=normalise(text)
      // "Surgical history: appendicectomy 2015 …" — drop the list's own heading.
      .replace(/^[ \t]*(?:past\s+)?(?:surgical|medical|operative|imaging|radiology|treatment|drug|oncology|nursing)\s+(?:history|list|notes?)\s*:[ \t]*(?=\S)/gim,'');
    let lines=clean.split('\n').filter(l=>l.trim());
    // Columns lined up with spaces (copied from a PDF or a fixed-width print):
    // three or more spaces between items act as a column break.
    if(!clean.includes('\t')&&lines.length>=2&&lines.filter(l=>/\S {3,}\S/.test(l)).length>=lines.length*0.6){
      clean=clean.split('\n').map(l=>l.replace(/(\S) {3,}(?=\S)/g,'$1\t')).join('\n');
      lines=clean.split('\n').filter(l=>l.trim());
    }
    // The hospital's own layouts first: a consultation note (labels), the iCM
    // notes table, then the date-led tables (procedures, imaging, consultations).
    let raw=null,mode='text';
    if(cat==='poyc'){raw=poycRows(clean);mode='table';}
    else if(cat==='ecg'||looksEcg(clean)){raw=ecgRows(clean);mode='ecg';}
    else if(cat==='case'||looksCase(clean)){raw=caseRows(clean);mode='case';}
    else if(cat==='lab'||looksLab(clean)){raw=labRows(clean);mode='lab';}
    else if(looksConsultNote(clean)){raw=consultNotes(clean);mode='note';}
    else if(clean.includes('\t')){
      if(cat==='doc_icm'){const r=icmRows(clean);if(r.length&&r.some(x=>x.date)){raw=r;mode='table';}}
      if(!raw){const h=hospitalRows(clean,cat);if(h&&h.entries.length){raw=h.entries;mode='table';}}
    }
    if(!raw){
      const tabbed=lines.filter(l=>l.includes('\t')).length;
      const table=tabbed>=2&&tabbed>=lines.length*0.6;
      raw=table?tableEntries(clean,cat):freeEntries(clean,cat);mode=table?'table':'text';
    }
    const today=(typeof global.TODAY==='string'&&global.TODAY)||new Date().toISOString().slice(0,10);
    const dob=String(opts.dob||'').slice(0,10);
    const existing=opts.existing instanceof Set?opts.existing:new Set(opts.existing||[]);
    const seen=new Set();
    const rows=raw.map(e=>{
      const f=e.table?{title:e.title,result:e.result,source:e.source}:fieldsFrom(cat,e.first,e.more);
      if(e.rangeText&&!e.table)f.result=tidy(('Until '+e.rangeText.replace(/^\s*(?:-|–|—|to|until|till)\s*/i,'')+(f.result?'\n'+f.result:'')));
      const d=e.date;
      const flags=[];
      if(!d)flags.push(e.badDate?'bad_date':'no_date');
      else{
        if(d.precision==='month')flags.push('month_only');
        if(d.precision==='year')flags.push('year_only');
        d.flags.forEach(x=>flags.push(x));
        if(d.iso>today)flags.push('future');
        if(dob&&d.iso<dob)flags.push('before_birth');
      }
      let category=CAT_KEYS.includes(e.category)?e.category:cat;
      // A consultation note is recognised for certain, so pasting it in another
      // tab needs no checking; anything else moved is shown in amber.
      if(category!==cat)flags.push((e.category==='consult'||e.category==='ecg'||e.category==='lab'||e.category==='case')&&e.hospital?'moved_note':'moved');
      if(e.partial)flags.push(e.category==='case'?'case_partial':'ecg_partial');
      else if(!e.hospital){const sug=suggestCategory(cat,f.title,f.result);if(sug){category=sug;flags.push('moved');}}
      const list=category==='surgery'||category==='imaging';
      if((category==='surgery'||category==='consult')&&STOMA_RE.test(f.title))flags.push('stoma');
      if(list&&!f.title)flags.push('no_title');
      if(list&&/postpon|cancell?ed|not done|abandoned|deferred/i.test(f.title+' '+String(f.result).slice(0,120)))flags.push('not_done');
      if(list&&!e.table&&(f.title+f.result).length>1500)flags.push('long');
      // Only the columns each tab keeps: no type for procedures and scans, no
      // author for scans and iCM notes (Created By is left out).
      const source=category==='surgery'||category==='consult'||category==='case'?f.source:'';
      const timed=category==='doc_icm'||category==='ecg'||category==='lab';
      const type=category==='doc_icm'?((e.typeCell||'').trim()||noteType(f.source,f.result))
        :category==='consult'||category==='ecg'||category==='lab'||category==='case'?(e.typeCell||'').trim():'';
      const fp=fingerprint(category,d?d.iso:'',f.title,f.result,timed&&d?d.time:'',type);
      let include=true;
      const key=[category,d?d.iso:'',f.title,f.result,timed&&d?d.time:'',type];
      if(isDup(existing,...key)){flags.push('duplicate_saved');include=false;}
      else if(isDup(seen,...key)){flags.push('duplicate_paste');include=false;}
      keysOf(...key).forEach(k=>seen.add(k));
      return {include,category,entry_date:d?d.iso:null,date_precision:d?d.precision:'',entry_time:timed&&d?d.time:'',date_text:d?d.text:(e.badDate||''),
        entry_type:type,title:f.title,result:f.result,source,raw_text:(e.raw||[]).join('\n').trim(),flags,fingerprint:fp,id_seen:e.idSeen||'',consultant_from:e.consultantFrom||(source?'list':''),
        lab_flag:e.labFlag||'',lab_range:e.labRange||'',lab_unit:e.labUnit||''};
    }).filter(r=>r.title||r.result);
    return {rows,mode};
  }

  const FLAG_TEXT={
    no_date:'No date found',bad_date:'Date is not a real date (e.g. 31/02) — check it',month_only:'Only the month was given',year_only:'Only the year was given',
    two_digit_year:'Two-digit year — check the century',swapped:'Read as month/day — check the date',
    future:'Date is in the future',before_birth:'Date is before the date of birth',
    moved:'Looks like {cat} — will be saved there',moved_note:'Recognised as {cat} — will be saved there',ecg_partial:'Part of the report could not be read — check it against the PDF',stoma:'Involves a stoma — linked to the stoma on the profile',
    no_title:'No procedure / test found',not_done:'Says postponed / cancelled — check it was done',long:'Long entry — check it was split correctly',
    duplicate_saved:'Already saved — not ticked',duplicate_paste:'Repeated in this paste — not ticked',
    id_mismatch:'The ID in this note ({id}) is not this patient’s — check it is the right patient (not ticked)',id_match:'✓ The ID in the note matches this patient',
    consultant_stoma:'Consultant filled in from the stoma on the profile',consultant_proc:'Consultant filled in from the performed procedure on that date',
    date_stoma:'Date filled in from the stoma’s operation date',date_proc:'Date filled in from the performed procedure',
    updates_saved:'Same note saved before — saving updates it, no second copy',
    lab_new:'New test — joins the blood investigations list when saved',
    lab_from_case:'Already in Lab results from a case summary — saving adds its panel, flag and range',
    case_partial:'The admission date or diagnosis could not be read — check them against the report',
    case_duplicate_saved:'A case summary for this admission is already saved — not ticked',
    case_duplicate_paste:'Repeated in this paste — not ticked',
    case_updates_saved:'This admission was saved before and the summary has changed — saving updates it, no second copy',
    lab_duplicate_saved:'This test at the same date and time is already saved — not ticked',
    lab_duplicate_paste:'Repeated in this paste — not ticked',
    lab_updates_saved:'Changed since it was saved — saving updates it, no second copy',
    ecg_duplicate_saved:'An ECG with the same date and time is already saved — not ticked',
    ecg_duplicate_paste:'Same date and time as another ECG in this paste — not ticked',
    ecg_updates_saved:'Same date and time as an ECG saved before, now with a changed report — saving updates it, no second copy'
  };
  function flagText(code,row){const c=row&&row.category;if((c==='ecg'||c==='lab'||c==='case')&&FLAG_TEXT[c+'_'+code])code=c+'_'+code;return (FLAG_TEXT[code]||code).replace('{cat}',CATS[row&&row.category]?CATS[row.category].label:'another tab').replace('{id}',String(row&&row.id_seen||''));}
  // Flags that mean "a nurse should look at this row".
  const CHECK_FLAGS=new Set(['ecg_partial','case_partial','no_date','bad_date','not_done','two_digit_year','swapped','future','before_birth','moved','no_title','long','id_mismatch']);

  global.ClinicalHistory=Object.assign(global.ClinicalHistory||{},{CATS,CAT_KEYS,isNoteCat,parse,looksEcg,looksLab,looksCase,keysOf,isDup,findDate,lineStartDate,fingerprint,savedKeys,flagText,CHECK_FLAGS,typeFor,suggestCategory,STOMA_RE,_fieldsFrom:fieldsFrom});
})(window);

/* ==================================================================== *
 * The tabs on the patient profile
 * ==================================================================== */
(function(global){
  'use strict';
  const CH=global.ClinicalHistory;
  const TABLE='patient_history_entries';
  const db=()=>(typeof SB!=='undefined'&&SB)||global.SB;
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const st={pid:null,patient:null,hosts:{},entries:[],tab:'surgery',qs:{},available:true,error:'',loading:false,loaded:false,preview:null,pasteText:'',edit:null,note:'',noteAt:'',
    focus:null};
  // The sections inside Hospital records, as in the hospital system: Performed
  // procedures, Patient consultation (linked to its procedure by date), Medical
  // imaging results, ECG, iCM notes and Entitlement CARE (POYC).
  const MAIN={
    procedures:{label:'Performed procedures',icon:'🏥',cat:'surgery'},
    consult:{label:'Patient consultation',icon:'📋',cat:'consult'},
    imaging:{label:'Medical imaging results',icon:'🩻',cat:'imaging'},
    ecg:{label:'ECG',icon:'🫀',cat:'ecg'},
    icm:{label:'iCM notes',icon:'📄',cat:'doc_icm'},
    poyc:{label:'Entitlement CARE (POYC)',icon:'💊',cat:'poyc'},
    case:{label:'Case summaries',icon:'🗂️',cat:'case'},
    lab:{label:'Lab results',icon:'🧪',cat:'lab'}
  };
  // The columns each table shows: [heading, field].
  const COLS={
    surgery:[['Date','date'],['Consultant','source'],['Procedure','title']],
    imaging:[['Date','date'],['Test','title'],['Report','result']],
    ecg:[['Date','date'],['ECG','title'],['Interpretation','result'],['Measurements','meas']],
    doc_icm:[['Type','entry_type'],['Note','result'],['Created On','date']],
    poyc:[['Description','title'],['Prescription','result']],
    // The hospital's Profile Name, Item Name, Status and Range & UOM, renamed;
    // Range & UOM is split into the normal range and the unit.
    lab:[['Date & time','date'],['Panel','entry_type'],['Test','title'],['Result','result'],['Flag','lab_flag'],['Normal range','lab_range'],['Unit','lab_unit']]
  };
  // The help line under each section's buttons. Empty = no help line and no
  // "Nothing recorded yet" line (Performed procedures, Medical imaging results,
  // ECG and iCM notes).
  const HINT={
    surgery:'',
    consult:'Open the visit in the hospital system (Hospital Events › Patient Consultation › Open past visit), copy the whole note and paste it. The date, consultant and each section are set out in order; a blank date or consultant is filled in from the stoma on the profile. A note on the same date as a performed procedure is linked to it, and to the stoma when the operation involved one.',
    imaging:'',
    ecg:'',
    doc_icm:'',
    lab:'',
    case:'',
    poyc:'Copy the Entitlement CARE (POYC) table from the hospital system (Medications › Entitlement CARE (POYC)) and paste it in one go. Description and Prescription are kept; ATC Code and Dosage Regimen are left out. A medicine already saved is skipped; ones no longer on a new list can be removed when you save it.'
  };
  const PASTE_LABEL={surgery:'📋 Paste performed procedures',consult:'📋 Paste a consultation note',imaging:'📋 Paste imaging results',ecg:'📋 Paste an ECG report',lab:'📋 Paste lab results',case:'📋 Paste a case summary',doc_icm:'📋 Paste iCM notes',poyc:'📋 Paste the POYC list'};
  // Each tab is a fold-out section of its own on the profile, below Outcome
  // (index.html wraps each host in a details.pd-section).
  const SECTION_OF={surgery:'procedures',consult:'consult',imaging:'imaging',ecg:'ecg',doc_icm:'icm',poyc:'poyc',case:'case',lab:'lab'};
  function catOf(k){return MAIN[k].cat;}
  // Unfold a section and the Hospital records fold-out around it
  // (after saving, or when a linked entry is opened).
  function sectionOpen(k){
    const h=st.hosts&&st.hosts[k];
    for(let d=h&&h.closest('details');d;d=d.parentElement&&d.parentElement.closest('details'))if(!d.open)d.open=true;
    return h;
  }
  // Point the tabs at the place a category lives (after saving or editing).
  function goToCategory(cat){
    if(SECTION_OF[cat]){st.noteAt=SECTION_OF[cat];sectionOpen(SECTION_OF[cat]);}
  }
  let loadSeq=0;
  const day=e=>String(e&&e.entry_date||'').slice(0,10);
  const short=(s,n)=>{s=String(s||'').replace(/\s+/g,' ').trim();n=n||60;return s.length>n?s.slice(0,n-1).replace(/\s+\S*$/,'')+'…':s;};
  const normId=v=>typeof global.normaliseIdCard==='function'?global.normaliseIdCard(v):String(v||'').trim().toUpperCase().replace(/\s+/g,'').replace(/^0+(?=\d)/,'');
  const fmt=iso=>{if(!iso)return '';const s=String(iso).slice(0,10);if(typeof global.fmtShortDate==='function')return global.fmtShortDate(s);const [y,m,d]=s.split('-');return d+'/'+m+'/'+y;};

  function showDate(e){
    if(!e.entry_date)return 'No date';
    const [y,m]=String(e.entry_date).slice(0,10).split('-');
    if(e.date_precision==='year')return y;
    if(e.date_precision==='month')return MONTHS[+m-1]+' '+y;
    return fmt(e.entry_date);
  }
  function counts(){
    const c={surgery:0,consult:0,imaging:0,ecg:0,doc_icm:0,poyc:0,case:0,lab:0};
    st.entries.forEach(e=>{if(c[e.category]!=null)c[e.category]++;});
    c.procedures=c.surgery;c.icm=c.doc_icm;return c;
  }
  function sorted(list){
    return list.slice().sort((a,b)=>{
      const ad=String(a.entry_date||''),bd=String(b.entry_date||'');
      if(!ad&&bd)return 1;if(ad&&!bd)return -1;
      return bd.localeCompare(ad)||String(b.entry_time||'').localeCompare(String(a.entry_time||''))||String(b.created_at||'').localeCompare(String(a.created_at||''));
    });
  }
  async function whoName(){try{const u=await global.getCurrentUserForAudit();return String(u&&(u.name||u.email)||'');}catch(e){return '';}}
  function msg(text,ok){const el=document.getElementById('ch-msg');if(el)el.innerHTML=text?'<div class="registry-lookup-note'+(ok?'':' error')+'" style="margin:8px 0;">'+text+'</div>':'';}

  /* ---------- the patient's stomas, for the links ---------- */
  function stomaList(){try{return typeof global.patientStomaList==='function'?(global.patientStomaList(st.patient)||[]):[];}catch(e){return [];}}
  function stomaName(x){
    const t=typeof global.stomaTitle==='function'?global.stomaTitle(x):'Stoma '+(x.number||'');
    return t+(x.type?' · '+x.type:'');
  }
  function stomaKindOf(t){
    const s=String(t||'');
    if(/ileostom/i.test(s))return /ileo/i;if(/colostom|hartmann/i.test(s))return /colo/i;
    if(/urostom|ileal conduit/i.test(s))return /uro|conduit/i;if(/jejunostom/i.test(s))return /jejun/i;
    if(/mucous fistula|mucus fistula/i.test(s))return /fistula/i;return null;
  }
  // The stoma(s) an operation is about: one chosen by hand, else any stoma formed,
  // refashioned, closed or replaced on that date, else the only stoma of the type
  // the operation names.
  function stomaMatches(e){
    const list=stomaList(),d=day(e);
    const related=CH.STOMA_RE.test(String(e.title||''));
    if(!list.length)return {hits:[],related,list};
    if(e.linked_stoma){const x=list.find(s=>s.slot===e.linked_stoma);if(x)return {hits:[{x,what:''}],related,list};}
    const hits=[];
    if(d)list.forEach(x=>{
      if(x.formed_date&&String(x.formed_date).slice(0,10)===d)hits.push({x,what:x.kind==='refashion'?'refashioned':'formed'});
      else if(x.reversal_date&&String(x.reversal_date).slice(0,10)===d)hits.push({x,what:'closed'});
      else if(x.superseded_date&&String(x.superseded_date).slice(0,10)===d)hits.push({x,what:'replaced'});
    });
    if(!hits.length&&related){
      const kind=stomaKindOf(e.title);
      const c=kind?list.filter(x=>kind.test(String(x.type||''))):[];
      if(c.length===1)hits.push({x:c[0],what:''});
    }
    return {hits,related,list};
  }
  /* ---------- filled in automatically when the note leaves it out ---------- */
  // The consultant written against a stoma in the registry: a later stoma's own
  // register row, else the patient's consultant (Firm).
  function stomaConsultant(x){
    const p=st.patient||{};
    if(x&&x.kind==='later'&&typeof global.parseStomas==='function'){
      try{const s=(global.parseStomas(p)||[]).find(y=>y.uid===x.uid);if(s&&String(s.row_consultant||'').trim())return String(s.row_consultant).trim();}catch(e){}
    }
    return String(p.consultant||'').trim();
  }
  // Every stoma type an operation names ("reversal of Hartmann's + loop ileostomy").
  const KINDS=[[/ileostom/i,/ileo/i],[/colostom|hartmann/i,/colo/i],[/urostom|ileal conduit/i,/uro|conduit/i],[/jejunostom/i,/jejun/i],[/mucous fistula|mucus fistula/i,/fistula/i]];
  const CLOSING=/revers|closure|\bclos(?:e|ed|ing)\b|take\s*down|takedown|restor|re-?anastomos/i;
  // The surgery date saved on the profile for the stoma type the operation names:
  // its formation date, or its closure date for a reversal. Only when one date fits.
  function stomaDateFor(title){
    const t=String(title||''),kinds=KINDS.filter(k=>k[0].test(t)).map(k=>k[1]);if(!kinds.length)return '';
    const closing=CLOSING.test(t),dates=new Set();
    stomaList().forEach(x=>{
      if(!kinds.some(k=>k.test(String(x.type||''))))return;
      const d=String((closing?x.reversal_date:x.formed_date)||'').slice(0,10);
      if(/^\d{4}-\d{2}-\d{2}$/.test(d))dates.add(d);
    });
    return dates.size===1?[...dates][0]:'';
  }
  // A performed procedure saved before that names the same operation.
  const COMMON=new Set(['procedure','procedures','performed','operation','operations','resection','report','repair','excision','insertion','removal','under','general','local','laparoscopic','converted','formation','refashioning']);
  const sigWords=t=>new Set(String(t||'').toLowerCase().replace(/[`'’]s\b/g,'').split(/[^a-z]+/).filter(w=>w.length>=5&&!COMMON.has(w)));
  function procDateFor(title){
    const w=sigWords(title);if(!w.size)return '';
    const dates=new Set(st.entries.filter(e=>e.category==='surgery'&&day(e)&&[...sigWords(e.title)].some(x=>w.has(x))).map(day));
    return dates.size===1?[...dates][0]:'';
  }
  // The consultant when the note leaves it blank: the stoma's consultant in the
  // registry, else the consultant of the performed procedure on that date.
  function consultantFor(r){
    const m=stomaMatches(r);
    const fromStoma=[...new Set(m.hits.map(h=>stomaConsultant(h.x)).filter(Boolean))];
    if(fromStoma.length===1)return [fromStoma[0],'consultant_stoma'];
    const d=r.entry_date||'';
    const fromProc=d?[...new Set(st.entries.filter(e=>e.category==='surgery'&&day(e)===d&&String(e.source||'').trim()).map(e=>String(e.source).trim()))]:[];
    if(fromProc.length===1)return [fromProc[0],'consultant_proc'];
    if(m.related&&String((st.patient||{}).consultant||'').trim())return [String(st.patient.consultant).trim(),'consultant_stoma'];
    return ['',''];
  }
  // The same consultation note saved before (e.g. by an earlier version of the
  // app): same date and operation, and mostly the same words.
  const wordSet=t=>new Set(String(t||'').toLowerCase().replace(/^§.*$/gm,'').split(/[^a-z0-9]+/).filter(w=>w.length>=4));
  const normT=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  function sameNote(e,r){
    if(e.category!=='consult'||!r.entry_date||day(e)!==r.entry_date||normT(e.title)!==normT(r.title))return false;
    if(e.entry_type&&r.entry_type&&normT(e.entry_type)!==normT(r.entry_type))return false;
    const a=wordSet(e.result),b=wordSet(r.result);if(Math.min(a.size,b.size)<5)return false;
    let k=0;b.forEach(w=>{if(a.has(w))k++;});
    return k/Math.min(a.size,b.size)>=0.7;
  }
  // The same ECG (same date and time) saved before: identical → skipped; its
  // report changed since (e.g. confirmed) → saving updates the saved one.
  function sameEcgTime(e,r){
    if(e.category!=='ecg'||!r.entry_date||day(e)!==r.entry_date)return false;
    const a=String(e.entry_time||''),b=String(r.entry_time||'');
    return a.length>=8&&b.length>=8?a.slice(0,8)===b.slice(0,8):a.slice(0,5)===b.slice(0,5);
  }
  // A lab result: the same test of the same panel at the same date and time.
  function sameLabResult(e,r){
    return e.category==='lab'&&r.entry_date&&day(e)===r.entry_date&&String(e.entry_time||'').slice(0,5)===String(r.entry_time||'').slice(0,5)
      &&normT(e.entry_type)===normT(r.entry_type)&&normT(e.title)===normT(r.title);
  }
  function ecgUpdates(rows){
    rows.forEach(r=>{
      if((r.category!=='ecg'&&r.category!=='lab'&&r.category!=='case')||!r.flags.includes('duplicate_saved'))return;
      const e=st.entries.find(x=>r.category==='lab'?sameLabResult(x,r):r.category==='case'?(x.category==='case'&&day(x)===r.entry_date):sameEcgTime(x,r));if(!e)return;
      if(normT(e.title)===normT(r.title)&&normT(e.entry_type)===normT(r.entry_type)&&normT(e.result)===normT(r.result)
        &&(r.category!=='lab'||(normT(e.lab_flag)===normT(r.lab_flag)&&normT(e.lab_range)===normT(r.lab_range)&&normT(e.lab_unit)===normT(r.lab_unit))))return;
      r.flags=r.flags.filter(f=>f!=='duplicate_saved');r.flags.push('updates_saved');r.replaces=e.id;r.include=true;
    });
  }
  function autoFill(rows){
    const have=CH.savedKeys(st.entries),seen=new Set(rows.filter(r=>r.entry_date).map(r=>r.fingerprint));
    rows.forEach(r=>{
      if(r.category!=='surgery'&&r.category!=='consult')return;
      if(!r.entry_date){
        let d=stomaDateFor(r.title),why='date_stoma';
        if(!d){d=procDateFor(r.title);why='date_proc';}
        if(d){
          r.entry_date=d;r.date_precision='day';r.flags=r.flags.filter(f=>f!=='no_date');r.flags.push(why);
          r.fingerprint=CH.fingerprint(r.category,d,r.title,r.result,r.entry_time);
          r.flags=r.flags.filter(f=>!/^duplicate_/.test(f));r.include=true;
          if(have.has(r.fingerprint)){r.flags.push('duplicate_saved');r.include=false;}
          else if(seen.has(r.fingerprint)){r.flags.push('duplicate_paste');r.include=false;}
          seen.add(r.fingerprint);
        }
      }
      if(r.consultant_from!=='note'&&r.consultant_from!=='list'){
        const [c,why]=consultantFor(r);
        if(c){r.source=c;r.flags.push(why);}
      }
      if(r.category==='consult'&&!r.flags.some(f=>/^duplicate_/.test(f))){
        const e=st.entries.find(x=>sameNote(x,r));
        if(e){
          r.replaces=e.id;r.flags.push('updates_saved');
          // Keep a consultant typed in by hand when the note has none.
          if(r.consultant_from!=='note'&&!r.flags.some(f=>/^consultant_/.test(f))&&String(e.source||'').trim())r.source=String(e.source).trim();
        }
      }
    });
  }
  function stomaChips(e,preview){
    const m=stomaMatches(e);
    const out=m.hits.map(h=>preview
      ?'<span class="ch-stoma">🟣 '+esc(stomaName(h.x))+(h.x.code?' · '+esc(h.x.code):'')+(h.what?' — '+h.what:'')+'</span>'
      :'<button type="button" class="ch-stoma" data-slot="'+esc(h.x.slot)+'" onclick="ClinicalHistory.openStoma(this.dataset.slot)" title="Open this stoma">🟣 '+esc(stomaName(h.x))+(h.x.code?' · '+esc(h.x.code):'')+(h.what?' — '+h.what:'')+'</button>');
    if(!preview&&e.id&&m.list.length&&(m.related||e.linked_stoma||m.hits.length))
      out.push('<button type="button" class="ch-link ch-link-quiet" onclick="ClinicalHistory.chooseStoma(\''+esc(e.id)+'\')">🔗 '+(m.hits.length?'Change stoma':'Link to a stoma')+'</button>');
    return out;
  }
  // Procedure ↔ consultation note on the same date, and the stoma.
  function linksHTML(e,from){
    const d=day(e),out=[];
    if(d&&from==='surgery'){
      const n=st.entries.filter(x=>x.category==='consult'&&day(x)===d).length;
      if(n)out.push('<button type="button" class="ch-link" onclick="ClinicalHistory.showLinked(\'consult\',\''+d+'\')">📋 Consultation note'+(n>1?'s ('+n+')':'')+'</button>');
    }
    if(d&&from==='consult'){
      st.entries.filter(x=>x.category==='surgery'&&day(x)===d).forEach(x=>out.push('<button type="button" class="ch-link" onclick="ClinicalHistory.showLinked(\'surgery\',\''+d+'\')">🏥 Performed procedure: '+esc(short(x.title,70))+'</button>'));
    }
    out.push(...stomaChips(e,false));
    return out.length?'<div class="ch-links">'+out.join('')+'</div>':'';
  }

  // hosts: {procedures, imaging, icm, poyc}, one element per fold-out section.
  function mount(hosts,patient){
    if(!hosts||!patient)return;
    const pid=String(patient.id);
    if(st.pid!==pid){st.pid=pid;st.entries=[];st.qs={};st.tab='surgery';st.loaded=false;st.note='';st.noteAt='';st.pasteText='';st.focus=null;}
    st.hosts=hosts;st.patient=patient;
    render();load();
  }
  async function load(){
    const pid=st.pid,seq=++loadSeq;if(!pid||!db())return;
    st.loading=!st.loaded;render();
    let res;
    try{
      res=typeof global.fetchAllRows==='function'
        ?await global.fetchAllRows(()=>db().from(TABLE).select('*').eq('patient_id',pid))
        :await db().from(TABLE).select('*').eq('patient_id',pid).then(r=>({rows:r.data||[],error:r.error}));
    }catch(e){res={rows:[],error:e};}
    if(seq!==loadSeq||pid!==st.pid)return;
    st.loading=false;st.loaded=true;
    if(res.error){
      const m=String(res.error.message||res.error);
      st.available=!/patient_history_entries|does not exist|relation|schema cache/i.test(m);
      st.error=st.available?m:'';st.entries=[];
    }else{st.available=true;st.error='';st.entries=res.rows||[];}
    render();
    // The Holistic summary rebuilds from these.
    try{document.dispatchEvent(new CustomEvent('clinical-history:changed'));}catch(e){}
    // Blood results in a case summary not yet sent to Lab results go there now.
    if(!res.error)syncCaseBloods();
    // The Treatment (💊) follows the latest case summary's treatment on discharge.
    if(!res.error&&typeof global.syncTreatmentFromCases==='function'&&st.patient&&String(st.patient.id)===String(pid))
      try{global.syncTreatmentFromCases(st.patient);}catch(e){}
  }
  function render(){
    const c=counts();
    // The Hospital records fold-out: the total in its title.
    const first=st.hosts&&st.hosts.procedures,outer=first&&first.closest('details')&&first.closest('details').parentElement.closest('details');
    const osum=outer&&outer.querySelector(':scope > summary');
    if(osum){if(!osum.dataset.label)osum.dataset.label=osum.textContent.trim();osum.innerHTML=esc(osum.dataset.label)+' <span class="ch-sum-count">'+(c.surgery+c.consult+c.imaging+c.ecg+c.doc_icm+c.poyc+c.case+c.lab)+'</span>';}
    Object.keys(MAIN).forEach(k=>{
      const h=st.hosts&&st.hosts[k];if(!h||!document.body.contains(h))return;
      // The fold-out's title carries the count, as the tab button did.
      const d=h.closest('details'),sum=d&&d.querySelector(':scope > summary');
      if(sum)sum.innerHTML=esc(MAIN[k].label)+' <span class="ch-sum-count">'+c[k]+'</span>';
      h.innerHTML=paneHTML(k,c);
    });
    if(st.focus)setTimeout(()=>{const h=st.hosts[SECTION_OF[st.focus.cat]];const el=h&&h.querySelector('.is-focus');if(el&&el.scrollIntoView)el.scrollIntoView({block:'center',behavior:'smooth'});},40);
  }
  function paneHTML(k,c){
    if(!st.available)return '<div class="ch-pane ch-pane-'+k+'"><div class="ch-missing">These sections need their database table first. Run <strong>sql/add-patient-history.sql</strong> once in Supabase (SQL Editor), then press ↻ Refresh.</div></div>';
    const cat=catOf(k);
    const what=cat==='doc_icm'?'iCM notes':cat==='poyc'?'POYC medicines':cat==='ecg'?'ECGs':cat==='lab'?'lab results':cat==='case'?'case summaries':CH.CATS[cat].label.toLowerCase();
    return '<div class="ch-pane ch-pane-'+k+'">'
      +'<div class="ch-tools"><button type="button" class="psm-btn psm-btn-primary" onclick="ClinicalHistory.openPaste(\''+cat+'\')">'+PASTE_LABEL[cat]+'</button>'
      +'<button type="button" class="psm-btn" onclick="ClinicalHistory.openEdit(\'\',\''+cat+'\')">＋ Add one</button>'
      +(cat==='lab'?'<button type="button" class="psm-btn" onclick="ClinicalHistory.labList()">🧪 Blood investigations list</button>':'')
      +'<input type="search" class="ch-search" placeholder="Search '+esc(what)+'…" aria-label="Search '+esc(what)+'" value="'+esc(st.qs[k]||'')+'" oninput="ClinicalHistory.search(this.value,\''+k+'\')"></div>'
      +(HINT[cat]?'<p class="ch-hint">'+esc(HINT[cat])+'</p>':'')+(st.note&&st.noteAt===k?'<div class="ch-note">'+st.note+'</div>':'')
      +'<div id="ch-list-'+k+'" class="ch-list">'+listHTML(k)+'</div></div>';
  }
  function matches(e,q){return !q||[e.title,e.result,e.source,e.entry_type,e.date_text,showDate(e),e.lab_flag,e.lab_range,e.lab_unit].join(' ').toLowerCase().includes(q);}
  function actHTML(e){
    const by='Added by '+(e.created_by_name||'—')+(e.updated_by_name&&e.updated_at&&e.updated_at!==e.created_at?' · edited by '+e.updated_by_name:'');
    return '<span class="ch-act" title="'+esc(by)+'"><button type="button" class="ch-ic" title="Edit this entry" aria-label="Edit this entry" onclick="ClinicalHistory.openEdit(\''+esc(e.id)+'\')">✏️</button>'
      +'<button type="button" class="ch-ic" title="Delete this entry" aria-label="Delete this entry" onclick="ClinicalHistory.remove(\''+esc(e.id)+'\')">🗑</button></span>';
  }
  function listHTML(k){
    if(st.loading)return '<p class="ch-empty">Loading…</p>';
    if(st.error)return '<p class="ch-empty" role="alert">Could not load these entries: '+esc(st.error)+' <button type="button" class="psm-btn" onclick="ClinicalHistory.reload()">Retry</button></p>';
    const q=String(st.qs[k]||'').trim().toLowerCase(),cat=catOf(k);
    let rows=sorted(st.entries.filter(e=>e.category===cat&&matches(e,q)));
    if(cat==='lab')rows=rows.sort((a,b)=>(day(b)+' '+(b.entry_time||'')).localeCompare(day(a)+' '+(a.entry_time||''))
      ||String(a.entry_type||'').localeCompare(String(b.entry_type||''))||String(a.created_at||'').localeCompare(String(b.created_at||'')));
    if(!rows.length&&!q&&!HINT[cat])return '';
    if(!rows.length)return '<p class="ch-empty">'+(q?'Nothing matches that search.':'Nothing recorded yet. Press <strong>'+esc(PASTE_LABEL[cat])+'</strong> to add '+(cat==='consult'?'a note':'the whole list in one go')+'.')+'</p>';
    if(cat==='poyc'){
      rows.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),undefined,{sensitivity:'base'}));   // medicines A–Z
      const last=rows.reduce((a,e)=>String(e.created_at||'')>String(a&&a.created_at||'')?e:a,null);
      return (last?'<p class="ch-asof">Entitlement list copied on <strong>'+esc(fmt(last.created_at||last.entry_date))+'</strong>'+(last.created_by_name?' by '+esc(last.created_by_name):'')+'.</p>':'')+tableHTML(cat,rows);
    }
    if(cat==='case'){rows.sort((a,b)=>day(b).localeCompare(day(a)));return (q?'':medHistoryHTML())+rows.map(caseCardHTML).join('');}
    return cat==='consult'?rows.map(consultCardHTML).join(''):tableHTML(cat,rows);
  }
  // The entries to highlight: one entry (opened from the Holistic summary), or all of a date.
  const isFocus=(cat,e)=>!!(st.focus&&st.focus.cat===cat&&(st.focus.id?String(e.id)===st.focus.id:st.focus.date===day(e)));
  function tableHTML(cat,rows){
    const cols=COLS[cat];
    const head='<thead><tr>'+cols.map(c=>'<th scope="col">'+esc(c[0])+'</th>').join('')+'<th scope="col" class="ch-c-act"><span class="ch-sr">Edit or delete</span></th></tr></thead>';
    const body=rows.map(e=>'<tr class="'+(isFocus(cat,e)?'is-focus':'')+'">'+cols.map(([label,key])=>{
      let v;
      if(key==='date')v='<strong>'+esc(showDate(e))+'</strong>'+((cat==='doc_icm'||cat==='ecg'||cat==='lab')&&e.entry_time?' <span class="ch-time">'+esc(e.entry_time)+'</span>':'');
      else if(cat==='ecg')v=ecgCell(e,key);
      else if(cat==='lab'&&key==='lab_flag')v=e.lab_flag?'<span class="ch-lab-flag">'+esc(e.lab_flag)+'</span>':'';
      else if(cat==='lab'&&key==='entry_type'&&!e.entry_type&&e.source)v='<span class="ch-lab-src">'+esc(e.source)+'</span>';
      else if(cat==='lab'&&key==='result')v='<strong class="ch-lab-res">'+esc(e.result||'')+'</strong>';
      else if(cat==='lab'&&key==='lab_range')v=e.lab_range?'<span class="ch-lab-rl">Normal range </span>'+esc(e.lab_range):'';
      else v='<div class="ch-cell-text">'+esc(e[key]||'')+'</div>';
      if(cat==='surgery'&&key==='title')v+=linksHTML(e,'surgery');
      return '<td data-label="'+esc(label)+'" class="ch-c-'+key+'"><div class="ch-td">'+v+'</div></td>';
    }).join('')+'<td class="ch-c-act">'+actHTML(e)+'</td></tr>').join('');
    return '<div class="ch-table-wrap"><table class="ch-table ch-table-'+cat+'">'+head+'<tbody>'+body+'</tbody></table></div>';
  }
  /* ---------- ECG: the cardiograph's own report, as printed ---------- */
  // Units as the cardiograph prints them: rate in beats per minute, intervals in
  // milliseconds, axes in degrees.
  const ECG_UNIT={HR:'bpm',RR:'ms',PR:'ms',QRSD:'ms',QT:'ms',QTc:'ms',QTcB:'ms',QTcF:'ms',QTcH:'ms',P:'°',QRS:'°',T:'°'};
  function ecgPairs(line){
    const out={};String(line||'').split('·').forEach(x=>{const m=x.trim().match(/^([A-Za-z]+)\s+(-?\d+)$/);if(m)out[m[1]]=+m[2];});return out;
  }
  function ecgValuesOf(e){
    const secs=sectionsOf(e.result),get=l=>(secs.find(x=>x.label===l)||{}).value||'';
    return {meas:ecgPairs(get('Measurements')),axis:ecgPairs(get('Axis')),secs};
  }
  // The ECG saved before this one (by date and time), for the change in each value.
  function ecgBefore(e){
    const key=x=>day(x)+' '+String(x.entry_time||'');
    return st.entries.filter(x=>x.category==='ecg'&&x.id!==e.id&&day(x)&&key(x)<key(e)).sort((a,b)=>key(b).localeCompare(key(a)))[0]||null;
  }
  function ecgCell(e,key){
    if(key==='title'){
      const v=String(e.title||''),tone=/^abnormal/i.test(v)?'abn':/^borderline/i.test(v)?'bord':/normal/i.test(v)?'norm':'';
      return (v?'<span class="ch-ecg-verdict'+(tone?' is-'+tone:'')+'">'+esc(v)+'</span>':'')
        +(e.entry_type?'<div class="ch-ecg-status">'+esc(e.entry_type)+'</div>':'');
    }
    const {meas,axis,secs}=ecgValuesOf(e);
    if(key==='result'){
      const lines=((secs.find(x=>x.label==='Interpretation')||{}).value||'').split('\n').filter(Boolean);
      const prev=(secs.find(x=>x.label==='Previous study')||{}).value||'';
      const other=secs.filter(x=>!['Measurements','Axis','Interpretation','Previous study'].includes(x.label));
      return (lines.length?'<ul class="ch-ecg-list">'+lines.map(l=>'<li>'+esc(l)+'</li>').join('')+'</ul>':'')
        +other.map(x=>'<div class="ch-cell-text"><strong>'+esc(x.label)+':</strong> '+esc(x.value)+'</div>').join('')
        +(prev?'<div class="ch-ecg-prev">Previous study: '+esc(prev)+'</div>':'');
    }
    // Measurements, with the change since the ECG saved before (no reading added).
    const b=ecgBefore(e),bv=b?ecgValuesOf(b):null;
    const item=(k,val,was)=>{
      const d=was!=null?val-was:null;
      return '<span class="ch-ecg-m"><b>'+esc(k)+'</b> '+esc(String(val))+'<small>'+esc(ECG_UNIT[k]||'')+'</small>'
        +(d?'<span class="ch-ecg-d" title="Change since the ECG of '+esc(showDate(b))+'">'+(d>0?'▲ +':'▼ ')+esc(String(d))+'</span>':'')+'</span>';
    };
    const ms=Object.keys(meas).map(k=>item(k,meas[k],bv?bv.meas[k]:null));
    const as=Object.keys(axis).map(k=>item(k,axis[k],bv?bv.axis[k]:null));
    return (ms.length?'<div class="ch-ecg-ms">'+ms.join('')+'</div>':'')
      +(as.length?'<div class="ch-ecg-ms"><span class="ch-ecg-axl">Axis</span>'+as.join('')+'</div>':'')
      +(b&&(ms.length||as.length)?'<div class="ch-ecg-since">▲▼ since '+esc(showDate(b))+'</div>':'');
  }
  // Left out of consultation notes (also hides them in notes saved before).
  const LEFT_OUT=/^(?:Assistant surgeon\/s|Anaesthetist\/s|Nurse\/s|External reference)$/i;
  // A consultation note's sections ("§ Label" lines, written when it was organised).
  function sectionsOf(text){
    const s=String(text||'');
    if(!/^§ /m.test(s))return s.trim()?[{label:'Note',value:s.trim()}]:[];
    return s.split(/^§ /m).filter(x=>x.trim()).map(part=>{const nl=part.indexOf('\n');
      return nl<0?{label:part.trim(),value:''}:{label:part.slice(0,nl).trim(),value:part.slice(nl+1).trim()};}).filter(x=>x.value&&!LEFT_OUT.test(x.label)
        // An earlier build put "Date/Time … Visit# … External Reference …" here.
        &&!(/^Case speciality$/i.test(x.label)&&/Visit\s*#|External\s+Ref|Date\s*\/\s*Time/i.test(x.value)));
  }
  function longText(v){
    v=String(v||'');if(v.length<=480)return '<div class="ch-sec-text">'+esc(v)+'</div>';
    return '<div class="ch-sec-text ch-clip">'+esc(short(v,260))+'</div><details class="ch-more"><summary>Show all</summary><div class="ch-sec-text">'+esc(v)+'</div></details>';
  }
  /* ---------- Case summaries → Lab results ----------
     The blood results listed under a case summary's Investigations are added to
     Lab results automatically — date, time, test, result and unit, with the case
     summary as their source (no panel, flag or range: the summary has none).
     Each case summary is sent once (a mark in its raw text), so a result deleted
     from Lab results does not come back. A result already in Lab results (same
     date, time and test, or the same value for the same kind of test) is
     skipped; a Lab Results table pasted later upgrades it with its panel, flag
     and normal range instead of adding a copy. */
  const BLOODS_SENT='[Blood results added to Lab results]';
  const NOT_BLOOD=/x-?ray|\bct\b|\bmri\b|ultrasound|\bus\b|fluoro|\bscan\b|echo|\becg\b|doppler|endoscop|culture|swab|histolog/i;
  function caseBloods(e){
    const out=[];
    caseSec(e,'Investigations').split('\n').forEach(l=>{
      const c=l.split(' · ');if(c.length<3)return;
      const m=c[0].match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}:\d{2})$/);if(!m)return;
      const test=c[1].trim(),v=c.slice(2).join(' · ').trim();
      const n=v.match(/^([<>]?\s*-?\d+(?:[.,]\d+)?)\s*(.{0,30})$/);
      if(!n||NOT_BLOOD.test(test))return;
      out.push({iso:m[3]+'-'+m[2]+'-'+m[1],time:m[4].padStart(5,'0'),test,value:n[1].replace(/\s+/g,''),unit:n[2].trim(),line:l});
    });
    return out;
  }
  const testKey=t=>String(t||'').toLowerCase().replace(/\([^)]*\)/g,' ').replace(/\b(?:serum|plasma|blood|whole|level|poc|venous|arterial)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
  // The same blood result: same date and minute, and the same test (or the same
  // value for a test starting with the same word).
  function sameBlood(e,b){
    if(day(e)!==b.iso||String(e.entry_time||'').slice(0,5)!==String(b.time||'').slice(0,5))return false;
    const a=testKey(e.title),c=testKey(b.test);if(a&&a===c)return true;
    const n1=parseFloat(String(e.result).replace(/[<>\s]/g,'')),n2=parseFloat(String(b.value).replace(/[<>\s]/g,''));
    return isFinite(n1)&&n1===n2&&a.split(' ')[0]===c.split(' ')[0];
  }
  let syncing=false;const sentNow=new Set();   // handled this session, even if the mark could not be saved
  async function syncCaseBloods(){
    if(syncing||!st.pid||!db())return;
    const pending=st.entries.filter(e=>e.category==='case'&&!sentNow.has(String(e.id))&&!String(e.raw_text||'').includes(BLOODS_SENT));
    if(!pending.length)return;
    syncing=true;const pid=st.pid;
    try{
      const labs=st.entries.filter(e=>e.category==='lab'),out=[],who=await whoName(),base=Date.now(),batch=global.crypto&&global.crypto.randomUUID?global.crypto.randomUUID():null;
      pending.forEach(e=>caseBloods(e).forEach(b=>{
        if(labs.some(x=>sameBlood(x,b))||out.some(x=>sameBlood({entry_date:x.entry_date,entry_time:x.entry_time,title:x.title,result:x.result},b)))return;
        const r={category:'lab',entry_date:b.iso,date_precision:'day',entry_time:b.time,date_text:'',entry_type:'',title:b.test,result:b.value,
          source:'Case summary '+fmt(e.entry_date),raw_text:b.line,lab_flag:'',lab_range:'',lab_unit:b.unit};
        const now=new Date(base+out.length).toISOString();
        out.push(dbRow(r,CH.fingerprint('lab',b.iso,b.test,b.value,b.time,''),batch,who,now));
      }));
      if(out.length){
        const res=await writeTolerant(rows=>db().from(TABLE).insert(rows),out);
        if(res.error)return;   // Lab results not set up yet: try again next time
        try{global.logAudit&&global.logAudit({action:'create',entity:'patient',entity_id:pid,patient_id:pid,summary:'Added '+out.length+' blood result'+(out.length===1?'':'s')+' to Lab results from case summaries'});}catch(e){}
      }
      for(const e of pending){sentNow.add(String(e.id));await db().from(TABLE).update({raw_text:(String(e.raw_text||'')+'\n'+BLOODS_SENT).trim()}).eq('id',e.id);}
      if(out.length&&pid===st.pid){st.note='✓ '+out.length+' blood result'+(out.length===1?'':'s')+' from case summaries added to Lab results.';st.noteAt='lab';}
    }catch(e){}
    finally{syncing=false;}
    if(pid===st.pid)await load();
  }

  /* ---------- Case summaries ---------- */
  const caseSec=(e,label)=>((sectionsOf(e.result).find(x=>x.label===label)||{}).value||'');
  function caseDates(e){
    const m=caseSec(e,'Dates').match(/Discharged\s+(\d{2})\/(\d{2})\/(\d{4})/);
    return {adm:day(e),dis:m?m[3]+'-'+m[2]+'-'+m[1]:''};
  }
  // The stoma(s) the patient had during the admission; a summary from before any
  // stoma reads "Before Stoma 1". A stoma chosen by hand wins.
  function caseStomaChips(e){
    const list=stomaList(),out=[];if(!list.length)return out;
    const {adm,dis}=caseDates(e),end=dis||adm,d10=v=>String(v||'').slice(0,10);
    let hits=[];
    if(e.linked_stoma){const x=list.find(s=>s.slot===e.linked_stoma);if(x)hits=[x];}
    if(!hits.length&&adm)hits=list.filter(x=>x.formed_date&&d10(x.formed_date)<=end&&(!(x.reversal_date||x.superseded_date)||d10(x.reversal_date||x.superseded_date)>=adm));
    hits.forEach(x=>{
      const what=d10(x.formed_date)>=adm&&d10(x.formed_date)<=end?' — formed this admission':x.reversal_date&&d10(x.reversal_date)>=adm&&d10(x.reversal_date)<=end?' — closed this admission':'';
      out.push('<button type="button" class="ch-stoma" data-slot="'+esc(x.slot)+'" onclick="ClinicalHistory.openStoma(this.dataset.slot)" title="Open this stoma">🟣 '+esc(stomaName(x))+(x.code?' · '+esc(x.code):'')+esc(what)+'</button>');
    });
    if(!hits.length&&adm){
      const first=list.filter(x=>x.formed_date).sort((a,b)=>d10(a.formed_date).localeCompare(d10(b.formed_date)))[0];
      if(first&&adm<d10(first.formed_date))out.push('<span class="ch-stoma ch-stoma-before">⏮ Before '+esc(stomaName(first))+' (formed '+esc(fmt(first.formed_date))+')</span>');
    }
    if(e.id)out.push('<button type="button" class="ch-link ch-link-quiet" onclick="ClinicalHistory.chooseStoma(\''+esc(e.id)+'\')">🔗 '+(e.linked_stoma?'Change stoma':'Link to a stoma')+'</button>');
    return out;
  }
  const CASE_LIST=new Set(['Past medical history','Medications on admission','Past surgical history','Allergies','Plan','Surgical interventions','Complications','Follow-up','Pending investigations','Family history']);
  function caseSectionHTML(x){
    const lines=x.value.split('\n').filter(Boolean);
    if(x.label==='Treatment on discharge')
      return '<div class="ch-table-wrap"><table class="ch-case-tx"><thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Period</th><th>Comments</th></tr></thead><tbody>'
        +lines.map(l=>{const c=l.split(' · ');return '<tr>'+[0,1,2,3].map(i=>'<td>'+esc(c[i]||'')+'</td>').join('')+'<td>'+esc(c.slice(4).join(' · '))+'</td></tr>';}).join('')+'</tbody></table></div>';
    if(x.label==='Investigations'){
      const li=lines.map(l=>'<li>'+esc(l)+'</li>');
      return li.length<=8?'<ul class="ch-case-ul">'+li.join('')+'</ul>'
        :'<ul class="ch-case-ul">'+li.slice(0,6).join('')+'</ul><details class="ch-more"><summary>Show all '+li.length+'</summary><ul class="ch-case-ul">'+li.slice(6).join('')+'</ul></details>';
    }
    if(CASE_LIST.has(x.label))return '<ul class="ch-case-ul">'+lines.map(l=>'<li>'+esc(l)+'</li>').join('')+'</ul>';
    return longText(x.value);
  }
  function caseCardHTML(e){
    const {adm,dis}=caseDates(e);
    const days=adm&&dis?Math.round((Date.parse(dis)-Date.parse(adm))/864e5):null;
    const secs=sectionsOf(e.result).filter(x=>x.label!=='Dates');
    return '<article class="ch-consult ch-case'+(isFocus('case',e)?' is-focus':'')+'">'
      +'<div class="ch-consult-head"><span class="ch-consult-date">'+esc(adm?fmt(adm):'No date')+(dis?' → '+esc(fmt(dis)):'')+'</span>'
      +(days!=null?'<span class="ch-type">'+days+' day'+(days===1?'':'s')+'</span>':'')
      +(e.source?'<span class="ch-consult-by">'+esc(e.source)+'</span>':'')
      +(e.entry_type?'<span class="ch-type">'+esc(e.entry_type)+'</span>':'')+actHTML(e)+'</div>'
      +(e.title?'<div class="ch-title">'+esc(e.title)+'</div>':'')
      +'<div class="ch-links">'+caseStomaChips(e).join('')+'</div>'
      +(secs.length?'<dl class="ch-sections">'+secs.map(x=>'<dt>'+esc(x.label)+'</dt><dd>'+caseSectionHTML(x)+'</dd>').join('')+'</dl>':'')
      +'</article>';
  }
  // Medication history: each medicine on admission and on discharge for every
  // case summary, and on the POYC list today — so starts and stops stand out.
  const FREQ_WORD=/\s(?=\d|(?:daily|od|om|on|bd|bid|tds|tid|qds|qid|prn|nocte|mane|stat|weekly|monthly|once|twice|alternate)\b)/i;
  function medSplit(line){
    const l=String(line||'').trim();
    if(l.includes(' · ')){const c=l.split(' · ');return {name:c[0],detail:[c[1],c[2]].filter(Boolean).join(' ')};}
    const i=l.search(FREQ_WORD);
    return i>0?{name:l.slice(0,i).trim(),detail:l.slice(i).trim()}:{name:l.replace(/\s+-\s+.*$/,''),detail:(l.match(/\s+-\s+(.*)$/)||[])[1]||''};
  }
  // One row per medicine: its generic name (first word), or two words for a
  // salt such as "Sodium bicarbonate"; brand names in brackets are ignored.
  const SALT=new Set(['sodium','potassium','calcium','magnesium','ferrous','zinc','vitamin','new']);
  function medKey(n){
    const w=String(n||'').toLowerCase().replace(/\([^)]*\)/g,' ').replace(/\b(?:tablets?|tabs?|capsules?|caps?|chewable|oral|iv|po|effervescent)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
    if(!w.length)return '';
    return w[0].length>=6&&!SALT.has(w[0])?w[0]:w.slice(0,2).join(' ');
  }
  function medHistoryHTML(){
    const cases=st.entries.filter(e=>e.category==='case'&&e.entry_date).sort((a,b)=>day(a).localeCompare(day(b)));
    const cols=[];
    cases.forEach(e=>{
      const {adm,dis}=caseDates(e);
      const a=caseSec(e,'Medications on admission'),d=caseSec(e,'Treatment on discharge');
      if(a)cols.push({head:'Admitted',when:adm,lines:a.split('\n')});
      if(d)cols.push({head:'Discharged',when:dis||adm,lines:d.split('\n')});
    });
    const poyc=st.entries.filter(e=>e.category==='poyc');
    if(poyc.length)cols.push({head:'POYC now',when:'',lines:poyc.map(e=>e.title+(e.result?' · '+e.result:''))});
    if(!cases.length||cols.length<1)return '';
    const rows=new Map();
    cols.forEach((c,ci)=>c.lines.filter(Boolean).forEach(l=>{
      const m=medSplit(l),k=medKey(m.name);if(!k)return;
      if(!rows.has(k))rows.set(k,{name:m.name,cells:{}});
      const r=rows.get(k);r.name=m.name;r.cells[ci]=ci===cols.length-1&&poyc.length?'✓':(m.detail||'✓');
    }));
    const list=[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
    return '<details class="ch-medhx"><summary>💊 Medication history <span class="ch-sum-count">'+list.length+'</span> <small>across '+cases.length+' case summar'+(cases.length===1?'y':'ies')+(poyc.length?' and the POYC list':'')+'</small></summary>'
      +'<div class="ch-table-wrap"><table class="ch-medhx-t"><thead><tr><th>Medicine</th>'+cols.map(c=>'<th>'+esc(c.head)+(c.when?'<br><small>'+esc(fmt(c.when))+'</small>':'')+'</th>').join('')+'</tr></thead><tbody>'
      +list.map(r=>'<tr><th scope="row">'+esc(r.name)+'</th>'+cols.map((c,ci)=>'<td'+(r.cells[ci]?'':' class="is-none"')+'>'+esc(r.cells[ci]||'—')+'</td>').join('')+'</tr>').join('')
      +'</tbody></table></div><p class="ch-asof">— means not listed on that summary.</p></details>';
  }
  function consultCardHTML(e){
    const secs=sectionsOf(e.result);
    return '<article class="ch-consult'+(isFocus('consult',e)?' is-focus':'')+'">'
      +'<div class="ch-consult-head"><span class="ch-consult-date">'+esc(showDate(e))+'</span>'
      +(e.source?'<span class="ch-consult-by">'+esc(e.source)+'</span>':'')
      +(e.entry_type?'<span class="ch-type">'+esc(e.entry_type)+'</span>':'')+actHTML(e)+'</div>'
      +(e.title?'<div class="ch-title">'+esc(e.title)+'</div>':'')
      +linksHTML(e,'consult')
      +(secs.length?'<dl class="ch-sections">'+secs.map(x=>'<dt>'+esc(x.label)+'</dt><dd>'+longText(x.value)+'</dd>').join('')+'</dl>':'')
      +'</article>';
  }
  // Open a section and bring it into view.
  function main(k){if(!MAIN[k])return;const h=sectionOpen(k);render();if(h&&h.scrollIntoView)h.scrollIntoView({block:'start',behavior:'smooth'});}
  // Kept for older calls: open the Performed procedures or Patient consultation section.
  function sub(x){if(SECTION_OF[x])main(SECTION_OF[x]);}
  function search(v,k){k=MAIN[k]?k:'procedures';st.qs[k]=String(v||'');st.focus=null;const l=document.getElementById('ch-list-'+k);if(l)l.innerHTML=listHTML(k);}
  function showLinked(cat,date){goToCategory(cat);st.qs[SECTION_OF[cat]]='';st.note='';st.focus={cat,date};render();}
  function openStoma(slot){if(slot&&typeof global.openStomaModal==='function')global.openStomaModal(st.pid,slot);}
  function chooseStoma(id){
    const e=st.entries.find(x=>String(x.id)===String(id));if(!e)return;
    const list=stomaList();const mb=document.getElementById('mb');if(!mb)return;
    mb.className='mb';
    mb.innerHTML='<h2>🔗 Link to a stoma</h2><div class="msub">'+esc(showDate(e))+(e.title?' · '+esc(short(e.title,90)):'')+'</div>'
      +(list.length?'<div class="ch-stoma-pick">'+list.map(x=>'<button type="button" class="ch-stoma-opt'+(e.linked_stoma===x.slot?' is-on':'')+'" data-slot="'+esc(x.slot)+'" onclick="ClinicalHistory.linkStoma(\''+esc(e.id)+'\',this.dataset.slot)">'
        +'<strong>🟣 '+esc(stomaName(x))+'</strong><span>'+esc([x.code,x.formed_date?'formed '+fmt(x.formed_date):'',x.reversal_date?'closed '+fmt(x.reversal_date):''].filter(Boolean).join(' · '))+'</span></button>').join('')+'</div>'
        :'<p class="ch-empty">This patient has no stoma recorded.</p>')
      +'<div id="ch-msg"></div><div class="mact">'+(e.linked_stoma?'<button class="btn-cancel" onclick="ClinicalHistory.linkStoma(\''+esc(e.id)+'\',\'\')">Remove the link</button>':'')
      +'<button class="btn-cancel" onclick="closeModal()">Cancel</button></div>';
    if(typeof global.openMo==='function')global.openMo();
  }
  async function linkStoma(id,slot){
    const who=await whoName(),now=new Date().toISOString();
    const r=await db().from(TABLE).update({linked_stoma:slot||'',updated_by_name:who,updated_at:now}).eq('id',id);
    if(r.error){
      const m=String(r.error.message||r.error);
      msg(/linked_stoma/i.test(m)?'Linking a stoma by hand needs the updated database set-up. Run <strong>sql/add-patient-history.sql</strong> once in Supabase, then try again.':'Could not save: '+esc(m));return;
    }
    try{global.logAudit&&global.logAudit({action:'update',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:slot?'Linked a clinical history entry to a stoma':'Removed a clinical history entry’s stoma link'});}catch(e){}
    if(typeof global.closeModal==='function')global.closeModal();
    await load();
  }

  /* ---------- the blood investigations list ---------- */
  // Every panel and test the system has seen, for all patients: the
  // lab_test_catalogue view (sql/add-patient-history.sql), worked out from the
  // saved lab results themselves. So a test never seen before is marked "New
  // test" before saving, and joins the list the moment it is saved.
  const catalogue={rows:null,error:'',at:0};
  const labKey=(panel,test)=>normT(panel)+'|'+normT(test);
  async function loadCatalogue(force){
    if(catalogue.rows&&!force&&Date.now()-catalogue.at<60000)return catalogue.rows;
    try{
      const r=await db().from('lab_test_catalogue').select('*');
      if(r.error)throw r.error;
      catalogue.rows=r.data||[];catalogue.error='';catalogue.at=Date.now();
    }catch(e){catalogue.rows=null;catalogue.error=String(e&&e.message||e);}
    return catalogue.rows;
  }
  async function markNewTests(rows){
    const list=await loadCatalogue(true);
    if(!list)return;   // the list is not set up yet: nothing is marked
    const known=new Set(list.map(x=>labKey(x.panel,x.test)));
    st.entries.filter(e=>e.category==='lab').forEach(e=>known.add(labKey(e.entry_type,e.title)));
    rows.forEach(r=>{if(r.category==='lab'&&r.title&&!known.has(labKey(r.entry_type,r.title))&&!r.flags.includes('lab_new'))r.flags.push('lab_new');});
  }
  async function labList(){
    const mb=document.getElementById('mb');if(!mb)return;
    mb.className='mb mb-wide';
    mb.innerHTML='<h2>🧪 Blood investigations list</h2><div class="msub">Loading…</div>';
    if(typeof global.openMo==='function')global.openMo();
    const list=await loadCatalogue(true);
    if(!list){
      mb.innerHTML='<h2>🧪 Blood investigations list</h2><div class="ch-missing">The list needs the updated database set-up. Run <strong>sql/add-patient-history.sql</strong> once in Supabase, then open it again.</div>'
        +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Close</button></div>';
      return;
    }
    const recent=new Date(Date.now()-30*864e5).toISOString();
    const byPanel=new Map();
    list.slice().sort((a,b)=>String(a.panel||'').localeCompare(String(b.panel||''))||String(a.test||'').localeCompare(String(b.test||''))).forEach(x=>{
      const k=x.panel||'Other';if(!byPanel.has(k))byPanel.set(k,[]);byPanel.get(k).push(x);});
    mb.innerHTML='<h2>🧪 Blood investigations list</h2>'
      +'<div class="msub">Every panel and test seen in a pasted lab result, for all patients — <strong>'+list.length+'</strong> test'+(list.length===1?'':'s')+' in <strong>'+byPanel.size+'</strong> panel'+(byPanel.size===1?'':'s')+'. A test seen for the first time joins it automatically when it is saved; one added in the last 30 days is marked 🆕.</div>'
      +'<input type="search" class="ch-search ch-lab-q" placeholder="Search tests…" aria-label="Search tests" oninput="ClinicalHistory.labListFilter(this.value)">'
      +'<div class="ch-lab-cat">'+[...byPanel].map(([panel,tests])=>'<details class="ch-lab-panel" open><summary>'+esc(panel)+' <span class="ch-sum-count">'+tests.length+'</span></summary><ul>'
        +tests.map(x=>'<li data-q="'+esc(String((panel||'')+' '+(x.test||'')).toLowerCase())+'"><span>'+esc(x.test||'')+(String(x.first_seen||'')>recent?' <span class="ch-lab-newtag">🆕 new</span>':'')+'</span>'
          +'<small>first seen '+esc(fmt(x.first_seen))+' · '+esc(String(x.patients||0))+' patient'+(+x.patients===1?'':'s')+'</small></li>').join('')+'</ul></details>').join('')+'</div>'
      +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Close</button></div>';
  }
  function labListFilter(q){
    q=String(q||'').trim().toLowerCase();
    document.querySelectorAll('.ch-lab-cat li').forEach(li=>{li.hidden=!!q&&!li.dataset.q.includes(q);});
    document.querySelectorAll('.ch-lab-panel').forEach(d=>{const any=[...d.querySelectorAll('li')].some(li=>!li.hidden);d.hidden=!any;if(q&&any)d.open=true;});
  }
  // The check screen for lab results: one compact table, as there are often
  // dozens of results in one paste.
  const LAB_BADGE={lab_from_case:'From a case summary — saving upgrades it',duplicate_saved:'Already saved',duplicate_paste:'Repeated in this paste',updates_saved:'Changed since — updates the saved one',lab_new:'🆕 New test',no_date:'No date',bad_date:'Check the date'};
  function labPreviewHTML(p){
    const rows=p.rows,cnt=f=>rows.filter(r=>r.flags.includes(f)).length;
    const tests=[...new Map(rows.filter(r=>r.flags.includes('lab_new')).map(r=>[labKey(r.entry_type,r.title),(r.entry_type&&normT(r.entry_type)!==normT(r.title)?r.entry_type+' › ':'')+r.title])).values()];
    const sum=[rows.filter(r=>r.include&&!r.flags.includes('updates_saved')).length+' new',cnt('updates_saved')&&cnt('updates_saved')+' changed since saved (will update)',
      cnt('duplicate_saved')&&cnt('duplicate_saved')+' already saved',cnt('duplicate_paste')&&cnt('duplicate_paste')+' repeated in this paste'].filter(Boolean).join(' · ');
    return '<div class="ch-lab-sum">'+esc(sum)+'</div>'
      +(tests.length?'<div class="ch-lab-newlist">🆕 <strong>'+tests.length+' new test'+(tests.length===1?'':'s')+'</strong> will join the blood investigations list when saved: '+esc(tests.join(', '))+'</div>':'')
      +(catalogue.error?'<div class="ch-lab-note">New tests could not be checked: the blood investigations list needs <strong>sql/add-patient-history.sql</strong> run once in Supabase.</div>':'')
      +'<div class="ch-table-wrap"><table class="ch-table ch-lab-pv"><thead><tr><th scope="col">Save</th>'+COLS.lab.map(c=>'<th scope="col">'+esc(c[0])+'</th>').join('')+'<th scope="col"><span class="ch-sr">Notes</span></th></tr></thead><tbody>'
      +rows.map((r,i)=>'<tr class="'+(r.include?'':'is-off')+(r.flags.some(f=>CH.CHECK_FLAGS.has(f))?' is-warn':'')+'">'
        +'<td data-label="Save"><input type="checkbox" '+(r.include?'checked':'')+' aria-label="Save this result" onchange="this.closest(\'tr\').classList.toggle(\'is-off\',!this.checked);ClinicalHistory.pv('+i+',\'include\',this.checked)"></td>'
        +'<td data-label="Date & time">'+esc(r.entry_date?fmt(r.entry_date):'No date')+(r.entry_time?' <span class="ch-time">'+esc(r.entry_time)+'</span>':'')+'</td>'
        +'<td data-label="Panel">'+esc(r.entry_type)+'</td><td data-label="Test">'+esc(r.title)+'</td><td data-label="Result"><strong>'+esc(r.result)+'</strong></td>'
        +'<td data-label="Flag">'+(r.lab_flag?'<span class="ch-lab-flag">'+esc(r.lab_flag)+'</span>':'')+'</td><td data-label="Normal range">'+esc(r.lab_range)+'</td><td data-label="Unit">'+esc(r.lab_unit)+'</td>'
        +'<td data-label="">'+r.flags.filter(f=>LAB_BADGE[f]).map(f=>'<span class="ch-flag'+(CH.CHECK_FLAGS.has(f)?' is-check':f==='lab_new'?' is-new':'')+'">'+esc(LAB_BADGE[f])+'</span>').join(' ')+'</td></tr>').join('')
      +'</tbody></table></div>';
  }

  /* ---------- paste → organise → check → save ---------- */
  function openPaste(cat){
    if(CH.CATS[cat])st.tab=cat;
    const meta=CH.CATS[st.tab]||CH.CATS.surgery;const mb=document.getElementById('mb');if(!mb)return;
    mb.className='mb mb-wide';
    mb.innerHTML='<h2>'+esc(PASTE_LABEL[st.tab]||'📋 Paste')+'</h2>'
      +'<div class="msub">'+(st.tab==='consult'
        ?'Paste the <strong>whole note</strong> as copied from the hospital system. The app sets out the date, consultant and each section for you to check before anything is saved.'
        :'Paste the <strong>whole table in one go</strong>, as copied from the hospital system. The app sorts it into dated entries, keeps only the columns this tab needs, and shows them for you to check before anything is saved.')
      +' The text stays inside this app.</div>'
      +'<textarea id="ch-paste" class="ch-paste" rows="14" placeholder="'+esc(meta.placeholder)+'">'+esc(st.pasteText)+'</textarea>'
      +'<div id="ch-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" onclick="ClinicalHistory.organise()">Organise ›</button></div>';
    if(typeof global.openMo==='function')global.openMo();
    setTimeout(()=>{const t=document.getElementById('ch-paste');if(t)t.focus();},60);
  }
  async function organise(){
    const ta=document.getElementById('ch-paste');const text=ta?ta.value:'';st.pasteText=text;
    if(!text.trim()){msg('Paste the list first.');return;}
    const res=CH.parse(text,st.tab,{dob:st.patient&&st.patient.date_of_birth,existing:CH.savedKeys(st.entries)});
    if(!res.rows.length){msg('Nothing could be read from that text. Check that it was pasted completely.');return;}
    autoFill(res.rows);ecgUpdates(res.rows);
    if(res.rows.some(r=>r.category==='lab')){
      await markNewTests(res.rows);
      res.rows.forEach(r=>{
        if(r.category!=='lab'||r.replaces||r.flags.some(f=>/^duplicate_/.test(f)))return;
        const e=st.entries.find(x=>x.category==='lab'&&/^Case summary/.test(x.source||'')&&sameBlood(x,{iso:r.entry_date,time:r.entry_time,test:r.title,value:r.result}));
        if(e){r.replaces=e.id;r.flags.push('lab_from_case');}
      });
    }
    // The ID in a pasted note is checked against this patient, then dropped.
    const mine=normId(st.patient&&st.patient.id_card);
    res.rows.forEach(r=>{
      if(!r.id_seen||!mine)return;
      if(normId(r.id_seen)===mine)r.flags.push('id_match');
      else{r.flags.push('id_mismatch');r.include=false;}
    });
    // A new POYC list: medicines saved before that are not on it can be removed.
    if(st.tab==='poyc'){
      const now=new Set(res.rows.map(r=>r.fingerprint));
      res.stale=st.entries.filter(e=>e.category==='poyc'&&!now.has(CH.fingerprint('poyc','',e.title,e.result)));
      res.removeStale=false;
    }
    st.preview=res;st.edit=null;renderPreview();
  }
  function includedCount(){return st.preview?st.preview.rows.filter(r=>r.include).length:0;}
  function renderPreview(){
    const p=st.preview;if(!p)return;const mb=document.getElementById('mb');if(!mb)return;
    const check=p.rows.filter(r=>r.include&&r.flags.some(f=>CH.CHECK_FLAGS.has(f))).length,n=includedCount();
    const bad=p.rows.some(r=>r.flags.includes('id_mismatch'));
    mb.className='mb mb-wide';
    mb.innerHTML='<h2>Check before saving</h2>'
      +(bad?'<div class="ch-idbad" role="alert">⚠️ <strong>This may be another patient’s note.</strong> The ID in the pasted text does not match '+esc(st.patient&&st.patient.id_card||'this patient')+'. It has been unticked — check you copied the right patient.</div>':'')
      +'<div class="msub">Found <strong>'+p.rows.length+'</strong> '+(p.mode==='lab'?'lab result'+(p.rows.length===1?'':'s'):'entr'+(p.rows.length===1?'y':'ies'))+(p.mode==='table'?' (read as a table)':p.mode==='note'?' (read as a consultation note)':p.mode==='ecg'?' (read as an ECG report)':'')+'. '
      +(check?'<strong class="ch-warn">'+check+' need'+(check===1?'s':'')+' checking</strong> (highlighted in amber). ':'')
      +'Untick anything that should not be saved and correct any field before saving.</div>'
      +(p.stale&&p.stale.length?'<div class="ch-stale"><strong>'+p.stale.length+' medicine'+(p.stale.length===1?'':'s')+' saved before '+(p.stale.length===1?'is':'are')+' not on this list:</strong> '+esc(p.stale.map(e=>e.title).join(', '))
        +'<label><input type="checkbox" '+(p.removeStale?'checked':'')+' onchange="ClinicalHistory._state.preview.removeStale=this.checked"> Remove '+(p.stale.length===1?'it':'them')+' when saving</label></div>':'')
      +(p.mode==='lab'?labPreviewHTML(p):'<div class="ch-preview">'+p.rows.map((r,i)=>cardHTML(r,i,false)).join('')+'</div>')
      +'<div id="ch-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="ClinicalHistory.openPaste()">‹ Back to the pasted text</button>'
      +'<button class="btn-save" id="ch-save" onclick="ClinicalHistory.saveAll()">'+saveLabel(n)+'</button></div>';
  }
  function saveLabel(n){return n?'Save '+n+' entr'+(n===1?'y':'ies'):'Nothing ticked';}
  function field(label,i,key,value,opts){
    opts=opts||{};
    const input=opts.rows
      ?'<textarea rows="'+opts.rows+'" oninput="ClinicalHistory.pv('+i+',\''+key+'\',this.value)">'+esc(value)+'</textarea>'
      :'<input type="text" value="'+esc(value)+'" oninput="ClinicalHistory.pv('+i+',\''+key+'\',this.value)">';
    return '<label'+(opts.wide?' class="ch-wide"':'')+'>'+esc(label)+input+(opts.help?'<span class="ch-help">'+esc(opts.help)+'</span>':'')+'</label>';
  }
  function cardHTML(r,i,single){
    const warn=r.flags.some(f=>CH.CHECK_FLAGS.has(f)),cat=CH.CAT_KEYS.includes(r.category)?r.category:'surgery';
    const catSel='<select aria-label="Save under" onchange="ClinicalHistory.pv('+i+',\'category\',this.value)">'+CH.CAT_KEYS.map(k=>'<option value="'+k+'"'+(k===cat?' selected':'')+'>'+esc(CH.CATS[k].label)+'</option>').join('')+'</select>';
    const prec=r.date_precision&&r.date_precision!=='day'
      ?'<select aria-label="How exact the date is" onchange="ClinicalHistory.pv('+i+',\'date_precision\',this.value)">'+[['day','Exact date'],['month','Month only'],['year','Year only']].map(([v,l])=>'<option value="'+v+'"'+(r.date_precision===v?' selected':'')+'>'+l+'</option>').join('')+'</select>':'';
    let grid;
    if(cat==='surgery')grid=field('Consultant',i,'source',r.source)+field('Procedure',i,'title',r.title,{wide:true,rows:2});
    else if(cat==='imaging')grid=field('Test',i,'title',r.title)+field('Report',i,'result',r.result,{wide:true,rows:5});
    else if(cat==='doc_icm')grid=field('Type',i,'entry_type',r.entry_type)+field('Note',i,'result',r.result,{wide:true,rows:6});
    else if(cat==='poyc')grid=field('Description',i,'title',r.title)+field('Prescription',i,'result',r.result);
    else if(cat==='case')grid=field('Consultant',i,'source',r.source)+field('Ward',i,'entry_type',r.entry_type)
      +field('Diagnosis',i,'title',r.title,{wide:true,rows:2})
      +field('The case summary, section by section',i,'result',r.result,{wide:true,rows:14,help:'Each section starts on a line beginning with § and its name. The discharge date is in the Dates line.'});
    else if(cat==='lab')grid=field('Panel',i,'entry_type',r.entry_type)+field('Test',i,'title',r.title)+field('Result',i,'result',r.result)
      +field('Flag',i,'lab_flag',r.lab_flag)+field('Normal range',i,'lab_range',r.lab_range)+field('Unit',i,'lab_unit',r.lab_unit);
    else if(cat==='ecg')grid=field('Verdict (as printed)',i,'title',r.title)+field('Confirmed / unconfirmed',i,'entry_type',r.entry_type)
      +field('The report, section by section',i,'result',r.result,{wide:true,rows:10,help:'Each section starts on a line beginning with § and its name: Measurements, Axis, Interpretation, Previous study.'});
    else grid=field('Consultant',i,'source',r.source)+field('Form type',i,'entry_type',r.entry_type)
      +field('Procedure/s performed',i,'title',r.title,{wide:true,rows:2})
      +field('The note, section by section',i,'result',r.result,{wide:true,rows:12,help:'Each section starts on a line beginning with § and its name.'});
    const stoma=cat==='surgery'||cat==='consult'?stomaChips(r,true):[];
    return '<div class="ch-card'+(warn?' is-warn':'')+(r.include?'':' is-off')+'" id="ch-card-'+i+'">'
      +'<div class="ch-card-head">'
        +(single?'':'<label class="ch-inc"><input type="checkbox" '+(r.include?'checked':'')+' onchange="ClinicalHistory.pv('+i+',\'include\',this.checked)"> Save</label>')
        +'<label>Under '+catSel+'</label>'
        +(cat==='poyc'?'':'<label>'+(cat==='doc_icm'?'Created on':cat==='case'?'Admission date':'Date')+' <input type="date" value="'+esc(r.entry_date||'')+'" max="2100-12-31" onchange="ClinicalHistory.pv('+i+',\'entry_date\',this.value)"></label>'+prec)
        +(cat==='doc_icm'||cat==='ecg'||cat==='lab'?'<label>Time <input type="time"'+(cat==='ecg'?' step="1"':'')+' value="'+esc(r.entry_time||'')+'" onchange="ClinicalHistory.pv('+i+',\'entry_time\',this.value)"></label>':'')
        +(r.date_text?'<span class="ch-orig">written as: '+esc(r.date_text)+'</span>':'')
      +'</div>'
      +(r.flags.length?'<div class="ch-flags">'+r.flags.map(f=>'<span class="ch-flag'+(CH.CHECK_FLAGS.has(f)?' is-check':f==='id_match'?' is-ok':'')+'">'+esc(CH.flagText(f,r))+'</span>').join('')+'</div>':'')
      +(stoma.length?'<div class="ch-links">'+stoma.join('')+'</div>':'')
      +'<div class="ch-grid">'+grid+'</div>'
      +(r.raw_text?'<details class="ch-raw"><summary>Pasted text for this entry</summary><pre>'+esc(r.raw_text)+'</pre></details>':'')
      +'</div>';
  }
  function pv(i,key,value){
    const r=st.preview&&st.preview.rows[i];if(!r)return;
    r[key]=value;
    if(key==='entry_date'){r.flags=r.flags.filter(f=>!['no_date','bad_date','future','before_birth','swapped','two_digit_year','date_stoma','date_proc'].includes(f));if(value&&!r.date_precision)r.date_precision='day';}
    if(key==='category'){r.flags=r.flags.filter(f=>f!=='moved'&&f!=='moved_note');}
    if(key==='source'){r.flags=r.flags.filter(f=>!/^consultant_/.test(f));}
    if(key==='include'||key==='category'){
      const el=document.getElementById('ch-card-'+i);if(el)el.outerHTML=cardHTML(r,i,!!st.edit);
      const b=document.getElementById('ch-save');if(b&&!st.edit)b.textContent=saveLabel(includedCount());
    }
  }
  function dbRow(r,fp,batch,who,now){
    const iso=r.entry_date||null,cat=r.category;
    return {patient_id:st.pid,category:cat,entry_date:iso,date_precision:iso?(r.date_precision||'day'):'',
      entry_time:cat==='doc_icm'||cat==='ecg'||cat==='lab'?(r.entry_time||''):'',date_text:r.date_text||'',entry_type:String(r.entry_type||'').trim(),
      title:String(r.title||'').trim(),result:String(r.result||'').trim(),source:String(r.source||'').trim(),
      raw_text:r.raw_text||'',fingerprint:fp,batch_id:batch,created_by_name:who,updated_by_name:who,created_at:now,updated_at:now,
      // Lab results: the flag, normal range and unit (sql/add-patient-history.sql).
      lab_flag:String(r.lab_flag||'').trim(),lab_range:String(r.lab_range||'').trim(),lab_unit:String(r.lab_unit||'').trim()};
  }
  // Insert / update, dropping any column the database does not have yet.
  async function writeTolerant(run,body){
    let rows=body,r;
    for(let i=0;i<8;i++){
      r=await run(rows);
      const miss=r.error&&typeof global.missingColumnFromError==='function'?global.missingColumnFromError(r.error):null;
      if(miss){rows=Array.isArray(rows)?rows.map(x=>{const y={...x};delete y[miss];return y;}):(()=>{const y={...rows};delete y[miss];return y;})();continue;}
      break;
    }
    return r;
  }
  function writeError(error){
    const m=String(error&&error.message||error);
    if(/category_check|violates check constraint/i.test(m))return 'The database needs the updated set-up for these sections (e.g. ECG, Lab results). Run <strong>sql/add-patient-history.sql</strong> once in Supabase, then save again.';
    if(/patient_history_entries|does not exist|relation|schema cache/i.test(m))return 'These tabs are not switched on in the database yet. Run <strong>sql/add-patient-history.sql</strong> once in Supabase.';
    return 'Could not save: '+esc(m);
  }
  function mismatchOK(rows){
    const bad=rows.filter(r=>r.flags&&r.flags.includes('id_mismatch'));
    return !bad.length||confirm('The ID in the pasted note ('+bad.map(r=>r.id_seen).join(', ')+') does not match this patient ('+(st.patient&&st.patient.id_card||'')+').\n\nSave it on this patient anyway?');
  }
  async function saveAll(){
    const p=st.preview;if(!p)return;
    const rows=p.rows.filter(r=>r.include&&(String(r.title).trim()||String(r.result).trim()));
    const drop=p.removeStale&&p.stale?p.stale.slice():[];
    if(!rows.length&&!drop.length){msg('Nothing is ticked to save.');return;}
    if(!mismatchOK(rows))return;
    const btn=document.getElementById('ch-save');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    const restore=()=>{if(btn){btn.disabled=false;btn.textContent=saveLabel(includedCount());}};
    const who=await whoName(),now=new Date().toISOString();
    const batch=global.crypto&&global.crypto.randomUUID?global.crypto.randomUUID():null;
    // Re-check duplicates against what is saved now (another nurse may have pasted meanwhile).
    await load();
    const have=CH.savedKeys(st.entries);
    const out=[],upd=[];let skipped=0;
    const batchKeys=new Set();
    rows.forEach(r=>{
      const key=[r.category,r.entry_date||'',r.title,r.result,r.entry_time,r.entry_type],fp=CH.fingerprint(...key);
      const rep=r.replaces&&st.entries.some(e=>String(e.id)===String(r.replaces));
      // An update is checked against every other saved entry, not the one it replaces.
      const pool=rep?CH.savedKeys(st.entries.filter(e=>String(e.id)!==String(r.replaces))):have;
      if(CH.isDup(pool,...key)||CH.isDup(batchKeys,...key)){skipped++;return;}
      CH.keysOf(...key).forEach(k=>{have.add(k);batchKeys.add(k);});
      if(rep)upd.push([r.replaces,dbRow(r,fp,batch,who,now)]);
      // Saved a millisecond apart so lab results keep the hospital's order.
      else out.push(dbRow(r,fp,batch,who,new Date(Date.parse(now)+out.length).toISOString()));});
    let removed=0,updated=0;const updBy={};
    for(const [id,row] of upd){
      delete row.created_by_name;delete row.created_at;delete row.patient_id;
      const u=await writeTolerant(b=>db().from(TABLE).update(b).eq('id',id),row);
      if(u.error){restore();msg(writeError(u.error));return;}
      updated++;updBy[row.category]=(updBy[row.category]||0)+1;
    }
    const upName=(k,n)=>k==='ecg'?n+' ECG'+(n===1?'':'s'):k==='lab'?n+' lab result'+(n===1?'':'s'):k==='case'?n+' case summar'+(n===1?'y':'ies'):k==='consult'?n+' consultation note'+(n===1?'':'s'):n+' entr'+(n===1?'y':'ies');
    for(const e of drop){const d=await db().from(TABLE).delete().eq('id',e.id);if(!d.error)removed++;}
    if(!out.length&&!removed&&!updated){restore();msg('All of these are already saved for this patient.');return;}
    if(out.length){
      const res=await writeTolerant(b=>db().from(TABLE).insert(b),out);
      if(res.error){restore();msg(writeError(res.error));return;}
    }
    if(out.length)try{global.logAudit&&global.logAudit({action:'create',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Added '+out.length+' entr'+(out.length===1?'y':'ies')+' from a pasted hospital list or note'});}catch(e){}
    if(updated)try{global.logAudit&&global.logAudit({action:'update',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Updated '+Object.keys(updBy).map(k=>upName(k,updBy[k])).join(', ')+' from the same one pasted again'});}catch(e){}
    const by={};out.forEach(r=>{by[r.category]=(by[r.category]||0)+1;});upd.forEach(([,r])=>{by[r.category]=by[r.category]||0;});
    const said=[];
    if(out.length)said.push('Saved '+Object.keys(by).filter(k=>by[k]).map(k=>by[k]+' to '+esc(CH.CATS[k].label)).join(', '));
    if(updated)said.push('Updated '+Object.keys(updBy).map(k=>upName(k,updBy[k])).join(', ')+' saved before');
    if(skipped)said.push(skipped+' already saved (skipped)');
    if(removed)said.push(removed+' no longer on the list removed');
    st.note='✓ '+said.join(' · ')+'.';
    if(removed)try{global.logAudit&&global.logAudit({action:'delete',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Removed '+removed+' medicine'+(removed===1?'':'s')+' no longer on the POYC list'});}catch(e){}
    const first=Object.keys(by)[0]||(removed?'poyc':'');if(first)goToCategory(first);
    st.preview=null;st.pasteText='';catalogue.at=0;
    if(typeof global.closeModal==='function')global.closeModal();
    await load();
  }

  /* ---------- one entry: add / edit / delete ---------- */
  function openEdit(id,cat){
    if(!id&&CH.CATS[cat])st.tab=cat;
    const e=id?st.entries.find(x=>String(x.id)===String(id)):null;if(id&&!e)return;
    const row=e?{category:e.category,entry_date:e.entry_date?String(e.entry_date).slice(0,10):'',date_precision:e.date_precision||'day',entry_time:e.entry_time||'',date_text:e.date_text||'',
      entry_type:e.entry_type||'',title:e.title||'',result:e.result||'',source:e.source||'',raw_text:e.raw_text||'',flags:[],include:true,linked_stoma:e.linked_stoma||'',
      lab_flag:e.lab_flag||'',lab_range:e.lab_range||'',lab_unit:e.lab_unit||''}
      :{category:st.tab,entry_date:'',date_precision:'day',entry_time:'',date_text:'',entry_type:'',title:'',result:'',source:'',raw_text:'',flags:[],include:true};
    st.edit={id:e?e.id:null};st.preview={rows:[row],mode:'edit'};
    const mb=document.getElementById('mb');if(!mb)return;mb.className='mb mb-wide';
    mb.innerHTML='<h2>'+(e?'✏️ Edit entry':'＋ Add one entry')+'</h2>'+cardHTML(row,0,true)+'<div id="ch-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" id="ch-save-one" onclick="ClinicalHistory.saveEdit()">Save</button></div>';
    if(typeof global.openMo==='function')global.openMo();
  }
  async function saveEdit(){
    const r=st.preview&&st.preview.rows[0];if(!r||!st.edit)return;
    if(!String(r.title).trim()&&!String(r.result).trim()){msg(r.category==='doc_icm'?'Write the note first.':'Write the procedure, test or note first.');return;}
    const btn=document.getElementById('ch-save-one');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    const who=await whoName(),now=new Date().toISOString();
    const key=[r.category,r.entry_date||'',r.title,r.result,r.entry_time,r.entry_type],fp=CH.fingerprint(...key);
    const others=CH.savedKeys(st.entries.filter(e=>String(e.id)!==String(st.edit.id||'')));
    // An ECG with the same date and time is never saved twice.
    if(r.category==='ecg'&&CH.isDup(others,...key)){if(btn){btn.disabled=false;btn.textContent='Save';}msg('An ECG with this date and time is already saved for this patient — it is not saved twice.');return;}
    if(r.category==='lab'&&CH.isDup(others,...key)){if(btn){btn.disabled=false;btn.textContent='Save';}msg('This test of this panel, at this date and time, is already saved for this patient — it is not saved twice.');return;}
    if(!st.edit.id&&CH.isDup(others,...key)&&!confirm('This entry is already saved for this patient. Save it again anyway?')){if(btn){btn.disabled=false;btn.textContent='Save';}return;}
    if(st.edit.id&&CH.isDup(others,...key)&&!confirm('Another saved entry is the same as this one. Save anyway?')){if(btn){btn.disabled=false;btn.textContent='Save';}return;}
    let res;
    if(st.edit.id){
      const row=dbRow(r,fp,null,who,now);delete row.created_by_name;delete row.created_at;delete row.batch_id;delete row.patient_id;delete row.raw_text;
      res=await writeTolerant(b=>db().from(TABLE).update(b).eq('id',st.edit.id),row);
    }else res=await writeTolerant(b=>db().from(TABLE).insert(b),[dbRow(r,fp,null,who,now)]);
    if(res.error){if(btn){btn.disabled=false;btn.textContent='Save';}msg(writeError(res.error));return;}
    try{global.logAudit&&global.logAudit({action:st.edit.id?'update':'create',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:(st.edit.id?'Edited':'Added')+' an entry ('+CH.CATS[r.category].label+')'});}catch(e){}
    st.edit=null;st.preview=null;st.note='';if(CH.CATS[r.category]){st.tab=r.category;goToCategory(r.category);}
    if(typeof global.closeModal==='function')global.closeModal();
    await load();
  }
  async function remove(id){
    const e=st.entries.find(x=>String(x.id)===String(id));if(!e)return;
    if(!confirm('Delete this entry ('+showDate(e)+(e.title?' · '+String(e.title).slice(0,60):'')+')? This cannot be undone.'))return;
    const r=await db().from(TABLE).delete().eq('id',id);
    if(r.error){alert('Could not delete: '+(r.error.message||r.error));return;}
    try{global.logAudit&&global.logAudit({action:'delete',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Deleted an entry ('+(CH.CATS[e.category]?CH.CATS[e.category].label:e.category)+')'});}catch(x){}
    st.note='';await load();
  }

  // This patient's saved entries (for the Holistic summary).
  function entries(pid){return !pid||String(pid)===String(st.pid)?st.entries.slice():[];}
  // Open the Hospital records fold-out at one saved entry and highlight it — a
  // line of the Holistic summary opens the record it came from.
  function reveal(id){
    const e=st.entries.find(x=>String(x.id)===String(id));if(!e||!SECTION_OF[e.category])return false;
    st.qs[SECTION_OF[e.category]]='';st.note='';st.focus={cat:e.category,date:day(e),id:String(e.id)};
    goToCategory(e.category);render();return true;
  }
  // Open one section (e.g. Lab results) and bring it into view.
  function revealCategory(cat){
    const k=SECTION_OF[cat];if(!k)return false;
    goToCategory(cat);const h=st.hosts&&st.hosts[k];
    if(h&&h.scrollIntoView)setTimeout(()=>h.scrollIntoView({block:'start',behavior:'smooth'}),30);
    return true;
  }
  Object.assign(CH,{mount,main,sub,search,reload:load,entries,reveal,revealCategory,medSplit,medKey,openPaste,organise,pv,saveAll,openEdit,saveEdit,remove,showLinked,openStoma,chooseStoma,linkStoma,labList,labListFilter,_state:st});
})(window);
