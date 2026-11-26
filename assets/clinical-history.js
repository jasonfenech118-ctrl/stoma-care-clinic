/* Clinical history — surgeries (not stoma-related), medical imaging, patient
   notes and treatment history, pasted in one lump per list and organised into
   dated rows by the rules below. Everything runs in the browser: the pasted
   text never leaves the app or the clinic's own database (no AI, no outside
   service). Nothing is saved until a nurse has reviewed the organised rows;
   anything the rules are not sure about is flagged, never guessed. */
(function(global){
  'use strict';

  /* ------------------------------------------------------------------ *
   * Categories (the four tabs)
   * ------------------------------------------------------------------ */
  const CATS={
    surgery:{label:'Surgeries',icon:'🏥',title:'Operation / procedure',result:'Outcome / findings',
      hint:'Operations that are not stoma-related (stoma operations belong under Stomas & surgery).',
      placeholder:'Paste the whole list of surgeries in one go, e.g.\n12/03/2019  Laparoscopic cholecystectomy – uneventful recovery (Mr Borg, MDH)\nMarch 2015  Open appendicectomy\n2008  Right inguinal hernia repair'},
    imaging:{label:'Medical imaging',icon:'📷',title:'Scan / test',result:'Result / report',
      hint:'CT, MRI, ultrasound, X-ray, PET, contrast studies, endoscopy and their results.',
      placeholder:'Paste the whole list of scans and results in one go, e.g.\n05/01/2024  CT abdomen and pelvis: no evidence of recurrence.\n14 Feb 2023  MRI pelvis – Impression: 2 cm collection in the presacral space'},
    notes:{label:'Patient notes',icon:'📝',title:'Subject',result:'Note',
      hint:'Notes from other nurses, doctors and therapists.',
      placeholder:'Paste all the notes in one go. Each note should start with its date (and time if shown), e.g.\n07/11/2026 10:30  Psaila, Josephine\nPatient reviewed on the ward. Stoma healthy, output 600 ml.'},
    treatment:{label:'Treatment',icon:'💊',title:'Treatment',result:'Details / response',
      hint:'Chemotherapy, radiotherapy, immunotherapy, antibiotics, transfusions and other courses of treatment.',
      placeholder:'Paste the whole treatment history in one go, e.g.\n03/2023 – 08/2023  FOLFOX chemotherapy, 6 cycles – good response\n12 Jan 2022  Short-course radiotherapy 25 Gy in 5 fractions'}
  };
  const CAT_KEYS=Object.keys(CATS);

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
  const TITLE_WORD='(?:Dr|Mr|Mrs|Ms|Miss|Prof|Professor|Sr|Sister|Nurse|SN)';
  const CAP='[A-Z][A-Za-z\'’\\-]+';
  const INITIALS='(?:[A-Z]\\.?\\s*){0,2}';
  const NAME_RE=new RegExp('\\b'+TITLE_WORD+'\\.?\\s+'+INITIALS+CAP+'(?:\\s+(?!(?:and|on|at|to|for|the|in|of|with)\\b)'+CAP+'){0,2}','g');
  const HOSP_RE=/\b(Mater Dei(?:\s+Hospital)?|MDH|SAMOC|Sir Anthony Mamo Oncology Cent(?:re|er)|Boffa(?:\s+Hospital)?|Karin Grech(?:\s+Hospital)?|Gozo General(?:\s+Hospital)?|Gozo Hospital|St\.?\s+James(?:\s+Hospital)?|Saint James(?:\s+Hospital)?|St\.?\s+Luke'?s(?:\s+Hospital)?|Mount Carmel(?:\s+Hospital)?|Rehabilitation Hospital Karin Grech|Day Care Unit|private(?:\s+hospital|\s+clinic)?|abroad|UK|London|Italy)\b/gi;
  const SURNAME_FIRST=new RegExp('^'+CAP+',\\s*'+CAP+'(?:\\s+'+CAP+'){0,2}$');
  const TITLED_ONLY=new RegExp('^'+TITLE_WORD+'\\.?\\s+'+INITIALS+CAP+'(?:\\s+'+CAP+'){0,3}\\.?$');
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
    ['Endoscopy',/colonoscop|sigmoidoscop|flexi(?:ble)?[\s\-]?sig|gastroscop|endoscop|cystoscop|capsule endoscop|proctoscop|pouchoscop/i,/\bOGD\b|\bERCP\b/],
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
    else if(/endoscop|cystoscop|\bTURP\b|\bTURBT\b|\bERCP\b|hysteroscop|ureteroscop|\bTEMS?\b|\bTAMIS\b/i.test(s))parts.push('Endoscopic');
    else if(/\bopen\b|laparotom|thoracotom|sternotom/i.test(s))parts.push('Open');
    if(/emergen|urgent|\bacute\b/i.test(s))parts.push('Emergency');
    else if(/elective/i.test(s))parts.push('Elective');
    return parts.join(' · ');
  }
  function firstType(list,text){const s=String(text||'');const hit=list.find(t=>t.length>2?typeHit(t,s):t[1].test(s));return hit?hit[0]:'';}
  const NOTE_ROLES=[
    ['Doctor',/\bDr\b|doctor|consultant|registrar|\bSHO\b|\bHO\b|resident|surgeon|\bMr\.?\s+[A-Z]|\bMs\.?\s+[A-Z]|\bProf/],
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
  // Does this entry clearly belong to another tab? (Only when it matches the
  // other tab and NOT its own — notes are never moved.)
  function suggestCategory(cat,title,text){
    if(cat==='notes')return '';
    const t=String(title||'').trim();if(!t)return '';
    const img=IMAGING_TYPES.some(x=>typeHit(x,t))&&!/biopsy|polypectomy|resection|excision|dilat/i.test(t);
    const trt=TREATMENT_TYPES.slice(0,6).some(x=>typeHit(x,t));
    const sur=isSurgery(t);
    if(cat==='surgery'&&!sur&&img)return 'imaging';
    if(cat==='surgery'&&!sur&&trt)return 'treatment';
    if(cat==='imaging'&&!img&&trt)return 'treatment';
    if(cat==='imaging'&&!img&&sur)return 'surgery';
    if(cat==='treatment'&&!TREATMENT_TYPES.some(x=>typeHit(x,t))){if(img)return 'imaging';if(sur)return 'surgery';}
    return '';
  }

  function typeFor(cat,title,text,source){
    if(cat==='imaging')return firstType(IMAGING_TYPES,title)||firstType(IMAGING_TYPES,text);
    if(cat==='treatment')return firstType(TREATMENT_TYPES,title)||firstType(TREATMENT_TYPES,text);
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
      if(src&&!(i===0&&cat!=='notes'&&!moreLines.some(x=>String(x).trim()))){sources.push(src);return;}
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
    if(cat==='notes'){
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
        if(cat!=='notes'&&cur&&line.length<=220&&!startsWithLabel(line)){
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
    let blocks=cat==='notes'||paras.length>1?paras:text.split('\n').map(l=>l.trim()).filter(Boolean);
    // "appendicectomy 2015, cholecystectomy 2018": one line holding several dated
    // items is split at the commas / semicolons between them.
    if(cat!=='notes')blocks=blocks.flatMap(b=>{
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
        else if(cat!=='notes'){const t=trailingYear(bl[0]);if(t)d=t;}
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
    ['date',/^(?:date|time|when)\b|date\s*(?:&|and)\s*time|\bdate$|performed on|done on|start date|scan date|exam date/i],
    ['type',/^type$|category|class|modality|kind/i],
    ['source',/provider|doctor|consultant|clinician|surgeon|author|^by$|staff|requested|reported|radiologist|location|department|hospital|ward|unit|site|specialty|centre|center|written by|signed/i],
    ['result',/result|report|finding|impression|conclusion|outcome|comment|summary|response|details|status|note|text|description of findings/i],
    ['title',/procedure|operation|surgery|exam|investigation|study|test|description|name|treatment|regimen|drug|medication|intervention|event|title|item|subject|order/i]
  ];
  function headerRole(cell){const c=String(cell||'').trim();if(!c||c.length>40)return null;const h=HEADER_ROLES.find(([,re])=>re.test(c));return h?h[0]:null;}
  function tableEntries(text,cat){
    const rows=text.split('\n').filter(l=>l.trim()).map(l=>l.split('\t').map(c=>c.trim()));
    if(!rows.length)return [];
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
      for(let i=0;i<width;i++)if(roles[i]==null&&share(i,c=>!!sourceLine(c))>=0.6)roles[i]='source';
      const free=[];for(let i=0;i<width;i++)if(roles[i]==null&&rows.some(r=>(r[i]||'').trim()))free.push(i);
      const avg=i=>{const c=rows.map(r=>r[i]||'').filter(Boolean);return c.reduce((a,x)=>a+x.length,0)/(c.length||1);};
      if(free.length===1)roles[free[0]]=cat==='notes'?'result':'title';
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
      if(cat!=='notes'&&!title&&result){const f=fieldsFrom(cat,result,[]);title=f.title;result=f.result;if(f.source)sources.push(f.source);}
      if(cat==='notes'&&title&&!result){result=title;title='';}
      return {date:e.date,rangeText:'',typeCell:get('type').join(' '),table:true,title,result,source:uniq(sources).join(' · '),raw:e.raw};
    });
  }

  /* ------------------------------------------------------------------ *
   * parse(): the whole lump → reviewed-ready rows
   * ------------------------------------------------------------------ */
  function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
  function fingerprint(cat,iso,title,result){return cat+'|'+(iso||'')+'|'+(norm(title)||norm(result)).slice(0,60);}
  function parse(text,cat,opts){
    opts=opts||{};cat=CATS[cat]?cat:'surgery';
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
    const tabbed=lines.filter(l=>l.includes('\t')).length;
    const table=tabbed>=2&&tabbed>=lines.length*0.6;
    const raw=table?tableEntries(clean,cat):freeEntries(clean,cat);
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
      let category=cat;
      const sug=suggestCategory(cat,f.title,f.result);
      if(sug){category=sug;flags.push('moved');}
      if(category==='surgery'&&STOMA_RE.test(f.title+' '+f.result.slice(0,200)))flags.push('stoma');
      if(category!=='notes'&&!f.title)flags.push('no_title');
      if((f.title+f.result).length>1500)flags.push('long');
      const type=(e.typeCell||'').trim()||typeFor(category,f.title,f.result,f.source);
      const fp=fingerprint(category,d?d.iso:'',f.title,f.result);
      let include=!flags.includes('stoma');
      if(existing.has(fp)){flags.push('duplicate_saved');include=false;}
      else if(seen.has(fp)){flags.push('duplicate_paste');include=false;}
      seen.add(fp);
      return {include,category,entry_date:d?d.iso:null,date_precision:d?d.precision:'',entry_time:d?d.time:'',date_text:d?d.text:(e.badDate||''),
        entry_type:type,title:f.title,result:f.result,source:f.source,raw_text:(e.raw||[]).join('\n').trim(),flags,fingerprint:fp,suggested:sug};
    }).filter(r=>r.title||r.result);
    return {rows,mode:table?'table':'text'};
  }

  const FLAG_TEXT={
    no_date:'No date found',bad_date:'Date is not a real date (e.g. 31/02) — check it',month_only:'Only the month was given',year_only:'Only the year was given',
    two_digit_year:'Two-digit year — check the century',swapped:'Read as month/day — check the date',
    future:'Date is in the future',before_birth:'Date is before the date of birth',
    moved:'Looks like {cat} — will be saved there',stoma:'Stoma-related — belongs under Stomas & surgery (not ticked)',
    no_title:'No operation / test found',long:'Long entry — check it was split correctly',
    duplicate_saved:'Already saved — not ticked',duplicate_paste:'Repeated in this paste — not ticked'
  };
  function flagText(code,row){return (FLAG_TEXT[code]||code).replace('{cat}',CATS[row&&row.category]?CATS[row.category].label:'another tab');}
  // Flags that mean "a nurse should look at this row".
  const CHECK_FLAGS=new Set(['no_date','bad_date','two_digit_year','swapped','future','before_birth','moved','stoma','no_title','long']);

  global.ClinicalHistory=Object.assign(global.ClinicalHistory||{},{CATS,CAT_KEYS,parse,findDate,lineStartDate,fingerprint,flagText,CHECK_FLAGS,typeFor,suggestCategory,_fieldsFrom:fieldsFrom});
})(window);

/* ==================================================================== *
 * The Clinical history section on the patient profile
 * ==================================================================== */
(function(global){
  'use strict';
  const CH=global.ClinicalHistory;
  const TABLE='patient_history_entries';
  const db=()=>(typeof SB!=='undefined'&&SB)||global.SB;
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const st={pid:null,patient:null,host:null,entries:[],tab:'surgery',q:'',available:true,error:'',loading:false,loaded:false,preview:null,pasteText:'',edit:null,note:'',
    main:null,sub:{surgeries:'surgery',notes:'all',treatment:'history'}};
  // Three tabs, each with its own sub-tabs: Surgeries holds the operations and
  // the medical imaging; Patient notes are split by who wrote them; Treatment
  // holds the pasted treatment history and the patient's medication groups.
  const MAIN={
    surgeries:{label:'Surgeries',icon:'🏥',subs:[['surgery','Surgeries','🏥'],['imaging','Medical imaging','📷']]},
    notes:{label:'Patient notes',icon:'📝',subs:[['all','All notes',''],['nurse','Nurses',''],['doctor','Doctors',''],['other','Other professionals','']]},
    treatment:{label:'Treatment',icon:'💊',subs:[['history','Treatment history',''],['groups','Medication groups','']]}
  };
  // Who wrote a note, from its type and author: nurse, doctor or other.
  function noteRole(e){
    const t=String(e.entry_type||'')+' '+String(e.source||'');
    if(/nurse|sister\b|stoma care|comcare/i.test(t)||/\bSN\b/.test(t))return 'nurse';
    if(/doctor|consultant|registrar|surgeon|physician/i.test(t)||/\b(?:Dr|Mr|Ms|Mrs|Prof)\b/.test(t))return 'doctor';
    return 'other';
  }
  function currentCategory(){
    if(st.main==='surgeries')return st.sub.surgeries;
    if(st.main==='notes')return 'notes';
    if(st.main==='treatment')return 'treatment';
    return null;
  }
  // Point the tabs at the place a category lives (after saving or editing).
  function goToCategory(cat){
    if(cat==='surgery'||cat==='imaging'){st.main='surgeries';st.sub.surgeries=cat;}
    else if(cat==='notes'){st.main='notes';}
    else if(cat==='treatment'){st.main='treatment';st.sub.treatment='history';}
  }
  let loadSeq=0;

  function showDate(e){
    if(!e.entry_date)return 'No date';
    const [y,m,d]=String(e.entry_date).slice(0,10).split('-');
    if(e.date_precision==='year')return y;
    if(e.date_precision==='month')return MONTHS[+m-1]+' '+y;
    return typeof global.fmtShortDate==='function'?global.fmtShortDate(String(e.entry_date).slice(0,10)):d+'/'+m+'/'+y;
  }
  function counts(){
    const c={surgery:0,imaging:0,notes:0,treatment:0,nurse:0,doctor:0,other:0};
    st.entries.forEach(e=>{if(c[e.category]!=null)c[e.category]++;if(e.category==='notes')c[noteRole(e)]++;});
    c.surgeries=c.surgery+c.imaging;c.all=c.notes;c.history=c.treatment;return c;
  }
  function medGroups(){
    const p=st.patient||{};
    let t={items:[],other:''};try{if(typeof patientTreatment==='function')t=patientTreatment(p);}catch(e){}
    const groups=typeof TREATMENT_GROUPS!=='undefined'?TREATMENT_GROUPS:[];
    const items=Array.isArray(t.items)?t.items:[];
    const on=groups.map(g=>({g,it:items.find(x=>x&&x.key===g.key&&x.on)})).filter(x=>x.it);
    return {t,on};
  }
  function groupsHTML(){
    const {t,on}=medGroups();
    const rows=on.map(x=>'<div class="ch-group"><strong>'+esc(x.g.label)+'</strong>'+(String(x.it.details||'').trim()?'<span>'+esc(x.it.details)+'</span>':'')+'</div>').join('')
      +(String(t.other||'').trim()?'<div class="ch-group"><strong>Other treatment</strong><span>'+esc(t.other)+'</span></div>':'');
    return '<p class="ch-hint">The medication groups the patient is on. When <b>OHAs</b> is ticked, the ID badge turns red.</p>'
      +(rows?'<div class="ch-groups">'+rows+'</div>':'<p class="ch-empty">No medication groups recorded.</p>')
      +(t.updated_by?'<p class="ch-by">Last updated by '+esc(t.updated_by)+'</p>':'')
      +'<div class="ch-tools"><button type="button" class="psm-btn psm-btn-primary" onclick="openPatientTreatment()">💊 Edit medication groups</button></div>';
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

  function mount(host,patient){
    if(!host||!patient)return;
    const pid=String(patient.id);
    if(st.pid!==pid){st.pid=pid;st.entries=[];st.q='';st.tab='surgery';st.loaded=false;st.note='';st.pasteText='';st.main=null;st.sub={surgeries:'surgery',notes:'all',treatment:'history'};}
    st.host=host;st.patient=patient;
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
    const h=st.host;if(!h||!document.body.contains(h))return;
    const c=counts();
    const mainTabs='<div class="ch-main-tabs" role="tablist" aria-label="Surgeries, patient notes and treatment">'+Object.keys(MAIN).map(k=>{
      const on=st.main===k,n=k==='surgeries'?c.surgeries:k==='notes'?c.notes:c.treatment;
      return '<button type="button" role="tab" class="ch-main ch-main-'+k+(on?' is-on':'')+'" aria-selected="'+on+'" aria-expanded="'+on+'" onclick="ClinicalHistory.main(\''+k+'\')">'
        +'<span class="ch-main-ic" aria-hidden="true">'+MAIN[k].icon+'</span>'+esc(MAIN[k].label)+'<span class="ch-count">'+n+'</span><span class="ch-caret" aria-hidden="true">'+(on?'▴':'▾')+'</span></button>';
    }).join('')+'</div>';
    if(!st.main){h.innerHTML=mainTabs;return;}
    if(!st.available){
      h.innerHTML=mainTabs+'<div class="ch-pane ch-pane-'+st.main+'"><div class="ch-missing">These tabs need their database table first. Run <strong>sql/add-patient-history.sql</strong> once in Supabase (SQL Editor), then press ↻ Refresh.</div></div>';
      return;
    }
    const sub=st.sub[st.main],groups=medGroups().on.length;
    const subTabs='<div class="ch-sub-tabs" role="tablist">'+MAIN[st.main].subs.map(([k,l,ic])=>{
      const on=sub===k,n=k==='groups'?groups:c[k];
      return '<button type="button" role="tab" class="ch-sub'+(on?' is-on':'')+'" aria-selected="'+on+'" onclick="ClinicalHistory.sub(\''+k+'\')">'+(ic?ic+' ':'')+esc(l)+'<span class="ch-count">'+n+'</span></button>';
    }).join('')+'</div>';
    let body;
    if(st.main==='treatment'&&sub==='groups')body=groupsHTML();
    else{
      const cat=currentCategory();st.tab=cat;
      const meta=CH.CATS[cat],what=st.main==='notes'&&sub!=='all'?MAIN.notes.subs.find(x=>x[0]===sub)[1].toLowerCase()+' notes':meta.label.toLowerCase();
      const hint=st.main==='notes'
        ?'Notes from other nurses, doctors and therapists. Each note goes under Nurses or Doctors by who wrote it; a note whose author is not recognised is under Other professionals (set its Type to Nurse or Doctor to move it).'
        :meta.hint;
      body='<div class="ch-tools"><button type="button" class="psm-btn psm-btn-primary" onclick="ClinicalHistory.openPaste()">📋 Paste a list</button>'
        +'<button type="button" class="psm-btn" onclick="ClinicalHistory.openEdit()">＋ Add one</button>'
        +'<input type="search" class="ch-search" placeholder="Search '+esc(what)+'…" aria-label="Search '+esc(what)+'" value="'+esc(st.q)+'" oninput="ClinicalHistory.search(this.value)"></div>'
        +'<p class="ch-hint">'+esc(hint)+'</p>'+(st.note?'<div class="ch-note">'+st.note+'</div>':'')
        +'<div id="ch-list" class="ch-list">'+listHTML()+'</div>';
    }
    h.innerHTML=mainTabs+'<div class="ch-pane ch-pane-'+st.main+'">'+subTabs+body+'</div>';
  }
  function listHTML(){
    if(st.loading)return '<p class="ch-empty">Loading…</p>';
    if(st.error)return '<p class="ch-empty" role="alert">Could not load the clinical history: '+esc(st.error)+' <button type="button" class="psm-btn" onclick="ClinicalHistory.reload()">Retry</button></p>';
    const q=st.q.trim().toLowerCase();
    const cat=currentCategory()||st.tab,sub=st.main==='notes'?st.sub.notes:'';
    const rows=sorted(st.entries.filter(e=>e.category===cat&&(!sub||sub==='all'||noteRole(e)===sub)&&(!q||[e.title,e.result,e.source,e.entry_type,e.date_text,showDate(e)].join(' ').toLowerCase().includes(q))));
    if(!rows.length)return '<p class="ch-empty">'+(q?'Nothing matches that search.':'Nothing recorded yet. Press <strong>📋 Paste a list</strong> to add the whole list in one go.')+'</p>';
    return rows.map(e=>'<article class="ch-row ch-cat-'+esc(e.category)+'">'
      +'<div class="ch-when"><strong>'+esc(showDate(e))+'</strong>'+(e.entry_time?'<span>'+esc(e.entry_time)+'</span>':'')+'</div>'
      +'<div class="ch-body">'+(e.entry_type?'<span class="ch-type">'+esc(e.entry_type)+'</span>':'')
        +(e.title?'<div class="ch-title">'+esc(e.title)+'</div>':'')
        +(e.result?'<div class="ch-result">'+esc(e.result)+'</div>':'')
        +(e.source?'<div class="ch-source">'+esc(e.source)+'</div>':'')
        +'<div class="ch-by">Added by '+esc(e.created_by_name||'—')+(e.updated_by_name&&e.updated_at&&e.updated_at!==e.created_at?' · edited by '+esc(e.updated_by_name):'')+'</div></div>'
      +'<div class="ch-act"><button type="button" class="ch-ic" title="Edit this entry" aria-label="Edit this entry" onclick="ClinicalHistory.openEdit(\''+esc(e.id)+'\')">✏️</button>'
      +'<button type="button" class="ch-ic" title="Delete this entry" aria-label="Delete this entry" onclick="ClinicalHistory.remove(\''+esc(e.id)+'\')">🗑</button></div></article>').join('');
  }
  function tab(k){if(!CH.CATS[k])return;goToCategory(k);st.tab=k;st.q='';st.note='';render();}
  // A main tab opens its pane; pressing the open tab again folds it away.
  function main(k){if(!MAIN[k])return;st.main=st.main===k?null:k;st.q='';st.note='';render();}
  function sub(k){if(!st.main||!MAIN[st.main].subs.some(x=>x[0]===k))return;st.sub[st.main]=k;st.q='';st.note='';render();}
  function search(v){st.q=String(v||'');const l=document.getElementById('ch-list');if(l)l.innerHTML=listHTML();}

  /* ---------- paste → organise → check → save ---------- */
  function openPaste(){
    const meta=CH.CATS[st.tab];const mb=document.getElementById('mb');if(!mb)return;
    mb.className='mb mb-wide';
    mb.innerHTML='<h2>📋 Paste '+esc(meta.label.toLowerCase())+'</h2>'
      +'<div class="msub">Paste the <strong>whole list in one go</strong>, copied from the hospital system, a letter or a report. The app sorts it into dated entries for you to check before anything is saved. The text stays inside this app.</div>'
      +'<textarea id="ch-paste" class="ch-paste" rows="14" placeholder="'+esc(meta.placeholder)+'">'+esc(st.pasteText)+'</textarea>'
      +'<div id="ch-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" onclick="ClinicalHistory.organise()">Organise ›</button></div>';
    if(typeof global.openMo==='function')global.openMo();
    setTimeout(()=>{const t=document.getElementById('ch-paste');if(t)t.focus();},60);
  }
  function organise(){
    const ta=document.getElementById('ch-paste');const text=ta?ta.value:'';st.pasteText=text;
    if(!text.trim()){msg('Paste the list first.');return;}
    const res=CH.parse(text,st.tab,{dob:st.patient&&st.patient.date_of_birth,existing:new Set(st.entries.map(e=>e.fingerprint).filter(Boolean))});
    if(!res.rows.length){msg('Nothing could be read from that text. Check that it was pasted completely.');return;}
    // Pasted under Nurses or Doctors: a note whose author was not recognised is
    // taken to be from that group.
    if(st.main==='notes'&&(st.sub.notes==='nurse'||st.sub.notes==='doctor')){
      const role=st.sub.notes==='nurse'?'Nurse':'Doctor';
      res.rows.forEach(r=>{if(r.category==='notes'&&noteRole(r)==='other')r.entry_type=r.entry_type?r.entry_type+' · '+role:role;});
    }
    st.preview=res;st.edit=null;renderPreview();
  }
  function includedCount(){return st.preview?st.preview.rows.filter(r=>r.include).length:0;}
  function renderPreview(){
    const p=st.preview;if(!p)return;const mb=document.getElementById('mb');if(!mb)return;
    const check=p.rows.filter(r=>r.include&&r.flags.some(f=>CH.CHECK_FLAGS.has(f))).length,n=includedCount();
    mb.className='mb mb-wide';
    mb.innerHTML='<h2>Check before saving</h2>'
      +'<div class="msub">Found <strong>'+p.rows.length+'</strong> entr'+(p.rows.length===1?'y':'ies')+(p.mode==='table'?' (read as a table)':'')+'. '
      +(check?'<strong class="ch-warn">'+check+' need'+(check===1?'s':'')+' checking</strong> (highlighted in amber). ':'')
      +'Untick anything that should not be saved and correct any field before saving.</div>'
      +'<div class="ch-preview">'+p.rows.map((r,i)=>cardHTML(r,i,false)).join('')+'</div>'
      +'<div id="ch-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="ClinicalHistory.openPaste()">‹ Back to the pasted text</button>'
      +'<button class="btn-save" id="ch-save" onclick="ClinicalHistory.saveAll()">'+saveLabel(n)+'</button></div>';
  }
  function saveLabel(n){return n?'Save '+n+' entr'+(n===1?'y':'ies'):'Nothing ticked';}
  function cardHTML(r,i,single){
    const warn=r.flags.some(f=>CH.CHECK_FLAGS.has(f)),meta=CH.CATS[r.category]||CH.CATS.surgery;
    const catSel='<select aria-label="Save under" onchange="ClinicalHistory.pv('+i+',\'category\',this.value)">'+CH.CAT_KEYS.map(k=>'<option value="'+k+'"'+(k===r.category?' selected':'')+'>'+esc(CH.CATS[k].label)+'</option>').join('')+'</select>';
    const prec='<select aria-label="How exact the date is" onchange="ClinicalHistory.pv('+i+',\'date_precision\',this.value)">'+[['day','Exact date'],['month','Month only'],['year','Year only']].map(([v,l])=>'<option value="'+v+'"'+((r.date_precision||'day')===v?' selected':'')+'>'+l+'</option>').join('')+'</select>';
    return '<div class="ch-card'+(warn?' is-warn':'')+(r.include?'':' is-off')+'" id="ch-card-'+i+'">'
      +'<div class="ch-card-head">'
        +(single?'':'<label class="ch-inc"><input type="checkbox" '+(r.include?'checked':'')+' onchange="ClinicalHistory.pv('+i+',\'include\',this.checked)"> Save</label>')
        +'<label>Under '+catSel+'</label>'
        +'<label>Date <input type="date" value="'+esc(r.entry_date||'')+'" max="2100-12-31" onchange="ClinicalHistory.pv('+i+',\'entry_date\',this.value)"></label>'+prec
        +'<label>Time <input type="time" value="'+esc(r.entry_time||'')+'" onchange="ClinicalHistory.pv('+i+',\'entry_time\',this.value)"></label>'
        +(r.date_text?'<span class="ch-orig">written as: '+esc(r.date_text)+'</span>':'')
      +'</div>'
      +(r.flags.length?'<div class="ch-flags">'+r.flags.map(f=>'<span class="ch-flag'+(CH.CHECK_FLAGS.has(f)?' is-check':'')+'">'+esc(CH.flagText(f,r))+'</span>').join('')+'</div>':'')
      +'<div class="ch-grid">'
        +'<label>Type<input type="text" value="'+esc(r.entry_type)+'" oninput="ClinicalHistory.pv('+i+',\'entry_type\',this.value)"></label>'
        +'<label>By / where<input type="text" value="'+esc(r.source)+'" oninput="ClinicalHistory.pv('+i+',\'source\',this.value)"></label>'
        +'<label class="ch-wide">'+esc(meta.title)+'<textarea rows="2" oninput="ClinicalHistory.pv('+i+',\'title\',this.value)">'+esc(r.title)+'</textarea></label>'
        +'<label class="ch-wide">'+esc(meta.result)+'<textarea rows="'+(r.category==='notes'?6:3)+'" oninput="ClinicalHistory.pv('+i+',\'result\',this.value)">'+esc(r.result)+'</textarea></label>'
      +'</div>'
      +(r.raw_text?'<details class="ch-raw"><summary>Pasted text for this entry</summary><pre>'+esc(r.raw_text)+'</pre></details>':'')
      +'</div>';
  }
  function pv(i,field,value){
    const r=st.preview&&st.preview.rows[i];if(!r)return;
    r[field]=value;
    if(field==='entry_date'){r.flags=r.flags.filter(f=>!['no_date','bad_date','future','before_birth','swapped','two_digit_year'].includes(f));if(value&&!r.date_precision)r.date_precision='day';}
    if(field==='category'){r.flags=r.flags.filter(f=>f!=='moved'&&f!=='stoma');}
    if(field==='include'||field==='category'){
      const el=document.getElementById('ch-card-'+i);if(el)el.outerHTML=cardHTML(r,i,!!st.edit);
      const b=document.getElementById('ch-save');if(b&&!st.edit)b.textContent=saveLabel(includedCount());
    }
  }
  function dbRow(r,fp,batch,who,now){
    const iso=r.entry_date||null;
    return {patient_id:st.pid,category:r.category,entry_date:iso,date_precision:iso?(r.date_precision||'day'):'',
      entry_time:r.entry_time||'',date_text:r.date_text||'',entry_type:String(r.entry_type||'').trim(),
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
    if(/patient_history_entries|does not exist|relation|schema cache/i.test(m))return 'Clinical history is not switched on in the database yet. Ask Jason to run <strong>sql/add-patient-history.sql</strong> once in Supabase.';
    return 'Could not save: '+esc(m);
  }
  async function saveAll(){
    const p=st.preview;if(!p)return;
    const rows=p.rows.filter(r=>r.include&&(String(r.title).trim()||String(r.result).trim()));
    if(!rows.length){msg('Nothing is ticked to save.');return;}
    const btn=document.getElementById('ch-save');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    const restore=()=>{if(btn){btn.disabled=false;btn.textContent=saveLabel(includedCount());}};
    const who=await whoName(),now=new Date().toISOString();
    const batch=global.crypto&&global.crypto.randomUUID?global.crypto.randomUUID():null;
    // Re-check duplicates against what is saved now (another nurse may have pasted meanwhile).
    await load();
    const have=new Set(st.entries.map(e=>e.fingerprint).filter(Boolean));
    const out=[];let skipped=0;
    rows.forEach(r=>{const fp=CH.fingerprint(r.category,r.entry_date||'',r.title,r.result);if(have.has(fp)){skipped++;return;}have.add(fp);out.push(dbRow(r,fp,batch,who,now));});
    if(!out.length){restore();msg('All of these are already saved for this patient.');return;}
    const res=await writeTolerant(b=>db().from(TABLE).insert(b),out);
    if(res.error){restore();msg(writeError(res.error));return;}
    try{global.logAudit&&global.logAudit({action:'create',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Added '+out.length+' clinical history entr'+(out.length===1?'y':'ies')+' from a pasted list'});}catch(e){}
    const by={};out.forEach(r=>{by[r.category]=(by[r.category]||0)+1;});
    st.note='✓ Saved '+Object.keys(by).map(k=>by[k]+' to '+esc(CH.CATS[k].label)).join(', ')+(skipped?' · '+skipped+' already saved (skipped)':'')+'.';
    st.preview=null;st.pasteText='';
    if(typeof global.closeModal==='function')global.closeModal();
    await load();
  }

  /* ---------- one entry: add / edit / delete ---------- */
  function openEdit(id){
    const e=id?st.entries.find(x=>String(x.id)===String(id)):null;if(id&&!e)return;
    const row=e?{category:e.category,entry_date:e.entry_date?String(e.entry_date).slice(0,10):'',date_precision:e.date_precision||'day',entry_time:e.entry_time||'',date_text:e.date_text||'',
      entry_type:e.entry_type||'',title:e.title||'',result:e.result||'',source:e.source||'',raw_text:e.raw_text||'',flags:[],include:true}
      :{category:st.tab,entry_date:'',date_precision:'day',entry_time:'',date_text:'',entry_type:'',title:'',result:'',source:'',raw_text:'',flags:[],include:true};
    st.edit={id:e?e.id:null};st.preview={rows:[row],mode:'edit'};
    const mb=document.getElementById('mb');if(!mb)return;mb.className='mb mb-wide';
    mb.innerHTML='<h2>'+(e?'✏️ Edit entry':'＋ Add one entry')+'</h2>'+cardHTML(row,0,true)+'<div id="ch-msg"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-save" id="ch-save-one" onclick="ClinicalHistory.saveEdit()">Save</button></div>';
    if(typeof global.openMo==='function')global.openMo();
  }
  async function saveEdit(){
    const r=st.preview&&st.preview.rows[0];if(!r||!st.edit)return;
    if(!String(r.title).trim()&&!String(r.result).trim()){msg('Write what was done, or the note, first.');return;}
    const btn=document.getElementById('ch-save-one');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    const who=await whoName(),now=new Date().toISOString();
    const fp=CH.fingerprint(r.category,r.entry_date||'',r.title,r.result);
    let res;
    if(st.edit.id){
      const row=dbRow(r,fp,null,who,now);delete row.created_by_name;delete row.created_at;delete row.batch_id;delete row.patient_id;delete row.raw_text;
      res=await writeTolerant(b=>db().from(TABLE).update(b).eq('id',st.edit.id),row);
    }else res=await writeTolerant(b=>db().from(TABLE).insert(b),[dbRow(r,fp,null,who,now)]);
    if(res.error){if(btn){btn.disabled=false;btn.textContent='Save';}msg(writeError(res.error));return;}
    try{global.logAudit&&global.logAudit({action:st.edit.id?'update':'create',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:(st.edit.id?'Edited':'Added')+' a clinical history entry ('+CH.CATS[r.category].label+')'});}catch(e){}
    st.edit=null;st.preview=null;st.note='';if(CH.CATS[r.category]){st.tab=r.category;goToCategory(r.category);}
    if(typeof global.closeModal==='function')global.closeModal();
    await load();
  }
  async function remove(id){
    const e=st.entries.find(x=>String(x.id)===String(id));if(!e)return;
    if(!confirm('Delete this entry ('+showDate(e)+(e.title?' · '+String(e.title).slice(0,60):'')+')? This cannot be undone.'))return;
    const r=await db().from(TABLE).delete().eq('id',id);
    if(r.error){alert('Could not delete: '+(r.error.message||r.error));return;}
    try{global.logAudit&&global.logAudit({action:'delete',entity:'patient',entity_id:st.pid,patient_id:st.pid,summary:'Deleted a clinical history entry ('+(CH.CATS[e.category]?CH.CATS[e.category].label:e.category)+')'});}catch(x){}
    st.note='';await load();
  }

  Object.assign(CH,{mount,tab,main,sub,noteRole,search,reload:load,openPaste,organise,pv,saveAll,openEdit,saveEdit,remove,_state:st});
})(window);
