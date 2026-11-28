/* ==================================================================== *
 * Holistic summary — the last fold-out on the patient profile.
 *
 * One technical summary of everything recorded for the patient, built by fixed
 * rules from the data the app already holds (no AI; nothing leaves the app):
 * the patient and current stomas, the surgical history with its indications and
 * findings, admissions, ward encounters and clinic visit reviews, the siting,
 * appliances and complications, teaching and discharge preparation, medicines
 * (and how they changed), investigations, correspondence and what is planned.
 *
 * Every line names where it came from and its date. The reasons are the ones
 * written in the records (indication, operation findings, reason for an
 * admission, a complication's note), never the app's own clinical conclusions.
 *
 * It is LIVE: rebuilt whenever the profile refreshes (a new encounter, an edited
 * stoma, another nurse's change), whenever the care history, appliances or
 * correspondence change, and whenever a Hospital records paste is saved.
 * It is only worked out while it is open.
 * ==================================================================== */
(function(global){
  'use strict';
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fn=n=>typeof global[n]==='function'?global[n]:null;
  const today=()=>(typeof TODAY!=='undefined'&&TODAY)||new Date().toISOString().slice(0,10);
  const day=v=>String(v||'').slice(0,10);
  const fd=v=>{const d=day(v);if(!d)return '';const f=fn('fmtShortDate');return f?f(d):d.split('-').reverse().join('/');};
  const daysBetween=(a,b)=>Math.round((Date.parse(day(b))-Date.parse(day(a)))/864e5);
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const one=(s,n)=>{s=String(s||'').replace(/\s+/g,' ').trim();n=n||160;return s.length>n?s.slice(0,n-1).replace(/\s+\S*$/,'')+'…':s;};
  // open: the detail drop-downs left open, kept when the summary is rebuilt.
  const st={host:null,pid:null,at:null,plain:'',open:new Set()};

  // A consultation note's / ECG's sections ("§ Name" lines).
  function sections(text){
    const s=String(text||'');if(!/^§ /m.test(s))return [];
    return s.split(/^§ /m).filter(x=>x.trim()).map(p=>{const i=p.indexOf('\n');return i<0?{label:p.trim(),value:''}:{label:p.slice(0,i).trim(),value:p.slice(i+1).trim()};});
  }
  const sec=(e,label)=>((sections(e.result).find(x=>x.label.toLowerCase()===label.toLowerCase())||{}).value||'');

  /* ---------- case summaries (Hospital records › Case summaries) ---------- */
  function cases(c){
    return c.hist.filter(e=>e.category==='case'&&e.entry_date).map(e=>{
      const m=sec(e,'Dates').match(/Discharged\s+(\d{2})\/(\d{2})\/(\d{4})/);
      return {e,adm:day(e.entry_date),dis:m?m[3]+'-'+m[2]+'-'+m[1]:'',list:l=>sec(e,l).split('\n').map(x=>x.trim()).filter(Boolean)};
    }).sort((a,b)=>b.adm.localeCompare(a.adm));
  }
  // The latest summary that has a section, with its lines.
  function latestList(cs,label){for(const x of cs){const l=x.list(label);if(l.length)return {x,lines:l};}return null;}
  // Every allergy named in any summary (case-insensitive, once each).
  function allergies(cs){const seen=new Map();cs.forEach(x=>x.list('Allergies').forEach(a=>{const k=a.toLowerCase();if(!seen.has(k))seen.set(k,a);}));return [...seen.values()];}
  function data(){
    const s=typeof clrState!=='undefined'?clrState:null;
    const p=s&&s.patient;if(!p)return null;
    const CH=global.ClinicalHistory;
    let comms=[];try{const PC=global.PatientCommunications;comms=PC&&typeof PC.historyRows==='function'?PC.historyRows().filter(r=>String(r.patient_id)===String(p.id)):[];}catch(e){comms=[];}
    return {p,rows:s.rows||[],appts:s.appts||[],enc:s.encounters||[],comms,siting:s.siting||null,
      hist:CH&&typeof CH.entries==='function'?CH.entries(p.id):[],
      stomas:(()=>{try{return fn('patientStomaList')?global.patientStomaList(p)||[]:[];}catch(e){return [];}})()};
  }
  function stomaName(x){
    const t=fn('stomaTitle')?global.stomaTitle(x):'Stoma '+(x.number||'');
    const type=x.type?(fn('prettyStomaType')?global.prettyStomaType(x.type):x.type):'type not recorded';
    return t+' · '+type+(x.code?' ('+x.code+')':'');
  }
  const L=(text,src,date)=>({text,src:src||'',date:date||''});
  // The age now — or at death, as the profile shows it.
  const ageOf=p=>{const f=fn('ageYearsBetween');if(!f||!p.date_of_birth)return null;const dd=/^\d{4}-\d{2}-\d{2}/.test(String(p.deceased_date||''))?String(p.deceased_date).slice(0,10):'';return global.ageYearsBetween(p.date_of_birth,dd||today());};

  /* ---------- the sections ---------- */
  function overview(c){
    const p=c.p,out=[];
    const age=ageOf(p);
    const sex=/^f/i.test(p.sex||'')?'F':/^m/i.test(p.sex||'')?'M':'';
    const outcome=fn('patientOutcome')?global.patientOutcome(p)[0]:'';
    out.push(L([age!=null?age+' y':'',sex,p.consultant?'Firm '+p.consultant:'',outcome].filter(Boolean).join(' · '),'Patient details'));
    if(p.operated_abroad)out.push(L('Operated outside MDH'+[p.operated_abroad_hospital,p.operated_abroad_country].filter(Boolean).map(x=>' · '+x).join(''),'Patient details'));
    const now=c.stomas.filter(x=>x.present);
    now.forEach(x=>out.push(L('Present: '+stomaName(x)+(x.location?', '+x.location:'')
      +(x.formed_date?' — formed '+fd(x.formed_date)+', day '+daysBetween(x.formed_date,today())+' post-op':''),'Stomas & surgery',x.formed_date)));
    if(!now.length)out.push(L(c.stomas.length?'No stoma present now ('+c.stomas.length+' recorded before).':'No stoma recorded.','Stomas & surgery'));
    return out;
  }
  // Operations in date order: what was done, by whom, why (indication) and what
  // was found, with the stoma formed, refashioned, closed or replaced that day.
  const uniq=a=>{const seen=new Set();return a.filter(x=>{const k=norm(x);if(!k||seen.has(k))return false;seen.add(k);return true;});};
  function surgeryEvents(c){
    const ev=new Map();
    const at=d=>{d=day(d)||'';if(!ev.has(d))ev.set(d,{date:d,procs:[],by:[],ind:[],find:[],stoma:[],src:new Set()});return ev.get(d);};
    c.stomas.forEach(x=>{
      if(x.formed_date){const e=at(x.formed_date);e.stoma.push((x.kind==='refashion'?'Refashioned ':'Formed ')+stomaName(x)+(x.location?', '+x.location:''));
        if(x.operation)e.procs.push(x.operation);e.src.add('Stomas & surgery');}
      if(x.reversal_date){const e=at(x.reversal_date);e.stoma.push('Closed '+stomaName(x)+(x.reversal_notes?' — '+x.reversal_notes:''));e.src.add('Stomas & surgery');}
      if(x.superseded_date){const e=at(x.superseded_date);e.stoma.push('Replaced '+stomaName(x));e.src.add('Stomas & surgery');}
    });
    c.hist.filter(e=>e.category==='surgery').forEach(h=>{const e=at(h.entry_date);if(h.title)e.procs.push(h.title);if(h.source)e.by.push(h.source);e.src.add('Performed procedures');});
    cases(c).forEach(x=>x.list('Surgical interventions').forEach(t=>{
      const m=t.match(/^(.*?)\s*·\s*(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return;
      const e=at(m[4]+'-'+m[3]+'-'+m[2]);e.procs.push(m[1]);if(x.e.source)e.by.push(x.e.source);if(x.e.title)e.ind.push(x.e.title);e.src.add('Case summaries');
    }));
    c.hist.filter(e=>e.category==='consult').forEach(h=>{
      const e=at(h.entry_date),ind=sec(h,'Indications'),find=sec(h,'Operation findings')||sec(h,'Findings');
      if(h.title)e.procs.push(h.title);if(h.source)e.by.push(h.source);
      if(ind)e.ind.push(ind.split('\n')[0]);if(find)e.find.push(find.split('\n')[0]);e.src.add('Patient consultation');
    });
    return [...ev.values()].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
  }
  function surgical(c){
    return surgeryEvents(c).map(e=>L(
      [(e.date?fd(e.date):'Date not recorded')+' —',uniq(e.procs).map(x=>one(x,120)).join(' / ')||'Operation',uniq(e.by).length?'('+uniq(e.by).join(' / ')+')':'',
       uniq(e.ind).length?'· Indication: '+uniq(e.ind).join('; '):'',uniq(e.find).length?'· Findings: '+one(uniq(e.find).join('; '),160):'',
       e.stoma.length?'→ '+e.stoma.join('; '):''].filter(Boolean).join(' '),
      [...e.src].join(', '),e.date));
  }
  function admissions(c){
    const eps=c.rows.filter(r=>r.kind==='episode'&&r.record_date).sort((a,b)=>day(b.record_date).localeCompare(day(a.record_date)));
    if(!eps.length)return [];
    const enc=ep=>c.enc.filter(e=>String(e.episode_id)===String(ep.id)).length;
    const total=c.enc.length;
    const out=[L(eps.length+' admission'+(eps.length===1?'':'s')+(total?', '+total+' encounter'+(total===1?'':'s'):''),'Appointments & episodes')];
    eps.slice(0,6).forEach(ep=>{
      const open=ep.is_current&&!ep.discharge_date,ward=ep.ward||(open?c.p.inpatient_ward:'')||'';
      const los=ep.discharge_date?daysBetween(ep.record_date,ep.discharge_date):daysBetween(ep.record_date,today());
      // The detail is often the ward and bed ("Ward ITU, Bed 6"), which is not a reason.
      const where=/\b(ward|bed|itu|icu|hdu|room)\b/i.test(ep.detail||'')?ep.detail:'';
      const why=[ep.title&&!/^inpatient visit$/i.test(ep.title)?ep.title:'',where?'':ep.detail||''].filter(Boolean).join(' — ');
      out.push(L('Admitted '+fd(ep.record_date)+(ward?', '+ward:'')+(open?' — inpatient now, day '+los:ep.discharge_date?' → discharged '+fd(ep.discharge_date)+' ('+los+' day'+(los===1?'':'s')+')':'')
        +(where?' · '+where:'')+(why?' · Reason: '+why:'')+(enc(ep)?' · '+enc(ep)+' encounter'+(enc(ep)===1?'':'s'):''),'Appointments & episodes',ep.record_date));
    });
    if(eps.length>6)out.push(L('… and '+(eps.length-6)+' earlier admission'+(eps.length-6===1?'':'s')+'.','Appointments & episodes'));
    return out;
  }
  function stomaCare(c){
    const out=[];
    let hist=null;try{hist=fn('stomaApplianceHistory')?global.stomaApplianceHistory(c.p,c.rows,c.appts):null;}catch(e){hist=null;}
    if(hist)c.stomas.filter(x=>x.present).forEach(x=>{
      const evs=hist.get(x.uid)||[],e=evs[0];if(!e)return;
      const items=e.appliances.concat(e.accessories);
      out.push(L(stomaName(x)+': '+(items.length?items.join(', '):'no appliance recorded')+(e.date?' (since '+fd(e.date)+')':''),'Appliances & accessories',e.date));
    });
    // Every appliance set or change, newest first (ward and clinic).
    if(c.K)applianceEvents(c,c.K,'1900-01-01','9999-12-31').sort((a,b)=>b.d.localeCompare(a.d)).slice(0,10)
      .forEach(e=>out.push(L(fd(e.d)+' — '+cap(e.text),'Appliances & accessories',e.d)));
    // The pre-operative siting.
    const si=c.siting,sd=si&&isoDay(si.session_date);
    if(sd&&si.status!=='cancelled'){
      let ck=null;try{ck=fn('sitingChecklistOf')?global.sitingChecklistOf(si):null;}catch(e){ck=null;}
      const marks=ck&&Array.isArray(ck.stoma_marks)?ck.stoma_marks.length:ck&&ck.stoma_mark?1:0;
      out.unshift(L('Pre-operative siting '+(sd>today()?'booked for ':'')+fd(sd)+(si.siting_for?' · for '+si.siting_for:'')+(si.proposed_operation?' · proposed: '+si.proposed_operation:'')
        +(si.consultant?' · '+si.consultant:'')+(marks?' · '+marks+' site'+(marks===1?'':'s')+' marked':'')+(si.status?' · '+si.status:''),'Stoma siting',sd));
    }
    let comp=[];try{comp=fn('parseComplications')?global.parseComplications(c.p):[];}catch(e){comp=[];}
    const open=comp.filter(x=>x.status!=='resolved'),done=comp.filter(x=>x.status==='resolved');
    open.forEach(x=>{const last=(x.events||[]).slice(-1)[0];
      out.push(L('Complication (open): '+x.text+(x.stoma?' — '+x.stoma:'')+(x.date?' since '+fd(x.date):'')+(last&&(last.trend||last.note)?' · latest: '+one([last.trend,last.note].filter(Boolean).join(' — '),120):x.note?' · '+one(x.note,120):''),'Complications',x.date));});
    if(done.length)out.push(L('Resolved complications: '+done.map(x=>x.text+(x.resolved_date?' ('+fd(x.resolved_date)+')':'')).join('; '),'Complications'));
    return out;
  }
  function medicines(c){
    const out=[],poyc=c.hist.filter(e=>e.category==='poyc');
    if(poyc.length){
      const last=poyc.reduce((a,e)=>String(e.created_at||'')>String(a.created_at||'')?e:a,poyc[0]);
      const names=poyc.map(e=>e.title).filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
      out.push(L(names.length+' medicine'+(names.length===1?'':'s')+' on Entitlement CARE: '+names.join('; '),'Entitlement CARE (POYC)',last.created_at));
    }
    const cs=cases(c),dis=latestList(cs,'Treatment on discharge'),adm=latestList(cs,'Medications on admission');
    if(dis)out.push(L('On discharge '+fd(dis.x.dis||dis.x.adm)+': '+dis.lines.map(l=>l.split(' · ').slice(0,3).join(' ')).join('; '),'Case summaries',dis.x.dis||dis.x.adm));
    if(adm)out.push(L('On admission '+fd(adm.x.adm)+': '+adm.lines.join('; '),'Case summaries',adm.x.adm));
    return out;
  }
  // Comorbidities, past surgery, allergies and social history, from the latest
  // case summary that records each.
  function background(c){
    const cs=cases(c),out=[];
    [['Past medical history','Past medical history'],['Past surgical history','Past surgical history'],['Social history','Social history'],['Family history','Family history'],['Functional status','Functional status']].forEach(([label,name])=>{
      const l=latestList(cs,label);if(l)out.push(L(name+': '+l.lines.map(x=>x.replace(/[.;]+$/,'')).join('; '),'Case summary',l.x.adm));
    });
    const al=allergies(cs);if(al.length)out.push(L('Allergies / adverse reactions: '+al.join('; '),'Case summaries'));
    return out;
  }
  // Each hospital admission with a case summary.
  function hospitalStays(c){
    return cases(c).map(x=>{
      const days=x.dis?daysBetween(x.adm,x.dis):null;
      const comp=x.list('Complications'),iv=x.list('Surgical interventions');
      return L(fd(x.adm)+(x.dis?' → '+fd(x.dis):'')+(days!=null?' ('+days+' d)':'')+(x.e.entry_type?' · '+x.e.entry_type:'')+(x.e.source?' · '+x.e.source:'')
        +(x.e.title?' — '+x.e.title:'')+(iv.length?' · Intervention: '+iv.join('; '):'')+(comp.length?' · Complications: '+comp.join('; '):''),'Case summaries',x.adm);
    });
  }
  function investigations(c){
    const out=[];
    const lab=c.hist.filter(e=>e.category==='lab'&&e.entry_date);
    if(lab.length){
      const key=e=>day(e.entry_date)+' '+(e.entry_time||'');
      const latest=lab.reduce((a,e)=>key(e)>a?key(e):a,'');
      const set=lab.filter(e=>key(e)===latest),runs=new Set(lab.map(key)).size;
      out.push(L('Latest bloods '+fd(latest)+(latest.slice(11)?' '+latest.slice(11,16):'')+' ('+set.length+' result'+(set.length===1?'':'s')+')'
        +(runs>1?' · '+runs+' sets of bloods on record':''),'Lab results',latest.slice(0,10)));
      // Each test's most recent result; those the lab flagged (its Status) are listed.
      const last=new Map();
      lab.forEach(e=>{const k=norm(e.entry_type)+'|'+norm(e.title),cur=last.get(k);if(!cur||key(e)>key(cur))last.set(k,e);});
      const flagged=[...last.values()].filter(e=>String(e.lab_flag||'').trim()).sort((a,b)=>key(b).localeCompare(key(a)));
      out.push(L(flagged.length?'Flagged by the lab on their latest result: '+flagged.map(e=>e.title+' '+e.result+(e.lab_unit?' '+e.lab_unit:'')+' ('+e.lab_flag+', '+fd(e.entry_date)+')').join('; ')
        :'No test flagged by the lab on its latest result.','Lab results'));
    }
    const ecg=c.hist.filter(e=>e.category==='ecg'&&e.entry_date).sort((a,b)=>(day(b.entry_date)+(b.entry_time||'')).localeCompare(day(a.entry_date)+(a.entry_time||'')));
    if(ecg.length){
      const e=ecg[0],prev=ecg[1];
      const qtc=x=>{const m=String(sec(x,'Measurements')).match(/QTc\s+(-?\d+)/);return m?+m[1]:null;};
      const q=qtc(e),qp=prev?qtc(prev):null;
      const stm=sec(e,'Interpretation').split('\n').filter(Boolean).slice(0,3);
      out.push(L('ECG '+fd(e.entry_date)+(e.entry_time?' '+String(e.entry_time).slice(0,5):'')+': '+(e.title||'no verdict')+(e.entry_type?' ('+e.entry_type+')':'')
        +(q!=null?' · QTc '+q+' ms'+(qp!=null&&q!==qp?' ('+(q>qp?'+':'')+(q-qp)+' since '+fd(prev.entry_date)+')':''):'')
        +(stm.length?' · '+stm.join('; '):''),'ECG',e.entry_date));
    }
    c.hist.filter(e=>e.category==='imaging'&&e.entry_date).sort((a,b)=>day(b.entry_date).localeCompare(day(a.entry_date))).slice(0,3).forEach(e=>{
      const m=String(e.result||'').match(/CONCLUSIONS?\s*:?\s*([\s\S]*?)(?:Reported by|Approved by|$)/i);
      out.push(L(fd(e.entry_date)+' '+(e.title||'Imaging')+': '+imagingText(e),'Medical imaging results',e.entry_date));
    });
    const icm=c.hist.filter(e=>e.category==='doc_icm');
    if(icm.length){const e=icm.reduce((a,x)=>(day(x.entry_date)+(x.entry_time||''))>(day(a.entry_date)+(a.entry_time||''))?x:a,icm[0]);
      out.push(L(icm.length+' iCM note'+(icm.length===1?'':'s')+'; latest '+fd(e.entry_date)+(e.entry_type?' ('+e.entry_type+')':'')+': '+one(e.result,140),'iCM notes',e.entry_date));}
    return out;
  }
  function followup(c){return nextList(c).map(x=>L(x.label+': '+x.value,'Planned dates & appointments'));}
  // Ward encounters and clinic visit reviews, newest first.
  function nursingReviews(c){
    const R=(c.K?c.K.R:[]).slice().reverse(),out=[];
    R.slice(0,15).forEach(r=>{
      const f=reviewFindings(r),i=infectionText(r.infection);
      const notes=r.stomas.filter(x=>x.notes).map(x=>(r.stomas.length>1?x.name+': ':'')+x.notes).concat(r.notes?[r.notes]:[]).join(' ');
      out.push(L(fd(r.d)+' — '+(r.src==='clinic'?'Clinic visit':'Ward encounter')+(r.by?' ('+r.by+')':'')+': '+(f.join(' · ')||'no stoma findings recorded')
        +(i?' · infection status '+i:'')+(r.complications?' · complication review: '+r.complications:'')+(notes?' · Noted: '+notes:''),r.src==='clinic'?'Appointments':'Encounters',r.d));
    });
    if(R.length>15)out.push(L('… and '+(R.length-15)+' earlier review'+(R.length-15===1?'':'s')+'.',''));
    const t=c.K?teachingLine(c.K,'1900-01-01',today()):'';if(t)out.push(L(plain(t),'Encounters'));
    const d=c.K?dischargeLine(c.K,'1900-01-01',today()):'';if(d)out.push(L(plain(d),'Encounters'));
    return out;
  }
  // Patient and community correspondence, newest first.
  function correspondence(c){
    const label=x=>x==='Recorded'?'open':x==='Completed'?'closed':lcw(x);
    const key=r=>String(r.communication_date||'')+String(r.communication_time||'');
    return c.comms.slice().sort((a,b)=>key(b).localeCompare(key(a))).slice(0,20).map(r=>{
      const root=r.parent_id?c.comms.find(x=>String(x.id)===String(r.parent_id)):null,who=[r.contact_name,r.service].filter(Boolean).join(', '),n=plainNotes(r.notes);
      return L(fd(r.communication_date)+' — '+(r.kind==='community'?'Community':'Patient')+' correspondence · '+(r.method||'contact')+(who?' · '+who:'')+': '+(r.subject||(root&&root.subject)||'(no subject)')
        +(r.status?' — '+label(r.status):'')+(n?' · '+n:'')+(r.followup_action||isoDay(r.followup_date)?' · Follow-up: '+[r.followup_action,isoDay(r.followup_date)?fd(r.followup_date):''].filter(Boolean).join(' · '):''),'Correspondence',r.communication_date);
    });
  }

  /* ---------- the clinical synopsis (top) ----------
     Written from the data like Power BI's "smart narrative": short sentences
     with the live figures in bold, and trends worked out as plain arithmetic.
     The rationale is the indication / findings / background written in the
     records; nothing is concluded by the app. */
  const B=v=>'<b>'+esc(v)+'</b>';
  // The words of an HTML sentence (for the plain-text detail lists).
  const plain=h=>String(h||'').replace(/<button[\s\S]*?<\/button>/g,'').replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  // "Exam performed: CT … of 21-NOV-2026: Peritonitis …" → its conclusion, or its first sentences.
  // A report's conclusion, else its text without the exam header and the
  // sign-off — complete, never cut.
  function imagingText(e){
    const t=String(e.result||'');
    const m=t.match(/CONCLUSIONS?\s*:?\s*([\s\S]*?)(?:Reported by|Approved by|$)/i);
    const x=m&&m[1].trim()?m[1]:t.replace(/^\s*Exam performed\s*:[^:]*?\d{1,2}-[A-Za-z]{3}-\d{4}\s*:\s*/i,'').replace(/^\s*FINDINGS\s*:\s*/i,'').replace(/\s*(?:Reported by|Approved by)[\s\S]*$/i,'');
    return x.replace(/\s+/g,' ').trim();
  }
  // Whole sentences up to about max characters (at least one sentence); the
  // rest is kept under "more", so nothing is ever cut mid-sentence. dot: end
  // with a full stop when the text has none.
  function textMore(x,max,dot){
    x=String(x||'').replace(/\s+/g,' ').trim();if(dot&&x&&!/[.!?]$/.test(x))x+='.';
    const sents=x.split(/(?<=[.!?])\s+(?=[A-Z(])/);
    let lead='';for(const t of sents){if(lead&&(lead+' '+t).length>max)break;lead+=(lead?' ':'')+t;}
    const rest=x.slice(lead.length).trim();
    return esc(lead)+(rest?'<span class="hs-rest" hidden> '+esc(rest)+'</span> <button type="button" class="hs-more" onclick="this.previousElementSibling.hidden=false;this.remove()">more</button>':'');
  }
  function imagingHTML(e,max){return textMore(imagingText(e),max);}
  const shortTest=t=>({haemoglobin:'Hb','c-reactive protein':'CRP',potassium:'K⁺',sodium:'Na⁺','white cell count':'WCC',platelets:'Plt',creatinine:'Creat'})[String(t||'').toLowerCase()]||t;
  function labTrends(c){
    const lab=c.hist.filter(e=>e.category==='lab'&&e.entry_date);
    const key=e=>day(e.entry_date)+' '+(e.entry_time||''),groups=new Map();
    lab.forEach(e=>{const k=norm(e.entry_type)+'|'+norm(e.title);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);});
    const out=[];
    groups.forEach(list=>{
      list.sort((a,b)=>key(b).localeCompare(key(a)));
      const last=list[0];if(!String(last.lab_flag||'').trim())return;
      const prev=list.find(x=>key(x)<key(last)&&isFinite(parseFloat(x.result)));
      const a=parseFloat(last.result),b0=prev?parseFloat(prev.result):NaN;
      let trend='';
      if(prev&&isFinite(a)&&isFinite(b0)&&b0!==0&&a!==b0){const pc=Math.round((a-b0)/Math.abs(b0)*100);trend=' '+(a>b0?'↑':'↓')+' from '+prev.result+' on '+fd(prev.entry_date)+' ('+(pc>0?'+':'−')+Math.abs(pc)+'%)';}
      out.push({date:key(last),html:B(shortTest(last.title)+' '+last.result+(last.lab_unit?' '+last.lab_unit:''))+' ('+esc(last.lab_flag)+')'+esc(trend)});
    });
    return out.sort((x,y)=>y.date.localeCompare(x.date));
  }
  function synopsis(c){
    const p=c.p,out=[],kpis=[];
    const age=ageOf(p);
    const sex=/^f/i.test(p.sex||'')?'female':/^m/i.test(p.sex||'')?'male':'';
    const ep=c.rows.filter(r=>r.kind==='episode'&&r.is_current&&!r.discharge_date&&r.record_date).sort((a,b)=>day(b.record_date).localeCompare(day(a.record_date)))[0]||null;
    const ward=ep?(ep.ward||p.inpatient_ward||''):'';
    const outcome=fn('patientOutcome')?global.patientOutcome(p)[0]:'';
    // Who and where.
    const push=(k,html)=>{if(html)out.push({k,html});};
    push('Situation',[age!=null?B(age+'-year-old'):'',sex,p.consultant?'under '+B(p.consultant):'',
      ep?'— inpatient'+(ward?' on '+B(ward):'')+' since '+B(fd(ep.record_date))+' (day '+daysBetween(ep.record_date,today())+')':outcome?'— '+esc(outcome.charAt(0).toLowerCase()+outcome.slice(1)):''].filter(Boolean).join(' ')+'.');
    // Background from the case summaries: comorbidities and allergies.
    const cs=cases(c),pmh=latestList(cs,'Past medical history'),al=allergies(cs),soc=latestList(cs,'Social history');
    push('Background',[pmh?'Comorbidities: '+pmh.lines.map(x=>B(one(x.replace(/\s*\(.*?\)\s*/g,' ').replace(/\s+managed with.*$/i,''),60))).join(', ')+'.':'',
      al.length?'Allergies: '+B(al.join(', '))+'.':'',soc?'Social: '+esc(one(soc.lines.map(x=>x.replace(/[.;]+$/,'')).join('; '),140))+'.':''].filter(Boolean).join(' '));
    if(al.length)kpis.push({label:'Allergies',value:al.length,sub:one(al.join(', '),40),tone:'warn'});
    if(cs.length){
      const x=cs[0],days=x.dis?daysBetween(x.adm,x.dis):null,comp=x.list('Complications');
      push('Last admission',B(fd(x.adm))+(x.dis?' → '+B(fd(x.dis)):'')+(days!=null?' ('+days+' days)':'')+(x.e.entry_type?', '+esc(x.e.entry_type):'')+(x.e.source?' under '+esc(x.e.source):'')
        +(x.e.title?': '+B(x.e.title):'')+(comp.length?'; complications: '+esc(comp.join(', ')):'')+'.'+(cs.length>1?' '+cs.length+' case summaries on record.':''));
    }
    if(ep)kpis.push({label:'Inpatient day',value:daysBetween(ep.record_date,today()),sub:ward||'admitted '+fd(ep.record_date)});
    // The latest operation and why it was done.
    const evs=surgeryEvents(c).filter(e=>e.date&&e.date<=today());
    const idx=evs[evs.length-1];
    if(idx){
      const procs=uniq(idx.procs),proc=procs[0]||'surgery';
      let ind=uniq(idx.ind)[0]||'';
      if(!ind){const m=procs.join(' ').match(/\bfor\s+(.+?)(?:\s+with\s+|\s*\(|[.;]|$)/i);if(m)ind=m[1];}
      const bg=(procs.join(' ')+' '+idx.find.join(' ')+' '+c.hist.filter(e=>e.category==='consult').map(e=>e.result).join(' ')).match(/background of\s+([^).;\n]+)/i);
      const pod=daysBetween(idx.date,today());
      const ty=x=>String(fn('prettyStomaType')?global.prettyStomaType(x.type):x.type||'stoma').toLowerCase();
      const idxStoma=[].concat(
        c.stomas.filter(x=>day(x.formed_date)===idx.date).map(x=>ty(x)+(x.kind==='refashion'?' refashioned':' formed')+(x.location?' ('+x.location+')':'')),
        c.stomas.filter(x=>day(x.reversal_date)===idx.date).map(x=>ty(x)+' closed'),
        c.stomas.filter(x=>day(x.superseded_date)===idx.date).map(x=>ty(x)+' replaced'));
      // "Hartmann's procedure for <indication> with <extra>": the operation and its reason apart.
      const full=proc.replace(/\s*\(.*$/,''),fm=full.match(/^(.*?)\s+for\s+(.+?)(?:\s+with\s+(.+))?$/i);
      if(!ind&&fm)ind=fm[2];
      const opName=fm?fm[1]+(fm[3]&&!idxStoma.length?' with '+fm[3]:''):full;
      const recent=pod<=180&&!p.deceased_date;
      push('Operation',(recent?'Day '+B(pod)+' after '+B(one(opName,90))+' on ':B(cap(one(opName,90)))+' on ')+B(fd(idx.date))+(uniq(idx.by).length?' ('+esc(uniq(idx.by)[0])+')':'')
        +(idxStoma.length?' — '+idxStoma.map(esc).join('; '):'')+'.');
      const pre=c.hist.filter(e=>e.category==='imaging'&&e.entry_date&&day(e.entry_date)<=idx.date&&daysBetween(e.entry_date,idx.date)<=7)
        .sort((a,b)=>(/\bCT\b/i.test(b.title)-/\bCT\b/i.test(a.title))||day(b.entry_date).localeCompare(day(a.entry_date)))[0];
      push('Rationale',[ind?'Indication: '+B(one(ind,90))+'.':'',uniq(idx.find).length?'Findings: '+esc(one(uniq(idx.find)[0],110))+'.':'',
        bg?'Background: '+B(bg[1].trim())+'.':'',pre?'Pre-operative '+B(pre.title||'imaging')+' ('+esc(fd(pre.entry_date))+'): '+imagingHTML(pre,260):''].filter(Boolean).join(' '));
      if(recent)kpis.push({label:'Post-op day',value:pod,sub:one(procs.length?proc.replace(/\s*\(.*$/,''):idxStoma[0]||'surgery',34)});
      const post=c.hist.filter(e=>e.category==='imaging'&&e.entry_date&&day(e.entry_date)>idx.date).sort((a,b)=>day(b.entry_date).localeCompare(day(a.entry_date)))[0];
      if(post)push('Since',B(post.title||'Imaging')+' ('+esc(fd(post.entry_date))+'): '+imagingHTML(post,220));
    }
    // Stomas present.
    const now=c.stomas.filter(x=>x.present);
    kpis.push({label:'Stoma'+(now.length===1?'':'s')+' present',value:now.length,sub:now.map(x=>fn('prettyStomaType')?global.prettyStomaType(x.type):x.type).filter(Boolean).join(', ')||'none'});
    // Stoma care: appliance and complications.
    let comp=[];try{comp=fn('parseComplications')?global.parseComplications(p):[];}catch(e){comp=[];}
    const open=comp.filter(x=>x.status!=='resolved');
    let applianceLine='';
    try{const hist=fn('stomaApplianceHistory')?global.stomaApplianceHistory(p,c.rows,c.appts):null;
      now.forEach(x=>{const e=hist&&(hist.get(x.uid)||[])[0];if(!e)return;const items=e.appliances.concat(e.accessories);
        applianceLine+=(applianceLine?' ':'')+'Using '+B(items.join(' + ')||'no appliance recorded')+(e.date?' since '+esc(fd(e.date)):'')
          +(!e.first&&e.stopped.length?' ('+esc(e.stopped.join(', '))+' stopped)':'')+'.';});}catch(e){}
    const K=c.K||storyContext(c),lastRev=K.R[K.R.length-1];
    let revLine='';
    if(lastRev){const f=reviewFindings(lastRev);revLine='Last '+(lastRev.src==='clinic'?'clinic':'ward')+' review '+B(fd(lastRev.d))+(lastRev.by?' ('+esc(lastRev.by)+')':'')+(f.length?': '+esc(f.join(' · ')):'')+'.';}
    const teachNow=ep?teachingLine(K,day(ep.record_date),today()):'';
    push('Stoma care',[revLine,applianceLine,open.length?B(open.length+' open complication'+(open.length===1?'':'s'))+': '+esc(open.map(x=>{const l=(x.events||[]).slice(-1)[0];return x.text+(l&&l.trend?' ('+l.trend+')':'');}).join('; '))+'.':'No open complication recorded.',teachNow].filter(Boolean).join(' '));
    kpis.push({label:'Open complications',value:open.length,sub:open.length?one(open[0].text,30):'none',tone:open.length?'warn':''});
    // Bloods flagged by the lab, with their trend.
    const flags=labTrends(c);
    if(flags.length)push('Bloods','Flagged by the lab on their latest result: '+flags.slice(0,5).map(f=>f.html).join('; ')+(flags.length>5?' and '+(flags.length-5)+' more':'')+'.');
    if(c.hist.some(e=>e.category==='lab'))kpis.push({label:'Lab flags',value:flags.length,sub:flags.length?'latest results H/L':'none flagged',tone:flags.length?'warn':''});
    // ECG.
    const ecg=c.hist.filter(e=>e.category==='ecg'&&e.entry_date).sort((a,b)=>(day(b.entry_date)+(b.entry_time||'')).localeCompare(day(a.entry_date)+(a.entry_time||'')));
    if(ecg.length){
      const e=ecg[0],qtc=x=>{const m=String(sec(x,'Measurements')).match(/QTc\s+(-?\d+)/);return m?+m[1]:null;},q=qtc(e),qp=ecg[1]?qtc(ecg[1]):null;
      const st=sec(e,'Interpretation').split('\n').filter(x=>x&&!/^sinus rhythm$/i.test(x)).slice(0,2);
      push('ECG',esc(fd(e.entry_date))+': '+B(e.title||'no verdict')+(st.length?' — '+esc(st.join('; ')):'')+(q!=null?'; QTc '+B(q+' ms')+(qp!=null&&q!==qp?' ('+(q>qp?'+':'')+(q-qp)+' since '+esc(fd(ecg[1].entry_date))+')':''):'')+'.');
      if(q!=null)kpis.push({label:'QTc',value:q+' ms',sub:qp!=null&&q!==qp?(q>qp?'▲ +':'▼ ')+(q-qp)+' since '+fd(ecg[1].entry_date):fd(e.entry_date),tone:/abnormal/i.test(e.title||'')?'warn':''});
    }
    // Medicines and what comes next.
    const meds=c.hist.filter(e=>e.category==='poyc').map(e=>e.title).filter(Boolean);
    const disc=latestList(cs,'Treatment on discharge');
    const tx=fn('patientTreatmentSummary')?global.patientTreatmentSummary(p):'';
    let rec='';
    if(meds.length&&disc){const ch=medChanges(disc.lines,meds);
      if(ch.started.length||ch.stopped.length)rec='Against that discharge list: '+[ch.started.length?'on POYC only — '+esc(ch.started.join(', ')):'',ch.stopped.length?'not on POYC — '+esc(ch.stopped.join(', ')):''].filter(Boolean).join('; ')+'.';}
    push('Medicines',[meds.length?'On '+B(meds.length+' POYC medicine'+(meds.length===1?'':'s'))+': '+esc(meds.sort((a,b)=>a.localeCompare(b)).join(', '))+'.':'',
      disc?'Discharged '+esc(fd(disc.x.dis||disc.x.adm))+' on '+B(disc.lines.length+' medicine'+(disc.lines.length===1?'':'s'))+': '+esc(disc.lines.map(l=>l.split(' · ')[0]).join(', '))+'.':'',
      rec,tx?'Treatment record: '+esc(tx)+'.':''].filter(Boolean).join(' '));
    // Correspondence still open.
    const openC=c.comms.filter(r=>!r.parent_id&&r.status&&r.status!=='Completed');
    if(openC.length)push('Correspondence',B(openC.length+' open issue'+(openC.length===1?'':'s'))+': '+openC.slice(0,3).map(r=>esc(r.subject||'no subject')+' ('+esc(r.status==='Recorded'?'open':lcw(r.status))+(isoDay(r.communication_date)?', '+esc(fdS(r.communication_date)):'')+')').join('; ')+(openC.length>3?' and '+(openC.length-3)+' more':'')+'.');
    const nx=nextList(c);
    if(nx.length)push('Next',nx.map(x=>esc(x.label)+' '+B(x.value)).join('; ')+'.');
    return {sentences:out.filter(x=>x.html&&x.html!=='.'),kpis};
  }

  /* ---------- the clinical rationale: the story so far ----------
     The patient's course told in date order, one paragraph per admission or
     operation: why they came in (the reason written in the records), the bloods
     and imaging around it, what was done and why, how the key bloods moved
     afterwards, what the case summary records along the way, and how it ended.
     The facts and reasons come from the records; the links between them are in
     time ("on admission", "after surgery", "by discharge") and the trends are
     arithmetic — the app draws no clinical conclusion of its own. */
  const MARKERS=[
    {k:'crp',name:'CRP',re:/c\s*-?\s*reactive|\bcrp\b/i,dir:'up'},
    {k:'wcc',name:'WCC',re:/white\s*(?:blood\s*)?cell|\bwcc\b|\bwbc\b|leu[ck]ocyte/i,dir:'up'},
    {k:'hb',name:'Hb',re:/haemoglobin|hemoglobin|\bhb\b/i,not:/a1c|glycated/i,dir:'down'},
    {k:'creat',name:'creatinine',re:/creatinine/i,not:/clearance|ratio/i,dir:'up'},
    {k:'egfr',name:'eGFR',re:/egfr|estimated\s*gfr|glomerular/i,dir:'down'},
    {k:'urea',name:'urea',re:/\burea\b/i,dir:'up'},
    {k:'lact',name:'lactate',re:/lactate|\blac\b/i,dir:'up'},
    {k:'k',name:'potassium',re:/potassium/i,dir:'both'},
    {k:'na',name:'sodium',re:/\bsodium\b/i,not:/bicarb/i,dir:'both'},
    {k:'alb',name:'albumin',re:/albumin/i,dir:'down'}
  ];
  const addDays=(iso,n)=>new Date(Date.parse(day(iso))+n*864e5).toISOString().slice(0,10);
  const fdS=d=>fd(d).replace(/\s\d{4}$/,'');
  const cap=s=>String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1);
  const trimDot=s=>String(s||'').trim().replace(/[.;,\s]+$/,'');
  function markerSeries(c){
    const out={},seen=new Set();
    c.hist.filter(e=>e.category==='lab'&&e.entry_date).forEach(e=>{
      const t=String(e.title||''),m=MARKERS.find(x=>x.re.test(t)&&!(x.not&&x.not.test(t)));if(!m)return;
      const v=parseFloat(String(e.result||'').replace(/[<>\s,]/g,''));if(!isFinite(v))return;
      const when=day(e.entry_date)+' '+String(e.entry_time||'').slice(0,5),key=m.k+'|'+when+'|'+v;if(seen.has(key))return;seen.add(key);
      (out[m.k]=out[m.k]||[]).push({t:when,d:day(e.entry_date),v,raw:String(e.result).trim(),unit:String(e.lab_unit||'').trim()});
    });
    Object.values(out).forEach(a=>a.sort((x,y)=>x.t.localeCompare(y.t)));
    return out;
  }
  const val=p=>p.raw+(p.unit?' '+p.unit:'');
  // The first value of each key blood in a window: "eGFR 19 mls/min/1.73m2, creatinine 314 umol/l".
  function bloodsAt(series,from,to){
    return MARKERS.map(m=>{const p=(series[m.k]||[]).find(x=>x.d>=from&&x.d<=to);return p?m.name+' '+B(val(p)):'';}).filter(Boolean);
  }
  // How each key blood moved in a window: a peak (or low) and where it ended.
  function bloodTrends(series,from,to){
    const out=[],rel=(a,b)=>Math.abs(a-b)/Math.max(Math.abs(b),1e-9);
    MARKERS.forEach(m=>{
      const a=(series[m.k]||[]).filter(p=>p.d>=from&&p.d<=to);if(a.length<2)return;
      const f=a[0],l=a[a.length-1],hi=a.reduce((x,y)=>y.v>x.v?y:x),lo=a.reduce((x,y)=>y.v<x.v?y:x);
      const ext=m.dir==='down'?lo:m.dir==='up'?hi:(Math.abs(hi.v-f.v)>=Math.abs(lo.v-f.v)?hi:lo);
      if(ext!==f&&ext!==l&&rel(ext.v,f.v)>=0.15){
        const up=ext.v>f.v;
        out.push(m.name+' '+(up?'rose':'fell')+' from '+esc(val(f))+' to '+(up?'a peak of ':'a low of ')+B(val(ext))+' on '+esc(fdS(ext.d))
          +', then '+(l.v<ext.v?'fell':'rose')+' to '+esc(val(l))+' by '+esc(fdS(l.d)));
      }else if(rel(l.v,f.v)>=0.15){
        out.push(m.name+' '+(l.v>f.v?'rose':'fell')+' from '+esc(val(f))+' ('+esc(fdS(f.d))+') to '+B(val(l))+' ('+esc(fdS(l.d))+')');
      }
    });
    return out;
  }
  // Imaging in a window: Medical imaging results, and the reports listed in a case summary.
  function imagingIn(c,P,from,to){
    const out=[];
    c.hist.filter(e=>e.category==='imaging'&&e.entry_date&&day(e.entry_date)>=from&&day(e.entry_date)<=to)
      .forEach(e=>out.push({d:day(e.entry_date),title:e.title||'Imaging',html:imagingHTML(e,220)}));
    P.cases.forEach(x=>x.list('Investigations').forEach(l=>{
      const p=l.split(' · ');if(p.length<3)return;
      const m=p[0].match(/^(\d{2})\/(\d{2})\/(\d{4})/);if(!m)return;
      const d=m[3]+'-'+m[2]+'-'+m[1],text=p.slice(2).join(' · ');
      if(d<from||d>to||/^[<>]?\s*-?\d/.test(text))return;   // a blood result, not a report
      if(out.some(o=>o.d===d&&norm(o.title).slice(0,6)===norm(p[1]).slice(0,6)))return;
      out.push({d,title:p[1],html:imagingHTML({result:text},220)});
    }));
    return out.sort((a,b)=>a.d.localeCompare(b.d));
  }
  // "On 24/08 the patient's wound was noted …" — the dated events the doctor wrote.
  function courseEvents(x,P,pron){
    const out=[],y0=+P.start.slice(0,4),m0=+P.start.slice(5,7);
    x.list('Clinical course').forEach(par=>{
      const sents=par.split(/(?<=[.!?])\s+(?=[A-Z(])/);
      sents.forEach((s,i)=>{
        const m=s.match(/^On\s+(?:the\s+)?(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\s*,?\s*(.+)$/i);if(!m)return;
        let y=m[3]?(m[3].length===2?2000+ +m[3]:+m[3]):y0;if(!m[3]&&+m[2]<m0)y=y0+1;
        const d=y+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
        const next=sents[i+1]&&!/^On\s+(?:the\s+)?\d/i.test(sents[i+1])?' '+sents[i+1]:'';
        out.push({d,text:cap(m[4].replace(/^the patient(?:'s)?\b/i,x=>/'s$/i.test(x)?pron.poss:pron.subj))+next});
      });
    });
    return out;
  }
  // "admitted in view of worsening of his obstructive symptoms"
  function admissionReason(x){
    if(!x)return '';
    const t=x.list('Clinical course').join(' ');
    const m=t.match(/\badmitted\b[^.]*?\b(in view of|with|for|due to|because of|following)\s+([^.;]+)/i);
    return m?m[1]+' '+trimDot(m[2]):'';
  }
  const wardLike=s=>/\b(ward|bed|itu|icu|hdu|room)\b/i.test(String(s||''));
  // One more-button list: the first n items shown, the rest a tap away.
  function moreList(items,n){
    if(items.length<=n)return items.join(' ');
    return items.slice(0,n).join(' ')+'<span class="hs-rest" hidden> '+items.slice(n).join(' ')+'</span> <button type="button" class="hs-more" onclick="this.previousElementSibling.hidden=false;this.remove()">'+(items.length-n)+' more</button>';
  }
  // Admissions (case summaries and the clinic's own inpatient episodes, merged when
  // they overlap) and operations, in date order.
  function storyPeriods(c){
    const P=[];
    const add=o=>{const p=Object.assign({start:'',end:'',cases:[],eps:[],ops:[],open:false,opOnly:false},o);P.push(p);return p;};
    cases(c).slice().reverse().forEach(x=>add({start:x.adm,end:x.dis||x.adm,cases:[x]}));
    c.rows.filter(r=>r.kind==='episode'&&r.record_date).forEach(ep=>{
      const s=day(ep.record_date),open=!!(ep.is_current&&!ep.discharge_date),e=open?today():(day(ep.discharge_date)||s);
      const hit=P.find(p=>!p.opOnly&&s<=addDays(p.end,1)&&e>=addDays(p.start,-1));
      if(hit){hit.eps.push(ep);if(s<hit.start)hit.start=s;if(e>hit.end)hit.end=e;if(open)hit.open=true;}
      else add({start:s,end:e,eps:[ep],open});
    });
    surgeryEvents(c).filter(e=>e.date).forEach(ev=>{
      const hit=P.find(p=>!p.opOnly&&ev.date>=addDays(p.start,-1)&&ev.date<=addDays(p.end,1));
      if(hit)hit.ops.push(ev);else add({start:ev.date,end:ev.date,ops:[ev],opOnly:true});
    });
    P.forEach(p=>p.ops.sort((a,b)=>a.date.localeCompare(b.date)));
    return P.sort((a,b)=>a.start.localeCompare(b.start));
  }
  function opSentence(c,o,pron,inAdmission){
    const procs=uniq(o.procs),full=(procs[0]||'').replace(/\s*\(.*$/,''),fm=full.match(/^(.*?)\s+for\s+(.+?)(?:\s+with\s+(.+))?$/i);
    const ty=x=>String(fn('prettyStomaType')?global.prettyStomaType(x.type):x.type||'stoma').toLowerCase();
    const stomas=[].concat(
      c.stomas.filter(x=>day(x.formed_date)===o.date).map(x=>ty(x)+(x.kind==='refashion'?' refashioned':' formed')+(x.location?' ('+x.location+')':'')),
      c.stomas.filter(x=>day(x.reversal_date)===o.date).map(x=>ty(x)+' closed'),
      c.stomas.filter(x=>day(x.superseded_date)===o.date).map(x=>ty(x)+' replaced'));
    let ind=uniq(o.ind)[0]||(fm?fm[2]:'');
    const name=fm?fm[1]+(fm[3]&&!stomas.length?' with '+fm[3]:''):full;
    const outside=c.p.operated_abroad&&day(c.p.surgery_date)===o.date;
    const bg=(procs.join(' ')+' '+o.find.join(' ')).match(/background of\s+([^).;\n]+)/i);
    return 'On '+B(inAdmission?fdS(o.date):fd(o.date))+' '+pron.subj+' underwent '+B(name||'surgery')
      +(uniq(o.by).length?' ('+esc(uniq(o.by)[0])+')':'')+(outside?', operated outside MDH'+(c.p.operated_abroad_hospital?' ('+esc(c.p.operated_abroad_hospital)+')':''):'')
      +(ind&&!norm(name).includes(norm(ind))?' for '+B(lc1(trimDot(ind))):'')
      +(uniq(o.find).length?'; findings: '+esc(lc1(trimDot(uniq(o.find)[0])))+'':'')
      +(stomas.length?' — '+esc(stomas.join('; ')):'')+(bg?' (background of '+esc(trimDot(bg[1]))+')':'')+'.';
  }
  // "Chronic Kidney Disease" → "chronic kidney disease" mid-sentence (acronyms kept).
  function lc1(t){
    t=String(t||'').trim();
    if(/^([A-Z][a-z]+)(\s+[A-Z][a-z]+)+$/.test(t))return t.toLowerCase();
    return /^[A-Z][a-z]/.test(t)||/^(?:A|An|The|His|Her|He|She|They|It|This|There|On)\s/.test(t)?t.charAt(0).toLowerCase()+t.slice(1):t;
  }
  // The reason, without the words of the operation itself ("DAMA Laparotomy +
  // Adhesiolysis Small Bowel Obstruction" for a laparotomy with adhesiolysis →
  // "small bowel obstruction").
  function reasonOnly(ind,proc){
    const pw=new Set(String(proc||'').toLowerCase().split(/[^a-z]+/).filter(w=>w.length>3));
    const left=String(ind||'').split(/\s+/).filter(w=>!pw.has(w.toLowerCase().replace(/[^a-z]/g,''))&&!/^(?:\+|&|and|with|dama|for)$/i.test(w));
    return left.length?left.join(' '):String(ind||'');
  }
  /* ---------- every other dated detail, for the story ----------
     The nursing reviews (ward encounters and seen clinic visits), appliance
     changes, referrals, the stoma siting, correspondence, iCM notes, ECGs and
     complications — each a dated item, so it falls into the admission, or the
     time between admissions, it belongs to. Nothing is concluded from them: the
     reviews are told as what was recorded, and what changed since the one before. */
  const arr=x=>Array.isArray(x)?x:[];
  const lcw=s=>String(s||'').trim().toLowerCase();
  const isoDay=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):'';
  const titleCase=x=>String(x||'Stoma').replace(/(^|[\s\-\/(])([a-z])/g,(m,a,b)=>a+b.toUpperCase());
  // A review's or a letter's note with its formatting marks (**bold**, {red}…) taken out.
  const plainNotes=t=>String(t||'').replace(/\{\/?(?:red|orange|green|blue|purple)\}/g,'').replace(/\*\*|__/g,'').replace(/\*([^*\n]+?)\*/g,'$1').replace(/\s+/g,' ').trim();
  const on=d=>'On '+esc(fdS(d))+', ';
  function skinText(s){
    s=s||{};
    if(s.status==='Healthy')return 'healthy';
    if(s.status==='Not healthy')return 'not healthy'+(arr(s.problems).length?' ('+arr(s.problems).map(lcw).join(', ')+')':'');
    if(s.status==='Not assessed')return 'not assessed (flange in situ)';
    return '';
  }
  function reviewStoma(x,all){
    let name='';try{const je=global.JasonEncounters;name=x.name||(je&&je.stomaName?je.stomaName(x,all):'');}catch(e){name='';}
    return {key:String(x.uid||x.type||name||''),name:name||titleCase(String(x.type||'Stoma').toLowerCase()),colour:String(x.colour||'').trim(),
      output:arr(x.output).map(o=>String(o).trim()).filter(Boolean),skin:skinText(x.skin),
      rod:x.rod_asked===false?null:(x.rod&&typeof x.rod==='object'?x.rod:null),notes:plainNotes(x.notes)};
  }
  // Ward encounters and the reviews of seen clinic visits, oldest first, each
  // from its latest signed version: per stoma its colour, output, skin and rod.
  function reviews(c){
    const out=[],je=global.JasonEncounters,vr=global.VisitStomaReview;
    c.enc.forEach(e=>{
      let v=null;try{v=je&&je.versions?je.versions(e).slice(-1)[0]:null;}catch(_){v=null;}
      const s=(v&&v.snapshot)||{},all=arr(s.stomas);
      out.push({src:'ward',id:String(e.id),d:day(e.encounter_date||e.created_at),t:String(e.created_at||''),by:(v&&v.author_name)||e.created_by_name||'',
        stomas:all.map(x=>reviewStoma(x,all)),notes:plainNotes(s.notes),infection:s.infection||null,teaching:s.teaching_plan||null,discharge:s.discharge_plan||null});
    });
    c.appts.filter(a=>a.status==='attended'&&!a.community_followup).forEach(a=>{
      let rows=[];try{rows=vr&&vr.rowsOf?arr(vr.rowsOf(a.stoma_assessment)):[];}catch(_){rows=[];}
      rows=rows.filter(x=>x&&typeof x==='object');
      out.push({src:'clinic',id:String(a.id),d:day(a.appt_date),t:String(a.appt_slot||''),by:(a.staff&&a.staff.full_name)||(a.bank_staff&&a.bank_staff.full_name)||'',
        stomas:rows.map(x=>reviewStoma(x,rows)),notes:'',complications:String(a.complication_review||'').replace(/-/g,' ').trim()});
    });
    return out.filter(r=>r.d).sort((a,b)=>(a.d+a.t).localeCompare(b.d+b.t));
  }
  const rodText=r=>!r?'':r.status==='Removed'?'rod removed'+(isoDay(r.removed)?' '+fdS(r.removed):''):r.status==='In place'?'rod in place'+(isoDay(r.due)?' (removal planned '+fdS(r.due)+')':''):'';
  // "healthy pink; output flatus present; peristomal skin healthy"
  function stomaFindings(x){
    return [x.colour?lcw(x.colour):'',x.output.length?'output '+x.output.map(lcw).join(', '):'',x.skin?'peristomal skin '+x.skin:'',rodText(x.rod)].filter(Boolean).join('; ');
  }
  const reviewFindings=r=>r.stomas.map(x=>{const f=stomaFindings(x);return f?lcw(x.name)+' '+f:'';}).filter(Boolean);
  const infectionText=i=>!i||!i.status||/^not recorded$/i.test(i.status)?'':lcw([i.organism,i.status].filter(Boolean).join(' · '));
  // The ward reviews in a window, told as the stoma's course: the first review
  // of each stoma in full, then only what changed since the review before (the
  // colour, the output, the skin, the rod, the infection status) and any note.
  function wardEvents(K,from,to){
    const ev=[],last=new Map();let inf='';
    K.R.filter(r=>r.src==='ward'&&r.d>=from&&r.d<=to).forEach(r=>{
      const bits=[],notes=[];
      r.stomas.forEach(x=>{
        const prev=last.get(x.key),outs=x.output.map(lcw).sort().join('|');
        if(!prev){const f=stomaFindings(x);if(f)bits.push(lcw(x.name)+' '+f);}
        else{
          const ch=[];
          if(x.colour&&lcw(x.colour)!==lcw(prev.colour))ch.push('colour now '+lcw(x.colour));
          if(outs&&outs!==prev.outs)ch.push('output now '+x.output.map(lcw).join(', '));
          if(x.skin&&x.skin!==prev.skin)ch.push('peristomal skin '+(x.skin==='healthy'&&/^not healthy/.test(prev.skin)?'healthy again':x.skin));
          if(x.rod&&x.rod.status==='Removed'&&!(prev.rod&&prev.rod.status==='Removed'))ch.push(rodText(x.rod));
          if(ch.length)bits.push(lcw(x.name)+' '+ch.join('; '));
        }
        const p0=prev||{};
        last.set(x.key,{colour:x.colour||p0.colour||'',skin:x.skin||p0.skin||'',rod:x.rod||p0.rod||null,outs:outs||p0.outs||''});
        if(x.notes)notes.push((r.stomas.length>1?x.name+': ':'')+x.notes);
      });
      const i=infectionText(r.infection);if(i&&i!==inf){bits.push('infection status '+i);inf=i;}
      if(r.notes)notes.push(r.notes);
      if(!bits.length&&!notes.length)return;
      const who=r.by?' ('+esc(r.by)+')':'';
      const note=notes.length?textMore(cap(notes.join(' ')),160,true):'';
      ev.push({d:r.d,html:bits.length?on(r.d)+'the stoma nursing review'+who+' recorded '+esc(bits.join(' · '))+'.'+(note?' Noted: '+note:'')
        :on(r.d)+'the stoma nursing review'+who+' noted: '+note});
    });
    return ev;
  }
  // "Stoma teaching: 6 of 9 steps achieved (latest on 29/08: empty bag); still to achieve: …"
  function teachingLine(K,from,to){
    const r=K.R.filter(x=>x.src==='ward'&&x.d>=from&&x.d<=to&&x.teaching&&arr(x.teaching.items).length).pop();if(!r)return '';
    const items=arr(r.teaching.items).filter(i=>i&&i.key),done=items.filter(i=>i.done),left=items.filter(i=>!i.done);
    const short=k=>{const s=lcw(k).replace(/\s*\(.*?\)\s*/g,' ').replace(/\s+/g,' ').trim();return /^patient has seen/.test(s)?'seen the stoma and a first change':s.replace(/^able to\s+/,'');};
    const latest=done.filter(i=>isoDay(i.date)).sort((a,b)=>String(a.date).localeCompare(String(b.date))).pop();
    return 'Stoma teaching: '+B(done.length+' of '+items.length)+' steps achieved'+(latest?' (latest on '+esc(fdS(latest.date))+': '+esc(short(latest.key))+')':'')
      +(left.length&&done.length?'; still to achieve: '+esc(left.map(i=>short(i.key)).join(', ')):'')+(String(r.teaching.note||'').trim()?' — '+esc(trimDot(r.teaching.note)):'')+'.';
  }
  const DISCHARGE_PREP=[['appliance_dispensing','appliance dispensing discussed'],['schedule_v','Schedule V and prescriptions given'],['home_supply','home supply brought'],
    ['info_literature','information and clinic contacts given'],['stoma_clinic_followup','stoma clinic follow-up arranged']];
  function dischargeLine(K,from,to){
    const r=K.R.filter(x=>x.src==='ward'&&x.d>=from&&x.d<=to&&x.discharge).pop();if(!r)return '';
    const dp=r.discharge,yes=DISCHARGE_PREP.filter(([k])=>dp[k]==='Yes').map(x=>x[1]),no=DISCHARGE_PREP.filter(([k])=>dp[k]==='No').map(x=>x[1]);
    if(dp.community_nurse&&dp.community_nurse!=='No')yes.push('community nurse '+(dp.community_nurse==='BD'?'BD':lcw(dp.community_nurse)));else if(dp.community_nurse==='No')no.push('community nurse');
    const com=trimDot(plainNotes(dp.comments));
    if(!yes.length&&!no.length&&!com)return '';
    return 'Discharge preparation'+(isoDay(dp.updated)?' ('+esc(fdS(dp.updated))+')':'')+': '+esc(yes.join(', ')||'nothing ticked yet')+(no.length?'; not done: '+esc(no.join(', ')):'')+(com?'; '+esc(com):'')+'.';
  }
  // Appliance set or changed in a window, with the stoma named.
  function applianceEvents(c,K,from,to,src){
    const out=[];if(!K.H)return out;
    K.H.forEach((evs,uid)=>{
      const st=c.stomas.find(x=>String(x.uid)===String(uid));
      const name=st?lcw(fn('prettyStomaType')?global.prettyStomaType(st.type):st.type||'stoma'):'stoma';
      arr(evs).forEach(e=>{
        const d=day(e.date);if(!d||d<from||d>to||(src&&e.source!==src))return;
        const items=arr(e.appliances).concat(arr(e.accessories));
        if(e.first){if(items.length)out.push({d,text:name+' appliance: '+items.join(' + ')});}
        else if(arr(e.added).length||arr(e.stopped).length)out.push({d,text:name+' appliance changed — '+[arr(e.added).length?'started '+e.added.join(', '):'',arr(e.stopped).length?'stopped '+e.stopped.join(', '):''].filter(Boolean).join('; ')});
      });
    });
    return out;
  }
  const byDay=list=>{const m=new Map();list.forEach(e=>{if(!m.has(e.d))m.set(e.d,[]);m.get(e.d).push(e.text);});return [...m].map(([d,t])=>({d,o:7,html:on(d)+esc(t.join('; '))+'.'}));};
  // Clinic visits in a window: seen (with the review), DNTU, cancelled, tele follow-up.
  function visitEvents(c,K,from,to){
    const out=[];
    c.appts.forEach(a=>{
      const d=day(a.appt_date);if(!d||d<from||d>to||d>today())return;
      if(a.community_followup){
        const fb=plainNotes(a.comcare_feedback);
        out.push({d,o:2,html:on(d)+'tele follow-up through Comcare'+(fb?': '+textMore(cap(fb),160,true):isoDay(a.comcare_email_sent_date)?' — request emailed on '+esc(fdS(a.comcare_email_sent_date))+', feedback awaited.':'.')});
        return;
      }
      if(a.status==='did_not_attend'){out.push({d,o:2,html:on(d)+'did not turn up for the stoma clinic appointment (DNTU).'});return;}
      if(a.status==='cancelled'){out.push({d,o:2,html:on(d)+'the stoma clinic appointment was cancelled.'});return;}
      if(a.status!=='attended')return;
      const r=K.R.find(x=>x.src==='clinic'&&x.id===String(a.id)),find=r?reviewFindings(r):[];
      const notes=r?r.stomas.filter(x=>x.notes).map(x=>(r.stomas.length>1?x.name+': ':'')+x.notes).join(' '):'';
      const appl=applianceEvents(c,K,d,d,'followup').map(x=>x.text);
      out.push({d,o:2,html:on(d)+'seen in the stoma clinic'+(r&&r.by?' by '+esc(r.by):'')+(find.length?': '+esc(find.join(' · ')):'')+'.'
        +(appl.length?' '+esc(cap(appl.join('; ')))+'.':'')+(r&&r.complications?' Complication review: '+esc(r.complications)+'.':'')+(notes?' Noted: '+textMore(cap(notes),160,true):'')});
    });
    return out;
  }
  // Referrals, the stoma siting, correspondence, iCM notes and ECGs in a window.
  function otherEvents(c,K,from,to){
    const T=[],inW=d=>!!d&&d>=from&&d<=to;
    K.refs.forEach(r=>{
      const who=lcw(r.profession),rd=isoDay(r.referred_on),sd=isoDay(r.seen_on);
      if(inW(rd))T.push({d:rd,o:8,html:on(rd)+'referred to the '+esc(who)+(r.referred_by?' (by '+esc(r.referred_by)+')':'')+'.'});
      if(r.seen&&inW(sd))T.push({d:sd,o:8,html:on(sd)+'seen by the '+esc(who)+'.'});
    });
    const s=c.siting,sd=s&&isoDay(s.session_date);
    if(s&&inW(sd)&&sd<=today()&&s.status!=='cancelled'){
      let ck=null;try{ck=fn('sitingChecklistOf')?global.sitingChecklistOf(s):null;}catch(e){ck=null;}
      const marks=ck&&Array.isArray(ck.stoma_marks)?ck.stoma_marks.length:ck&&ck.stoma_mark?1:0;
      T.push({d:sd,o:0,html:on(sd)+'pre-operative stoma siting'+(s.siting_for?' for '+B(lcw(s.siting_for)):'')+(s.proposed_operation?' (proposed operation: '+esc(s.proposed_operation)+')':'')
        +(s.consultant?' under '+esc(s.consultant):'')+(marks?' — '+marks+' site'+(marks===1?'':'s')+' marked':s.status==='done'?' — seen':'')+'.'});
    }
    c.comms.forEach(r=>{
      const d=isoDay(r.communication_date);if(!inW(d))return;
      const root=r.parent_id?c.comms.find(x=>String(x.id)===String(r.parent_id)):null;
      const subj=r.subject||(root&&root.subject)||'',who=[r.contact_name,r.service].filter(Boolean).join(', ');
      const st=r.status&&!/^(recorded|completed)$/i.test(r.status)?' ['+esc(lcw(r.status))+']':'';
      const n=plainNotes(r.notes);
      T.push({d,o:9,html:on(d)+esc(lcw(r.method)||'contact')+' — '+(r.kind==='community'?'community':'patient')+' correspondence'+(who?' with '+esc(who):'')
        +(subj?(root?', follow-up on ':': ')+B(subj):'')+st+'.'+(n?' '+textMore(cap(n),140,true):'')});
    });
    c.hist.filter(e=>e.category==='doc_icm'&&inW(day(e.entry_date))).forEach(e=>{
      const t=plainNotes(e.result||e.title);if(t)T.push({d:day(e.entry_date),o:6,html:on(e.entry_date)+'iCM note'+(e.entry_type?' ('+esc(e.entry_type)+')':'')+': '+textMore(cap(t),160,true)});
    });
    c.hist.filter(e=>e.category==='ecg'&&inW(day(e.entry_date))).forEach(e=>{
      const q=String(sec(e,'Measurements')).match(/QTc\s+(-?\d+)/);
      T.push({d:day(e.entry_date),o:4,html:on(e.entry_date)+'the ECG read '+B(e.title||'no verdict')+(q?' with a QTc of '+esc(q[1])+' ms':'')+'.'});
    });
    return T;
  }
  function complicationEvents(K,from,to){
    return K.comp.filter(k=>{const d=day(k.date);return d&&d>=from&&d<=to;}).map(k=>({d:day(k.date),o:5,text:k.text,
      html:on(k.date)+'a complication was recorded: '+B(k.text)+(k.status==='resolved'?' (since resolved'+(isoDay(k.resolved_date)?' on '+esc(fdS(k.resolved_date)):'')+')':'')+'.'}));
  }
  // The last set of key bloods in a window: "on 12/10: CRP 4 mg/L, Hb 13.1 g/dL".
  function lastBloods(series,from,to){
    let last='';MARKERS.forEach(m=>(series[m.k]||[]).forEach(p=>{if(p.d>=from&&p.d<=to&&p.d>last)last=p.d;}));
    if(!last)return null;
    return {d:last,list:MARKERS.map(m=>{const a=(series[m.k]||[]).filter(p=>p.d===last);return a.length?m.name+' '+B(val(a[a.length-1])):'';}).filter(Boolean)};
  }
  // Results beyond the key bloods that the lab flagged in a window (latest of each test).
  function flaggedIn(c,from,to){
    const last=new Map(),key=x=>day(x.entry_date)+' '+(x.entry_time||'');
    c.hist.filter(e=>e.category==='lab'&&e.entry_date&&String(e.lab_flag||'').trim()&&day(e.entry_date)>=from&&day(e.entry_date)<=to).forEach(e=>{
      const t=String(e.title||'');if(MARKERS.some(m=>m.re.test(t)&&!(m.not&&m.not.test(t))))return;
      const k=norm(e.entry_type)+'|'+norm(t),cur=last.get(k);if(!cur||key(e)>key(cur))last.set(k,e);
    });
    return [...last.values()].sort((a,b)=>key(a).localeCompare(key(b))).map(e=>B(shortTest(e.title)+' '+e.result+(e.lab_unit?' '+e.lab_unit:''))+' ('+esc(e.lab_flag)+', '+esc(fdS(e.entry_date))+')');
  }
  /* Medicines matched on the generic name (assets/clinical-history.js does the
     same for the medication history), so "Amlodipine 10mg daily" and
     "AMLODIPINE 5MG TABLETS" are one medicine. */
  const medKeyOf=n=>{const CH=global.ClinicalHistory;if(CH&&CH.medKey)return CH.medKey(n);return lcw(n).replace(/[^a-z0-9 ]+/g,' ').trim().split(/\s+/)[0]||'';};
  const medNameOf=l=>{const CH=global.ClinicalHistory;const s=CH&&CH.medSplit?CH.medSplit(l):{name:String(l||'').split(' · ')[0]};return trimDot(s.name);};
  function medChanges(before,after){
    const map=list=>{const m=new Map();arr(list).forEach(l=>{const n=medNameOf(l),k=medKeyOf(n);if(k&&!m.has(k))m.set(k,n);});return m;};
    const b=map(before),a=map(after);
    return {started:[...a].filter(([k])=>!b.has(k)).map(([,n])=>n),stopped:[...b].filter(([k])=>!a.has(k)).map(([,n])=>n)};
  }
  function storyContext(c){
    let H=null;try{H=fn('stomaApplianceHistory')?global.stomaApplianceHistory(c.p,c.rows,c.appts):null;}catch(e){H=null;}
    let comp=[];try{comp=fn('parseComplications')?global.parseComplications(c.p)||[]:[];}catch(e){comp=[];}
    let refs=[];try{const je=global.JasonEncounters;refs=je&&je.patientReferrals?je.patientReferrals(c.p):[];}catch(e){refs=[];}
    let R=[];try{R=reviews(c);}catch(e){R=[];}
    return {R,H,comp,refs,series:markerSeries(c),csAsc:cases(c).slice().reverse()};
  }
  // What is planned next: the operation, a booked siting, the reversal, the rod,
  // correspondence follow-ups and the clinic (next / last appointment, due month).
  function nextList(c){
    const p=c.p,t=today(),out=[];
    const st=fn('normaliseFollowupStatus')?global.normaliseFollowupStatus(p.followup_status):String(p.followup_status||'');
    if(st==='deceased'||p.deceased_date)return out;
    if(isoDay(p.upcoming_surgery_date)&&day(p.upcoming_surgery_date)>=t)out.push({label:'Surgery planned',value:fd(p.upcoming_surgery_date)});
    const s=c.siting,sd=s&&isoDay(s.session_date);
    if(sd&&sd>t&&!/^(cancelled|done)$/.test(String(s.status||'')))out.push({label:'Stoma siting booked',value:fd(sd)+(s.siting_for?' · '+s.siting_for:'')});
    if(isoDay(p.proposed_reversal_date)&&st!=='reversed')out.push({label:'Proposed reversal',value:fd(p.proposed_reversal_date)});
    if(isoDay(p.rod_removal_date)&&!isoDay(p.rod_removed_date))out.push({label:'Rod removal planned',value:fd(p.rod_removal_date)});
    c.comms.filter(r=>!r.parent_id&&r.status!=='Completed'&&isoDay(r.followup_date)).forEach(r=>out.push({label:'Correspondence follow-up',value:fd(r.followup_date)+(r.followup_action?' · '+r.followup_action:r.subject?' · '+r.subject:'')}));
    const f=global.patientFollowupSummary;
    if(f&&String(f.patientId)===String(p.id))(f.items||[]).forEach(x=>out.push({label:x.label,value:x.value}));
    return out;
  }
  /* The time between admissions (and before the first, and since the last
     discharge), told only when something happened in it: clinic visits, tele
     follow-ups, correspondence, imaging, ECGs, bloods, referrals, the siting. */
  function gapItems(c,K,from,to,nextStart){
    const T=[].concat(visitEvents(c,K,from,to),otherEvents(c,K,from,to),complicationEvents(K,from,to),
      wardEvents(K,from,to).map(e=>({d:e.d,o:6,html:e.html})),byDay(applianceEvents(c,K,from,to,'inpatient')));
    // Imaging in the two days before an admission is told with that admission.
    const imgTo=nextStart&&addDays(nextStart,-3)<to?addDays(nextStart,-3):to;
    c.hist.filter(e=>e.category==='imaging'&&e.entry_date&&day(e.entry_date)>=from&&day(e.entry_date)<=imgTo)
      .forEach(e=>T.push({d:day(e.entry_date),o:1,html:on(e.entry_date)+esc(e.title||'Imaging')+' showed: '+imagingHTML(e,220)}));
    return T.sort((a,b)=>a.d.localeCompare(b.d)||a.o-b.o);
  }
  function withGaps(c,K,P){
    const out=[],now=today();
    const mk=(from,to,label,nextStart)=>{
      if(!label||from>to)return;
      const bTo=nextStart&&addDays(nextStart,-2)<to?addDays(nextStart,-2):to;
      const items=gapItems(c,K,from,to,nextStart);
      const bd=[];MARKERS.forEach(m=>(K.series[m.k]||[]).forEach(v=>{if(v.d>=from&&v.d<=bTo)bd.push(v.d);}));
      if(!items.length&&!bd.length)return;
      const ds=items.map(i=>i.d).concat(bd).sort();
      out.push({gap:true,label,from,to:bTo,start:ds[0],end:ds[ds.length-1],items});
    };
    if(!P.length){mk('1900-01-01',now,'Clinic follow-up','');return out;}
    mk('1900-01-01',addDays(P[0].start,-1),'Before '+(P[0].opOnly?'the operation':'the admission'),P[0].start);
    let maxEnd='';
    P.forEach((a,i)=>{
      out.push(a);if(a.end>maxEnd)maxEnd=a.end;
      const b=P[i+1];
      if(b)mk(addDays(maxEnd,1),addDays(b.start,-1),'Between '+(a.opOnly||b.opOnly?'episodes':'admissions'),b.start);
      else if(!a.open)mk(addDays(maxEnd,1),now,a.opOnly?'Since the operation':'Since discharge','');
    });
    return out;
  }
  // A period's lines: the dated events one per line (the rest a tap away), and
  // each other sentence group on a line of its own.
  const evLine=h=>'<span class="hs-ev">'+h+'</span>';
  const lines=S=>S.filter(Boolean).map(x=>/^<span class="hs-ev">/.test(x)?x:evLine(x)).join(' ');
  function gapPeriod(c,P,K){
    const S=[];
    if(P.items.length)S.push(moreList(P.items.map(t=>evLine(t.html)),10));
    const tr=bloodTrends(K.series,P.from,P.to);
    if(tr.length)S.push('Bloods over this time: '+tr.join('; ')+'.');
    else{const lb=lastBloods(K.series,P.from,P.to);if(lb&&lb.list.length)S.push('Bloods on '+esc(fdS(lb.d))+': '+lb.list.join(', ')+'.');}
    const fl=flaggedIn(c,P.from,P.to);if(fl.length)S.push('Flagged by the lab: '+fl.join('; ')+'.');
    return {head:fd(P.start)+(P.end&&P.end!==P.start?' → '+fd(P.end):'')+' · '+P.label,html:lines(S)};
  }
  function storyPeriod(c,P,K,pron){
    if(P.gap)return gapPeriod(c,P,K);
    const S=[],x=P.cases[0]||null,ep=P.eps[0]||null,series=K.series;
    if(P.opOnly){
      P.ops.forEach(o=>S.push(opSentence(c,o,pron,false)));
      const tr=bloodTrends(series,P.start,addDays(P.start,7));if(tr.length)S.push('Afterwards '+tr.join('; ')+'.');
      return {head:fd(P.start)+' · Operation',html:lines(S)};
    }
    const ward=(x&&x.e.entry_type)||(ep&&(ep.ward||(P.open?c.p.inpatient_ward:'')))||(ep&&wardLike(ep.detail)?ep.detail:'')||'';
    const reason=admissionReason(x)||(ep&&ep.detail&&!wardLike(ep.detail)?ep.detail:'');
    const intro=[cap(pron.subj)+' was admitted'+(ward?' to '+B(ward):'')+(x&&x.e.source?' under '+esc(x.e.source):'')+' on '+B(fd(P.start))
      +(reason?' '+esc(reason):'')+'.'+(x&&x.e.title?' Diagnosis: '+B(x.e.title)+'.':'')];
    // The medicines on admission against the discharge list of the stay before.
    if(x){
      const prev=K.csAsc.filter(y=>y.adm<x.adm&&y.list('Treatment on discharge').length).pop(),admMeds=x.list('Medications on admission');
      if(prev&&admMeds.length){const ch=medChanges(prev.list('Treatment on discharge'),admMeds);
        if(ch.started.length||ch.stopped.length)intro.push('Medicines on admission, against the discharge list of '+esc(fd(prev.dis||prev.adm))+': '
          +[ch.started.length?'new — '+esc(ch.started.join(', ')):'',ch.stopped.length?'no longer listed — '+esc(ch.stopped.join(', ')):''].filter(Boolean).join('; ')+'.');}
    }
    const firstOp=P.ops.length?P.ops[0].date:'';
    // On admission: the bloods before anything was done.
    const adm=bloodsAt(series,addDays(P.start,-1),addDays(P.start,1));
    if(adm.length)intro.push('On admission: '+adm.join(', ')+'.');
    S.push(intro.join(' '));
    // Then everything dated, in order — imaging, operations, what the doctor
    // recorded day by day, the nursing reviews, appliance changes, ECGs, iCM
    // notes, referrals, correspondence and complications — so one leads to the next.
    const T=[];
    imagingIn(c,P,addDays(P.start,-2),P.end).forEach(i=>T.push({d:i.d,o:1,html:'On '+esc(fdS(i.d))+', '+esc(i.title)+' showed: '+i.html}));
    P.ops.forEach(o=>{
      const s0=opSentence(c,o,pron,true);
      T.push({d:o.date,o:2,html:x?s0.replace(/ for <b>([^<]*)<\/b>/,(m,ind)=>{const r=reasonOnly(ind,uniq(o.procs)[0]);return r?' for <b>'+esc(lc1(r))+'</b>':'';}):s0});
    });
    if(x)courseEvents(x,P,pron).forEach(e=>T.push({d:e.d,o:3,html:'On '+esc(fdS(e.d))+', '+esc(lc1(e.text))}));
    wardEvents(K,P.start,P.end).forEach(e=>T.push({d:e.d,o:6,html:e.html}));
    byDay(applianceEvents(c,K,P.start,P.end,'inpatient')).forEach(e=>T.push(e));
    visitEvents(c,K,P.start,P.end).forEach(e=>T.push(e));
    otherEvents(c,K,P.start,P.end).forEach(e=>T.push(e));
    let undated=x?x.list('Complications'):[];
    complicationEvents(K,P.start,P.end).forEach(k=>{undated=undated.filter(u=>norm(u)!==norm(k.text));T.push(k);});
    T.sort((a,b)=>a.d.localeCompare(b.d)||a.o-b.o);
    if(T.length)S.push(moreList(T.map(t=>evLine(t.html)),10));
    // How the bloods moved: after surgery, and from admission to the last result.
    const tr=bloodTrends(series,firstOp||P.start,P.end),named=new Set(tr.map(t=>t.split(' ')[0]));
    const across=bloodTrends(series,P.start,P.end).filter(t=>!named.has(t.split(' ')[0]));
    if(tr.length)S.push((firstOp?'After surgery, ':'During the admission, ')+tr.join('; ')+'.');
    if(across.length)S.push((tr.length?'Across the admission, ':'During the admission, ')+across.join('; ')+'.');
    const fl=flaggedIn(c,P.start,P.end);if(fl.length)S.push('Also flagged by the lab: '+fl.join('; ')+'.');
    if(undated.length)S.push('Complications recorded: '+B(undated.map(lc1).join(', '))+'.');
    // The stoma nurse's teaching and discharge preparation during the stay.
    const teach=teachingLine(K,P.start,P.end),prep=dischargeLine(K,P.start,P.end);
    if(teach)S.push(teach);if(prep)S.push(prep);
    // How it ended.
    if(P.open){
      const pod=firstOp?daysBetween(P.ops[P.ops.length-1].date,today()):null;
      S.push(cap(pron.subj)+' is still an inpatient — day '+B(daysBetween(P.start,today()))+(pod!=null?', day '+B(pod)+' after surgery':'')+'.');
    }else if(x&&x.dis){
      const plan=x.list('Plan').slice(0,3).map(t=>lc1(trimDot(t))),dis=x.list('Treatment on discharge'),admMeds=x.list('Medications on admission');
      const ch=admMeds.length&&dis.length?medChanges(admMeds,dis):{started:[],stopped:[]};
      const fu=x.list('Follow-up').map(trimDot).filter(Boolean),pend=x.list('Pending investigations').map(trimDot).filter(Boolean);
      S.push(cap(pron.subj)+' was discharged on '+B(fd(x.dis))+' after '+daysBetween(P.start,x.dis)+' days'+(dis.length?', on '+dis.length+' medicine'+(dis.length===1?'':'s'):'')+'.'
        +(ch.started.length||ch.stopped.length?' During the stay: '+[ch.started.length?'started '+esc(ch.started.join(', ')):'',ch.stopped.length?'stopped '+esc(ch.stopped.join(', ')):''].filter(Boolean).join('; ')+'.':'')
        +(plan.length?' Plan: '+esc(plan.join('; '))+'.':'')+(fu.length?' Follow-up: '+esc(fu.join('; '))+'.':'')+(pend.length?' Pending: '+esc(pend.join('; '))+'.':''));
    }else if(ep&&ep.discharge_date)S.push(cap(pron.subj)+' was discharged on '+B(fd(ep.discharge_date))+'.');
    const head=fd(P.start)+(P.open?' – now':P.end&&P.end!==P.start?' → '+fd(P.end):'')+' · Admission';
    return {head,html:lines(S)};
  }
  function story(c){
    const p=c.p,sex=/^f/i.test(p.sex||'')?'f':/^m/i.test(p.sex||'')?'m':'';
    const pron=sex==='f'?{subj:'she',poss:'her'}:sex==='m'?{subj:'he',poss:'his'}:{subj:'the patient',poss:'the patient’s'};
    const K=c.K||storyContext(c),out=[],cs=cases(c),series=K.series;
    // Background: who the patient is before the story starts.
    const age=ageOf(p);
    const pmh=latestList(cs,'Past medical history'),psh=latestList(cs,'Past surgical history'),soc=latestList(cs,'Social history'),al=allergies(cs);
    const fun=latestList(cs,'Functional status'),fam=latestList(cs,'Family history');
    const ty=x=>String(fn('prettyStomaType')?global.prettyStomaType(x.type):x.type||'stoma').toLowerCase();
    const st0=c.stomas.map(x=>ty(x)+(x.formed_date?' (formed '+fd(x.formed_date)+(x.reversal_date?', closed '+fd(x.reversal_date):'')+')':'')+(x.present?'':' — no longer present'));
    const bgS=[(age!=null?B(age+'-year-old')+' '+(sex==='f'?'woman':sex==='m'?'man':'patient'):sex==='f'?'Woman':sex==='m'?'Man':'Patient')+(p.consultant?' under '+esc(p.consultant):'')+(p.deceased_date&&age!=null?' (age at death)':'')+'.',
      pmh?'Background of '+pmh.lines.map(x=>B(lc1(trimDot(x)))).join('; ')+'.':'',
      psh?'Previous surgery: '+esc(psh.lines.map(trimDot).join('; '))+'.':'',
      al.length?'Allergies: '+B(al.join(', '))+'.':'',
      soc?'Social: '+esc(soc.lines.map(trimDot).join('; '))+'.':'',
      fun?'Functional status: '+esc(fun.lines.map(trimDot).join('; '))+'.':'',
      fam?'Family history: '+esc(fam.lines.map(trimDot).join('; '))+'.':'',
      st0.length?'Stomas: '+esc(st0.join('; '))+'.':''].filter(Boolean);
    out.push({head:'Background',html:bgS.join(' ')});
    const P=storyPeriods(c);
    withGaps(c,K,P).forEach(x=>{try{const s=storyPeriod(c,x,K,pron);if(s&&s.html)out.push(s);}catch(e){}});
    // How the follow-up ended, when it has.
    const fst=fn('normaliseFollowupStatus')?global.normaliseFollowupStatus(p.followup_status):'';
    if(isoDay(p.deceased_date)||fst==='deceased')out.push({head:(isoDay(p.deceased_date)?fd(p.deceased_date)+' · ':'')+'Outcome',html:cap(pron.subj)+' died'+(isoDay(p.deceased_date)?' on '+B(fd(p.deceased_date)):'')+'.'});
    else if(fst==='discharged_gozo')out.push({head:'Outcome',html:'Follow-up handed over to Gozo'+(isoDay(p.discharged_gozo_date)?' on '+B(fd(p.discharged_gozo_date)):'')+'.'});
    else if(fst==='relocated_overseas')out.push({head:'Outcome',html:cap(pron.subj)+' relocated overseas'+(isoDay(p.relocated_overseas_date)?' on '+B(fd(p.relocated_overseas_date)):'')+'.'});
    // Where it goes next.
    const nx=nextList(c);
    if(nx.length)out.push({head:'Next',html:nx.map(x=>esc(x.label)+' '+B(x.value)).join('; ')+'.'});
    // What would complete the story.
    const gaps=[];
    P.forEach(x=>{
      if(x.opOnly)return;
      if(!x.cases.length&&!x.open)gaps.push('a case summary for the admission of '+fd(x.start));
      if(!MARKERS.some(m=>(series[m.k]||[]).some(v=>v.d>=x.start&&v.d<=x.end)))gaps.push('blood results for the admission of '+fd(x.start));
      x.ops.forEach(o=>{if(!o.src.has('Patient consultation')&&!o.src.has('Case summaries')&&!(p.operated_abroad&&day(p.surgery_date)===o.date))gaps.push('the operation note (Patient consultation) for '+fd(o.date));});
    });
    return {paras:out,gaps:uniq(gaps).slice(0,5)};
  }

  const SECTIONS=[['Patient',overview],['Background',background],['Surgical history',surgical],['Admissions & encounters',admissions],['Hospital stays (case summaries)',hospitalStays],
    ['Stoma care',stomaCare],['Nursing reviews',nursingReviews],['Medicines',medicines],['Investigations',investigations],['Correspondence',correspondence],['Follow-up',followup]];

  /* ---------- drawing ---------- */
  function build(){
    const c=data();if(!c)return null;
    c.K=storyContext(c);
    let syn={sentences:[],kpis:[]};try{syn=synopsis(c);}catch(e){syn={sentences:[{k:'Note',html:'The synopsis could not be put together: '+esc(e&&e.message||e)}],kpis:[]};}
    const secs=SECTIONS.map(([title,f])=>{let lines=[];try{lines=f(c)||[];}catch(e){lines=[L('Could not be put together: '+(e&&e.message||e),'')];}return {title,lines};}).filter(s=>s.lines.length);
    let sto={paras:[],gaps:[]};try{sto=story(c);}catch(e){sto={paras:[{head:'Note',html:'The story could not be put together: '+esc(e&&e.message||e)}],gaps:[]};}
    return {syn,secs,sto};
  }
  function render(){
    const h=st.host;if(!h||!document.body.contains(h))return;
    const d=h.closest('details');if(d&&!d.open)return;
    const built=build();if(!built)return;const secs=built.secs,syn=built.syn,sto=built.sto;
    st.at=new Date();
    const txt=h=>{const d=document.createElement('div');d.innerHTML=h;d.querySelectorAll('button').forEach(x=>x.remove());return d.textContent.replace(/\s+/g,' ').trim();};
    st.plain='CLINICAL SYNOPSIS\n'+syn.sentences.map(x=>x.k+': '+txt(x.html)).join('\n')+'\n\n'
      +(sto.paras.length?'CLINICAL RATIONALE — THE STORY SO FAR\n'+sto.paras.map(x=>x.head+': '+txt(x.html)).join('\n')+(sto.gaps.length?'\nTo complete the story, paste: '+sto.gaps.join('; ')+'.':'')+'\n\n':'')
      +secs.map(s=>s.title.toUpperCase()+'\n'+s.lines.map(l=>'- '+l.text+(l.src?' ['+l.src+(l.date?', '+fd(l.date):'')+']':'')).join('\n')).join('\n\n');
    h.innerHTML='<div class="hs">'
      +'<div class="hs-bar"><span class="hs-live" title="Rebuilt automatically from this patient’s records whenever they change. Each line shows where it came from; reasons are the ones written in the records.">● Live · updated '+esc(st.at.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))+'</span>'
      +'<button type="button" class="psm-btn" onclick="HolisticSummary.copy(this)">📋 Copy summary</button></div>'
      +(syn.kpis.length?'<div class="hs-kpis">'+syn.kpis.map(k=>'<div class="hs-kpi'+(k.tone?' is-'+k.tone:'')+'"><span class="hs-kpi-l">'+esc(k.label)+'</span><span class="hs-kpi-v">'+esc(String(k.value))+'</span><span class="hs-kpi-s">'+esc(k.sub||'')+'</span></div>').join('')+'</div>':'')
      +(syn.sentences.length?'<section class="hs-syn"><h4>Clinical synopsis</h4><dl>'+syn.sentences.map(x=>'<dt>'+esc(x.k)+'</dt><dd>'+x.html+'</dd>').join('')+'</dl></section>':'')
      +(sto.paras.length?'<section class="hs-story"><h4>Clinical rationale — the story so far</h4>'
        +sto.paras.map(x=>'<div class="hs-par"><div class="hs-par-h">'+esc(x.head)+'</div><p>'+x.html+'</p></div>').join('')
        +(sto.gaps.length?'<p class="hs-gaps">To complete the story, paste '+esc(sto.gaps.join('; '))+'.</p>':'')+'</section>':'')
      +secs.map(s=>'<details class="hs-sec" data-k="'+esc(s.title)+'"'+(st.open.has(s.title)?' open':'')+' ontoggle="HolisticSummary._toggle(this)"><summary>'+esc(s.title)+' <span class="ch-sum-count">'+s.lines.length+'</span></summary><ul>'+s.lines.map(l=>'<li><span class="hs-text">'+esc(l.text)+'</span>'
        +(l.src?' <span class="hs-src">'+esc(l.src)+(l.date?' · '+esc(fd(l.date)):'')+'</span>':'')+'</li>').join('')+'</ul></details>').join('')
      +'</div>';
  }
  function mount(host,patient){
    if(!host||!patient)return;
    if(st.pid!==String(patient.id))st.open=new Set();
    st.host=host;st.pid=String(patient.id);
    const d=host.closest('details');
    if(d&&!d.dataset.hsBound){d.dataset.hsBound='1';d.addEventListener('toggle',()=>{if(d.open)render();});}
    render();
  }
  async function copy(btn){
    const text=st.plain||'';if(!text)return;
    let ok=false;
    try{await navigator.clipboard.writeText(text);ok=true;}catch(e){
      try{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();ok=document.execCommand('copy');t.remove();}catch(_){}
    }
    if(btn){const was=btn.textContent;btn.textContent=ok?'✓ Copied':'Could not copy';setTimeout(()=>{btn.textContent=was;},1600);}
  }
  // Any change on the open record (hospital records, an encounter, a visit, a
  // letter, an appliance, the siting…) → rebuild once, only while it is open.
  let timer=0;
  function refresh(){clearTimeout(timer);timer=setTimeout(render,60);}
  document.addEventListener('clinical-history:changed',refresh);
  function toggle(el){const k=el&&el.dataset.k;if(!k)return;if(el.open)st.open.add(k);else st.open.delete(k);}
  global.HolisticSummary={mount,render,refresh,copy,_toggle:toggle,_build:build};
})(window);
