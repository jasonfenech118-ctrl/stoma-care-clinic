/* Episode & encounter codes — EP01-12345M-01-I.

   EP<n>     the patient's own episode count (EP01 = first episode).
   12345M    the patient's ID card.
   -<k>      the encounter number inside that episode (restarts at 01 each episode).
   -<type>   I  = inpatient encounter
             CC = community correspondence
             PC = patient correspondence
             DC = doctors correspondence
             F  = follow-up visit (an attended clinic / tele appointment)
   Numbers have at least two digits and grow as needed (09, 10 … 99, 100).

   Episodes:
   • Every admission is an episode. Anything recorded while the patient is
     admitted (inpatient encounters and any correspondence) is an encounter of
     that admission — unless the nurse chose to open that correspondence as an
     episode of its own (communication_episode_choices).
   • Correspondence or a follow-up visit while the patient is NOT admitted
     opens an episode (or joins one still open). It stays open until every correspondence in it is
     Resolved or the patient is admitted; further correspondence meanwhile (and
     every follow-up update) is added to it as the next encounter.

   Codes are worked out from the saved dates every time, so existing records get
   them automatically and nothing in the database is rewritten. */
(function(global){
  'use strict';
  const cache=new Map();      // patientId -> computed result
  const pending=new Map();    // patientId -> in-flight promise
  const pad=n=>n<10?'0'+n:String(n);
  const day=v=>String(v||'').slice(0,10);
  function maltaDay(t){
    if(!t)return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(t)))return String(t);
    try{return new Date(t).toLocaleDateString('en-CA',{timeZone:'Europe/Malta'});}catch(e){return day(t);}
  }
  function idPart(patient){return String(patient&&patient.id_card||'').replace(/\s+/g,'').toUpperCase()||'NOID';}
  function commType(c){
    if(c.kind==='followup')return 'F';
    if(c.kind==='doctor')return 'DC';   // a Doctors correspondence kind of its own (with Dataverse)
    if(c.kind==='patient')return 'PC';
    return /doctor/i.test(String(c.service||''))?'DC':'CC';
  }
  // A sortable moment for an item: its date, then its time / save time.
  function commMoment(c){return day(c.communication_date)+'T'+(c.communication_time?String(c.communication_time).slice(0,8):'99:99')+'|'+String(c.created_at||'');}
  function encMoment(e){return day(e.encounter_date||maltaDay(e.created_at))+'T'+String(e.created_at||'').slice(11,19)+'|'+String(e.created_at||'');}

  /* Pure: build every code for one patient. */
  function compute(patient,episodes,encounters,comms,appointments){
    const id=idPart(patient);
    // Admissions as dated intervals [start, end] (end '' = still open).
    const adm=(episodes||[]).filter(e=>e&&e.id).map(e=>{
      const start=day(e.record_date)||maltaDay(e.created_at);
      let end=day(e.discharge_date);
      if(!end&&!(e.is_current&&!e.discharge_date))end=maltaDay(e.updated_at)||start;   // closed without a discharge date (e.g. old case)
      if(end&&end<start)end=start;
      return {kind:'admission',key:'adm:'+e.id,ref:e,start,end,items:[]};
    }).sort((a,b)=>a.start.localeCompare(b.start)||String(a.ref.id).localeCompare(String(b.ref.id)));
    const admissionOn=d=>{
      // The admission covering this day (latest start wins on overlaps).
      let hit=null;
      adm.forEach(a=>{if(a.start<=d&&(!a.end||d<=a.end))hit=a;});
      return hit;
    };
    const byEpisodeId=new Map(adm.map(a=>[String(a.ref.id),a]));
    // Inpatient encounters: their own admission when linked, else by date.
    (encounters||[]).forEach(e=>{
      if(!e||!e.id)return;
      const d=day(e.encounter_date)||maltaDay(e.created_at);
      let a=e.episode_id?byEpisodeId.get(String(e.episode_id)):null;
      if(!a)a=admissionOn(d);
      if(!a){const before=adm.filter(x=>x.start<=d);a=before[before.length-1]||adm[0]||null;}
      if(a)a.items.push({type:'I',id:'enc:'+e.id,moment:encMoment(e)});
    });
    // Correspondence: roots first decide their episode; updates follow their root.
    // Follow-up visits behave like correspondence that is finished at the end
    // of its day: it opens (or joins) an episode outside an admission, and
    // anything recorded later that day still joins it.
    const visits=(appointments||[]).filter(a=>a&&a.id&&String(a.status||'')==='attended'&&day(a.appt_date)
      &&!(typeof global.isLegacyAdminAppliancePlaceholder==='function'&&global.isLegacyAdminAppliancePlaceholder(a)))
      .map(a=>({id:'appt-'+a.id,_appt:a,kind:'followup',communication_date:day(a.appt_date),
        communication_time:a.appt_slot?String(a.appt_slot).slice(0,5)+':00':null,
        created_at:day(a.appt_date)+'T'+(a.appt_slot?String(a.appt_slot).slice(0,5):'00:00')+':00',
        status:'Completed',resolved_at:day(a.appt_date)+'T23:59:59'}));
    const all=(comms||[]).filter(c=>c&&c.id).concat(visits);
    const roots=all.filter(c=>!c.parent_id).sort((a,b)=>commMoment(a).localeCompare(commMoment(b)));
    const corr=[];let open=null;const placed=new Map();   // root id -> episode
    const resolvedDay=c=>c.status==='Completed'?(maltaDay(c.resolved_at)||maltaDay(c.updated_at)||day(c.communication_date)):'';
    roots.forEach(c=>{
      const d=day(c.communication_date)||maltaDay(c.created_at);
      const a=admissionOn(d);
      // While admitted, correspondence joins the admission — unless the nurse
      // chose to open it as an episode of its own.
      if(a&&!c.separate_episode){placed.set(String(c.id),a);return;}
      if(open){
        // Closed by an admission that started since it opened, or by every
        // correspondence in it being resolved before this one.
        const admitted=adm.some(x=>x.start>open.start&&x.start<=d);
        // Exact times when both are known (resolved earlier the same day still
        // closes it), otherwise by date.
        const allResolved=open.roots.every(r=>{
          if(r.status!=='Completed')return false;
          if(r.resolved_at&&c.created_at)return new Date(r.resolved_at).getTime()<new Date(c.created_at).getTime();
          const rd=resolvedDay(r);return !!rd&&rd<d;});
        if(admitted||allResolved)open=null;
      }
      if(!open){open={kind:'correspondence',key:'corr:'+c.id,ref:c,start:d,items:[],roots:[]};corr.push(open);}
      open.roots.push(c);placed.set(String(c.id),open);
    });
    all.forEach(c=>{
      const ep=placed.get(String(c.parent_id||c.id));
      if(ep)ep.items.push({type:commType(c.parent_id?(all.find(r=>String(r.id)===String(c.parent_id))||c):c),id:'comm:'+c.id,moment:commMoment(c)});
    });
    // Number the episodes in date order, then the encounters inside each.
    const eps=adm.concat(corr).sort((a,b)=>a.start.localeCompare(b.start)||(a.kind==='admission'?-1:1)-(b.kind==='admission'?-1:1)||a.key.localeCompare(b.key));
    const episodeById=new Map(),itemCode=new Map(),episodeOfItem=new Map();
    eps.forEach((ep,i)=>{
      ep.number=i+1;ep.code='EP'+pad(ep.number)+'-'+id;
      if(ep.kind==='admission')episodeById.set(String(ep.ref.id),ep);
      ep.items.sort((a,b)=>a.moment.localeCompare(b.moment)).forEach((it,k)=>{
        it.code=ep.code+'-'+pad(k+1)+'-'+it.type;itemCode.set(it.id,it.code);episodeOfItem.set(it.id,ep);
      });
    });
    return {
      episodes:eps,
      // EP02-12345M for an admission (clinical_records episode row or its id).
      episodeCode:ep=>{const e=episodeById.get(String(ep&&ep.id||ep));return e?e.code:'';},
      episodeNumber:ep=>{const e=episodeById.get(String(ep&&ep.id||ep));return e?e.number:0;},
      encounterCode:enc=>itemCode.get('enc:'+String(enc&&enc.id||enc))||'',
      commCode:c=>itemCode.get('comm:'+String(c&&c.id||c))||'',
      followupCode:a=>itemCode.get('comm:appt-'+String(a&&a.id||a))||'',
      commEpisodeNumber:c=>{const e=episodeOfItem.get('comm:'+String(c&&c.id||c));return e?e.number:0;}
    };
  }

  async function fetchAll(db,build){
    const out=[];const page=1000;
    for(let from=0;;from+=page){
      const {data,error}=await build().range(from,from+page-1);
      if(error)throw error;
      out.push(...(data||[]));
      if(!data||data.length<page)break;
    }
    return out;
  }
  /* Load (or reload with force) everything needed for one patient. Missing
     tables or columns degrade to fewer items rather than failing. */
  function load(patientId,opts){
    const pid=String(patientId||'');if(!pid)return Promise.resolve(null);
    if(!(opts&&opts.force)&&cache.has(pid))return Promise.resolve(cache.get(pid));
    if(pending.has(pid)&&!(opts&&opts.force))return pending.get(pid);
    // The app's client is a script-level `const SB` (not a window property).
    const db=(typeof SB!=='undefined'&&SB)||global.SB;if(!db)return Promise.resolve(null);
    const safe=p=>p.catch(()=>[]);
    const job=(async()=>{
      const [pat,episodes,encounters,rawComms,choices,appts]=await Promise.all([
        db.from('patients').select('id,id_card').eq('id',pid).maybeSingle().then(r=>r.data||null).catch(()=>null),
        safe(fetchAll(db,()=>db.from('clinical_records').select('id,record_date,discharge_date,is_current,created_at,updated_at').eq('patient_id',pid).eq('kind','episode').order('id'))),
        safe(fetchAll(db,()=>db.from('encounters').select('id,episode_id,encounter_date,created_at').eq('patient_id',pid).order('id'))),
        safe(fetchAll(db,()=>db.from('patient_communications').select('id,parent_id,kind,service,communication_date,communication_time,created_at,updated_at,status,resolved_at').eq('patient_id',pid).order('id')))
          .then(r=>r.length?r:safe(fetchAll(db,()=>db.from('patient_communications').select('id,parent_id,kind,service,communication_date,communication_time,created_at,updated_at,status').eq('patient_id',pid).order('id')))),
        safe(fetchAll(db,()=>db.from('communication_episode_choices').select('communication_id,separate_episode').eq('patient_id',pid).order('communication_id'))),
        safe(fetchAll(db,()=>db.from('appointments').select('id,appt_date,appt_slot,status,assigned_to,bank_staff_id,outcome_recorded_at,appliances,accessories,stoma_appliances').eq('patient_id',pid).eq('status','attended').order('id')))
      ]);
      const separate=new Set((choices||[]).filter(x=>x&&x.separate_episode).map(x=>String(x.communication_id)));
      const comms=(rawComms||[]).map(c=>separate.has(String(c.id))?{...c,separate_episode:true}:c);
      const res=compute(pat,episodes,encounters,comms,appts);
      res._in={pat,episodes,encounters,comms,appts};
      cache.set(pid,res);
      return res;
    })().finally(()=>pending.delete(pid));
    pending.set(pid,job);
    return job;
  }
  function cached(patientId){return cache.get(String(patientId||''))||null;}
  /* The codes the patient's records WOULD have with some extra correspondence
     added (e.g. an email being previewed). Nothing is saved. */
  function preview(patientId,extra){
    const c=cache.get(String(patientId||''));if(!c||!c._in)return null;
    const i=c._in;return compute(i.pat,i.episodes,i.encounters,(i.comms||[]).concat(extra||[]),i.appts);
  }
  function invalidate(patientId){cache.delete(String(patientId||''));}
  global.EpisodeCodes={compute,load,cached,preview,invalidate,pad};
})(window);
