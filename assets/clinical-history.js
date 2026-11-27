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
    doc_icm:{label:'iCM notes',icon:'📄',
      placeholder:'Copy the whole iCM Notes table from the hospital system (Patient Documentation › iCM Notes) and paste it here in one go.\nType, Note and Created On are kept; Created By is left out.'},
    // Tabs that were removed. Anything saved under them is kept in the database
    // but no longer shown or offered.
    notes:{label:'Patient notes',icon:'📝',legacy:true,placeholder:''},
    doc_onco:{label:'Oncology / Haematology / Palliative care notes',icon:'📄',legacy:true,placeholder:''},
    doc_ccp:{label:'CCP – Practice nurse review notes',icon:'📄',legacy:true,placeholder:''},
    treatment:{label:'Treatment',icon:'💊',legacy:true,placeholder:''}
  };
  const CAT_KEYS=['surgery','consult','imaging','doc_icm','poyc'];
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
  function fingerprint(cat,iso,title,result,time){
    if(cat==='poyc')return 'poyc||'+(norm(title)+'|'+norm(result)).slice(0,120);
    if(cat==='doc_icm'||cat==='notes')return cat+'|'+(iso||'')+'|'+String(time||'').slice(0,5)+'|'+norm(title).slice(0,40)+'|'+norm(result).slice(0,200);
    return cat+'|'+(iso||'')+'|'+norm(title).slice(0,80)+'|'+norm(result).slice(0,120);
  }
  // Every way a saved entry could be recognised: its stored fingerprint (from
  // whichever version of the rules saved it) and today's rules.
  function savedKeys(entries){
    const keys=new Set();
    (entries||[]).forEach(e=>{if(e.fingerprint)keys.add(e.fingerprint);
      keys.add(fingerprint(e.category,String(e.entry_date||'').slice(0,10),e.title,e.result,e.entry_time));});
    return keys;
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
      if(category!==cat)flags.push(e.category==='consult'&&e.hospital?'moved_note':'moved');
      else if(!e.hospital){const sug=suggestCategory(cat,f.title,f.result);if(sug){category=sug;flags.push('moved');}}
      const list=category==='surgery'||category==='imaging';
      if((category==='surgery'||category==='consult')&&STOMA_RE.test(f.title))flags.push('stoma');
      if(list&&!f.title)flags.push('no_title');
      if(list&&/postpon|cancell?ed|not done|abandoned|deferred/i.test(f.title+' '+String(f.result).slice(0,120)))flags.push('not_done');
      if(list&&!e.table&&(f.title+f.result).length>1500)flags.push('long');
      // Only the columns each tab keeps: no type for procedures and scans, no
      // author for scans and iCM notes (Created By is left out).
      const type=category==='doc_icm'?((e.typeCell||'').trim()||noteType(f.source,f.result))
        :category==='consult'?(e.typeCell||'').trim():'';
      const source=category==='surgery'||category==='consult'?f.source:'';
      const fp=fingerprint(category,d?d.iso:'',f.title,f.result,category==='doc_icm'&&d?d.time:'');
      let include=true;
      if(existing.has(fp)){flags.push('duplicate_saved');include=false;}
      else if(seen.has(fp)){flags.push('duplicate_paste');include=false;}
      seen.add(fp);
      return {include,category,entry_date:d?d.iso:null,date_precision:d?d.precision:'',entry_time:category==='doc_icm'&&d?d.time:'',date_text:d?d.text:(e.badDate||''),
        entry_type:type,title:f.title,result:f.result,source,raw_text:(e.raw||[]).join('\n').trim(),flags,fingerprint:fp,id_seen:e.idSeen||'',consultant_from:e.consultantFrom||(source?'list':'')};
    }).filter(r=>r.title||r.result);
    return {rows,mode};
  }

  const FLAG_TEXT={
    no_date:'No date found',bad_date:'Date is not a real date (e.g. 31/02) — check it',month_only:'Only the month was given',year_only:'Only the year was given',
    two_digit_year:'Two-digit year — check the century',swapped:'Read as month/day — check the date',
    future:'Date is in the future',before_birth:'Date is before the date of birth',
    moved:'Looks like {cat} — will be saved there',moved_note:'Consultation note — will be saved under Patient consultation',stoma:'Involves a stoma — linked to the stoma on the profile',
    no_title:'No procedure / test found',not_done:'Says postponed / cancelled — check it was done',long:'Long entry — check it was split correctly',
    duplicate_saved:'Already saved — not ticked',duplicate_paste:'Repeated in this paste — not ticked',
    id_mismatch:'The ID in this note ({id}) is not this patient’s — check it is the right patient (not ticked)',id_match:'✓ The ID in the note matches this patient',
    consultant_stoma:'Consultant filled in from the stoma on the profile',consultant_proc:'Consultant filled in from the performed procedure on that date',
    date_stoma:'Date filled in from the stoma’s operation date',date_proc:'Date filled in from the performed procedure',
    updates_saved:'Same note saved before — saving updates it, no second copy'
  };
  function flagText(code,row){return (FLAG_TEXT[code]||code).replace('{cat}',CATS[row&&row.category]?CATS[row.category].label:'another tab').replace('{id}',String(row&&row.id_seen||''));}
  // Flags that mean "a nurse should look at this row".
  const CHECK_FLAGS=new Set(['no_date','bad_date','not_done','two_digit_year','swapped','future','before_birth','moved','no_title','long','id_mismatch']);

  global.ClinicalHistory=Object.assign(global.ClinicalHistory||{},{CATS,CAT_KEYS,isNoteCat,parse,findDate,lineStartDate,fingerprint,savedKeys,flagText,CHECK_FLAGS,typeFor,suggestCategory,STOMA_RE,_fieldsFrom:fieldsFrom});
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
    sub:{procedures:'surgery'},focus:null};
  // Four sections, as in the hospital system: Performed procedures (with the
  // Patient consultation notes, linked to their procedure by date), Medical
  // imaging results, iCM notes and Entitlement CARE (POYC).
  const MAIN={
    procedures:{label:'Performed procedures',icon:'🏥',subs:[['surgery','Performed procedures','🏥'],['consult','Patient consultation','📋']]},
    imaging:{label:'Medical imaging results',icon:'🩻',cat:'imaging'},
    icm:{label:'iCM notes',icon:'📄',cat:'doc_icm'},
    poyc:{label:'Entitlement CARE (POYC)',icon:'💊',cat:'poyc'}
  };
  // The columns each table shows: [heading, field].
  const COLS={
    surgery:[['Date','date'],['Consultant','source'],['Procedure','title']],
    imaging:[['Date','date'],['Test','title'],['Report','result']],
    doc_icm:[['Type','entry_type'],['Note','result'],['Created On','date']],
    poyc:[['Description','title'],['Prescription','result']]
  };
  const HINT={
    surgery:'Copy the Performed Procedures table from the hospital system (Procedures › Performed Procedures) and paste it in one go. Date, Consultant and Procedure are kept; OP Note, Age, Theatre and Source are left out.',
    consult:'Open the visit in the hospital system (Hospital Events › Patient Consultation › Open past visit), copy the whole note and paste it. The date, consultant and each section are set out in order; a blank date or consultant is filled in from the stoma on the profile. A note on the same date as a performed procedure is linked to it, and to the stoma when the operation involved one.',
    imaging:'Copy the Medical Imaging Results table from the hospital system (Investigations › Medical Imaging Results) and paste it in one go. Date, Test and Report are kept.',
    doc_icm:'Copy the iCM Notes table from the hospital system (Patient Documentation › iCM Notes) and paste it in one go. Type, Note and Created On are kept; Created By is left out.',
    poyc:'Copy the Entitlement CARE (POYC) table from the hospital system (Medications › Entitlement CARE (POYC)) and paste it in one go. Description and Prescription are kept; ATC Code and Dosage Regimen are left out. A medicine already saved is skipped; ones no longer on a new list can be removed when you save it.'
  };
  const PASTE_LABEL={surgery:'📋 Paste performed procedures',consult:'📋 Paste a consultation note',imaging:'📋 Paste imaging results',doc_icm:'📋 Paste iCM notes',poyc:'📋 Paste the POYC list'};
  // Each tab is a fold-out section of its own on the profile, below Outcome
  // (index.html wraps each host in a details.pd-section).
  const SECTION_OF={surgery:'procedures',consult:'procedures',imaging:'imaging',doc_icm:'icm',poyc:'poyc'};
  function catOf(k){return k==='procedures'?st.sub.procedures:MAIN[k].cat;}
  // Unfold a section (after saving, or when a linked entry is opened).
  function sectionOpen(k){const h=st.hosts&&st.hosts[k];const d=h&&h.closest('details');if(d&&!d.open)d.open=true;return h;}
  // Point the tabs at the place a category lives (after saving or editing).
  function goToCategory(cat){
    if(cat==='surgery'||cat==='consult')st.sub.procedures=cat;
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
    const c={surgery:0,consult:0,imaging:0,doc_icm:0,poyc:0};
    st.entries.forEach(e=>{if(c[e.category]!=null)c[e.category]++;});
    c.procedures=c.surgery+c.consult;c.icm=c.doc_icm;return c;
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
    if(st.pid!==pid){st.pid=pid;st.entries=[];st.qs={};st.tab='surgery';st.loaded=false;st.note='';st.noteAt='';st.pasteText='';st.sub={procedures:'surgery'};st.focus=null;}
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
  }
  function render(){
    const c=counts();
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
    const cat=catOf(k),subs=MAIN[k].subs;
    const subTabs=subs?'<div class="ch-sub-tabs" role="tablist">'+subs.map(([x,l,ic])=>{
      const on=st.sub[k]===x;
      return '<button type="button" role="tab" class="ch-sub'+(on?' is-on':'')+'" aria-selected="'+on+'" onclick="ClinicalHistory.sub(\''+x+'\')">'+(ic?ic+' ':'')+esc(l)+'<span class="ch-count">'+c[x]+'</span></button>';
    }).join('')+'</div>':'';
    const what=cat==='doc_icm'?'iCM notes':cat==='poyc'?'POYC medicines':CH.CATS[cat].label.toLowerCase();
    return '<div class="ch-pane ch-pane-'+k+'">'+subTabs
      +'<div class="ch-tools"><button type="button" class="psm-btn psm-btn-primary" onclick="ClinicalHistory.openPaste(\''+cat+'\')">'+PASTE_LABEL[cat]+'</button>'
      +'<button type="button" class="psm-btn" onclick="ClinicalHistory.openEdit(\'\',\''+cat+'\')">＋ Add one</button>'
      +'<input type="search" class="ch-search" placeholder="Search '+esc(what)+'…" aria-label="Search '+esc(what)+'" value="'+esc(st.qs[k]||'')+'" oninput="ClinicalHistory.search(this.value,\''+k+'\')"></div>'
      +'<p class="ch-hint">'+esc(HINT[cat])+'</p>'+(st.note&&st.noteAt===k?'<div class="ch-note">'+st.note+'</div>':'')
      +'<div id="ch-list-'+k+'" class="ch-list">'+listHTML(k)+'</div></div>';
  }
  function matches(e,q){return !q||[e.title,e.result,e.source,e.entry_type,e.date_text,showDate(e)].join(' ').toLowerCase().includes(q);}
  function actHTML(e){
    const by='Added by '+(e.created_by_name||'—')+(e.updated_by_name&&e.updated_at&&e.updated_at!==e.created_at?' · edited by '+e.updated_by_name:'');
    return '<span class="ch-act" title="'+esc(by)+'"><button type="button" class="ch-ic" title="Edit this entry" aria-label="Edit this entry" onclick="ClinicalHistory.openEdit(\''+esc(e.id)+'\')">✏️</button>'
      +'<button type="button" class="ch-ic" title="Delete this entry" aria-label="Delete this entry" onclick="ClinicalHistory.remove(\''+esc(e.id)+'\')">🗑</button></span>';
  }
  function listHTML(k){
    if(st.loading)return '<p class="ch-empty">Loading…</p>';
    if(st.error)return '<p class="ch-empty" role="alert">Could not load these entries: '+esc(st.error)+' <button type="button" class="psm-btn" onclick="ClinicalHistory.reload()">Retry</button></p>';
    const q=String(st.qs[k]||'').trim().toLowerCase(),cat=catOf(k);
    const rows=sorted(st.entries.filter(e=>e.category===cat&&matches(e,q)));
    if(!rows.length)return '<p class="ch-empty">'+(q?'Nothing matches that search.':'Nothing recorded yet. Press <strong>'+esc(PASTE_LABEL[cat])+'</strong> to add '+(cat==='consult'?'a note':'the whole list in one go')+'.')+'</p>';
    if(cat==='poyc'){
      rows.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),undefined,{sensitivity:'base'}));   // medicines A–Z
      const last=rows.reduce((a,e)=>String(e.created_at||'')>String(a&&a.created_at||'')?e:a,null);
      return (last?'<p class="ch-asof">Entitlement list copied on <strong>'+esc(fmt(last.created_at||last.entry_date))+'</strong>'+(last.created_by_name?' by '+esc(last.created_by_name):'')+'.</p>':'')+tableHTML(cat,rows);
    }
    return cat==='consult'?rows.map(consultCardHTML).join(''):tableHTML(cat,rows);
  }
  const isFocus=(cat,e)=>!!(st.focus&&st.focus.cat===cat&&st.focus.date===day(e));
  function tableHTML(cat,rows){
    const cols=COLS[cat];
    const head='<thead><tr>'+cols.map(c=>'<th scope="col">'+esc(c[0])+'</th>').join('')+'<th scope="col" class="ch-c-act"><span class="ch-sr">Edit or delete</span></th></tr></thead>';
    const body=rows.map(e=>'<tr class="'+(isFocus(cat,e)?'is-focus':'')+'">'+cols.map(([label,key])=>{
      let v;
      if(key==='date')v='<strong>'+esc(showDate(e))+'</strong>'+(cat==='doc_icm'&&e.entry_time?' <span class="ch-time">'+esc(e.entry_time)+'</span>':'');
      else v='<div class="ch-cell-text">'+esc(e[key]||'')+'</div>';
      if(cat==='surgery'&&key==='title')v+=linksHTML(e,'surgery');
      return '<td data-label="'+esc(label)+'" class="ch-c-'+key+'"><div class="ch-td">'+v+'</div></td>';
    }).join('')+'<td class="ch-c-act">'+actHTML(e)+'</td></tr>').join('');
    return '<div class="ch-table-wrap"><table class="ch-table ch-table-'+cat+'">'+head+'<tbody>'+body+'</tbody></table></div>';
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
  // Performed procedures ↔ Patient consultation, inside the Performed procedures section.
  function sub(x){if(x!=='surgery'&&x!=='consult')return;st.sub.procedures=x;st.qs.procedures='';st.note='';st.focus=null;render();}
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
  function organise(){
    const ta=document.getElementById('ch-paste');const text=ta?ta.value:'';st.pasteText=text;
    if(!text.trim()){msg('Paste the list first.');return;}
    const res=CH.parse(text,st.tab,{dob:st.patient&&st.patient.date_of_birth,existing:CH.savedKeys(st.entries)});
    if(!res.rows.length){msg('Nothing could be read from that text. Check that it was pasted completely.');return;}
    autoFill(res.rows);
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
      +'<div class="msub">Found <strong>'+p.rows.length+'</strong> entr'+(p.rows.length===1?'y':'ies')+(p.mode==='table'?' (read as a table)':p.mode==='note'?' (read as a consultation note)':'')+'. '
      +(check?'<strong class="ch-warn">'+check+' need'+(check===1?'s':'')+' checking</strong> (highlighted in amber). ':'')
      +'Untick anything that should not be saved and correct any field before saving.</div>'
      +(p.stale&&p.stale.length?'<div class="ch-stale"><strong>'+p.stale.length+' medicine'+(p.stale.length===1?'':'s')+' saved before '+(p.stale.length===1?'is':'are')+' not on this list:</strong> '+esc(p.stale.map(e=>e.title).join(', '))
        +'<label><input type="checkbox" '+(p.removeStale?'checked':'')+' onchange="ClinicalHistory._state.preview.removeStale=this.checked"> Remove '+(p.stale.length===1?'it':'them')+' when saving</label></div>':'')
      +'<div class="ch-preview">'+p.rows.map((r,i)=>cardHTML(r,i,false)).join('')+'</div>'
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
    else grid=field('Consultant',i,'source',r.source)+field('Form type',i,'entry_type',r.entry_type)
      +field('Procedure/s performed',i,'title',r.title,{wide:true,rows:2})
      +field('The note, section by section',i,'result',r.result,{wide:true,rows:12,help:'Each section starts on a line beginning with § and its name.'});
    const stoma=cat==='surgery'||cat==='consult'?stomaChips(r,true):[];
    return '<div class="ch-card'+(warn?' is-warn':'')+(r.include?'':' is-off')+'" id="ch-card-'+i+'">'
      +'<div class="ch-card-head">'
        +(single?'':'<label class="ch-inc"><input type="checkbox" '+(r.include?'checked':'')+' onchange="ClinicalHistory.pv('+i+',\'include\',this.checked)"> Save</label>')
        +'<label>Under '+catSel+'</label>'
        +(cat==='poyc'?'':'<label>'+(cat==='doc_icm'?'Created on':'Date')+' <input type="date" value="'+esc(r.entry_date||'')+'" max="2100-12-31" onchange="ClinicalHistory.pv('+i+',\'entry_date\',this.value)"></label>'+prec)
        +(cat==='doc_icm'?'<label>Time <input type="time" value="'+esc(r.entry_time||'')+'" onchange="ClinicalHistory.pv('+i+',\'entry_time\',this.value)"></label>':'')
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
      entry_time:cat==='doc_icm'?(r.entry_time||''):'',date_text:r.date_text||'',entry_type:String(r.entry_type||'').trim(),
      title:String(r.title||'').trim(),result:String(r.result||'').trim(),source:String(r.source||'').trim(),
      raw_text:r.raw_text||'',fingerprint:fp,batch_id:batch,created_by_name:who,updated_by_name:who,created_at:now,updated_at:now};
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
    if(/category_check|violates check constraint/i.test(m))return 'The database needs the updated set-up for these tabs (Patient consultation). Run <strong>sql/add-patient-history.sql</strong> once in Supabase, then save again.';
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
    rows.forEach(r=>{const fp=CH.fingerprint(r.category,r.entry_date||'',r.title,r.result,r.entry_time);if(have.has(fp)){skipped++;return;}have.add(fp);
      if(r.replaces&&st.entries.some(e=>String(e.id)===String(r.replaces)))upd.push([r.replaces,dbRow(r,fp,batch,who,now)]);
      else out.push(dbRow(r,fp,batch,who,now));});
    let removed=0,updated=0;
    for(const [id,row] of upd){
      delete row.created_by_name;delete row.created_at;delete row.patient_id;
      const u=await writeTolerant(b=>db().from(TABLE).update(b).eq('id',id),row);
      if(u.error){restore();msg(writeError(u.error));return;}
      updated++;
    }
    for(const e of drop){const d=await db().from(TABLE).delete().eq('id',e.id);if(!d.error)removed++;}
    if(!out.length&&!removed&&!updated){restore();msg('All of these are already saved for this patient.');return;}
    if(out.length){
      const res=await writeTolerant(b=>db().from(TABLE).insert(b),out);
      if(res.error){restore();msg(writeError(res.error));return;}
    }
    if(out.length)try{global.logAudit&&global.logAudit({action:'create',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Added '+out.length+' entr'+(out.length===1?'y':'ies')+' from a pasted hospital list or note'});}catch(e){}
    if(updated)try{global.logAudit&&global.logAudit({action:'update',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Updated '+updated+' consultation note'+(updated===1?'':'s')+' from the same note pasted again'});}catch(e){}
    const by={};out.forEach(r=>{by[r.category]=(by[r.category]||0)+1;});upd.forEach(([,r])=>{by[r.category]=by[r.category]||0;});
    const said=[];
    if(out.length)said.push('Saved '+Object.keys(by).filter(k=>by[k]).map(k=>by[k]+' to '+esc(CH.CATS[k].label)).join(', '));
    if(updated)said.push('Updated '+updated+' note'+(updated===1?'':'s')+' saved before');
    if(skipped)said.push(skipped+' already saved (skipped)');
    if(removed)said.push(removed+' no longer on the list removed');
    st.note='✓ '+said.join(' · ')+'.';
    if(removed)try{global.logAudit&&global.logAudit({action:'delete',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Removed '+removed+' medicine'+(removed===1?'':'s')+' no longer on the POYC list'});}catch(e){}
    const first=Object.keys(by)[0]||(removed?'poyc':'');if(first)goToCategory(first);
    st.preview=null;st.pasteText='';
    if(typeof global.closeModal==='function')global.closeModal();
    await load();
  }

  /* ---------- one entry: add / edit / delete ---------- */
  function openEdit(id,cat){
    if(!id&&CH.CATS[cat])st.tab=cat;
    const e=id?st.entries.find(x=>String(x.id)===String(id)):null;if(id&&!e)return;
    const row=e?{category:e.category,entry_date:e.entry_date?String(e.entry_date).slice(0,10):'',date_precision:e.date_precision||'day',entry_time:e.entry_time||'',date_text:e.date_text||'',
      entry_type:e.entry_type||'',title:e.title||'',result:e.result||'',source:e.source||'',raw_text:e.raw_text||'',flags:[],include:true,linked_stoma:e.linked_stoma||''}
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
    const fp=CH.fingerprint(r.category,r.entry_date||'',r.title,r.result,r.entry_time);
    if(!st.edit.id&&CH.savedKeys(st.entries).has(fp)&&!confirm('This entry is already saved for this patient. Save it again anyway?')){if(btn){btn.disabled=false;btn.textContent='Save';}return;}
    if(st.edit.id&&CH.savedKeys(st.entries.filter(e=>String(e.id)!==String(st.edit.id))).has(fp)&&!confirm('Another saved entry is the same as this one. Save anyway?')){if(btn){btn.disabled=false;btn.textContent='Save';}return;}
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

  Object.assign(CH,{mount,main,sub,search,reload:load,openPaste,organise,pv,saveAll,openEdit,saveEdit,remove,showLinked,openStoma,chooseStoma,linkStoma,_state:st});
})(window);
