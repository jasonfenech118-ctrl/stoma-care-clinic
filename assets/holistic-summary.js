/* ==================================================================== *
 * Holistic summary — the last fold-out on the patient profile.
 *
 * One technical summary of everything recorded for the patient, built by fixed
 * rules from the data the app already holds (no AI; nothing leaves the app):
 * the patient and current stomas, the surgical history with its indications and
 * findings, admissions and encounters, appliances and complications, medicines,
 * investigations, and follow-up.
 *
 * Every line names where it came from and its date. The reasons are the ones
 * written in the records (indication, operation findings, reason for an
 * admission, a complication's note), never the app's own clinical conclusions.
 *
 * It is LIVE: rebuilt whenever the profile refreshes (a new encounter, an edited
 * stoma, another nurse's change) and whenever a Hospital records paste is saved.
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
  const st={host:null,pid:null,at:null,plain:''};

  // A consultation note's / ECG's sections ("§ Name" lines).
  function sections(text){
    const s=String(text||'');if(!/^§ /m.test(s))return [];
    return s.split(/^§ /m).filter(x=>x.trim()).map(p=>{const i=p.indexOf('\n');return i<0?{label:p.trim(),value:''}:{label:p.slice(0,i).trim(),value:p.slice(i+1).trim()};});
  }
  const sec=(e,label)=>((sections(e.result).find(x=>x.label.toLowerCase()===label.toLowerCase())||{}).value||'');

  function data(){
    const s=typeof clrState!=='undefined'?clrState:null;
    const p=s&&s.patient;if(!p)return null;
    const CH=global.ClinicalHistory;
    return {p,rows:s.rows||[],appts:s.appts||[],enc:s.encounters||[],
      hist:CH&&typeof CH.entries==='function'?CH.entries(p.id):[],
      stomas:(()=>{try{return fn('patientStomaList')?global.patientStomaList(p)||[]:[];}catch(e){return [];}})()};
  }
  function stomaName(x){
    const t=fn('stomaTitle')?global.stomaTitle(x):'Stoma '+(x.number||'');
    const type=x.type?(fn('prettyStomaType')?global.prettyStomaType(x.type):x.type):'type not recorded';
    return t+' · '+type+(x.code?' ('+x.code+')':'');
  }
  const L=(text,src,date)=>({text,src:src||'',date:date||''});

  /* ---------- the sections ---------- */
  function overview(c){
    const p=c.p,out=[];
    const age=fn('ageYearsBetween')&&p.date_of_birth?global.ageYearsBetween(p.date_of_birth,today()):null;
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
  function surgical(c){
    const ev=new Map();
    const at=d=>{d=day(d)||'';if(!ev.has(d))ev.set(d,{date:d,procs:[],by:[],ind:[],find:[],stoma:[],src:new Set()});return ev.get(d);};
    c.stomas.forEach(x=>{
      if(x.formed_date){const e=at(x.formed_date);e.stoma.push((x.kind==='refashion'?'Refashioned ':'Formed ')+stomaName(x)+(x.location?', '+x.location:''));
        if(x.operation)e.procs.push(x.operation);e.src.add('Stomas & surgery');}
      if(x.reversal_date){const e=at(x.reversal_date);e.stoma.push('Closed '+stomaName(x)+(x.reversal_notes?' — '+x.reversal_notes:''));e.src.add('Stomas & surgery');}
      if(x.superseded_date){const e=at(x.superseded_date);e.stoma.push('Replaced '+stomaName(x));e.src.add('Stomas & surgery');}
    });
    c.hist.filter(e=>e.category==='surgery').forEach(h=>{const e=at(h.entry_date);if(h.title)e.procs.push(h.title);if(h.source)e.by.push(h.source);e.src.add('Performed procedures');});
    c.hist.filter(e=>e.category==='consult').forEach(h=>{
      const e=at(h.entry_date),ind=sec(h,'Indications'),find=sec(h,'Operation findings')||sec(h,'Findings');
      if(h.title)e.procs.push(h.title);if(h.source)e.by.push(h.source);
      if(ind)e.ind.push(ind.split('\n')[0]);if(find)e.find.push(find.split('\n')[0]);e.src.add('Patient consultation');
    });
    const uniq=a=>{const seen=new Set();return a.filter(x=>{const k=norm(x);if(!k||seen.has(k))return false;seen.add(k);return true;});};
    return [...ev.values()].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')).map(e=>L(
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
      const why=[ep.title&&!/^inpatient visit$/i.test(ep.title)?ep.title:'',ep.detail||''].filter(Boolean).join(' — ');
      out.push(L('Admitted '+fd(ep.record_date)+(ward?', '+ward:'')+(open?' — inpatient now, day '+los:ep.discharge_date?' → discharged '+fd(ep.discharge_date)+' ('+los+' day'+(los===1?'':'s')+')':'')
        +(why?' · Reason: '+why:'')+(enc(ep)?' · '+enc(ep)+' encounter'+(enc(ep)===1?'':'s'):''),'Appointments & episodes',ep.record_date));
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
      if(!e.first&&(e.added.length||e.stopped.length))
        out.push(L('Last change '+fd(e.date)+': '+[e.added.length?'started '+e.added.join(', '):'',e.stopped.length?'stopped '+e.stopped.join(', '):''].filter(Boolean).join('; ')+(evs.length>1?' · '+evs.length+' entries in all':''),'Appliances & accessories',e.date));
    });
    let comp=[];try{comp=fn('parseComplications')?global.parseComplications(c.p):[];}catch(e){comp=[];}
    const open=comp.filter(x=>x.status!=='resolved'),done=comp.filter(x=>x.status==='resolved');
    open.forEach(x=>{const last=(x.events||[]).slice(-1)[0];
      out.push(L('Complication (open): '+x.text+(x.stoma?' — '+x.stoma:'')+(x.date?' since '+fd(x.date):'')+(last&&(last.trend||last.note)?' · latest: '+one([last.trend,last.note].filter(Boolean).join(' — '),120):x.note?' · '+one(x.note,120):''),'Complications',x.date));});
    if(done.length)out.push(L('Resolved complications: '+done.map(x=>x.text+(x.resolved_date?' ('+fd(x.resolved_date)+')':'')).join('; '),'Complications'));
    return out;
  }
  function medicines(c){
    const poyc=c.hist.filter(e=>e.category==='poyc');if(!poyc.length)return [];
    const last=poyc.reduce((a,e)=>String(e.created_at||'')>String(a.created_at||'')?e:a,poyc[0]);
    const names=poyc.map(e=>e.title).filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
    return [L(names.length+' medicine'+(names.length===1?'':'s')+' on Entitlement CARE: '+names.join('; '),'Entitlement CARE (POYC)',last.created_at)];
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
      out.push(L(fd(e.entry_date)+' '+(e.title||'Imaging')+': '+one(m&&m[1].trim()?m[1]:e.result,180),'Medical imaging results',e.entry_date));
    });
    const icm=c.hist.filter(e=>e.category==='doc_icm');
    if(icm.length){const e=icm.reduce((a,x)=>(day(x.entry_date)+(x.entry_time||''))>(day(a.entry_date)+(a.entry_time||''))?x:a,icm[0]);
      out.push(L(icm.length+' iCM note'+(icm.length===1?'':'s')+'; latest '+fd(e.entry_date)+(e.entry_type?' ('+e.entry_type+')':'')+': '+one(e.result,140),'iCM notes',e.entry_date));}
    return out;
  }
  function followup(c){
    const f=global.patientFollowupSummary;
    if(!f||String(f.patientId)!==String(c.p.id))return [];
    return (f.items||[]).map(x=>L(x.label+': '+x.value,'Appointments'));
  }

  const SECTIONS=[['Patient',overview],['Surgical history',surgical],['Admissions & encounters',admissions],['Stoma care',stomaCare],
    ['Medicines',medicines],['Investigations',investigations],['Follow-up',followup]];

  /* ---------- drawing ---------- */
  function build(){
    const c=data();if(!c)return null;
    return SECTIONS.map(([title,f])=>{let lines=[];try{lines=f(c)||[];}catch(e){lines=[L('Could not be put together: '+(e&&e.message||e),'')];}return {title,lines};}).filter(s=>s.lines.length);
  }
  function render(){
    const h=st.host;if(!h||!document.body.contains(h))return;
    const d=h.closest('details');if(d&&!d.open)return;
    const secs=build();if(!secs)return;
    st.at=new Date();
    st.plain=secs.map(s=>s.title.toUpperCase()+'\n'+s.lines.map(l=>'- '+l.text+(l.src?' ['+l.src+(l.date?', '+fd(l.date):'')+']':'')).join('\n')).join('\n\n');
    h.innerHTML='<div class="hs">'
      +'<div class="hs-bar"><span class="hs-live" title="Rebuilt automatically from this patient’s records whenever they change. Each line shows where it came from; reasons are the ones written in the records.">● Live · updated '+esc(st.at.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))+'</span>'
      +'<button type="button" class="psm-btn" onclick="HolisticSummary.copy(this)">📋 Copy summary</button></div>'
      +secs.map(s=>'<section class="hs-sec"><h4>'+esc(s.title)+'</h4><ul>'+s.lines.map(l=>'<li><span class="hs-text">'+esc(l.text)+'</span>'
        +(l.src?' <span class="hs-src">'+esc(l.src)+(l.date?' · '+esc(fd(l.date)):'')+'</span>':'')+'</li>').join('')+'</ul></section>').join('')
      +'</div>';
  }
  function mount(host,patient){
    if(!host||!patient)return;
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
  // Hospital records saved or loaded → rebuild (only while open).
  document.addEventListener('clinical-history:changed',render);
  global.HolisticSummary={mount,render,copy,_build:build};
})(window);
