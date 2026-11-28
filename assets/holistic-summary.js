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
  const st={host:null,pid:null,at:null,plain:'',open:new Set(),range:'',table:false,trend:null,tipFor:null,built:null,patient:null};

  // A consultation note's / ECG's sections ("§ Name" lines).
  function sections(text){
    const s=String(text||'');if(!/^§ /m.test(s))return [];
    return s.split(/^§ /m).filter(x=>x.trim()).map(p=>{const i=p.indexOf('\n');return i<0?{label:p.trim(),value:''}:{label:p.slice(0,i).trim(),value:p.slice(i+1).trim()};});
  }
  const sec=(e,label)=>((sections(e.result).find(x=>x.label.toLowerCase()===label.toLowerCase())||{}).value||'');
  // The QTc the cardiograph printed: plain QTc, else Bazett, Fridericia or Hodges.
  function qtcOf(e){
    const m=String(sec(e,'Measurements'));
    for(const k of ['QTc','QTcB','QTcF','QTcH']){const x=m.match(new RegExp('(?:^|[ ·])'+k+'\\s+(-?\\d+)'));if(x)return {k,v:+x[1]};}
    return null;
  }

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
    const at=d=>{d=day(d)||'';if(!ev.has(d))ev.set(d,{date:d,procs:[],by:[],ind:[],find:[],stoma:[],src:new Set(),refC:'',refK:'',refS:'',refR:''});return ev.get(d);};
    c.stomas.forEach(x=>{
      if(x.formed_date){const e=at(x.formed_date);e.stoma.push((x.kind==='refashion'?'Refashioned ':'Formed ')+stomaName(x)+(x.location?', '+x.location:''));
        if(x.operation)e.procs.push(x.operation);e.src.add('Stomas & surgery');e.refR='panel:stomas';}
      if(x.reversal_date){const e=at(x.reversal_date);e.stoma.push('Closed '+stomaName(x)+(x.reversal_notes?' — '+x.reversal_notes:''));e.src.add('Stomas & surgery');}
      if(x.superseded_date){const e=at(x.superseded_date);e.stoma.push('Replaced '+stomaName(x));e.src.add('Stomas & surgery');}
    });
    c.hist.filter(e=>e.category==='surgery').forEach(h=>{const e=at(h.entry_date);if(h.title)e.procs.push(h.title);if(h.source)e.by.push(h.source);e.src.add('Performed procedures');if(!e.refS)e.refS='ch:'+h.id;});
    cases(c).forEach(x=>x.list('Surgical interventions').forEach(t=>{
      const m=t.match(/^(.*?)\s*·\s*(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return;
      const e=at(m[4]+'-'+m[3]+'-'+m[2]);e.procs.push(m[1]);if(x.e.source)e.by.push(x.e.source);if(x.e.title)e.ind.push(x.e.title);e.src.add('Case summaries');if(!e.refK)e.refK='ch:'+x.e.id;
    }));
    c.hist.filter(e=>e.category==='consult').forEach(h=>{
      const e=at(h.entry_date),ind=sec(h,'Indications'),find=sec(h,'Operation findings')||sec(h,'Findings');
      if(h.title)e.procs.push(h.title);if(h.source)e.by.push(h.source);
      if(ind)e.ind.push(ind.split('\n')[0]);if(find)e.find.push(find.split('\n')[0]);e.src.add('Patient consultation');if(!e.refC)e.refC='ch:'+h.id;
    });
    return [...ev.values()].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
  }
  // Where an operation is best read: its operation note, else the case summary,
  // the performed procedure, or the stoma record.
  const opRef=o=>o?o.refC||o.refK||o.refS||o.refR||'':'';
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
      const qtc=x=>{const m=qtcOf(x);return m?m.v:null;},qk=(qtcOf(e)||{}).k||'QTc';
      const q=qtc(e),qp=prev?qtc(prev):null;
      const stm=sec(e,'Interpretation').split('\n').filter(Boolean).slice(0,3);
      out.push(L('ECG '+fd(e.entry_date)+(e.entry_time?' '+String(e.entry_time).slice(0,5):'')+': '+(e.title||'no verdict')+(e.entry_type?' ('+e.entry_type+')':'')
        +(q!=null?' · '+qk+' '+q+' ms'+(qp!=null&&q!==qp?' ('+(q>qp?'+':'')+(q-qp)+' since '+fd(prev.entry_date)+')':''):'')
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
    // Where each line can be read in full (a tap on it opens that).
    const srcs={Situation:ep?'rec:episode:'+ep.id:'',Background:pmh?'ch:'+pmh.x.e.id:'',Bloods:'cat:lab',Medicines:'cat:poyc',Next:'panel:appts','Stoma care':'panel:stomas'};
    push('Background',[pmh?'Comorbidities: '+pmh.lines.map(x=>B(one(x.replace(/\s*\(.*?\)\s*/g,' ').replace(/\s+managed with.*$/i,''),60))).join(', ')+'.':'',
      al.length?'Allergies: '+B(al.join(', '))+'.':'',soc?'Social: '+esc(one(soc.lines.map(x=>x.replace(/[.;]+$/,'')).join('; '),140))+'.':''].filter(Boolean).join(' '));
    if(al.length)kpis.push({label:'Allergies',value:al.length,sub:one(al.join(', '),40),tone:'warn'});
    if(cs.length){
      const x=cs[0],days=x.dis?daysBetween(x.adm,x.dis):null,comp=x.list('Complications');srcs['Last admission']='ch:'+x.e.id;
      push('Last admission',B(fd(x.adm))+(x.dis?' → '+B(fd(x.dis)):'')+(days!=null?' ('+days+' days)':'')+(x.e.entry_type?', '+esc(x.e.entry_type):'')+(x.e.source?' under '+esc(x.e.source):'')
        +(x.e.title?': '+B(x.e.title):'')+(comp.length?'; complications: '+esc(comp.join(', ')):'')+'.'+(cs.length>1?' '+cs.length+' case summaries on record.':''));
    }
    if(ep)kpis.push({label:'Inpatient day',value:daysBetween(ep.record_date,today()),sub:ward||'admitted '+fd(ep.record_date)});
    // The latest operation and why it was done.
    const evs=surgeryEvents(c).filter(e=>e.date&&e.date<=today());
    const idx=evs[evs.length-1];
    if(idx){
      const procs=uniq(idx.procs),proc=procs[0]||'surgery';srcs.Operation=srcs.Rationale=opRef(idx);
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
      if(post){srcs.Since='ch:'+post.id;}
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
    if(lastRev){srcs['Stoma care']=(lastRev.src==='clinic'?'rec:appointment:':'rec:encounter:')+lastRev.id;const f=reviewFindings(lastRev);revLine='Last '+(lastRev.src==='clinic'?'clinic':'ward')+' review '+B(fd(lastRev.d))+(lastRev.by?' ('+esc(lastRev.by)+')':'')+(f.length?': '+esc(f.join(' · ')):'')+'.';}
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
      const e=ecg[0],qtc=x=>{const m=qtcOf(x);return m?m.v:null;},q=qtc(e),qp=ecg[1]?qtc(ecg[1]):null,qk=(qtcOf(e)||{}).k||'QTc';srcs.ECG='ch:'+e.id;
      const st=sec(e,'Interpretation').split('\n').filter(x=>x&&!/^sinus rhythm$/i.test(x)).slice(0,2);
      push('ECG',esc(fd(e.entry_date))+': '+B(e.title||'no verdict')+(st.length?' — '+esc(st.join('; ')):'')+(q!=null?'; '+esc(qk)+' '+B(q+' ms')+(qp!=null&&q!==qp?' ('+(q>qp?'+':'')+(q-qp)+' since '+esc(fd(ecg[1].entry_date))+')':''):'')+'.');
      if(q!=null)kpis.push({label:qk,value:q+' ms',sub:qp!=null&&q!==qp?(q>qp?'▲ +':'▼ ')+(q-qp)+' since '+fd(ecg[1].entry_date):fd(e.entry_date),tone:/abnormal/i.test(e.title||'')?'warn':''});
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
    const openC=c.comms.filter(r=>!r.parent_id&&r.status&&r.status!=='Completed');if(openC.length)srcs.Correspondence='rec:correspondence:'+openC[0].id;
    if(openC.length)push('Correspondence',B(openC.length+' open issue'+(openC.length===1?'':'s'))+': '+openC.slice(0,3).map(r=>esc(r.subject||'no subject')+' ('+esc(r.status==='Recorded'?'open':lcw(r.status))+(isoDay(r.communication_date)?', '+esc(fdS(r.communication_date)):'')+')').join('; ')+(openC.length>3?' and '+(openC.length-3)+' more':'')+'.');
    const nx=nextList(c);
    if(nx.length)push('Next',nx.map(x=>esc(x.label)+' '+B(x.value)).join('; ')+'.');
    out.forEach(x=>{x.src=srcs[x.k]||'';});
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
      (out[m.k]=out[m.k]||[]).push({t:when,d:day(e.entry_date),v,raw:String(e.result).trim(),unit:String(e.lab_unit||'').trim(),
        flag:String(e.lab_flag||'').trim(),range:String(e.lab_range||'').trim(),id:e.id,time:String(e.entry_time||'').slice(0,5)});
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
      .forEach(e=>out.push({d:day(e.entry_date),title:e.title||'Imaging',html:imagingHTML(e,220),src:'ch:'+e.id}));
    P.cases.forEach(x=>x.list('Investigations').forEach(l=>{
      const p=l.split(' · ');if(p.length<3)return;
      const m=p[0].match(/^(\d{2})\/(\d{2})\/(\d{4})/);if(!m)return;
      const d=m[3]+'-'+m[2]+'-'+m[1],text=p.slice(2).join(' · ');
      if(d<from||d>to||/^[<>]?\s*-?\d/.test(text))return;   // a blood result, not a report
      if(out.some(o=>o.d===d&&norm(o.title).slice(0,6)===norm(p[1]).slice(0,6)))return;
      out.push({d,title:p[1],html:imagingHTML({result:text},220),src:'ch:'+x.e.id});
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
      ev.push({d:r.d,src:'rec:encounter:'+r.id,html:bits.length?on(r.d)+'the stoma nursing review'+who+' recorded '+esc(bits.join(' · '))+'.'+(note?' Noted: '+note:'')
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
  const byDay=list=>{const m=new Map();list.forEach(e=>{if(!m.has(e.d))m.set(e.d,[]);m.get(e.d).push(e.text);});return [...m].map(([d,t])=>({d,o:7,src:'panel:appliances',html:on(d)+esc(t.join('; '))+'.'}));};
  // Clinic visits in a window: seen (with the review), DNTU, cancelled, tele follow-up.
  function visitEvents(c,K,from,to){
    const out=[];
    c.appts.forEach(a=>{
      const d=day(a.appt_date);if(!d||d<from||d>to||d>today())return;
      if(a.community_followup){
        const fb=plainNotes(a.comcare_feedback);
        out.push({d,o:2,src:'rec:appointment:'+a.id,html:on(d)+'tele follow-up through Comcare'+(fb?': '+textMore(cap(fb),160,true):isoDay(a.comcare_email_sent_date)?' — request emailed on '+esc(fdS(a.comcare_email_sent_date))+', feedback awaited.':'.')});
        return;
      }
      if(a.status==='did_not_attend'){out.push({d,o:2,src:'rec:appointment:'+a.id,html:on(d)+'did not turn up for the stoma clinic appointment (DNTU).'});return;}
      if(a.status==='cancelled'){out.push({d,o:2,src:'rec:appointment:'+a.id,html:on(d)+'the stoma clinic appointment was cancelled.'});return;}
      if(a.status!=='attended')return;
      const r=K.R.find(x=>x.src==='clinic'&&x.id===String(a.id)),find=r?reviewFindings(r):[];
      const notes=r?r.stomas.filter(x=>x.notes).map(x=>(r.stomas.length>1?x.name+': ':'')+x.notes).join(' '):'';
      const appl=applianceEvents(c,K,d,d,'followup').map(x=>x.text);
      out.push({d,o:2,src:'rec:appointment:'+a.id,html:on(d)+'seen in the stoma clinic'+(r&&r.by?' by '+esc(r.by):'')+(find.length?': '+esc(find.join(' · ')):'')+'.'
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
      T.push({d:sd,o:0,src:'siting',html:on(sd)+'pre-operative stoma siting'+(s.siting_for?' for '+B(lcw(s.siting_for)):'')+(s.proposed_operation?' (proposed operation: '+esc(s.proposed_operation)+')':'')
        +(s.consultant?' under '+esc(s.consultant):'')+(marks?' — '+marks+' site'+(marks===1?'':'s')+' marked':s.status==='done'?' — seen':'')+'.'});
    }
    c.comms.forEach(r=>{
      const d=isoDay(r.communication_date);if(!inW(d))return;
      const root=r.parent_id?c.comms.find(x=>String(x.id)===String(r.parent_id)):null;
      const subj=r.subject||(root&&root.subject)||'',who=[r.contact_name,r.service].filter(Boolean).join(', ');
      const st=r.status&&!/^(recorded|completed)$/i.test(r.status)?' ['+esc(lcw(r.status))+']':'';
      const n=plainNotes(r.notes);
      T.push({d,o:9,src:'rec:correspondence:'+r.id,html:on(d)+esc(lcw(r.method)||'contact')+' — '+(r.kind==='community'?'community':'patient')+' correspondence'+(who?' with '+esc(who):'')
        +(subj?(root?', follow-up on ':': ')+B(subj):'')+st+'.'+(n?' '+textMore(cap(n),140,true):'')});
    });
    c.hist.filter(e=>e.category==='doc_icm'&&inW(day(e.entry_date))).forEach(e=>{
      const t=plainNotes(e.result||e.title);if(t)T.push({d:day(e.entry_date),o:6,src:'ch:'+e.id,html:on(e.entry_date)+'iCM note'+(e.entry_type?' ('+esc(e.entry_type)+')':'')+': '+textMore(cap(t),160,true)});
    });
    c.hist.filter(e=>e.category==='ecg'&&inW(day(e.entry_date))).forEach(e=>{
      const q=qtcOf(e);
      T.push({d:day(e.entry_date),o:4,src:'ch:'+e.id,html:on(e.entry_date)+'the ECG read '+B(e.title||'no verdict')+(q?' with a '+esc(q.k)+' of '+esc(String(q.v))+' ms':'')+'.'});
    });
    return T;
  }
  function complicationEvents(K,from,to){
    return K.comp.filter(k=>{const d=day(k.date);return d&&d>=from&&d<=to;}).map(k=>({d:day(k.date),o:5,text:k.text,src:'panel:stomas',
      html:on(k.date)+'a complication was recorded: '+B(k.text)+(k.status==='resolved'?' (since resolved'+(isoDay(k.resolved_date)?' on '+esc(fdS(k.resolved_date)):'')+')':'')+'.'}));
  }
  // The last set of key bloods in a window: "on 12/10: CRP 4 mg/L, Hb 13.1 g/dL".
  function lastBloods(series,from,to){
    let last='';MARKERS.forEach(m=>(series[m.k]||[]).forEach(p=>{if(p.d>=from&&p.d<=to&&p.d>last)last=p.d;}));
    if(!last)return null;
    return {d:last,list:MARKERS.map(m=>{const a=(series[m.k]||[]).filter(p=>p.d===last),x=a[a.length-1];return x?m.name+' '+B(val(x))+(x.flag?' ('+esc(x.flag)+')':''):'';}).filter(Boolean)};
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
    if(f&&String(f.patientId)===String(p.id))(f.items||[]).filter(x=>!/^last\b/i.test(x.label)).forEach(x=>out.push({label:x.label,value:x.value}));
    return out;
  }
  /* The time between admissions (and before the first, and since the last
     discharge), told only when something happened in it: clinic visits, tele
     follow-ups, correspondence, imaging, ECGs, bloods, referrals, the siting. */
  function gapItems(c,K,from,to,nextStart){
    const T=[].concat(visitEvents(c,K,from,to),otherEvents(c,K,from,to),complicationEvents(K,from,to),
      wardEvents(K,from,to).map(e=>({d:e.d,o:6,src:e.src,html:e.html})),byDay(applianceEvents(c,K,from,to,'inpatient')));
    // Imaging in the two days before an admission is told with that admission.
    const imgTo=nextStart&&addDays(nextStart,-3)<to?addDays(nextStart,-3):to;
    c.hist.filter(e=>e.category==='imaging'&&e.entry_date&&day(e.entry_date)>=from&&day(e.entry_date)<=imgTo)
      .forEach(e=>T.push({d:day(e.entry_date),o:1,src:'ch:'+e.id,html:on(e.entry_date)+esc(e.title||'Imaging')+' showed: '+imagingHTML(e,220)}));
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
  const evLine=(h,src)=>'<span class="hs-ev'+(src?' hs-link" data-src="'+esc(src)+'" tabindex="0':'')+'">'+h+'</span>';
  const lines=S=>S.filter(Boolean).map(x=>typeof x==='object'?evLine(x.html,x.src):/^<span class="hs-ev[ "]/.test(x)?x:evLine(x)).join(' ');
  function gapPeriod(c,P,K){
    const S=[];
    if(P.items.length)S.push(moreList(P.items.map(t=>evLine(t.html,t.src)),10));
    const tr=bloodTrends(K.series,P.from,P.to);
    if(tr.length)S.push({html:'Bloods over this time: '+tr.join('; ')+'.',src:'cat:lab'});
    else{const lb=lastBloods(K.series,P.from,P.to);if(lb&&lb.list.length)S.push({html:'Bloods on '+esc(fdS(lb.d))+': '+lb.list.join(', ')+'.',src:'cat:lab'});}
    const fl=flaggedIn(c,P.from,P.to);if(fl.length)S.push({html:'Flagged by the lab: '+fl.join('; ')+'.',src:'cat:lab'});
    return {head:fd(P.start)+(P.end&&P.end!==P.start?' → '+fd(P.end):'')+' · '+P.label,html:lines(S)};
  }
  function storyPeriod(c,P,K,pron){
    if(P.gap)return gapPeriod(c,P,K);
    const S=[],x=P.cases[0]||null,ep=P.eps[0]||null,series=K.series;
    if(P.opOnly){
      P.ops.forEach(o=>S.push({html:opSentence(c,o,pron,false),src:opRef(o)}));
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
    S.push({html:intro.join(' '),src:x?'ch:'+x.e.id:ep?'rec:episode:'+ep.id:''});
    // Then everything dated, in order — imaging, operations, what the doctor
    // recorded day by day, the nursing reviews, appliance changes, ECGs, iCM
    // notes, referrals, correspondence and complications — so one leads to the next.
    const T=[];
    imagingIn(c,P,addDays(P.start,-2),P.end).forEach(i=>T.push({d:i.d,o:1,src:i.src,html:'On '+esc(fdS(i.d))+', '+esc(i.title)+' showed: '+i.html}));
    P.ops.forEach(o=>{
      const s0=opSentence(c,o,pron,true);
      T.push({d:o.date,o:2,src:opRef(o),html:x?s0.replace(/ for <b>([^<]*)<\/b>/,(m,ind)=>{const r=reasonOnly(ind,uniq(o.procs)[0]);return r?' for <b>'+esc(lc1(r))+'</b>':'';}):s0});
    });
    if(x)courseEvents(x,P,pron).forEach(e=>T.push({d:e.d,o:3,src:'ch:'+x.e.id,html:'On '+esc(fdS(e.d))+', '+esc(lc1(e.text))}));
    wardEvents(K,P.start,P.end).forEach(e=>T.push({d:e.d,o:6,src:e.src,html:e.html}));
    byDay(applianceEvents(c,K,P.start,P.end,'inpatient')).forEach(e=>T.push(e));
    visitEvents(c,K,P.start,P.end).forEach(e=>T.push(e));
    otherEvents(c,K,P.start,P.end).forEach(e=>T.push(e));
    let undated=x?x.list('Complications'):[];
    complicationEvents(K,P.start,P.end).forEach(k=>{undated=undated.filter(u=>norm(u)!==norm(k.text));T.push(k);});
    T.sort((a,b)=>a.d.localeCompare(b.d)||a.o-b.o);
    if(T.length)S.push(moreList(T.map(t=>evLine(t.html,t.src)),10));
    // How the bloods moved: after surgery, and from admission to the last result.
    const tr=bloodTrends(series,firstOp||P.start,P.end),named=new Set(tr.map(t=>t.split(' ')[0]));
    const across=bloodTrends(series,P.start,P.end).filter(t=>!named.has(t.split(' ')[0]));
    if(tr.length)S.push({html:(firstOp?'After surgery, ':'During the admission, ')+tr.join('; ')+'.',src:'cat:lab'});
    if(across.length)S.push({html:(tr.length?'Across the admission, ':'During the admission, ')+across.join('; ')+'.',src:'cat:lab'});
    const fl=flaggedIn(c,P.start,P.end);if(fl.length)S.push({html:'Also flagged by the lab: '+fl.join('; ')+'.',src:'cat:lab'});
    if(undated.length)S.push('Complications recorded: '+B(undated.map(lc1).join(', '))+'.');
    // The stoma nurse's teaching and discharge preparation during the stay.
    const teach=teachingLine(K,P.start,P.end),prep=dischargeLine(K,P.start,P.end);
    const encWith=f=>{const r=K.R.filter(y=>y.src==='ward'&&y.d>=P.start&&y.d<=P.end&&y[f]).pop();return r?'rec:encounter:'+r.id:'';};
    if(teach)S.push({html:teach,src:encWith('teaching')});if(prep)S.push({html:prep,src:encWith('discharge')});
    // How it ended.
    if(P.open){
      const pod=firstOp?daysBetween(P.ops[P.ops.length-1].date,today()):null;
      S.push(cap(pron.subj)+' is still an inpatient — day '+B(daysBetween(P.start,today()))+(pod!=null?', day '+B(pod)+' after surgery':'')+'.');
    }else if(x&&x.dis){
      const plan=x.list('Plan').slice(0,3).map(t=>lc1(trimDot(t))),dis=x.list('Treatment on discharge'),admMeds=x.list('Medications on admission');
      const ch=admMeds.length&&dis.length?medChanges(admMeds,dis):{started:[],stopped:[]};
      const fu=x.list('Follow-up').map(trimDot).filter(Boolean),pend=x.list('Pending investigations').map(trimDot).filter(Boolean);
      S.push({src:'ch:'+x.e.id,html:cap(pron.subj)+' was discharged on '+B(fd(x.dis))+' after '+daysBetween(P.start,x.dis)+' days'+(dis.length?', on '+dis.length+' medicine'+(dis.length===1?'':'s'):'')+'.'
        +(ch.started.length||ch.stopped.length?' During the stay: '+[ch.started.length?'started '+esc(ch.started.join(', ')):'',ch.stopped.length?'stopped '+esc(ch.stopped.join(', ')):''].filter(Boolean).join('; ')+'.':'')
        +(plan.length?' Plan: '+esc(plan.join('; '))+'.':'')+(fu.length?' Follow-up: '+esc(fu.join('; '))+'.':'')+(pend.length?' Pending: '+esc(pend.join('; '))+'.':'')});
    }else if(ep&&ep.discharge_date)S.push({src:'rec:episode:'+ep.id,html:cap(pron.subj)+' was discharged on '+B(fd(ep.discharge_date))+'.'});
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

  /* ---------- trends: CRP, WCC, Hb, creatinine and eGFR over time ----------
     Small multiples, like Power BI line charts: one chart per test, each on its
     own single axis (never two scales on one plot). The line is the results in
     time order; a larger red dot is a result the lab flagged (H/L); the pale
     band is the lab's normal range; the labelled vertical lines are admissions
     (A), operations (Op) and discharges (D). Hover or tap for the value; the
     table shows the same figures. Colours checked for colour-blind separation. */
  const TREND_KEYS=['crp','wcc','hb','creat','egfr'];
  const TREND_NAME={crp:'CRP',wcc:'WCC',hb:'Hb',creat:'Creatinine',egfr:'eGFR'};
  const TC={line:'#0d9488',flag:'#dc3c3d',op:'#7c3aed',ev:'#94a3b8',grid:'#e8edf3',band:'#eef2f6',ink:'#0f172a',ink2:'#64748b',surface:'#ffffff'};
  // Admissions, operations and discharges, for the chart markers.
  function trendEvents(c){
    const ev=[];
    (c.P||[]).forEach(p=>{
      if(!p.opOnly){ev.push({d:p.start,k:'A',label:'Admitted'});if(!p.open&&p.end&&p.end!==p.start)ev.push({d:p.end,k:'D',label:'Discharged'});}
      p.ops.forEach(o=>ev.push({d:o.date,k:'Op',label:uniq(o.procs)[0]||'Operation'}));
    });
    return ev;
  }
  // The period chips: all results, the last 90 days, and each admission with bloods.
  function trendRanges(c){
    const all=[];TREND_KEYS.forEach(k=>(c.K.series[k]||[]).forEach(p=>all.push(p.d)));
    if(!all.length)return [];
    all.sort();
    const out=[{id:'all',label:'All results',from:all[0],to:all[all.length-1]}];
    const l90=addDays(today(),-90);
    if(all[0]<l90&&all.some(d=>d>=l90))out.push({id:'90',label:'Last 90 days',from:l90,to:today()});
    (c.P||[]).filter(p=>!p.opOnly).forEach(p=>{
      const from=addDays(p.start,-2),to=addDays(p.open?today():p.end,2);
      if(all.some(d=>d>=from&&d<=to))out.push({id:'adm'+p.start,label:(p.open?'Current admission':'Admission')+' '+fd(p.start),from,to,adm:true,open:p.open});
    });
    return out;
  }
  // "0.0 - 5.0" → {lo:0,hi:5}; "< 5" → {lo:null,hi:5}; "> 60" → {lo:60,hi:null}.
  function rangeBand(s){
    s=String(s||'').replace(/[−–]/g,'-');
    let m=s.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);if(m)return {lo:+m[1],hi:+m[2],text:m[1]+'–'+m[2]};
    m=s.match(/^\s*<=?\s*(\d+(?:\.\d+)?)/);if(m)return {lo:null,hi:+m[1],text:'< '+m[1]};
    m=s.match(/^\s*>=?\s*(\d+(?:\.\d+)?)/);if(m)return {lo:+m[1],hi:null,text:'> '+m[1]};
    return null;
  }
  function niceTicks(lo,hi,n){
    if(!(hi>lo)){lo-=1;hi+=1;}
    const step0=(hi-lo)/n,mag=Math.pow(10,Math.floor(Math.log10(step0))),err=step0/mag;
    const step=(err>=7.5?10:err>=3.5?5:err>=1.5?2:1)*mag,a=Math.floor(lo/step)*step,b=Math.ceil(hi/step)*step,out=[];
    for(let v=a;v<=b+step/2;v+=step)out.push(+v.toFixed(10));
    return out;
  }
  const tms=p=>Date.parse(p.d+'T'+(/^\d{2}:\d{2}/.test(p.time||'')?p.time.slice(0,5):'12:00')+':00');
  const fmtNum=v=>Math.abs(v)>=1000?Math.round(v).toLocaleString('en-GB'):String(+v.toFixed(2));
  // The charts' data for a period: per test, its results in one unit (the latest
  // result's unit — a result in another unit is left out and counted).
  function trendData(c,r){
    const out=[];
    TREND_KEYS.forEach(k=>{
      const all=(c.K.series[k]||[]).filter(p=>p.d>=r.from&&p.d<=r.to);if(!all.length)return;
      const unit=all[all.length-1].unit,pts=all.filter(p=>!unit||!p.unit||p.unit===unit),other=all.length-pts.length;
      const band=rangeBand((pts.slice().reverse().find(p=>p.range)||{}).range);
      const m=MARKERS.find(x=>x.k===k);
      out.push({k,name:TREND_NAME[k],unit,pts:pts.map(p=>Object.assign({x:tms(p)},p)),band,other,dir:m?m.dir:'both'});
    });
    return out;
  }
  // One chart as SVG, drawn at the width it is shown at so the text stays crisp.
  function chartSVG(ch,ev,r,w,idx){
    const h=150,pad={l:42,r:40,t:18,b:22},pw=Math.max(40,w-pad.l-pad.r),ph=h-pad.t-pad.b;
    const x0=Date.parse(r.from+'T00:00:00'),x1=Date.parse(r.to+'T23:59:59');
    let lo=Math.min(...ch.pts.map(p=>p.v)),hi=Math.max(...ch.pts.map(p=>p.v));
    if(ch.band){if(ch.band.lo!=null)lo=Math.min(lo,ch.band.lo);if(ch.band.hi!=null)hi=Math.max(hi,ch.band.hi);}
    const ticks=niceTicks(lo,hi,3),y0=ticks[0],y1=ticks[ticks.length-1];
    const X=t=>pad.l+(x1>x0?(t-x0)/(x1-x0):.5)*pw,Y=v=>pad.t+(1-(v-y0)/((y1-y0)||1))*ph;
    let s='<svg class="hs-chart" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="img" tabindex="0" data-chart="'+idx+'" aria-label="'
      +esc(ch.name+': '+ch.pts.length+' result'+(ch.pts.length===1?'':'s')+' from '+fd(ch.pts[0].d)+' to '+fd(ch.pts[ch.pts.length-1].d)+'; latest '+ch.pts[ch.pts.length-1].raw+(ch.unit?' '+ch.unit:''))+'">';
    // The lab's normal range.
    if(ch.band){const top=Y(ch.band.hi!=null?Math.min(ch.band.hi,y1):y1),bot=Y(ch.band.lo!=null?Math.max(ch.band.lo,y0):y0);
      if(bot>top)s+='<rect x="'+pad.l+'" y="'+top.toFixed(1)+'" width="'+pw+'" height="'+(bot-top).toFixed(1)+'" fill="'+TC.band+'"/>';}
    // Recessive hairline grid and the y ticks.
    ticks.forEach(v=>{const y=Y(v).toFixed(1);s+='<line x1="'+pad.l+'" x2="'+(pad.l+pw)+'" y1="'+y+'" y2="'+y+'" stroke="'+TC.grid+'" stroke-width="1"/>'
      +'<text x="'+(pad.l-6)+'" y="'+(+y+3.5)+'" text-anchor="end" class="hs-tick">'+esc(fmtNum(v))+'</text>';});
    // x ticks: a few dates, never crowded.
    const n=Math.max(2,Math.min(5,Math.floor(pw/80))),seen=new Set();
    for(let i=0;i<n;i++){const t=x0+(x1-x0)*i/(n-1),d=new Date(t).toISOString().slice(0,10),lab=fdS(d);if(seen.has(lab))continue;seen.add(lab);
      s+='<text x="'+X(t).toFixed(1)+'" y="'+(h-6)+'" text-anchor="'+(i===0?'start':i===n-1?'end':'middle')+'" class="hs-tick">'+esc(lab)+'</text>';}
    // Admissions, operations and discharges: labelled vertical lines (labels never collide).
    const days=new Map();ev.filter(e=>e.d>=r.from&&e.d<=r.to).forEach(e=>{if(!days.has(e.d))days.set(e.d,[]);days.get(e.d).push(e);});
    let lastLab=-99;
    [...days.keys()].sort().forEach(d=>{
      const list=days.get(d),x=X(Date.parse(d+'T12:00:00')).toFixed(1),op=list.some(e=>e.k==='Op');
      s+='<line x1="'+x+'" x2="'+x+'" y1="'+pad.t+'" y2="'+(pad.t+ph)+'" stroke="'+(op?TC.op:TC.ev)+'" stroke-width="1"/>';
      if(+x-lastLab>=22){s+='<text x="'+x+'" y="'+(pad.t-5)+'" text-anchor="middle" class="hs-evlab">'+esc(uniq(list.map(e=>e.k)).join('·'))+'</text>';lastLab=+x;}
    });
    // The line, then the dots (all of them while there is room; flagged ones always).
    const P=ch.pts;
    if(P.length>1)s+='<path d="'+P.map((p,i)=>(i?'L':'M')+X(p.x).toFixed(1)+' '+Y(p.v).toFixed(1)).join(' ')+'" fill="none" stroke="'+TC.line+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    const roomy=P.length<=Math.floor(pw/9);
    P.forEach((p,i)=>{const fl=!!p.flag;if(!roomy&&!fl&&i!==P.length-1)return;
      s+='<circle cx="'+X(p.x).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="'+(fl?5:4)+'" fill="'+(fl?TC.flag:TC.line)+'" stroke="'+TC.surface+'" stroke-width="2"/>';});
    // Selective labels: the latest value, and the peak (or low) when it is another point.
    const last=P[P.length-1],ext=ch.dir==='down'?P.reduce((a,b)=>b.v<a.v?b:a):ch.dir==='up'?P.reduce((a,b)=>b.v>a.v?b:a):null;
    s+='<text x="'+(X(last.x)+7).toFixed(1)+'" y="'+(Y(last.v)+4).toFixed(1)+'" class="hs-endlab">'+esc(last.raw)+'</text>';
    if(ext&&ext!==last&&P.length>2){
      // Above a peak (below a low) — beside it when that would touch the marker labels.
      const up=ch.dir!=='down',ly=Y(ext.v)+(up?-8:15),side=up&&ly<pad.t+10;
      s+='<text x="'+(X(ext.x)+(side?8:0)).toFixed(1)+'" y="'+(side?Y(ext.v)+4:ly).toFixed(1)+'" text-anchor="'+(side?'start':'middle')+'" class="hs-extlab">'+esc(ext.raw)+'</text>';
    }
    // The crosshair and the pointer layer.
    s+='<line class="hs-cross" x1="0" x2="0" y1="'+pad.t+'" y2="'+(pad.t+ph)+'" stroke="'+TC.ink2+'" stroke-width="1" visibility="hidden"/>'
      +'<rect class="hs-hit" x="'+pad.l+'" y="0" width="'+pw+'" height="'+h+'" fill="transparent"/></svg>';
    ch.geo={X,Y,pad,pw,ph,h};
    return s;
  }
  function trendsShell(c){
    const R=trendRanges(c);if(!R.length)return '';
    let r=R.find(x=>x.id===st.range);
    if(!r){r=R.find(x=>x.open)||R[0];st.range=r.id;}
    const charts=trendData(c,r);st.trend={c,r,charts,ev:trendEvents(c)};
    const chips=R.map(x=>'<button type="button" class="hs-chip'+(x.id===r.id?' is-on':'')+'" aria-pressed="'+(x.id===r.id)+'" onclick="HolisticSummary._range(\''+esc(x.id)+'\')">'+esc(x.label)+'</button>').join('');
    const table=st.table?'<div class="hs-ttable-wrap"><table class="hs-ttable"><thead><tr><th>Date</th><th>Test</th><th>Result</th><th>Flag</th><th>Normal range</th></tr></thead><tbody>'
      +charts.flatMap(ch=>ch.pts.map(p=>({ch,p}))).sort((a,b)=>b.p.x-a.p.x).map(({ch,p})=>'<tr class="hs-link" data-src="ch:'+esc(p.id)+'" tabindex="0"><td>'+esc(fd(p.d))+(p.time?' '+esc(p.time):'')+'</td><td>'+esc(ch.name)+'</td><td><b>'+esc(p.raw)+'</b>'+(p.unit?' '+esc(p.unit):'')+'</td><td>'+esc(p.flag||'')+'</td><td>'+esc(p.range||'')+'</td></tr>').join('')
      +'</tbody></table></div>':'';
    return '<section class="hs-trends"><h4>Trends</h4>'
      +'<div class="hs-chips" role="group" aria-label="Period shown">'+chips+'<button type="button" class="hs-chip hs-chip-table" aria-pressed="'+!!st.table+'" onclick="HolisticSummary._table()">'+(st.table?'Hide table':'▦ Table')+'</button></div>'
      +(charts.length?'<div class="hs-tgrid"></div><p class="hs-tkey"><span class="hs-k hs-k-line"></span> result <span class="hs-k hs-k-flag"></span> flagged by the lab (H/L) <span class="hs-k hs-k-band"></span> normal range · <b>A</b> admitted · <b>Op</b> operation · <b>D</b> discharged</p>'
        :'<p class="hs-tkey">No CRP, WCC, Hb, creatinine or eGFR results in this period.</p>')
      +table+'<div class="hs-tip" role="status" hidden></div></section>';
  }
  // Draws the charts into the grid at its current width (and again on resize).
  function drawCharts(){
    const h=st.host,T=st.trend;if(!h||!T)return;
    const grid=h.querySelector('.hs-tgrid');if(!grid)return;
    const W=grid.clientWidth||600,cols=W>=980?3:W>=620?2:1,w=Math.floor((W-(cols-1)*14)/cols);
    grid.style.gridTemplateColumns='repeat('+cols+',minmax(0,1fr))';
    grid.innerHTML=T.charts.map((ch,i)=>'<div class="hs-tcard"><div class="hs-ttitle"><b>'+esc(ch.name)+'</b> <span>'+esc([ch.unit,ch.band?'normal '+ch.band.text:'',ch.other?ch.other+' in another unit not shown':''].filter(Boolean).join(' · '))+'</span></div>'
      +chartSVG(ch,T.ev,T.r,w,i)+'</div>').join('');
  }
  // Hover / tap: the crosshair snaps to the nearest result; a tap pins the
  // readout and offers to open the result in Lab results.
  function chartPoint(svg,clientX){
    const T=st.trend,ch=T&&T.charts[+svg.dataset.chart];if(!ch||!ch.geo)return null;
    const b=svg.getBoundingClientRect(),x=clientX-b.left;let best=null,bd=1e9;
    ch.pts.forEach(p=>{const d=Math.abs(ch.geo.X(p.x)-x);if(d<bd){bd=d;best=p;}});
    return best?{ch,p:best}:null;
  }
  function showTip(svg,hit,pinned){
    const h=st.host,tip=h&&h.querySelector('.hs-tip');if(!tip||!hit)return;
    const {ch,p}=hit,g=ch.geo,cx=g.X(p.x);
    st.host.querySelectorAll('.hs-cross').forEach(x=>{if(x.ownerSVGElement!==svg)x.setAttribute('visibility','hidden');});
    const cross=svg.querySelector('.hs-cross');if(cross){cross.setAttribute('x1',cx);cross.setAttribute('x2',cx);cross.setAttribute('visibility','visible');}
    const evs=(st.trend.ev||[]).filter(e=>e.d===p.d);
    tip.innerHTML='';
    const v=document.createElement('div');v.className='hs-tip-v';v.textContent=p.raw+(p.unit?' '+p.unit:'')+(p.flag?' ('+p.flag+')':'');tip.append(v);
    const l=document.createElement('div');l.className='hs-tip-l';l.textContent=ch.name+' · '+fd(p.d)+(p.time?' '+p.time:'');tip.append(l);
    evs.forEach(e=>{const x=document.createElement('div');x.className='hs-tip-e';x.textContent=e.k+' — '+e.label;tip.append(x);});
    if(pinned){const btn=document.createElement('button');btn.type='button';btn.className='hs-tip-go';btn.textContent='Open in Lab results ›';btn.onclick=()=>openSource('ch:'+p.id);tip.append(btn);}
    tip.hidden=false;tip.classList.toggle('is-pinned',!!pinned);
    const sec=tip.parentElement.getBoundingClientRect(),sb=svg.getBoundingClientRect();
    let left=sb.left-sec.left+cx+12;const tw=tip.offsetWidth||160;if(left+tw>sec.width)left=sb.left-sec.left+cx-tw-12;
    tip.style.left=Math.max(0,left)+'px';tip.style.top=(sb.top-sec.top+g.Y(p.v)-14)+'px';
    st.tipFor={svg,id:p.id,pinned:!!pinned};
  }
  function hideTip(force){
    const h=st.host,tip=h&&h.querySelector('.hs-tip');if(!tip)return;
    if(!force&&st.tipFor&&st.tipFor.pinned)return;
    tip.hidden=true;st.tipFor=null;h.querySelectorAll('.hs-cross').forEach(x=>x.setAttribute('visibility','hidden'));
  }
  function bindCharts(h){
    if(h.dataset.hsCharts)return;h.dataset.hsCharts='1';
    h.addEventListener('pointermove',e=>{const svg=e.target.closest&&e.target.closest('svg.hs-chart');if(!svg||(st.tipFor&&st.tipFor.pinned))return;showTip(svg,chartPoint(svg,e.clientX),false);});
    h.addEventListener('pointerout',e=>{if(e.target.closest&&e.target.closest('svg.hs-chart')&&!(e.relatedTarget&&e.relatedTarget.closest&&e.relatedTarget.closest('svg.hs-chart')))hideTip(false);});
    h.addEventListener('click',e=>{
      const svg=e.target.closest&&e.target.closest('svg.hs-chart');
      if(svg){showTip(svg,chartPoint(svg,e.clientX),true);return;}
      if(!(e.target.closest&&e.target.closest('.hs-tip')))hideTip(true);
    });
    // Keyboard: ← → step through the results, Enter opens the one shown.
    h.addEventListener('keydown',e=>{
      const svg=e.target.closest&&e.target.closest('svg.hs-chart');if(!svg)return;
      const ch=st.trend&&st.trend.charts[+svg.dataset.chart];if(!ch)return;
      let i=ch.pts.findIndex(p=>st.tipFor&&p.id===st.tipFor.id);
      if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();i=i<0?ch.pts.length-1:Math.max(0,Math.min(ch.pts.length-1,i+(e.key==='ArrowRight'?1:-1)));showTip(svg,{ch,p:ch.pts[i]},false);}
      else if(e.key==='Enter'&&i>=0){e.preventDefault();openSource('ch:'+ch.pts[i].id);}
      else if(e.key==='Escape')hideTip(true);
    });
    let t=0;global.addEventListener('resize',()=>{clearTimeout(t);t=setTimeout(()=>{if(st.host&&document.body.contains(st.host)){hideTip(true);drawCharts();}},150);});
  }

  /* ---------- tap a line to open where it came from ----------
     ch:<id> a Hospital records entry · cat:<category> a Hospital records section ·
     rec:<key> a row of the care history (an encounter, a visit, a letter, an
     admission) · panel:<name> a part of the profile · siting the siting window. */
  function flash(el){
    if(!el)return false;
    for(let d=el.closest('details');d;d=d.parentElement&&d.parentElement.closest('details'))if(!d.open)d.open=true;
    el.scrollIntoView({block:'center',behavior:'smooth'});
    el.classList.remove('hs-flash');void el.offsetWidth;el.classList.add('hs-flash');setTimeout(()=>el.classList.remove('hs-flash'),2600);
    return true;
  }
  function openSource(src){
    src=String(src||'');const i=src.indexOf(':'),t=i<0?src:src.slice(0,i),v=i<0?'':src.slice(i+1);
    const CH=global.ClinicalHistory,p=st.patient||{};
    hideTip(true);
    if(t==='ch'){if(CH&&CH.reveal&&CH.reveal(v))return;}
    if(t==='cat'){if(CH&&CH.revealCategory)CH.revealCategory(v);return;}
    if(t==='rec'){
      if(fn('patientDashboardOpen'))global.patientDashboardOpen('history');
      setTimeout(()=>{
        const esc2=global.CSS&&CSS.escape?CSS.escape(v):v.replace(/"/g,'\\"');
        const el=document.querySelector('#pd-history tr[data-rec="'+esc2+'"]');
        if(!flash(el)&&/^encounter:/.test(v)&&fn('openEncounter'))global.openEncounter(p.id,v.slice(10));
      },80);
      return;
    }
    if(t==='panel'){if(fn('patientDashboardOpen'))global.patientDashboardOpen(v);return;}
    if(t==='siting'){if(fn('openPatientSitingSessions'))global.openPatientSitingSessions(p.id,p.id_card,[p.first_name,p.surname].filter(Boolean).join(' '));return;}
  }
  function bindLinks(h){
    if(h.dataset.hsLinks)return;h.dataset.hsLinks='1';
    h.addEventListener('click',e=>{
      if(e.target.closest('button,a,input,select,textarea,summary,svg'))return;
      const l=e.target.closest('[data-src]');if(l&&h.contains(l))openSource(l.dataset.src);
    });
    h.addEventListener('keydown',e=>{
      if(e.key!=='Enter'&&e.key!==' ')return;
      const l=e.target.closest&&e.target.closest('[data-src]');if(!l||e.target.closest('button,svg'))return;
      e.preventDefault();openSource(l.dataset.src);
    });
  }

  /* ---------- since the last clinic visit (for clinic preparation) ----------
     What has been recorded since the patient was last seen in clinic:
     admissions, operations, stomas, medicines, results, complications,
     appliances, nursing reviews, missed visits and correspondence. */
  function sinceLastVisit(c){
    const K=c.K,t=today();
    const seen=c.appts.filter(a=>a.status==='attended'&&!a.community_followup&&day(a.appt_date)&&day(a.appt_date)<t).sort((a,b)=>day(b.appt_date).localeCompare(day(a.appt_date)))[0];
    if(!seen)return null;
    const from=day(seen.appt_date),f1=addDays(from,1),after=d=>!!d&&d>from&&d<=t,items=[],add=(html,src)=>items.push({html,src:src||''});
    const next=c.appts.filter(a=>a.status==='booked'&&!a.community_followup&&day(a.appt_date)>=t).sort((a,b)=>day(a.appt_date).localeCompare(day(b.appt_date)))[0];
    (c.P||[]).forEach(p=>{
      if(!p.opOnly&&after(p.start)){const x=p.cases[0];
        add('Admitted '+B(fd(p.start))+(p.open?' — still an inpatient':p.end&&p.end!==p.start?' → discharged '+B(fd(p.end))+' ('+daysBetween(p.start,p.end)+' days)':'')+(x&&x.e.title?': '+esc(x.e.title):''),x?'ch:'+x.e.id:p.eps[0]?'rec:episode:'+p.eps[0].id:'');}
      p.ops.filter(o=>after(o.date)).forEach(o=>add('Operation '+B(fd(o.date))+': '+esc(uniq(o.procs)[0]||'surgery'),opRef(o)));
    });
    c.stomas.forEach(x=>{
      if(after(day(x.formed_date)))add('Stoma formed '+B(fd(x.formed_date))+': '+esc(stomaName(x)),'panel:stomas');
      if(after(day(x.reversal_date)))add('Stoma closed '+B(fd(x.reversal_date))+': '+esc(stomaName(x)),'panel:stomas');
    });
    K.csAsc.filter(x=>after(x.dis||x.adm)).forEach(x=>{
      const dis=x.list('Treatment on discharge');if(!dis.length)return;
      const ch=medChanges(x.list('Medications on admission'),dis);
      add('Discharge medicines ('+esc(fd(x.dis||x.adm))+'): '+B(dis.length)+(ch.started.length?' — started '+esc(ch.started.join(', ')):'')+(ch.stopped.length?'; stopped '+esc(ch.stopped.join(', ')):''),'ch:'+x.e.id);
    });
    const newPoyc=c.hist.filter(e=>e.category==='poyc'&&after(day(e.created_at)));
    if(newPoyc.length)add('POYC list copied again: '+esc(uniq(newPoyc.map(e=>e.title)).join(', ')),'cat:poyc');
    const labs=c.hist.filter(e=>e.category==='lab'&&after(day(e.entry_date)));
    if(labs.length){
      const lb=lastBloods(K.series,f1,t),tr=bloodTrends(K.series,f1,t);
      add(B(labs.length)+' blood result'+(labs.length===1?'':'s')+(lb&&lb.list.length?'; latest ('+esc(fdS(lb.d))+'): '+lb.list.join(', '):'')+(tr.length?'. '+cap(tr.join('; ')):'')+'.','cat:lab');
      const fl=flaggedIn(c,f1,t);if(fl.length)add('Also flagged by the lab: '+fl.join('; '),'cat:lab');
    }
    c.hist.filter(e=>e.category==='imaging'&&after(day(e.entry_date))).forEach(e=>add(esc(fd(e.entry_date))+' '+B(e.title||'Imaging')+': '+imagingHTML(e,140),'ch:'+e.id));
    c.hist.filter(e=>e.category==='ecg'&&after(day(e.entry_date))).forEach(e=>{const q=qtcOf(e);add('ECG '+esc(fd(e.entry_date))+': '+B(e.title||'no verdict')+(q?' · '+esc(q.k)+' '+q.v+' ms':''),'ch:'+e.id);});
    K.comp.forEach(k=>{
      if(after(day(k.date)))add('Complication recorded '+esc(fd(k.date))+': '+B(k.text)+(k.status==='resolved'?' (since resolved)':''),'panel:stomas');
      else if(k.status==='resolved'&&after(day(k.resolved_date)))add('Complication resolved '+esc(fd(k.resolved_date))+': '+esc(k.text),'panel:stomas');
    });
    const ap=applianceEvents(c,K,f1,t);if(ap.length)add('Appliance: '+esc(ap.map(x=>fdS(x.d)+' '+x.text).join('; ')),'panel:appliances');
    const R=K.R.filter(r=>r.src==='ward'&&after(r.d));
    if(R.length){const r=R[R.length-1],f=reviewFindings(r);add(B(R.length)+' ward nursing review'+(R.length===1?'':'s')+'; latest '+esc(fdS(r.d))+(f.length?': '+esc(f.join(' · ')):''),'rec:encounter:'+r.id);}
    c.appts.filter(a=>after(day(a.appt_date))&&!a.community_followup&&(a.status==='did_not_attend'||a.status==='cancelled'))
      .forEach(a=>add((a.status==='did_not_attend'?'Did not turn up (DNTU)':'Clinic appointment cancelled')+' '+esc(fd(a.appt_date)),'rec:appointment:'+a.id));
    c.appts.filter(a=>a.community_followup&&after(day(a.appt_date))&&a.comcare_feedback).forEach(a=>add('Tele follow-up '+esc(fd(a.appt_date))+': '+textMore(cap(plainNotes(a.comcare_feedback)),120,true),'rec:appointment:'+a.id));
    c.comms.filter(r=>after(isoDay(r.communication_date))).slice(0,5).forEach(r=>add(esc(fd(r.communication_date))+' — '+esc(lcw(r.method)||'contact')+(r.contact_name?' with '+esc(r.contact_name):'')+': '+B(r.subject||'correspondence')+(r.status&&!/^(recorded|completed)$/i.test(r.status)?' ['+esc(lcw(r.status))+']':''),'rec:correspondence:'+r.id));
    K.refs.forEach(r=>{if(after(isoDay(r.referred_on)))add('Referred to the '+esc(lcw(r.profession))+' '+esc(fd(r.referred_on))+(r.seen&&isoDay(r.seen_on)?'; seen '+esc(fd(r.seen_on)):''),'');});
    return {from,days:daysBetween(from,t),by:(seen.staff&&seen.staff.full_name)||'',next:next?day(next.appt_date):'',items};
  }
  function sinceHTML(s){
    if(!s)return '';
    return '<section class="hs-since"><h4>Since the last clinic visit — '+esc(fd(s.from))+' <span>('+s.days+' day'+(s.days===1?'':'s')+' ago'+(s.by?', '+esc(s.by):'')+')'+(s.next?' · for the visit on '+esc(fd(s.next)):'')+'</span></h4>'
      +(s.items.length?'<ul>'+s.items.map(x=>'<li'+(x.src?' class="hs-link" data-src="'+esc(x.src)+'" tabindex="0"':'')+'>'+x.html+'</li>').join('')+'</ul>':'<p class="hs-none">Nothing new recorded since then.</p>')+'</section>';
  }

  /* ---------- watch-points: fixed team rules ----------
     Each rule is a prompt to check something, never a diagnosis, and shows the
     record that set it off. The wording is the team's: change it here and in
     the manual (Holistic summary › Watch-points). */
  function watchPoints(c){
    const K=c.K,p=c.p,t=today(),out=[];
    const st0=fn('normaliseFollowupStatus')?global.normaliseFollowupStatus(p.followup_status):'';
    if(st0==='deceased'||isoDay(p.deceased_date))return out;
    const add=(id,html,why,src)=>out.push({id,html,why,src:src||''});
    const latest=k=>{const a=K.series[k]||[];return a[a.length-1]||null;};
    const recent=(x,n)=>x&&daysBetween(x.d,t)<=n;
    const tyOf=x=>lcw(fn('prettyStomaType')?global.prettyStomaType(x.type):x.type||'stoma');
    const present=c.stomas.filter(x=>x.present);
    // 1. New ileostomy / jejunostomy: output and hydration — the first 2 weeks, or up
    //    to 8 weeks when the kidney results or the salts are off.
    const egfr=latest('egfr'),cr=latest('creat'),na=latest('na'),k=latest('k');
    const renal=[];
    if(recent(egfr,14)&&egfr.v<60)renal.push('eGFR '+val(egfr)+' ('+fdS(egfr.d)+')');
    if(recent(cr,14)&&/^h/i.test(cr.flag))renal.push('creatinine '+val(cr)+' H ('+fdS(cr.d)+')');
    if(recent(na,14)&&/^l/i.test(na.flag))renal.push('sodium '+val(na)+' L ('+fdS(na.d)+')');
    if(recent(k,14)&&/^l/i.test(k.flag))renal.push('potassium '+val(k)+' L ('+fdS(k.d)+')');
    present.filter(x=>/ileo|jejuno/i.test(String(x.type||''))&&isoDay(x.formed_date)).forEach(x=>{
      const d=daysBetween(x.formed_date,t);if(d<0||d>56||(d>14&&!renal.length))return;
      add('ileo-hydration','New '+esc(tyOf(x))+' (day '+d+')'+(renal.length?' with '+esc(renal.join(', ')):'')+' — watch stoma output and hydration (fluid balance, U&amp;Es).',
        'Formed '+fd(x.formed_date)+(renal.length?' · latest kidney / salt results':''),renal.length?'cat:lab':'panel:stomas');
    });
    // 2–4. The last nursing review (ward or clinic, within 30 days): output, colour, skin.
    const last=K.R[K.R.length-1];
    if(last&&daysBetween(last.d,t)<=30){
      const src=last.src==='clinic'?'rec:appointment:'+last.id:'rec:encounter:'+last.id,when=fdS(last.d);
      last.stomas.forEach(x=>{
        const outs=x.output.map(lcw);
        if(/ileo|jejuno/i.test(x.name)&&outs.some(o=>/liquid|watery|high/.test(o)))add('liquid-output','Liquid output from the '+esc(lcw(x.name))+' at the last review ('+esc(when)+') — watch output volume and hydration.','Last review: output '+outs.join(', '),src);
        if(x.colour&&!/healthy|pink/i.test(x.colour))add('colour','The last review ('+esc(when)+') recorded the '+esc(lcw(x.name))+' as '+esc(lcw(x.colour))+' — recheck the colour and report it to the surgical team.','Last review: colour '+lcw(x.colour),src);
        if(/^not healthy/.test(x.skin))add('skin','Peristomal skin '+esc(x.skin)+' at the last review ('+esc(when)+') — check the appliance fit, template size and leaks.','Last review: skin '+x.skin,src);
      });
    }
    // 5. A rod past its planned removal.
    if(isoDay(p.rod_removal_date)&&!isoDay(p.rod_removed_date)&&p.rod_removal_date<t&&present.some(x=>/loop/i.test(String(x.type||''))))
      {const n=daysBetween(p.rod_removal_date,t);add('rod','Rod removal was planned for '+esc(fd(p.rod_removal_date))+' ('+n+' day'+(n===1?'':'s')+' ago) and is not recorded as done — check the rod.','Planned rod removal date','panel:stomas');}
    // 6–8. While an inpatient after an operation.
    const cur=(c.P||[]).find(x=>x.open);
    const encUser=fn('isEncounterUser')&&global.isEncounterUser();
    if(cur){
      const op=cur.ops.length?cur.ops[cur.ops.length-1]:null,pod=op?daysBetween(op.date,t):null;
      const since=op?K.R.filter(r=>r.src==='ward'&&r.d>=op.date):[];
      if(op&&encUser&&pod>=1&&!since.length)add('no-review','No stoma nursing review recorded since the operation on '+esc(fd(op.date))+' (day '+pod+').','Operation '+fd(op.date)+'; no encounter since',opRef(op));
      if(op&&since.length){
        present.filter(x=>day(x.formed_date)===op.date).forEach(x=>{
          const ileo=/ileo|jejuno/i.test(String(x.type||'')),need=ileo?3:5;if(pod<need)return;
          const outs=since.flatMap(r=>r.stomas.filter(s=>lcw(s.name)===tyOf(x)||since.length&&r.stomas.length===1).flatMap(s=>s.output.map(lcw)));
          if(outs.length&&outs.every(o=>o==='nil'))add('nil-output','Only nil output recorded from the '+esc(tyOf(x))+' since the operation (day '+pod+') — keep monitoring the output.','Ward reviews since '+fdS(op.date),'rec:encounter:'+since[since.length-1].id);
        });
      }
      const tr=K.R.filter(r=>r.src==='ward'&&r.d>=cur.start&&r.teaching&&arr(r.teaching.items).length).pop();
      if(tr){const items=arr(tr.teaching.items),done=items.filter(i=>i&&i.done).length;
        if(done<items.length)add('teaching','Stoma teaching '+done+' of '+items.length+' steps — '+(items.length-done)+' still to achieve before discharge.','Teaching plan, '+fdS(tr.d),'rec:encounter:'+tr.id);}
      // 9. A flange change past its due date.
      if(K.H)present.forEach(x=>{const e=(K.H.get(x.uid)||[])[0];if(e&&isoDay(e.flange_due)&&e.flange_due<t)add('flange','Flange change for the '+esc(tyOf(x))+' was due '+esc(fd(e.flange_due))+'.','Appliance set '+fdS(e.date),'panel:appliances');});
    }
    // 10. A present stoma with no appliance recorded.
    if(K.H)present.forEach(x=>{if(!(K.H.get(x.uid)||[]).length)add('no-appliance','No appliance recorded for the '+esc(tyOf(x))+'.','Appliances & accessories','panel:appliances');});
    // 11. Missed visits and an overdue follow-up.
    const past=c.appts.filter(a=>!a.community_followup&&day(a.appt_date)&&day(a.appt_date)<t&&a.status!=='booked').sort((a,b)=>day(b.appt_date).localeCompare(day(a.appt_date)));
    if(past.length>=2&&past[0].status==='did_not_attend'&&past[1].status==='did_not_attend')
      add('dntu','Did not turn up for the last 2 clinic appointments ('+esc(fdS(past[1].appt_date))+', '+esc(fdS(past[0].appt_date))+').','Appointments','rec:appointment:'+past[0].id);
    const f=global.patientFollowupSummary;
    if(f&&String(f.patientId)===String(p.id))(f.items||[]).filter(x=>x.tone==='overdue').forEach(x=>add('overdue','Follow-up overdue ('+esc(x.value.replace(/\s*·\s*overdue$/,''))+') with no appointment booked.','Follow-up due month','panel:appts'));
    // 12. Correspondence follow-ups that have come due.
    c.comms.filter(r=>!r.parent_id&&r.status!=='Completed'&&isoDay(r.followup_date)&&r.followup_date<t)
      .forEach(r=>add('corr','Correspondence follow-up on “'+esc(r.subject||'(no subject)')+'” was due '+esc(fd(r.followup_date))+'.','Correspondence','rec:correspondence:'+r.id));
    return out;
  }
  function watchHTML(w){
    if(!w.length)return '';
    return '<section class="hs-watch"><h4>⚠ Watch-points <span>fixed team rules — a prompt to check, not a diagnosis</span></h4><ul>'
      +w.map(x=>'<li'+(x.src?' class="hs-link" data-src="'+esc(x.src)+'" tabindex="0"':'')+'><span class="hs-w-t">'+x.html+'</span><span class="hs-w-why">'+esc(x.why)+'</span></li>').join('')+'</ul></section>';
  }

  /* ---------- print or send: a one-page handover or a referral letter ---------- */
  const pr={kind:'handover',to:'',why:'',watch:true,since:true,story:true,by:'',pid:''};
  const fullHTML=h=>String(h||'').replace(/<button[\s\S]*?<\/button>/g,'').replace(/<span class="hs-rest" hidden>/g,'<span>');
  function letterParts(){
    const B0=st.built;if(!B0)return null;
    const c=B0.c,p=c.p,syn=B0.syn,sto=B0.sto;
    const name=[p.first_name,p.surname].filter(Boolean).join(' ')||'Patient',age=ageOf(p);
    const ep=(c.P||[]).find(x=>x.open),ward=ep&&ep.eps[0]?(ep.eps[0].ward||p.inpatient_ward||''):'';
    const stomas=c.stomas.filter(x=>x.present).map(stomaName);
    // The story: the latest admission and what has happened since (one page).
    const paras=sto.paras.filter(x=>x.head!=='Background'&&x.head!=='Next');
    let from=paras.map(x=>x.head).reduce((a,h,i)=>/· (Admission|Operation)$/.test(h)?i:a,-1);
    const story=pr.story?paras.slice(from<0?Math.max(0,paras.length-2):from):[];
    return {c,p,name,age,ward,stomas,syn,story,watch:pr.watch?B0.watch:[],since:pr.since?B0.since:null,next:sto.paras.find(x=>x.head==='Next')};
  }
  function letterHTML(L){
    const p=L.p,dob=isoDay(p.date_of_birth)?fd(p.date_of_birth):'',dt=fd(today());
    const row=(k,v)=>v?'<tr><th>'+esc(k)+'</th><td>'+v+'</td></tr>':'';
    const head='<div class="lt-head"><img src="'+esc(new URL('assets/mater-dei-logo.png',location.href).href)+'" alt=""><div><b>Stoma Care Clinic</b><br>Mater Dei Hospital</div><div class="lt-date">'+esc(dt)+'</div></div>';
    // The referral names the patient in its "Re:" line; the handover in this table.
    const idRows=pr.kind==='referral'?'':row('Patient',esc(L.name))+row('ID card',esc(p.id_card||''))+row('Date of birth',esc(dob)+(L.age!=null?' ('+L.age+' years)':''));
    const who='<table class="lt-id">'+idRows
      +row('Consultant',esc(p.consultant||''))+row('Ward',esc(L.ward))+row('Stoma'+(L.stomas.length===1?'':'s'),esc(L.stomas.join('; ')||'none present'))+'</table>';
    const syn=L.syn.sentences.filter(x=>!['Next'].includes(x.k)).map(x=>'<tr><th>'+esc(x.k)+'</th><td>'+fullHTML(x.html)+'</td></tr>').join('');
    const watch=L.watch.length?'<h3>Watch-points</h3><ul class="lt-list">'+L.watch.map(x=>'<li>'+x.html+'</li>').join('')+'</ul>':'';
    const since=L.since?'<h3>Since the last clinic visit ('+esc(fd(L.since.from))+')</h3>'+(L.since.items.length?'<ul class="lt-list">'+L.since.items.map(x=>'<li>'+fullHTML(x.html)+'</li>').join('')+'</ul>':'<p>Nothing new recorded since then.</p>'):'';
    const story=L.story.length?'<h3>Clinical course</h3>'+L.story.map(x=>'<p class="lt-par"><b>'+esc(x.head)+'.</b> '+fullHTML(x.html).replace(/<span class="hs-ev[^"]*"[^>]*>/g,'<span>')+'</p>').join(''):'';
    const next=L.next?'<h3>Next</h3><p>'+L.next.html+'</p>':'';
    const sign='<p class="lt-sign">'+(pr.by?esc(pr.by)+'<br>':'')+'Stoma Care Nurse, Stoma Care Clinic, Mater Dei Hospital<br>'+esc(typeof STOMA_CARE_EMAIL!=='undefined'?STOMA_CARE_EMAIL:'')+'</p>';
    if(pr.kind==='referral')
      return head+'<h2>Referral</h2><p>'+(pr.to?'To: <b>'+esc(pr.to)+'</b><br>':'')+'Re: <b>'+esc(L.name)+'</b>'+(p.id_card?', ID '+esc(p.id_card):'')+(dob?', born '+esc(dob):'')+'</p>'
        +'<p>Dear colleague, '+(pr.why?'I would be grateful if you could see this patient: <b>'+esc(pr.why)+'</b>.':'I would be grateful if you could see this patient.')+' A summary of the stoma care record follows.</p>'
        +who+'<h3>Summary</h3><table class="lt-syn">'+syn+'</table>'+watch+since+story+next+sign.replace('<p class="lt-sign">','<p class="lt-sign">Yours sincerely,<br>');
    return head+'<h2>Stoma care handover</h2>'+who+watch+'<h3>Summary</h3><table class="lt-syn">'+syn+'</table>'+since+story+next+sign;
  }
  const LETTER_CSS='@page{size:A4;margin:12mm}html,body{margin:0;background:#fff}body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.26;color:#111}'
    +'.lt-bar{margin:10px 0 14px;display:flex;gap:10px;align-items:center}.lt-bar button{font:600 13px Arial;padding:8px 14px;border:1px solid #0d7377;background:#0d7377;color:#fff;border-radius:8px;cursor:pointer}'
    +'.lt{max-width:186mm;margin:0 auto}.lt-head{display:flex;align-items:center;gap:10px;border-bottom:2px solid #0d7377;padding-bottom:6px;margin-bottom:6px}.lt-head img{height:34px}.lt-date{margin-left:auto;color:#444}'
    +'h2{font-size:12.5pt;margin:3px 0 4px;color:#0d4f52}h3{font-size:9.8pt;margin:6px 0 2px;color:#0d4f52;border-bottom:1px solid #d6dee6;padding-bottom:1px}'
    +'table{border-collapse:collapse;width:100%}th{text-align:left;vertical-align:top;width:27mm;padding:1px 6px 1px 0;color:#333;font-weight:700}td{padding:1px 0;vertical-align:top}'
    +'.lt-id{margin:3px 0 2px}.lt-list{margin:1px 0;padding-left:15px}.lt-list li{margin:0}.lt-par{margin:2px 0}.lt-par span{display:inline}.lt-sign{margin-top:8px}'
    +'@media print{.lt-bar{display:none}}';
  function letterText(){
    const L=letterParts();if(!L)return '';
    const d=document.createElement('div');d.innerHTML=letterHTML(L);
    d.querySelectorAll('img').forEach(x=>x.remove());
    d.querySelectorAll('h2,h3,p,li,tr,br').forEach(x=>{if(x.tagName==='BR')x.replaceWith('\n');else x.append('\n');});
    d.querySelectorAll('th').forEach(x=>x.append(': '));
    d.querySelectorAll('li').forEach(x=>x.prepend('- '));
    return d.textContent.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function prRead(){
    const v=id=>{const el=document.getElementById(id);return el?el:null;};
    const k=document.querySelector('input[name="hs-pr-kind"]:checked');if(k)pr.kind=k.value;
    if(v('hs-pr-to'))pr.to=v('hs-pr-to').value.trim();if(v('hs-pr-why'))pr.why=v('hs-pr-why').value.trim();
    ['watch','since','story'].forEach(x=>{if(v('hs-pr-'+x))pr[x]=v('hs-pr-'+x).checked;});
    const ref=v('hs-pr-refbox');if(ref)ref.hidden=pr.kind!=='referral';
    const pv=v('hs-pr-preview');const L=letterParts();if(pv&&L)pv.innerHTML='<div class="lt">'+letterHTML(L)+'</div>';
  }
  async function printOpen(){
    const mb=document.getElementById('mb');if(!mb||!st.built)return;
    if(pr.pid!==st.pid){const inp=(st.built.c.P||[]).some(x=>x.open);Object.assign(pr,{pid:st.pid,kind:'handover',to:'',why:'',watch:true,since:!inp,story:true});}
    try{if(!pr.by&&fn('getCurrentUserForAudit')){const u=await global.getCurrentUserForAudit();pr.by=(u&&u.name)||'';}}catch(e){}
    mb.className='mb hs-pr-modal';
    mb.innerHTML='<h2>🖨 Print or send</h2>'
      +'<div class="hs-pr-row" role="radiogroup" aria-label="Kind of letter"><label><input type="radio" name="hs-pr-kind" value="handover"'+(pr.kind==='handover'?' checked':'')+'> One-page handover</label>'
      +'<label><input type="radio" name="hs-pr-kind" value="referral"'+(pr.kind==='referral'?' checked':'')+'> Referral letter</label></div>'
      +'<div id="hs-pr-refbox"'+(pr.kind==='referral'?'':' hidden')+'><div class="fg"><label for="hs-pr-to">To</label><input id="hs-pr-to" value="'+esc(pr.to)+'" placeholder="e.g. Dietitian, Mater Dei Hospital"></div>'
      +'<div class="fg"><label for="hs-pr-why">Reason for referral</label><textarea id="hs-pr-why" rows="2" placeholder="e.g. high ileostomy output — dietary advice">'+esc(pr.why)+'</textarea></div></div>'
      +'<div class="hs-pr-row"><label><input type="checkbox" id="hs-pr-watch"'+(pr.watch?' checked':'')+'> Watch-points</label><label><input type="checkbox" id="hs-pr-since"'+(pr.since?' checked':'')+'> Since the last clinic visit</label><label><input type="checkbox" id="hs-pr-story"'+(pr.story?' checked':'')+'> Clinical course (latest admission and since)</label></div>'
      +'<div class="hs-pr-preview" id="hs-pr-preview" aria-label="Preview"></div>'
      +'<div class="mact"><button class="btn-cancel" onclick="closeModal()">Close</button><button class="btn-save" onclick="HolisticSummary._prCopy(this)">📋 Copy text</button>'
      +'<button class="btn-save" onclick="HolisticSummary._prEmail()">📧 Email</button><button class="btn-save" onclick="HolisticSummary._prPrint()">🖨 Print / PDF</button></div>';
    mb.querySelectorAll('input,textarea').forEach(el=>el.addEventListener('input',prRead));
    mb.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(el=>el.addEventListener('change',prRead));
    if(fn('openMo'))global.openMo();
    prRead();
  }
  function prPrint(){
    prRead();const L=letterParts();if(!L)return;
    const w=global.open('','_blank');if(!w){alert('Please allow pop-ups to open the letter.');return;}
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc((pr.kind==='referral'?'Referral':'Handover')+' — '+L.name)+'</title><style>'+LETTER_CSS+'</style></head><body><div class="lt">'
      +'<div class="lt-bar"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>'+letterHTML(L)+'</div></body></html>');
    w.document.close();w.focus();
  }
  async function prCopy(btn){
    prRead();const text=letterText();let ok=false;
    try{await navigator.clipboard.writeText(text);ok=true;}catch(e){try{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();ok=document.execCommand('copy');t.remove();}catch(_){}}
    if(btn){const was=btn.textContent;btn.textContent=ok?'✓ Copied':'Could not copy';setTimeout(()=>{btn.textContent=was;},1600);}
  }
  function prEmail(){
    prRead();const text=letterText(),L=letterParts();if(!L)return;
    const long=text.length>1700,body=long?text.slice(0,1600).replace(/\s+\S*$/,'')+'\n\n[Continued — the full letter is attached as a PDF.]':text;
    const subject='Stoma care '+(pr.kind==='referral'?'referral':'handover')+(pr.kind==='referral'&&pr.to?' — '+pr.to:'');
    const go=fn('openMailtoLink')||(h=>{location.href=h;});
    go('mailto:?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body));
    if(long)setTimeout(()=>alert('An email draft has opened with the start of the letter. Press 🖨 Print / PDF, save it as a PDF and attach it to the email.'),400);
  }

  const SECTIONS=[['Patient',overview],['Background',background],['Surgical history',surgical],['Admissions & encounters',admissions],['Hospital stays (case summaries)',hospitalStays],
    ['Stoma care',stomaCare],['Nursing reviews',nursingReviews],['Medicines',medicines],['Investigations',investigations],['Correspondence',correspondence],['Follow-up',followup]];

  /* ---------- drawing ---------- */
  function build(){
    const c=data();if(!c)return null;
    c.K=storyContext(c);
    try{c.P=storyPeriods(c);}catch(e){c.P=[];}
    st.patient=c.p;
    let syn={sentences:[],kpis:[]};try{syn=synopsis(c);}catch(e){syn={sentences:[{k:'Note',html:'The synopsis could not be put together: '+esc(e&&e.message||e)}],kpis:[]};}
    const secs=SECTIONS.map(([title,f])=>{let lines=[];try{lines=f(c)||[];}catch(e){lines=[L('Could not be put together: '+(e&&e.message||e),'')];}return {title,lines};}).filter(s=>s.lines.length);
    let sto={paras:[],gaps:[]};try{sto=story(c);}catch(e){sto={paras:[{head:'Note',html:'The story could not be put together: '+esc(e&&e.message||e)}],gaps:[]};}
    let watch=[];try{watch=watchPoints(c);}catch(e){watch=[];}
    let since=null;try{since=sinceLastVisit(c);}catch(e){since=null;}
    return {c,syn,secs,sto,watch,since};
  }
  function render(){
    const h=st.host;if(!h||!document.body.contains(h))return;
    const d=h.closest('details');if(d&&!d.open)return;
    const built=build();if(!built)return;st.built=built;
    const {secs,syn,sto,watch,since}=built;
    st.at=new Date();
    const txt=h=>{const d=document.createElement('div');d.innerHTML=h;d.querySelectorAll('button').forEach(x=>x.remove());return d.textContent.replace(/\s+/g,' ').trim();};
    st.plain=(watch.length?'WATCH-POINTS (fixed team rules — a prompt to check, not a diagnosis)\n'+watch.map(x=>'- '+txt(x.html)).join('\n')+'\n\n':'')
      +(since?'SINCE THE LAST CLINIC VISIT ('+fd(since.from)+')\n'+(since.items.length?since.items.map(x=>'- '+txt(x.html)).join('\n'):'Nothing new recorded since then.')+'\n\n':'')
      +'CLINICAL SYNOPSIS\n'+syn.sentences.map(x=>x.k+': '+txt(x.html)).join('\n')+'\n\n'
      +(sto.paras.length?'CLINICAL RATIONALE — THE STORY SO FAR\n'+sto.paras.map(x=>x.head+': '+txt(x.html)).join('\n')+(sto.gaps.length?'\nTo complete the story, paste: '+sto.gaps.join('; ')+'.':'')+'\n\n':'')
      +secs.map(s=>s.title.toUpperCase()+'\n'+s.lines.map(l=>'- '+l.text+(l.src?' ['+l.src+(l.date?', '+fd(l.date):'')+']':'')).join('\n')).join('\n\n');
    const link=src=>src?' class="hs-link" data-src="'+esc(src)+'" tabindex="0"':'';
    h.innerHTML='<div class="hs">'
      +'<div class="hs-bar"><span class="hs-live" title="Rebuilt automatically from this patient’s records whenever they change. Each line shows where it came from; reasons are the ones written in the records.">● Live · updated '+esc(st.at.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))+'</span>'
      +'<button type="button" class="psm-btn" onclick="HolisticSummary.copy(this)">📋 Copy summary</button>'
      +'<button type="button" class="psm-btn" onclick="HolisticSummary.print()">🖨 Print / send</button></div>'
      +(syn.kpis.length?'<div class="hs-kpis">'+syn.kpis.map(k=>'<div class="hs-kpi'+(k.tone?' is-'+k.tone:'')+'"><span class="hs-kpi-l">'+esc(k.label)+'</span><span class="hs-kpi-v">'+esc(String(k.value))+'</span><span class="hs-kpi-s">'+esc(k.sub||'')+'</span></div>').join('')+'</div>':'')
      +watchHTML(watch)+sinceHTML(since)
      +(syn.sentences.length?'<section class="hs-syn"><h4>Clinical synopsis</h4><dl>'+syn.sentences.map(x=>'<dt>'+esc(x.k)+'</dt><dd'+link(x.src)+'>'+x.html+'</dd>').join('')+'</dl></section>':'')
      +trendsShell(built.c)
      +(sto.paras.length?'<section class="hs-story"><h4>Clinical rationale — the story so far <span class="hs-hint">tap a line to open the record it came from</span></h4>'
        +sto.paras.map(x=>'<div class="hs-par"><div class="hs-par-h">'+esc(x.head)+'</div><p>'+x.html+'</p></div>').join('')
        +(sto.gaps.length?'<p class="hs-gaps">To complete the story, paste '+esc(sto.gaps.join('; '))+'.</p>':'')+'</section>':'')
      +secs.map(s=>'<details class="hs-sec" data-k="'+esc(s.title)+'"'+(st.open.has(s.title)?' open':'')+' ontoggle="HolisticSummary._toggle(this)"><summary>'+esc(s.title)+' <span class="ch-sum-count">'+s.lines.length+'</span></summary><ul>'+s.lines.map(l=>'<li><span class="hs-text">'+esc(l.text)+'</span>'
        +(l.src?' <span class="hs-src">'+esc(l.src)+(l.date?' · '+esc(fd(l.date)):'')+'</span>':'')+'</li>').join('')+'</ul></details>').join('')
      +'</div>';
    bindLinks(h);bindCharts(h);drawCharts();
  }
  function mount(host,patient){
    if(!host||!patient)return;
    if(st.pid!==String(patient.id)){st.open=new Set();st.range='';st.table=false;st.tipFor=null;}
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
  function setRange(id){st.range=String(id||'');hideTip(true);render();}
  function toggleTable(){st.table=!st.table;render();}
  global.HolisticSummary={mount,render,refresh,copy,print:printOpen,openSource,_toggle:toggle,_build:build,_range:setRange,_table:toggleTable,_prPrint:prPrint,_prCopy:prCopy,_prEmail:prEmail};
})(window);
