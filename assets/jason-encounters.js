/* The ward encounter workspace (for every signed-in nurse; it began as Jason's). Standard findings are dropdowns; notes stay
   editable. A server transaction appends revisions and publishes current care. */
(function(){
  'use strict';
  const JASON_EMAIL='jason.fenech@gov.mt';
  const COLOURS=['Healthy pink','Dusky','Aubergine colour','Necrotic'];
  const OUTPUTS=['Nil','Flatus present','Bilious effluent','Liquid stools','Semi-formed stools','Blood','Hemoserous fluid'];
  // Peristomal skin: "Healthy skin" stands alone; every other finding is a skin
  // problem and is also recorded as a complication of that stoma. "Not assessed
  // — flange in situ" also stands alone, for a two-piece appliance whose flange
  // was left on (not due): the skin could not be seen, so it is neither healthy
  // nor a problem, and any skin complication already on record is left untouched.
  const HEALTHY_SKIN='Healthy skin';
  const SKIN_NOT_ASSESSED='Not assessed — flange in situ';
  const SKIN=[HEALTHY_SKIN,'Irritation','Excoriation','Fungal infection','Psoriasis','Eczema','Dermatitis','Metaplasia','Ulcerated','Varices','Bluish discolouration'];
  // Earlier skin wording, still recognised on records saved with it.
  const LEGACY_SKIN=['Erythema / redness','Irritant dermatitis (leakage)','Excoriation / erosion','Mucocutaneous separation','Allergic dermatitis','Folliculitis','Hypergranulation','Pressure ulcer / MARSI','Pyoderma gangrenosum'];
  // Findings Jason adds himself ("+ Add other…") join these lists for good:
  // shared through the assessment_options table, and kept on this device too.
  const BASE_OPTIONS={colour:COLOURS,output:OUTPUTS,skin:SKIN},OPTION_STORE='jenc-assessment-options';
  const lower=x=>String(x||'').trim().toLowerCase();
  // Runs while the module loads, before the shared helpers below exist.
  function readLocalOptions(){const arr=x=>Array.isArray(x)?x.filter(y=>typeof y==='string'&&y.trim()):[];
    try{const v=JSON.parse(localStorage.getItem(OPTION_STORE)||'{}')||{};return {colour:arr(v.colour),output:arr(v.output),skin:arr(v.skin)};}catch(_){return {colour:[],output:[],skin:[]};}}
  let customOptions=readLocalOptions(),optionsLoad=null,warnedLocal=false;
  function writeLocalOptions(){try{localStorage.setItem(OPTION_STORE,JSON.stringify(customOptions));}catch(_){}}
  function options(field){const out=[];list(BASE_OPTIONS[field]).concat(list(customOptions[field])).forEach(x=>{if(!out.some(y=>lower(y)===lower(x)))out.push(x);});return out;}
  function loadOptions(force=false){
    if(optionsLoad&&!force)return optionsLoad;
    optionsLoad=(async()=>{try{
      const {data,error:e}=await SB.from('assessment_options').select('field,name').order('created_at');if(e)return false;let changed=false;
      list(data).forEach(r=>{if(!r||!customOptions[r.field]||!String(r.name||'').trim())return;if(!options(r.field).some(x=>lower(x)===lower(r.name))){customOptions[r.field].push(String(r.name).trim());changed=true;}});
      if(changed)writeLocalOptions();return changed;}catch(_){return false;}})();
    return optionsLoad;
  }
  async function addOption(field,raw,by){
    const name=String(raw||'').trim().replace(/\s+/g,' ');if(!name||!BASE_OPTIONS[field])return '';
    const existing=options(field).find(x=>lower(x)===lower(name));if(existing)return existing;
    customOptions[field].push(name);writeLocalOptions();
    let shared=false;try{const {error:e}=await SB.from('assessment_options').insert({field,name,created_by:String(by||ctx?.who?.name||'')||null});shared=!e||/duplicate|unique/i.test(String(e.message||''));}catch(_){}
    if(!shared&&!warnedLocal){warnedLocal=true;try{window.alert('“'+name+'” was added on this computer only. Run sql/add-assessment-options.sql once in Supabase so added options are shared on every computer.');}catch(_){}}
    return name;
  }
  const skinName=t=>options('skin').concat(LEGACY_SKIN).find(k=>lower(k)===lower(t))||'';
  const isSkinProblem=t=>!!skinName(t)&&lower(t)!==lower(HEALTHY_SKIN);
  // A rod is only ever used with a loop stoma — never an end stoma or a urostomy.
  const rodCapable=type=>typeof stomaTypeCanHaveRod==='function'?stomaTypeCanHaveRod(type):/loop|transverse/i.test(String(type||''));
  // Infection status is deliberately just two states: it is either an active
  // Infection (note the organism alongside) or Resolved. Leaving it on the
  // blank "— choose —" means nothing to record. Older notes that used the wider
  // wording (Colonisation, Recorded, …) fold into Infection when re-opened.
  const INFECTION_STATUS=['Infection','Resolved'];
  const ORGANISMS=['CRE','VRE','MRSA','C. difficile','ESBL','Other'];
  const PROFESSIONS=['Psychologist','Dietitian','Doctor / surgeon','Social worker'];
  // Support referrals belong to the PATIENT, not one episode: who they were
  // referred to (when, by whom) and, later, ticked Seen (with the date). They
  // carry over to every later encounter and clinic visit. Older encounters kept
  // a status per episode; those still read (Seen/Completed = seen, Declined = gone).
  function normReferral(r){
    if(!r||!String(r.profession||'').trim()||r.status==='Declined')return null;
    // No id on an older entry: derive a stable one so it is matched, not duplicated.
    const id=r.id||('ref-'+String(r.profession).toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+String(r.referred_on||''));
    return {id:String(id),profession:String(r.profession),referred_on:String(r.referred_on||''),referred_by:String(r.referred_by||''),
      seen:typeof r.seen==='boolean'?r.seen:['Seen','Completed'].includes(r.status),seen_on:String(r.seen_on||''),seen_by:String(r.seen_by||'')};
  }
  function patientReferrals(p){let v=p?.support_referrals;if(typeof v==='string'){try{v=JSON.parse(v);}catch(_){v=null;}}return list(v).map(normReferral).filter(Boolean);}
  const showDay=d=>d?(typeof fmtShortDate==='function'?fmtShortDate(d):d):'';
  const referralText=r=>r.seen?'Seen by '+r.profession+(r.seen_on?' · '+showDay(r.seen_on):''):'Referred to '+r.profession+(r.referred_on?' · '+showDay(r.referred_on):'');
  function referralChipsHTML(rows){
    const l=list(rows).map(normReferral).filter(Boolean);if(!l.length)return '';
    return '<span class="jenc-ref-chips">'+l.map(r=>'<span class="jenc-ref-chip '+(r.seen?'seen':'referred')+'">'+(r.seen?'✅ ':'↗ ')+esc(referralText(r))+'</span>').join('')+'</span>';
  }
  // The patient's list after this encounter: earlier entries removed here go,
  // everything in the draft is added or updated by its id.
  function mergedReferrals(patientList,baseRows,draftRows){
    const draftNorm=list(draftRows).map(normReferral).filter(Boolean),ids=new Set(draftNorm.map(r=>r.id));
    const removed=new Set(list(baseRows).map(normReferral).filter(Boolean).map(r=>r.id).filter(id=>!ids.has(id)));
    const out=list(patientList).filter(r=>!removed.has(r.id)&&!ids.has(r.id));
    return out.concat(draftNorm);
  }
  let ctx=null,request=0;
  const latestByPatient=new Map();
  const copy=x=>JSON.parse(JSON.stringify(x));
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const list=x=>Array.isArray(x)?x:[];
  // Any signed-in nurse may record encounters; each version is signed with their name.
  const signedIn=u=>!!String(u?.email||'').trim();
  const isJason=u=>String(u?.email||'').trim().toLowerCase()===JASON_EMAIL;
  const enabled=()=>typeof isEncounterUser==='function'&&isEncounterUser();
  const signedName=u=>typeof attDisplayName==='function'?(attDisplayName(u)||u.email):u.email;
  const stamp=x=>{try{return new Date(x).toLocaleString('en-GB',{timeZone:'Europe/Malta',dateStyle:'medium',timeStyle:'short'});}catch(_){return String(x||'');}};
  function assessment(e){let a=e?.assessment||{};if(typeof a==='string'){try{a=JSON.parse(a);}catch(_){a={};}}return a;}
  function versions(e){
    const a=assessment(e);
    if(Array.isArray(a.versions)&&a.versions.length)return a.versions;
    return [{version:1,saved_at:e.created_at,author_name:e.created_by_name,author_email:e.created_by_email,
      snapshot:{notes:[a.notes,e.nursing_report].filter(Boolean).join('\n\n'),scope:[],stomas:[],infection:{status:'',organism:''},referrals:[]},
      report:e.nursing_report||'',legacy_assessment:copy(a)}];
  }
  function currentVersion(e){return versions(e).slice(-1)[0];}
  // Stomas are shown by type ("End Ileostomy"), never by S-number; two of the
  // same type are told apart as (1) and (2).
  const titleCase=x=>String(x||'Stoma').replace(/(^|[\s\-\/(])([a-z])/g,(m,a,b)=>a+b.toUpperCase());
  // ENC-<ID card>-<DDMMYY>. There is one encounter per patient per day: later
  // changes that day become V2, V3 of the same code. Two same-day records saved
  // before that rule are told apart with -2.
  function encounterCode(rec,patient,rows){
    const id=String(patient?.id_card||'').replace(/\s+/g,'').toUpperCase()||'NOID';
    const day=String(rec?.encounter_date||rec?.created_at||'').slice(0,10),[y,m,d]=day.split('-');
    const twins=list(rows).filter(r=>String(r.encounter_date||r.created_at||'').slice(0,10)===day)
      .sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id)));
    const n=twins.findIndex(r=>String(r.id)===String(rec?.id));
    return 'ENC-'+id+(y&&m&&d?'-'+d+m+y.slice(2):'')+(n>0?'-'+(n+1):'');
  }
  // A fistula patient's fistula has a column of its own: no colour and no rod.
  const isFistulaCol=s=>s?.uid==='fistula'||String(s?.type||'').trim().toLowerCase()==='fistula';
  function stomaName(s,all){const t=titleCase(s?.type),twins=list(all).filter(x=>titleCase(x.type)===t);return twins.length>1?t+' ('+(twins.indexOf(s)+1)+')':t;}
  function nilExclusive(values,changed){return changed==='Nil'?['Nil']:values.filter(v=>v!=='Nil');}
  function diffHTML(before,after,removed=false){
    before=String(before||'');after=String(after||'');if(before===after)return esc(after);
    const a=before.match(/\s+|\S+/g)||[],b=after.match(/\s+|\S+/g)||[];
    // Bound comparison work for a long report; common edges still remain plain.
    if(a.length*b.length>250000){let p=0,q=0;while(p<a.length&&p<b.length&&a[p]===b[p])p++;
      while(q<a.length-p&&q<b.length-p&&a[a.length-1-q]===b[b.length-1-q])q++;
      return esc(b.slice(0,p).join(''))+(removed&&a.length-p-q?'<del class="jenc-deleted">'+esc(a.slice(p,a.length-q).join(''))+'</del>':'')+
        '<span class="jenc-change">'+esc(b.slice(p,b.length-q).join(''))+'</span>'+esc(q?b.slice(-q).join(''):'');}
    const d=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
    for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)d[i][j]=a[i]===b[j]?1+d[i+1][j+1]:Math.max(d[i+1][j],d[i][j+1]);
    let i=0,j=0,out='';while(i<a.length||j<b.length){
      if(i<a.length&&j<b.length&&a[i]===b[j]){out+=esc(b[j++]);i++;}
      else if(j<b.length&&(i===a.length||d[i][j+1]>d[i+1][j]))out+='<span class="jenc-change">'+esc(b[j++])+'</span>';
      else{if(removed)out+='<del class="jenc-deleted">'+esc(a[i])+'</del>';i++;}
    }return out;
  }
  function report(s){
    const lines=[],stomas=list(s.stomas);
    stomas.forEach(x=>{
      const parts=[],skinWord=isFistulaCol(x)?'skin around the fistula':'peristomal skin';if(x.colour)parts.push('colour / appearance: '+x.colour.toLowerCase());
      if(x.output?.length)parts.push((isFistulaCol(x)?'output: ':'function / output: ')+x.output.join(', '));
      if(x.skin?.status==='Healthy')parts.push(skinWord+': healthy');
      if(x.skin?.status==='Not assessed')parts.push(skinWord+': not assessed (flange in situ)');
      if(x.skin?.status==='Not healthy')parts.push(skinWord+': not healthy'+(list(x.skin.problems).length?' ('+x.skin.problems.join(', ')+')':''));
      if(x.appliances?.length)parts.push('appliance: '+x.appliances.join(', '));
      if(x.accessories?.length)parts.push('accessories: '+x.accessories.join(', '));
      if(x.flange_due)parts.push('flange due: '+x.flange_due);
      list(x.complications).filter(c=>c.text).forEach(c=>parts.push(c.text+': '+(c.status==='resolved'?'resolved':'active')));
      if(x.rod_asked!==false&&x.rod?.status==='In place')parts.push('rod present'+(x.rod.due?' (planned removal '+x.rod.due+')':''));
      if(x.rod_asked!==false&&x.rod?.status==='Removed')parts.push('rod removed'+(x.rod.removed?' '+x.rod.removed:''));
      const name=stomaName(x,stomas);
      lines.push(name+' — '+(parts.join('; ')||'No assessment recorded')+'.');
      if(String(x.notes||'').trim())lines.push(name+' notes: '+x.notes);
    });
    if(s.infection?.status&&s.infection.status!=='Not recorded')lines.push('Infection status: '+[s.infection.organism,s.infection.status].filter(Boolean).join(' · ')+'.');
    list(s.referrals).map(normReferral).filter(Boolean).forEach(r=>lines.push(r.seen?'Seen by '+r.profession+(r.seen_on?' on '+r.seen_on:'')+'.':'Referred to '+r.profession+(r.referred_on?' on '+r.referred_on:'')+'.'));
    if(String(s.notes||'').trim())lines.push('General notes: '+s.notes);
    return lines.join('\n');
  }
  // The system, baseplate and pouch follow from the appliances themselves.
  function setupFields(ap){
    const item=n=>APPLIANCE_CATALOGUE.find(c=>c.name===n);ap=list(ap);
    const baseplate=ap.find(n=>item(n)?.part==='flange')||'';
    return {system:ap.some(n=>item(n)?.system==='two')?'two':(item(ap[0])?.system||(ap.length?'one':'')),baseplate,pouch:ap.find(n=>n!==baseplate)||''};
  }
  function stomaSeed(p,ep,date){
    const timeline=stomaTimeline(p),all=stomasPresentOn(p,date).filter(s=>!s.ended||String(s.ended)>date);
    const rows=parseEpisodeApplianceRows(ep),comps=parseComplications(p);
    return all.map(s=>{
      const number=s.code||('S'+(timeline.findIndex(t=>t.uid===s.uid)+1));
      const legacy=patientStomaList(p).find(t=>t.uid===s.uid);
      let candidates=rows.filter(r=>applianceStomaUid(r,timeline)===s.uid&&(!r.changed_on||r.changed_on<=date));
      if(all.length===1&&!['new','refashion'].includes(s.origin))candidates=candidates.concat(rows.filter(r=>!applianceStomaUid(r,timeline)&&(!r.changed_on||r.changed_on<=date)));
      const row=candidates.reduce((a,b)=>!a||String(b.changed_on||'')>=String(a.changed_on||'')?b:a,null);
      const ap=row?.appliances||[],ac=row?.accessories||[],{system,baseplate:flange,pouch}=setupFields(ap);
      const own=comps.filter(c=>c.stoma_uid===s.uid||c.stoma===legacy?.slot||c.stoma===String(legacy?.number)||(!c.stoma&&all.length===1));
      const loops=all.filter(x=>rodCapable(x.typeLabel||x.type));
      const rodOwn=rodCapable(s.typeLabel||s.type)&&(p.rod_stoma_uid===s.uid||(!p.rod_stoma_uid&&(all.length===1||(loops.length===1&&loops[0].uid===s.uid))));
      return {uid:s.uid,number,type:s.typeLabel||s.type||'Stoma',short:s.shortLabel||s.short||'',legacy_ref:legacy?.slot||String(legacy?.number||''),
        colour:'',output:[],notes:'',system,baseplate:flange,pouch,appliances:copy(ap),accessories:copy(ac),flange_due:row?.flange_due||'',
        complications:own.map(c=>({id:c.id,text:c.text,status:c.status})),
        skin:(()=>{const open=[...new Set(own.filter(c=>c.status!=='resolved'&&isSkinProblem(c.text)).map(c=>skinName(c.text)))];return {status:open.length?'Not healthy':'',problems:open};})(),
        rod:{status:rodOwn?(p.rod_removed_date?'Removed':p.rod_removal_date?'In place':'Not recorded'):'Not recorded',
          due:rodOwn?(p.rod_removal_date||''):'',removed:rodOwn?(p.rod_removed_date||''):''}};
    });
  }
  function infectionSeed(p){
    const text=String(p.inpatient_nurse_notes||'').trim(),value=text.replace(/^Infection status:\s*/i,'');
    const status=INFECTION_STATUS.find(v=>v.toLowerCase()===value.toLowerCase());
    if(status)return {status,organism:''};
    const parts=text.split(/\s*·\s*/),organism=ORGANISMS.find(o=>o.toLowerCase()===parts[0]?.toLowerCase());
    const recorded=INFECTION_STATUS.find(v=>v.toLowerCase()===parts[1]?.toLowerCase());
    if(parts.length===2&&organism&&recorded)return {status:recorded,organism};
    // Legacy ward notes can mention an organism, but unrelated words such as
    // "secretion" must never be treated as CRE or as an infection assessment.
    const org=ORGANISMS.filter(o=>o!=='Other').find(o=>new RegExp('\\b'+o.replaceAll('.','\\.')+'\\b','i').test(text))||'';
    return {status:org?'Infection':'',organism:org};
  }
  function seed(p,ep,date){
    const stomas=stomaSeed(p,ep,date);
    const recent=ctx?.rows?.find(r=>String(r.episode_id)===String(ep.id)&&assessment(r).snapshot);
    const saved=recent?assessment(recent).snapshot:null;
    stomas.forEach(s=>{const prior=saved?.stomas?.find(v=>v.uid===s.uid);if(prior?.rod&&p.rod_stoma_uid!==s.uid)s.rod=copy(prior.rod);s.rod_asked=firstAssessmentOf(s.uid);});
    // Referrals come from the patient record; an older episode's own list fills any gap.
    const fromPatient=patientReferrals(p);
    const legacy=list(saved?.referrals).map(normReferral).filter(r=>r&&!fromPatient.some(x=>x.id===r.id||(!x.seen&&x.profession===r.profession)));
    return {stomas,scope:stomas.map(s=>s.uid),notes:'',infection:infectionSeed(p),referrals:fromPatient.concat(legacy)};
  }
  // A rod is only placed at surgery, so the rod question belongs to the FIRST
  // encounter that assessed a stoma; later encounters do not ask it again.
  function firstAssessmentOf(uid){
    const rec=ctx?.record;
    return !list(ctx?.rows).some(r=>(!rec||(String(r.id)!==String(rec.id)&&String(r.created_at||'')<String(rec.created_at||'')))&&list(assessment(r).snapshot?.stomas).some(x=>x.uid===uid));
  }
  const rodAsked=s=>rodCapable(s?.type)&&(s?.rod_asked??firstAssessmentOf(s?.uid));
  function changedAppliances(base,draft){return list(draft.stomas).filter(s=>{
    const old=list(base.stomas).find(x=>x.uid===s.uid);return !old||!same([s.appliances,s.accessories,s.flange_due],[old.appliances,old.accessories,old.flange_due]);
  }).map(s=>({stoma_uid:s.uid,stoma_code:s.number,stoma_short:s.short,stoma_type:s.type,
    appliances:s.appliances,accessories:s.accessories,flange_due:s.flange_due||''}));}
  function parentPage(){let el=document.getElementById('page-jason-encounters');if(!el){el=document.createElement('section');el.id='page-jason-encounters';el.className='page';document.querySelector('#app .main').append(el);
    el.addEventListener('click',click);el.addEventListener('change',change);el.addEventListener('input',input);}return el;}
  function error(message){const el=document.getElementById('jenc-message');if(el)el.innerHTML='<div class="jenc-error" role="alert">'+esc(message)+'</div>';}
  function dirty(){return !!ctx&&ctx.editable&&!same(ctx.draft,ctx.baseline);}
  function editableSnapshot(snapshot){const value=copy(snapshot);delete value.save_request_id;return value;}
  // Bound the entire wait, including a fetch that ignores cancellation. A lost
  // response is not proof of a failed write: its request ID is retained for retry.
  function boundedRequest(build,ms=8000){
    const controller=new AbortController();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{controller.abort();const e=new Error('The clinic server did not respond in time.');e.code='CLIENT_TIMEOUT';reject(e);},ms);
      Promise.resolve().then(()=>build(controller.signal)).then(resolve,reject).finally(()=>clearTimeout(timer));
    });
  }
  function cancellable(query,signal){return typeof query?.abortSignal==='function'?query.abortSignal(signal):query;}
  async function confirmSave(target,pending){
    const result=await boundedRequest(signal=>cancellable(SB.from('encounters').select('*')
      .eq('patient_id',String(target.patient.id)).eq('episode_id',String(target.episode.id))
      .contains('assessment',{versions:[{snapshot:{save_request_id:pending.payload.p_snapshot.save_request_id}}]})
      .order('created_at',{ascending:false}).limit(1),signal));
    if(result.error)throw result.error;
    return list(result.data)[0]||null;
  }
  function canLeave(){if(ctx?.saving)return false;return !dirty()||window.confirm('Discard the unsaved encounter changes?');}
  function dismiss(force=false){if(!force&&!canLeave())return false;request++;ctx=null;document.body.classList.remove('jenc-open');document.getElementById('page-jason-encounters')?.classList.remove('active');return true;}
  async function back(){if(!canLeave())return;const pos=ctx?.returnScroll||0,pid=ctx?.patient.id,origin=ctx?.returnPage||'page-handover';dismiss(true);document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    if(origin==='page-patient-record'&&typeof openPatientRecord==='function')await openPatientRecord(pid);
    else{document.getElementById('page-handover')?.classList.add('active');await loadHandover();}window.scrollTo(0,pos);}
  async function open(pid,recordId=null){
    if(!enabled())return;const {data,error:authError}=await SB.auth.getUser();if(authError||!signedIn(data?.user))return;
    if(ctx&&!canLeave())return;
    const token=++request,returnScroll=window.scrollY,returnPage=ctx?.returnPage||document.querySelector('.main > .page.active')?.id||'page-handover';ctx=null;
    const page=parentPage();document.body.classList.add('jenc-open');
    loadOptions().then(changed=>{if(changed&&ctx&&ctx.mode==='form')render();});
    document.querySelectorAll('.main > .page.active').forEach(el=>el.classList.remove('active'));
    page.classList.add('active');page.innerHTML='<div class="jenc-card">Loading encounter…</div>';window.scrollTo(0,0);closeModal();
    try{
      const [patientResult,episodeResult,encResult]=await Promise.all([
        fetchPatientById(pid),SB.from('clinical_records').select('*').eq('patient_id',pid).eq('kind','episode').order('record_date',{ascending:false}),
        fetchAllRows(()=>SB.from('encounters').select('*').eq('patient_id',String(pid)).order('created_at',{ascending:false}).order('id'))]);
      if(token!==request)return;
      const p=patientResult.data;if(patientResult.error||!p)throw new Error('Could not load this patient.');
      if(episodeResult.error||encResult.error)throw new Error(episodeResult.error?.message||encResult.error?.message);
      let episodes=episodeResult.data||[];const rows=encResult.rows||[];
      // On the handover but no admission record yet (an older entry): open one,
      // exactly as the patient record does, so the encounter has its episode.
      if(p.is_inpatient&&!episodes.some(e=>e.is_current&&!e.discharge_date)&&typeof createInpatientEpisodeFor==='function'){
        const made=await createInpatientEpisodeFor(pid,p.inpatient_since||TODAY);if(token!==request)return;
        if(made?.data)episodes=[made.data].concat(episodes);
      }
      const openEpisode=episodes.find(e=>e.is_current&&!e.discharge_date);
      const ep=openEpisode||episodes.find(e=>rows.some(r=>String(r.episode_id)===String(e.id)));
      if(!ep)throw new Error('There are no saved encounters or open inpatient episodes. Open an inpatient visit from the patient record first.');
      ctx={patient:p,episode:ep,episodes,rows,who:{email:data.user.email,name:signedName({email:data.user.email})},returnScroll,returnPage,mode:'form',historyFilter:String(ep.id),compare:true,openSections:new Set()};
      const todays=openEpisode&&rows.find(r=>String(r.episode_id)===String(openEpisode.id)&&String(r.encounter_date||'').slice(0,10)===TODAY);
      if(recordId&&rows.some(r=>String(r.id)===String(recordId)))selectRecord(recordId);
      else if(todays){
        // Saved encounters open for reading. Starting a revision is a separate,
        // deliberate action; simply reopening the handover button changes nothing.
        selectRecord(todays.id);
        ctx.message='Today’s encounter '+encounterCode(todays,p,rows)+' is saved and opens read only. Choose Edit report as V'+(ctx.expectedVersion+1)+' to make changes.';render();
      }else if(openEpisode)newEncounter(true);else{ctx.mode='history';ctx.editable=false;ctx.historyFilter='all';render();}
    }catch(e){if(token!==request)return;page.innerHTML='<div class="jenc-card"><h2>Encounters</h2><p>'+esc(e.message)+'</p><button class="jenc-btn" data-action="back">Back to handover</button></div>';}
  }
  function newEncounter(force=false){
    if(!ctx||(!force&&!canLeave()))return;
    const ep=ctx.episodes.find(e=>e.is_current&&!e.discharge_date);if(!ep)return error('This inpatient episode has closed. Open a saved encounter from History.');
    ctx.episode=ep;ctx.record=null;ctx.viewVersion=null;ctx.editable=true;ctx.mode='form';ctx.expectedVersion=0;ctx.comparison=null;ctx.comparisonReport=null;ctx.openSections=new Set();
    ctx.draft=seed(ctx.patient,ep,TODAY);ctx.baseline=copy(ctx.draft);ctx.message='';render();
  }
  // An encounter can be edited (making V2, V3 …) only on the day it was recorded.
  function recordDay(rec){const d=String(rec?.encounter_date||'').slice(0,10);if(d)return d;try{return new Date(rec?.created_at).toLocaleDateString('en-CA',{timeZone:'Europe/Malta'});}catch(_){return '';}}
  const editableToday=rec=>!!rec&&recordDay(rec)===TODAY;
  function selectRecord(id,index=null,edit=false){
    if(!ctx||!canLeave())return;const rec=ctx.rows.find(r=>String(r.id)===String(id));if(!rec)return;
    if(edit&&!editableToday(rec))edit=false;
    const vs=versions(rec),v=index===null?vs.slice(-1)[0]:vs[index];if(!v)return;
    const ep=ctx.episodes.find(e=>String(e.id)===String(rec.episode_id));if(!ep)return error('The linked episode could not be loaded.');
    ctx.episode=ep;ctx.record=rec;ctx.viewVersion=v;ctx.expectedVersion=vs.slice(-1)[0].version;ctx.editable=edit;ctx.compare=edit;ctx.mode='form';ctx.openSections=new Set();ctx.message='';
    ctx.draft=editableSnapshot(v.snapshot);if(!ctx.draft.stomas?.length){const legacy=seed(ctx.patient,ep,String(rec.encounter_date));ctx.draft={...legacy,notes:v.snapshot.notes||''};}
    // Every stoma is assessed on one screen, so an encounter always covers them all.
    ctx.draft.scope=list(ctx.draft.stomas).map(x=>x.uid);
    list(ctx.draft.stomas).forEach(x=>{if(!x.skin)x.skin={status:'',problems:[]};});
    ctx.draft.referrals=list(ctx.draft.referrals).map(normReferral).filter(Boolean);
    // Correcting today's encounter starts from the patient's current referrals,
    // so one ticked Seen elsewhere since is not quietly undone on save.
    if(edit){const pat=patientReferrals(ctx.patient);if(pat.length)ctx.draft.referrals=pat.concat(ctx.draft.referrals.filter(r=>!pat.some(x=>x.id===r.id)));}
    const idx=vs.indexOf(v);
    ctx.compare=edit||idx>0;ctx.baseline=copy(ctx.draft);ctx.comparison=edit?copy(ctx.baseline):(idx>0?copy(vs[idx-1].snapshot):null);
    // A saved version is compared with the report as it was saved, not re-worded.
    ctx.comparisonReport=!edit&&idx>0?String(vs[idx-1].report||''):null;
    render();
  }
  function oldStoma(uid){return ctx?.comparison?.stomas?.find(s=>s.uid===uid);}
  function attrs(kind,field,extra=''){return 'data-kind="'+kind+'" data-field="'+field+'" '+extra;}
  function select(label,value,choices,kind,field,extra='',old){
    const ch=choices.map(c=>Array.isArray(c)?c:[c,c]);if(value&&!ch.some(c=>c[0]===value))ch.push([value,value]);
    const changed=ctx.compare&&ctx.comparison&&kind!=='history'&&!same(old??'',value);
    return '<div class="jenc-field"><label>'+esc(label)+'</label><select '+attrs(kind,field,extra)+(ctx.editable||kind==='history'?'':' disabled')+(changed?' class="jenc-changed"':'')+' aria-label="'+esc(label)+'"><option value="">— '+(['Colour / appearance','Peristomal skin'].includes(label)?'not recorded':'choose')+' —</option>'+ch.map(c=>{const val=c[0],txt=c[1];return '<option value="'+esc(val)+'"'+(val===value?' selected':'')+'>'+esc(txt)+'</option>';}).join('')+'</select>'+(changed?'<div class="jenc-previous">Previously: '+esc(old||'not recorded')+'</div>':'')+'</div>';
  }
  function multi(label,values,choices,kind,field,extra='',old=[],addField=''){
    values=list(values);const options=[...new Set(choices.concat(values))];
    const add=ctx.editable&&addField?'<button type="button" class="jenc-add-opt" data-action="add-option" data-option="'+esc(addField)+'" '+extra+'>＋ Add other…</button>':'';
    const text=values.length?values.map(v=>ctx.compare&&!old.includes(v)&&ctx.comparison?'<span class="jenc-change">'+esc(v)+'</span>':esc(v)).join(', '):'— not recorded —';
    return '<div class="jenc-field"><label>'+esc(label)+'</label><details class="jenc-multi"><summary>'+text+'</summary><div class="jenc-menu">'+options.map(v=>'<label><input type="checkbox" '+attrs(kind,field,extra)+' value="'+esc(v)+'"'+(values.includes(v)?' checked':'')+(ctx.editable?'':' disabled')+'>'+esc(v)+'</label>').join('')+add+'</div></details></div>';
  }
  function accordion(key,title,summary,body){return '<details class="jenc-accordion" data-section="'+esc(key)+'"'+(ctx.openSections.has(key)?' open':'')+'><summary>'+esc(title)+'<span class="jenc-summary">'+summary+'</span></summary><div class="jenc-body">'+body+'</div></details>';}
  // One tick: "Rod present". Ticking it shows the planned removal date; unticking
  // a rod that was in place records it as removed (today, adjustable).
  const rodText=r=>r?.status==='In place'?'Present'+(r.due?' · removal '+r.due:''):r?.status==='Removed'?'Removed'+(r.removed?' '+r.removed:''):'Not present';
  function rodHTML(s,extra,old){
    const r=s.rod||{},was=ctx.baseline?.stomas?.find(x=>x.uid===s.uid)?.rod||{},on=r.status==='In place',lock=ctx.editable?'':' disabled';
    const changed=ctx.compare&&ctx.comparison&&!same(rodText(old?.rod),rodText(r));
    let out='<div class="jenc-rod'+(changed?' jenc-changed':'')+'"><label class="jenc-check"><input type="checkbox" '+attrs('rod','present',extra)+(on?' checked':'')+lock+'> Rod present</label>';
    if(on)out+='<div class="jenc-field"><label>Planned removal date *</label><input type="date" '+attrs('rod','due',extra)+' value="'+esc(r.due||'')+'"'+lock+'></div>';
    else if(r.status==='Removed'&&(was.status==='In place'||ctx.record))out+='<div class="jenc-field"><label>Rod removed on</label><input type="date" '+attrs('rod','removed',extra)+' value="'+esc(r.removed||TODAY)+'" max="'+esc(TODAY)+'"'+lock+'></div>';
    else if(r.status==='Removed')out+='<div class="jenc-meta">Rod removed'+(r.removed?' '+esc(r.removed):'')+'.</div>';
    if(changed)out+='<div class="jenc-previous">Previously: '+esc(rodText(old?.rod))+'</div>';
    return out+'</div>';
  }
  const skinValues=k=>k?.status==='Healthy'?[HEALTHY_SKIN]:k?.status==='Not assessed'?[SKIN_NOT_ASSESSED]:list(k?.problems);
  // Offered on every stoma; a hint points to it when the appliance is two-piece,
  // where the flange is often left in situ and the skin cannot be seen.
  const skinChoices=()=>options('skin').concat(SKIN_NOT_ASSESSED);
  function skinHTML(s,extra,old){
    const hint=(s.system==='two'&&!isFistulaCol(s))?'<p class="jenc-skin-hint">Two-piece system — if the flange was left in situ (not due), tick <b>Not assessed — flange in situ</b>.</p>':'';
    return '<div class="jenc-fields jenc-skin">'+multi(isFistulaCol(s)?'Skin around the fistula':'Peristomal skin',skinValues(s.skin),skinChoices(),'skin','pick',extra,skinValues(old?.skin),'skin')+hint+'</div>';
  }
  // "Healthy skin" and "Not assessed — flange in situ" each stand alone; ticking
  // one clears the others, and ticking any finding clears both.
  function applySkin(st,values,value,checked){
    const standalone=[HEALTHY_SKIN,SKIN_NOT_ASSESSED];
    let v=checked&&standalone.includes(value)?[value]:list(values).filter(x=>!standalone.includes(x));
    st.skin=v.includes(HEALTHY_SKIN)?{status:'Healthy',problems:[]}
      :v.includes(SKIN_NOT_ASSESSED)?{status:'Not assessed',problems:[]}
      :{status:v.length?'Not healthy':'',problems:v};
    linkSkin(st);
  }
  function colourSelect(s,extra,old){
    const html=select('Colour / appearance',s.colour,options('colour'),'stoma','colour',extra,old?.colour);
    return ctx.editable?html.replace('</select>','<option value="__add__">＋ Add other…</option></select>'):html;
  }
  // Skin problems are complications too: each one ticked joins the stoma's
  // complications; "Healthy" resolves the skin complications already on record.
  function linkSkin(st){
    const base=list(ctx.baseline.stomas.find(x=>x.uid===st.uid)?.complications),k=st.skin||{status:'',problems:[]};
    const want=k.status==='Not healthy'?list(k.problems):[],wanted=t=>want.some(w=>w.toLowerCase()===String(t||'').trim().toLowerCase());
    st.complications=list(st.complications).filter(c=>!isSkinProblem(c.text)||wanted(c.text)||base.some(b=>b.id===c.id));
    st.complications.forEach(c=>{const b=base.find(x=>x.id===c.id);if(!b||!isSkinProblem(c.text))return;
      c.status=wanted(c.text)?'open':k.status==='Healthy'?'resolved':b.status;});
    want.forEach(w=>{if(!st.complications.some(c=>String(c.text||'').trim().toLowerCase()===w.toLowerCase()))st.complications.push({id:crypto.randomUUID(),text:w,status:'open'});});
  }
  // The appliance setup reads as it stands, with no dropdowns. "Keep same
  // appliance" leaves it as recorded; "Modify appliance" opens the same picker
  // pages as an appointment, and what is picked comes back into this encounter.
  const setupKey=x=>[list(x?.appliances),list(x?.accessories),x?.flange_due||''];
  function applianceHTML(s,extra,old){
    const base=ctx.baseline?.stomas?.find(x=>x.uid===s.uid)||{},changed=!same(setupKey(s),setupKey(base)),had=list(base.appliances).length>0;
    // Red marks what differs from the setup on record (or, on a saved version, from the one before).
    const ref=!ctx.compare?null:ctx.editable?base:ctx.comparison?(old||{}):null;
    // Whole items are marked, so an appliance name is never split by the highlight.
    const row=(label,now,was,empty)=>{const items=list(now).map(v=>ref&&!list(was).includes(v)?'<span class="jenc-change">'+esc(v)+'</span>':esc(v));
      return '<div class="jenc-setup-row"><span class="jenc-setup-label">'+esc(label)+'</span><span>'+(items.join(', ')||esc(empty))+'</span></div>';};
    const moved=ref&&!same(setupKey(s),setupKey(ref));
    let html='<div class="jenc-setup'+(moved?' jenc-setup-changed':'')+'">'+row('Appliance',s.appliances,ref?.appliances,'No appliance recorded')+row('Accessories',s.accessories,ref?.accessories,'None recorded');
    if(s.flange_due||ref?.flange_due)html+=row('Flange due',[s.flange_due].filter(Boolean),[ref?.flange_due].filter(Boolean),'Not set');
    if(moved)html+='<div class="jenc-previous">Previously: '+esc([list(ref.appliances).join(', ')||'No appliance recorded',list(ref.accessories).join(', '),ref.flange_due?'flange due '+ref.flange_due:''].filter(Boolean).join(' · '))+'</div>';
    html+='<div class="jenc-meta">'+(!ctx.editable?'Saved setup':changed?'Changed in this encounter'+(had?' — Keep same appliance puts it back':''):had?'Same appliance as before — no change':'No appliance set yet')+'</div>';
    // Keep same is offered only when there is an appliance on record to keep.
    if(ctx.editable){
      html+='<div class="jenc-setup-actions">'+(had?'<button type="button" class="jenc-btn jenc-keep'+(changed?'':' is-kept')+'" data-action="keep-appliance" '+extra+' aria-pressed="'+(!changed)+'">'+(changed?'↺ ':'✓ ')+'Keep same appliance</button>':'')+
        '<button type="button" class="jenc-btn" data-action="modify-appliance" '+extra+'>✏️ '+(had?'Modify appliance':'Set appliance')+'</button></div>';
    }
    return html+'</div>';
  }
  function modifyAppliance(st){
    if(typeof openEncounterApplianceWizard!=='function')return error('The appliance picker is not available. Reload the page and try again.');
    const target=ctx,uid=st.uid;
    openEncounterApplianceWizard({patient:ctx.patient,uid,type:st.type,short:st.short,code:st.number,
      current:{appliances:copy(list(st.appliances)),accessories:copy(list(st.accessories)),flange_due:st.flange_due||''},
      onDone:picked=>{
        if(ctx!==target||!ctx.editable)return;const s=ctx.draft.stomas.find(x=>x.uid===uid);if(!s)return;
        const ap=list(picked?.appliances).slice(),f=setupFields(ap);
        Object.assign(s,{appliances:ap,accessories:list(picked?.accessories).slice(),flange_due:picked?.flange_due||'',system:picked?.system||f.system,baseplate:f.baseplate,pouch:f.pouch});
        render();
      }});
  }
  function stomaHTML(s){
    const extra='data-uid="'+esc(s.uid)+'"',old=oldStoma(s.uid);
    let compBody=list(s.complications).map((c,i)=>{
      const o=old?.complications?.find(v=>v.id===c.id),ref=extra+' data-index="'+i+'"';
      const choices=complicationCatalogue.filter(v=>v.active!==false&&(v.scope==='all'||v.scope===complicationScopeForStoma(s.type))).map(v=>v.name);
      return '<div class="jenc-comp">'+select('Complication',c.text,choices,'comp','text',ref,o?.text)+select('Status',c.status,[['open','Active'],['resolved','Resolved']],'comp','status',ref,o?.status)+(ctx.editable?'<button class="jenc-remove" data-action="remove-comp" '+extra+' data-index="'+i+'" aria-label="Remove this complication from the encounter">×</button>':'')+'</div>';
    }).join('');
    if(ctx.editable)compBody+='<button class="jenc-btn" data-action="add-comp" '+extra+'>+ Add complication</button>';
    const careSummary=x=>list(x?.complications).filter(c=>c.text).map(c=>c.text+' · '+(c.status==='resolved'?'resolved':'active')).join('\n')||'No complication recorded';
    const compSummary=ctx.compare&&ctx.comparison?diffHTML(careSummary(old),careSummary(s),true):esc(careSummary(s));
    return {
      review:'<div class="jenc-fields">'+(isFistulaCol(s)?'':colourSelect(s,extra,old))+multi(isFistulaCol(s)?'Output':'Function / output',s.output,options('output'),'stoma','output',extra,old?.output||[],'output')+'</div>'+
        skinHTML(s,extra,old)+(rodAsked(s)?rodHTML(s,extra,old):'')+accordion('complications:'+s.uid,'Complications',compSummary,compBody),
      appliances:applianceHTML(s,extra,old)
    };
  }
  function render(){
    if(!ctx)return;const page=parentPage(),p=ctx.patient,rec=ctx.record,ver=ctx.viewVersion;
    const episodeLabel=ctx.episode.episode_ref||String(ctx.episode.id).slice(0,8);
    const top='<div class="jenc-head"><div><div class="jenc-toolbar"><button class="jenc-btn" data-action="back">← Back to '+(ctx.returnPage==='page-patient-record'?'patient record':'handover')+'</button><h2>Encounters</h2></div><div class="jenc-identity" style="margin-top:14px">'+esc((p.first_name||'')+' '+(p.surname||''))+' <span class="jenc-id">ID: '+esc(p.id_card||'—')+'</span></div><div class="jenc-meta">'+esc([p.inpatient_ward,p.inpatient_bed].filter(Boolean).join(' · '))+' · <span class="jenc-episode">Episode '+esc(episodeLabel)+'</span></div>'+referralChipsHTML(ctx.mode==='form'&&ctx.editable?ctx.draft?.referrals:patientReferrals(p))+'</div><div><div class="jenc-toolbar"><button class="jenc-btn '+(ctx.mode==='history'?'primary':'')+'" data-action="history">History</button></div><div class="jenc-meta">Recorded automatically from '+esc(ctx.who.name)+'</div></div></div><div id="jenc-message">'+(ctx.message?'<div class="jenc-success" role="status">'+esc(ctx.message)+'</div>':'')+'</div>';
    if(ctx.mode==='history'){
      const choices=[['all','All episodes'],...ctx.episodes.map(e=>[String(e.id),'Episode '+(e.episode_ref||String(e.id).slice(0,8))+' · '+e.record_date])];
      const rows=ctx.rows.filter(r=>ctx.historyFilter==='all'||String(r.episode_id)===ctx.historyFilter);
      page.innerHTML=top+'<div class="jenc-card">'+select('Episode',ctx.historyFilter,choices,'history','filter')+'</div>'+rows.map(e=>{const v=currentVersion(e),prior=versions(e).slice(-2,-1)[0];return '<article class="jenc-history-card"><h3>'+esc(encounterCode(e,p,ctx.rows))+' · V'+v.version+'</h3><div class="jenc-meta">'+esc(stamp(e.created_at))+' · '+esc(e.created_by_name||e.created_by_email||'')+' · Episode '+esc(e.episode_ref||String(e.episode_id).slice(0,8))+'</div><div class="jenc-history-report">'+documentReport({...v.snapshot,legacy_assessment:v.legacy_assessment},v.report,prior&&prior!==v?prior.snapshot:null,prior?.report)+'</div><button class="jenc-btn" data-action="view" data-id="'+esc(e.id)+'">Open encounter</button></article>';}).join('')+(rows.length?'':'<div class="jenc-card">No encounters saved for this episode.</div>');return;
    }
    const d=ctx.draft,n=ctx.expectedVersion;
    const editReport=rec&&!ctx.editable&&editableToday(rec)?'<button type="button" class="jenc-btn primary jenc-no-print" data-action="edit">Edit report as V'+(n+1)+'</button>':'';
    const versionBar=rec?'<div class="jenc-version"><strong>'+esc(encounterCode(rec,p,ctx.rows))+' · '+(ctx.editable?'Editing V'+(n+1):'V'+ver.version)+'</strong>'+(!ctx.editable?'<span class="jenc-state">Read only</span>':'')+'<div class="jenc-meta">Original: '+esc(stamp(rec.created_at))+'</div><div class="jenc-toolbar">'+editReport+versions(rec).map((v,i)=>'<button class="jenc-btn muted" data-action="version" data-index="'+i+'">V'+v.version+'</button>').join('')+(ctx.comparison?'<label class="jenc-meta"><input type="checkbox" data-kind="compare"'+(ctx.compare?' checked':'')+'> Show changes'+(ctx.editable?' from V'+n:' from previous version')+'</label>':'')+'</div></div>':'';
    if(rec&&!ctx.editable){
      page.innerHTML=top+versionBar+'<article class="jenc-document" aria-labelledby="jenc-document-title"><header><h3 id="jenc-document-title">Clinical encounter report</h3><p class="jenc-document-date">'+esc(showDay(recordDay(rec)))+' · Episode '+esc(episodeLabel)+'</p></header><div id="jenc-report" class="jenc-report"></div><footer class="jenc-signature">Signed by: '+esc(ver.author_name||ver.author_email||'')+' · '+esc(stamp(ver.saved_at))+'</footer></article><div class="jenc-actions jenc-no-print">'+(!editableToday(rec)?'<span class="jenc-locked">Recorded '+esc(recordDay(rec))+' — an encounter can be edited only on the day it was recorded.</span>':'')+'<button class="jenc-btn" data-action="print">Print / PDF</button><button class="jenc-btn muted" data-action="history">Version / encounter history</button></div>';
      refreshReport();return;
    }
    const inf=d.infection||{status:'',organism:''};
    const infectionText=x=>[x?.organism,x?.status].filter(Boolean).join(' · ')||'Not recorded';
    const infectionSummary=ctx.compare&&ctx.comparison?diffHTML(infectionText(ctx.comparison.infection),infectionText(inf),true):esc(infectionText(inf));
    const infBody='<div class="jenc-fields">'+select('Status',inf.status,INFECTION_STATUS,'infection','status','',ctx.comparison?.infection?.status)+select('Organism',inf.organism,ORGANISMS,'infection','organism','',ctx.comparison?.infection?.organism)+'</div>';
    const previousRefs=list(ctx.comparison?.referrals).map(normReferral).filter(Boolean);
    const referrals=list(d.referrals).map((r,i)=>{
      const old=previousRefs.find(v=>v.id===r.id),isNew=!list(ctx.baseline?.referrals).some(v=>v.id===r.id),lock=ctx.editable?'':' disabled';
      const changed=ctx.compare&&ctx.comparison&&(!old||old.seen!==r.seen||old.seen_on!==r.seen_on||old.profession!==r.profession);
      const open=PROFESSIONS.filter(x=>x===r.profession||!list(d.referrals).some(y=>y!==r&&y.profession===x&&!y.seen));
      const who=r.profession&&!isNew?'<div class="jenc-ref-name">'+esc(r.profession)+'</div>':select('Refer to',r.profession,open,'referral','profession','data-index="'+i+'"',old?.profession);
      const meta='<div class="jenc-meta">Referred '+esc(showDay(r.referred_on||TODAY))+(r.referred_by?' by '+esc(r.referred_by):'')+'</div>';
      let seen='<label class="jenc-check"><input type="checkbox" data-kind="referral" data-field="seen" data-index="'+i+'"'+(r.seen?' checked':'')+lock+'> Seen'+(r.profession?' by '+esc(r.profession):'')+'</label>';
      if(r.seen)seen+='<div class="jenc-field"><label>Seen on</label><input type="date" data-kind="referral" data-field="seen_on" data-index="'+i+'" value="'+esc(r.seen_on||TODAY)+'" max="'+esc(TODAY)+'"'+lock+'></div>'+(r.seen_by?'<div class="jenc-meta">Recorded by '+esc(r.seen_by)+'</div>':'');
      const remove=ctx.editable&&isNew?'<button class="jenc-remove" data-action="remove-referral" data-index="'+i+'" aria-label="Remove this referral">×</button>':'';
      return '<div class="jenc-referral-row'+(changed?' jenc-changed':'')+'"><div>'+who+meta+'</div><div class="jenc-ref-seen">'+seen+'</div>'+remove+'</div>';
    }).join('')||'<div class="jenc-meta">No referrals on record for this patient.</div>';
    // One column per stoma, side by side, so nothing is hidden behind a tab.
    const panels=d.stomas.map(v=>({stoma:v,name:stomaName(v,d.stomas),...stomaHTML(v)}));
    const grid=cols=>'<div class="jenc-stoma-grid" style="--jenc-cols:'+Math.min(Math.max(panels.length,1),3)+'">'+cols+'</div>';
    const column=(name,body)=>'<div class="jenc-stoma-col"><h4 class="jenc-stoma-title">'+esc(name)+'</h4>'+body+'</div>';
    const noteBox=(key,label,value,id)=>'<div class="jenc-note-col"><label class="jenc-notes-label" for="'+id+'">'+esc(label)+'</label><div class="jenc-notebox"><div class="jenc-note-mirror" aria-hidden="true"></div><textarea id="'+id+'" data-note="'+esc(key)+'" aria-label="'+esc(label)+'" placeholder="Write your observations, care provided or patient concerns…"'+(ctx.editable?'':' readonly')+'>'+esc(value||'')+'</textarea></div><div class="jenc-note-diff jenc-previous"></div></div>';
    // Patient-wide observations have their own box on every encounter. Reuse
    // the versioned notes field so older episode notes are preserved as well.
    const notesHTML=(panels.length?grid(panels.map((x,i)=>noteBox(x.stoma.uid,x.name+' — clinical notes',x.stoma.notes,'jenc-notes-'+i)).join('')):'')+
      '<div class="jenc-general-notes">'+noteBox('','General notes',d.notes,'jenc-notes')+'</div>';
    const heading=(number,title,id,badge='')=>'<h3 class="jenc-step-heading" id="'+id+'"><span class="jenc-step-number" aria-hidden="true">'+number+'</span>'+title+(badge?'<span class="jenc-state">'+badge+'</span>':'')+'</h3>';
    const review='<section class="jenc-card jenc-step" data-step="review" aria-labelledby="jenc-review-heading">'+heading(1,panels.length&&panels.every(x=>isFistulaCol(x.stoma))?'Fistula review':'Stoma review','jenc-review-heading')+(panels.length?grid(panels.map(x=>column(x.name,x.review)).join('')):'<p>No stoma is recorded for this episode. Add its details in the patient record first.</p>')+'</section>';
    const appliances='<section class="jenc-card jenc-step" data-step="appliances" aria-labelledby="jenc-appliances-heading">'+heading(2,'Appliances &amp; accessories','jenc-appliances-heading')+(panels.length?grid(panels.map(x=>column(x.name,x.appliances)).join('')):'<p>Record the stoma details before choosing its appliance setup.</p>')+'</section>';
    const writtenReport='<section class="jenc-card jenc-step" data-step="report" aria-labelledby="jenc-report-heading"><div class="jenc-form-content">'+heading(3,'Written report','jenc-report-heading','Episode '+esc(episodeLabel))+notesHTML+'<div class="jenc-meta">Each stoma’s notes are saved with this episode.</div></div><div class="jenc-preview"><h4>Report'+(ctx.editable?' preview':'')+'</h4><div id="jenc-report" class="jenc-report"></div><div class="jenc-signature">'+(ctx.editable?'Signature will be recorded automatically: ':'Signed by: ')+esc(ctx.editable?ctx.who.name:(ver.author_name||ver.author_email||''))+(ctx.editable?'':' · '+esc(stamp(ver.saved_at)))+'</div></div></section>';
    const infection='<section class="jenc-card jenc-step" data-step="infection" aria-labelledby="jenc-infection-heading">'+heading(4,'Infection status','jenc-infection-heading','Patient')+accordion('infection','Recorded status',infectionSummary,infBody)+'</section>';
    const support='<section class="jenc-card jenc-step" data-step="support" aria-labelledby="jenc-support-heading">'+heading(5,'Support / referrals','jenc-support-heading','Patient · every episode')+referrals+(ctx.editable?'<button class="jenc-btn" data-action="add-referral">+ Add referral</button>':'')+'</section>';
    page.innerHTML=top+versionBar+'<div class="jenc-form-content">'+review+appliances+'</div>'+writtenReport+'<div class="jenc-form-content">'+infection+support+'</div><div class="jenc-actions jenc-no-print">'+(ctx.editable?'<button class="jenc-btn primary" id="jenc-save" data-action="save">'+(rec?'Save as V'+(n+1):'Save encounter')+'</button><button class="jenc-btn muted" data-action="cancel">Cancel'+(rec?' edit':'')+'</button>':(!editableToday(rec)?'<span class="jenc-locked">🔒 Recorded '+esc(recordDay(rec))+' — an encounter can be edited only on the day it was recorded.</span>':'')+'<button class="jenc-btn" data-action="print">Print / PDF</button>')+'<button class="jenc-btn muted" data-action="history">Version / encounter history</button></div>';
    page.querySelectorAll('details[data-section]').forEach(el=>el.addEventListener('toggle',()=>{if(el.open)ctx?.openSections.add(el.dataset.section);else ctx?.openSections.delete(el.dataset.section);}));
    page.querySelectorAll('textarea[data-note]').forEach(ta=>ta.addEventListener('scroll',()=>{const mirror=ta.parentNode.querySelector('.jenc-note-mirror');if(mirror){mirror.scrollTop=ta.scrollTop;mirror.scrollLeft=ta.scrollLeft;}}));refreshReport();
    if(ctx.saving){const saveButton=page.querySelector('#jenc-save');if(saveButton)saveButton.textContent=ctx.savePhase||'Saving…';page.querySelectorAll('select,input,textarea,button').forEach(el=>el.disabled=true);}
  }
  // Use the selected version's snapshot, never the patient's current care setup.
  // Text-only older records retain their original saved report as readable prose.
  function documentReport(snapshot,text,previous=null,previousText=null){
    const stomas=list(snapshot?.stomas);
    if(!stomas.length&&text&&(!snapshot?.notes||snapshot?.legacy_assessment))return '<div class="jenc-document-legacy">'+(previous?diffHTML(previousText??report(previous),text):esc(text))+'</div>';
    const field=(label,value,fallback='Not recorded')=>'<div class="jenc-document-field"><dt>'+esc(label)+'</dt><dd><strong>'+esc(String(value||'').trim()||fallback)+'</strong></dd></div>';
    const notes=value=>'<h5 class="jenc-document-notes-title">Notes</h5><p class="jenc-document-notes">'+esc(String(value||'').trim()||'No written notes recorded.')+'</p>';
    const skin=s=>s?.status==='Healthy'?'Healthy':s?.status==='Not assessed'?'Not assessed — flange in situ':s?.status==='Not healthy'?'Not healthy'+(list(s.problems).length?' — '+s.problems.join(', '):''):'';
    const sections=stomas.map((x,i)=>{
      const comps=list(x.complications).filter(c=>c.text).map(c=>c.text+' — '+(c.status==='resolved'?'Resolved':'Active')).join('\n');
      let review=(isFistulaCol(x)?'':field('Colour / appearance',x.colour))+field(isFistulaCol(x)?'Output':'Function / output',list(x.output).join(', '))+field(isFistulaCol(x)?'Skin around the fistula':'Peristomal skin',skin(x.skin));
      if(comps)review+=field('Complications',comps);
      if(x.rod_asked!==false&&['In place','Removed'].includes(x.rod?.status))review+=field('Rod',x.rod.status==='In place'?'Present'+(x.rod.due?' — planned removal '+showDay(x.rod.due):''):'Removed'+(x.rod.removed?' — '+showDay(x.rod.removed):''));
      return '<section data-stoma-uid="'+esc(x.uid)+'" class="jenc-document-stoma jenc-document-tone-'+(i%3)+'"><h4>'+esc(stomaName(x,stomas))+'</h4><dl>'+review+'</dl>'+notes(x.notes)+'<h5 class="jenc-document-appliances-title">Appliances &amp; accessories</h5><dl>'+field('Appliances',list(x.appliances).join(', '),'No appliance recorded')+field('Accessories',list(x.accessories).join(', '),'No accessories recorded')+(x.flange_due?field('Flange change due',showDay(x.flange_due)):'')+'</dl></section>';
    }).join('');
    const general='<section class="jenc-document-general"><h4>General notes</h4><p class="jenc-document-notes">'+esc(String(snapshot?.notes||'').trim()||'No written notes recorded.')+'</p></section>';
    const infection=snapshot?.infection;
    const infectionHTML=infection?.status&&infection.status!=='Not recorded'?'<section class="jenc-document-support"><h4>Infection status</h4><p><strong>'+esc([infection.organism,infection.status].filter(Boolean).join(' · '))+'</strong></p></section>':'';
    const refs=list(snapshot?.referrals).map(normReferral).filter(Boolean);
    const support=refs.length?'<section class="jenc-document-support"><h4>Support / referrals</h4>'+refs.map(r=>'<p><strong>'+esc(referralText(r))+'</strong></p>').join('')+'</section>':'';
    const html=sections+general+infectionHTML+support;
    if(!previous)return html;
    // Compare signed values within their original sections, keeping the saved document layout.
    const current=document.createElement('div'),before=document.createElement('div');
    current.innerHTML=html;before.innerHTML=documentReport(previous,previousText||'');
    current.querySelectorAll('section').forEach(section=>{
      const uid=section.dataset.stomaUid;
      const oldSection=Array.from(before.querySelectorAll('section')).find(old=>uid?old.dataset.stomaUid===uid:old.className===section.className&&old.querySelector('h4')?.textContent===section.querySelector('h4')?.textContent);
      section.querySelectorAll('dd strong, p').forEach(value=>{
        const label=value.closest('.jenc-document-field')?.querySelector('dt')?.textContent;
        const oldValue=label?Array.from(oldSection?.querySelectorAll('.jenc-document-field')||[]).find(field=>field.querySelector('dt')?.textContent===label)?.querySelector('dd strong'):Array.from(oldSection?.querySelectorAll('p')||[])[Array.from(section.querySelectorAll('p')).indexOf(value)];
        value.innerHTML=diffHTML(oldValue?.textContent||'',value.textContent);
      });
    });
    return current.innerHTML;
  }
  function refreshReport(){
    if(!ctx||ctx.mode!=='form')return;const old=ctx.comparison,showDiff=!!(ctx.compare&&old);
    document.querySelectorAll('#page-jason-encounters textarea[data-note]').forEach(ta=>{
      const key=ta.dataset.note,box=ta.closest('.jenc-note-col');
      const notes=String((key?ctx.draft.stomas.find(x=>x.uid===key)?.notes:ctx.draft.notes)||'');
      const before=String((key?list(old?.stomas).find(x=>x.uid===key)?.notes:old?.notes)||'');
      const mirror=box?.querySelector('.jenc-note-mirror');if(mirror)mirror.innerHTML=(showDiff?diffHTML(before,notes):esc(notes))+'\n';
      const diff=box?.querySelector('.jenc-note-diff');if(diff)diff.innerHTML=showDiff&&before!==notes?'Changes: '+diffHTML(before,notes,true):'';
    });
    const r=document.getElementById('jenc-report');if(r){const now=ctx.record&&!ctx.editable&&ctx.viewVersion?.report?ctx.viewVersion.report:report(ctx.draft);
      const was=!ctx.editable&&ctx.comparisonReport!=null?ctx.comparisonReport:(old?report(old):'');r.classList.toggle('jenc-document-prose',!ctx.editable);r.innerHTML=ctx.editable?(showDiff?diffHTML(was,now,true):esc(now)):documentReport({...ctx.viewVersion.snapshot,legacy_assessment:ctx.viewVersion.legacy_assessment},now,showDiff?old:null,was);}
  }
  function input(e){
    if(!ctx?.editable)return;const key=e.target.dataset?.note;if(e.target.tagName!=='TEXTAREA'||key===undefined)return;
    if(key)(ctx.draft.stomas.find(x=>x.uid===key)||{}).notes=e.target.value;else ctx.draft.notes=e.target.value;refreshReport();
  }
  function change(e){
    if(!ctx)return;const el=e.target,kind=el.dataset.kind,field=el.dataset.field;
    if(kind==='compare'){ctx.compare=el.checked;render();return;}
    if(kind==='history'){ctx.historyFilter=el.value;render();return;}
    if(!ctx.editable)return;
    if(!kind)return;
    let obj;
    if(kind==='global')obj=ctx.draft;
    if(kind==='infection')obj=ctx.draft.infection;
    if(kind==='referral')obj=ctx.draft.referrals[Number(el.dataset.index)];
    if(kind==='referral'&&field==='seen'&&obj){obj.seen=el.checked;obj.seen_on=el.checked?(obj.seen_on||TODAY):'';obj.seen_by=el.checked?ctx.who.name:'';render();return;}
    const st=ctx.draft.stomas.find(s=>s.uid===el.dataset.uid);
    if(kind==='rod'&&field==='present'&&st){
      const was=ctx.baseline.stomas.find(x=>x.uid===st.uid)?.rod||{};
      if(el.checked)st.rod={status:'In place',due:st.rod?.due||(was.status==='In place'?was.due:'')||'',removed:''};
      else if(was.status==='In place')st.rod={status:'Removed',due:was.due||'',removed:TODAY};
      else st.rod=was.status==='Removed'?copy(was):{status:'Not recorded',due:'',removed:''};
      render();return;
    }
    if(kind==='stoma'&&field==='colour'&&el.value==='__add__'&&st){addOptionFlow('colour',st);return;}
    if(kind==='skin'&&field==='pick'&&st){
      const v=skinValues(st.skin).filter(x=>x!==el.value);if(el.checked)v.push(el.value);applySkin(st,v,el.value,el.checked);
      render();return;   // the picker closes on each choice; reopen it to add another
    }
    if(kind==='skin'&&st&&!st.skin)st.skin={status:'',problems:[]};
    if(kind==='stoma')obj=st;if(kind==='rod')obj=st?.rod;if(kind==='skin')obj=st?.skin;if(kind==='comp')obj=st?.complications[Number(el.dataset.index)];if(!obj)return;
    if(el.type==='checkbox'){
      let v=list(obj[field]).filter(x=>x!==el.value);if(el.checked)v.push(el.value);
      if(field==='output')v=nilExclusive(v,el.checked?el.value:'');obj[field]=v;
    }else obj[field]=el.value;
    if(kind==='skin'){if(field==='status'&&st.skin.status!=='Not healthy')st.skin.problems=[];linkSkin(st);}
    if(kind==='rod'&&field==='status'){if(el.value==='Removed'){st.rod.removed=TODAY;}else if(el.value==='Not recorded'){st.rod.due='';st.rod.removed='';}else st.rod.removed='';}
    // The multi-select picker collapses on each choice (reopen it to add another).
    render();
  }
  async function click(e){
    const btn=e.target.closest('[data-action]');if(!btn)return;const action=btn.dataset.action;
    if(action==='back'){await back();return;}if(!ctx)return;
    
    if(action==='history'){if(!canLeave())return;ctx.mode='history';ctx.editable=false;render();return;}
    if(action==='view'){selectRecord(btn.dataset.id);return;}
    if(action==='version'){selectRecord(ctx.record.id,Number(btn.dataset.index));return;}
    if(action==='edit'){selectRecord(ctx.record.id,null,true);return;}
    if(action==='cancel'){if(!canLeave())return;if(ctx.record){ctx.editable=false;selectRecord(ctx.record.id);}else await back();return;}
    if(action==='print'){window.print();return;}
    if(!ctx.editable)return;
    const st=ctx.draft.stomas.find(s=>s.uid===btn.dataset.uid);
    if(action==='add-option'&&st){await addOptionFlow(btn.dataset.option,st);return;}
    // Keep same: the recorded setup goes back exactly as it was (an older snapshot may lack some fields).
    if(action==='keep-appliance'&&st){const b=ctx.baseline.stomas.find(x=>x.uid===st.uid);
      if(b)['system','baseplate','pouch','appliances','accessories','flange_due'].forEach(k=>{if(k in b)st[k]=copy(b[k]);else delete st[k];});render();return;}
    if(action==='modify-appliance'&&st){modifyAppliance(st);return;}
    if(action==='add-comp'&&st){st.complications.push({id:crypto.randomUUID(),text:'',status:'open'});ctx.openSections.add('complications:'+st.uid);render();}
    if(action==='remove-comp'&&st){st.complications.splice(Number(btn.dataset.index),1);render();}
    if(action==='add-referral'){ctx.draft.referrals.push({id:crypto.randomUUID(),profession:'',referred_on:TODAY,referred_by:ctx.who.name,seen:false,seen_on:'',seen_by:''});render();}
    if(action==='remove-referral'){ctx.draft.referrals.splice(Number(btn.dataset.index),1);render();}
    if(action==='save')await save();
  }
  // "+ Add other…": the new wording joins the list for good and is chosen here.
  async function addOptionFlow(field,st){
    const label={colour:'colour / appearance',output:'function / output',skin:'peristomal skin finding'}[field];if(!label)return;
    let raw='';try{raw=window.prompt('Add another '+label+' to the list:')||'';}catch(_){}
    const name=await addOption(field,raw);
    if(name&&ctx?.editable&&st){
      if(field==='colour')st.colour=name;
      if(field==='output')st.output=nilExclusive(list(st.output).filter(x=>x!==name).concat(name),name);
      if(field==='skin')applySkin(st,skinValues(st.skin).filter(x=>x!==name).concat(name),name,true);
    }
    render();
  }
  function impact(){
    const patch={},expected={},p=ctx.patient,base=ctx.baseline,draft=ctx.draft;
    const changes=draft.stomas.filter(s=>!same(s.complications,base.stomas.find(b=>b.uid===s.uid)?.complications));
    if(changes.length){let comps=parseComplications(p);changes.forEach(s=>{
      const existing=comps.filter(c=>c.stoma_uid===s.uid||c.stoma===s.legacy_ref||(!c.stoma&&draft.stomas.length===1));
      // Removal from a saved selection resolves the clinical item; history survives.
      const selected=new Set(s.complications.map(c=>c.id));existing.forEach(c=>{if(!selected.has(c.id)){c.status='resolved';c.resolved_date=TODAY;c.events.push({id:crypto.randomUUID(),date:TODAY,trend:'resolved',note:'Resolved through encounter',by:ctx.who.name});}});
      s.complications.forEach(c=>{let item=comps.find(x=>x.id===c.id);if(!item){item={id:c.id,text:c.text,stoma:s.legacy_ref,stoma_uid:s.uid,date:TODAY,status:c.status,events:[],source:'Encounter',by:ctx.who.name};comps.push(item);}
        if(!same(existing.find(v=>v.id===c.id)?.status,c.status)||!existing.some(v=>v.id===c.id&&v.text===c.text))item.events.push({id:crypto.randomUUID(),date:TODAY,trend:c.status==='resolved'?'resolved':'noted',note:c.text,by:ctx.who.name});item.text=c.text;item.status=c.status;if(c.status==='resolved')item.resolved_date=TODAY;});
    });patch.complications=JSON.stringify(comps);expected.complications=p.complications??null;}
    const rodChanges=draft.stomas.filter(s=>!same(s.rod,base.stomas.find(b=>b.uid===s.uid)?.rod));
    if(rodChanges.some(s=>s.rod?.status==='In place'&&!s.rod.due))throw new Error('Choose the planned rod removal date.');
    const rod=rodChanges.length?(draft.stomas.filter(s=>s.rod?.status==='In place').sort((a,b)=>a.rod.due.localeCompare(b.rod.due))[0]||rodChanges[0]):null;
    if(rod){
      Object.assign(patch,{rod_stoma_uid:rod.uid,rod_removal_date:rod.rod.due||null,rod_removed_date:rod.rod.status==='Removed'?(rod.rod.removed||TODAY):null});
      ['rod_stoma_uid','rod_removal_date','rod_removed_date'].forEach(k=>expected[k]=p[k]??null);}
    if(!same(draft.infection,base.infection)){patch.inpatient_nurse_notes=!draft.infection.status?'':draft.infection.status==='Resolved'?'Infection status: Resolved':[draft.infection.organism,draft.infection.status].filter(Boolean).join(' · ');expected.inpatient_nurse_notes=p.inpatient_nurse_notes??null;}
    const appliances=changedAppliances(base,draft);
    const merged=parseEpisodeApplianceRows(ctx.episode).concat(appliances.map(a=>({...a,changed_on:ctx.record?.encounter_date||TODAY})));
    const current=currentApplianceNoteRows(p,merged).concat(looseApplianceRows(p,merged));
    return {appliances,expected_appliances:ctx.episode.appliances??null,ward_note:episodeApplianceNote(current),flange_due:episodeFlangeDueDate(current),patient_patch:patch,expected_patient:expected};
  }
  async function save(){
    if(!ctx?.editable||ctx.saving||!enabled())return;
    if(ctx.record&&!editableToday(ctx.record))return error('This encounter was recorded on '+recordDay(ctx.record)+' and can no longer be edited.');
    if(!dirty())return error(ctx.record?'There are no changes to save.':'Record a finding, care change, referral or clinical note before saving.');
    if(!ctx.draft.scope.length||ctx.draft.scope.some(uid=>!ctx.draft.stomas.some(s=>s.uid===uid)))return error('Record the patient’s stoma in the patient record before saving an encounter.');
    const noSkin=ctx.draft.stomas.filter(s=>s.skin?.status==='Not healthy'&&!list(s.skin.problems).length);
    if(noSkin.length)return error('Choose the peristomal skin problem for '+noSkin.map(s=>stomaName(s,ctx.draft.stomas)).join(', ')+'.');
    if(ctx.draft.stomas.some(s=>s.complications.some(c=>!c.text)))return error('Choose a complication or remove the empty row.');
    if(ctx.draft.referrals.some(r=>!r.profession))return error('Choose who the patient is referred to, or remove the empty referral.');
    let updates;try{updates=impact();}catch(e){return error(e.message);}
    const empty=ctx.draft.stomas.filter(s=>updates.appliances.some(a=>a.stoma_uid===s.uid&&!list(a.appliances).length));
    if(empty.length)return error('Choose the appliance for '+empty.map(s=>stomaName(s,ctx.draft.stomas)).join(', ')+' — press Modify appliance, or Keep same appliance.');
    const savedCtx=ctx,owner={};ctx.saveOwner=owner;ctx.saving=true;ctx.savePhase='Saving…';const button=document.getElementById('jenc-save');if(button){button.textContent=ctx.savePhase;}
    const message=document.getElementById('jenc-message');if(message)message.innerHTML='';
    parentPage().querySelectorAll('select,input,textarea,button').forEach(el=>el.disabled=true);
    let pending=ctx.pendingSave;
    try{
      const {data:auth,error:authError}=await boundedRequest(()=>SB.auth.getUser(),10000);if(ctx!==savedCtx)return;
      if(authError||!signedIn(auth?.user))throw new Error('Sign in to save this encounter.');
      if(!pending){
        pending={draft:copy(ctx.draft),baseline:copy(ctx.baseline),payload:{p_patient_id:ctx.patient.id,p_episode_id:ctx.episode.id,p_encounter_id:ctx.record?.id||null,
          p_expected_version:ctx.expectedVersion,p_snapshot:{...copy(ctx.draft),save_request_id:crypto.randomUUID()},p_report:report(ctx.draft),p_impact:updates}};
        ctx.pendingSave=pending;
      }
      // A retry uses the exact same payload. The database returns the original
      // result if this request committed before its response was interrupted.
      let data;
      try{
        const result=await boundedRequest(signal=>{
          let query=SB.rpc('save_jason_encounter',pending.payload);
          if(typeof query?.retry==='function')query=query.retry(false);
          return cancellable(query,signal);
        },25000);
        if(result.error)throw Object.assign(new Error(result.error.message||'Could not save the encounter.'),{code:result.error.code});
        if(!result.data?.id)throw new Error('The saved encounter was not returned.');
        data=result.data;
      }catch(saveError){
        if(ctx!==savedCtx)return;
        ctx.savePhase='Checking save…';const checkButton=document.getElementById('jenc-save');if(checkButton)checkButton.textContent=ctx.savePhase;
        try{data=await confirmSave(savedCtx,pending);}catch(_){}
        if(!data){
          // Validation/conflict errors are definite failures, unlike a timeout.
          if(['40001','42501','P0001','22023','22P02'].includes(saveError.code))ctx.pendingSave=null;
          throw saveError;
        }
      }
      if(ctx!==savedCtx)return;
      const currentIndex=ctx.rows.findIndex(r=>r.id===data.id);if(currentIndex<0)ctx.rows.unshift(data);else ctx.rows[currentIndex]=data;
      const localDraft=copy(ctx.draft),hasLaterChanges=!same(localDraft,pending.draft);
      ctx.pendingSave=null;ctx.editable=false;ctx.compare=false;ctx.baseline=copy(ctx.draft);ctx.saving=false;
      selectRecord(data.id,null,hasLaterChanges);
      if(hasLaterChanges)ctx.draft=localDraft;
      const success='Encounter '+encounterCode(data,ctx.patient,ctx.rows)+' saved · V'+currentVersion(data).version+'.';
      ctx.message=success+(hasLaterChanges?' Your later changes remain unsaved below. Press Save as V'+(ctx.expectedVersion+1)+' to record them.':'');render();
      hvEncounteredToday.add(String(ctx.patient.id));latestByPatient.set(String(ctx.patient.id),data);
      // Show the confirmed save immediately. Optional refreshes and the patient
      // referral sync must never hold the Save button or disguise a committed write.
      const savedVersion=ctx.expectedVersion;
      // Referrals live on the patient so they carry to later episodes and visits.
      const before=patientReferrals(savedCtx.patient),after=mergedReferrals(before,pending.baseline.referrals,pending.draft.referrals);
      let refNote='';
      if(!same(before,after)&&typeof updatePatientTolerant==='function'){
        try{const r=await boundedRequest(()=>updatePatientTolerant(savedCtx.patient.id,{support_referrals:after}));
          if(r?.error)refNote=' Referrals could not be saved to the patient: '+(r.error.message||r.error)+'.';
          else if(list(r?.dropped).includes('support_referrals'))refNote=' Referrals were kept in this encounter only — run sql/add-support-referrals.sql once in Supabase so they carry over to later episodes and visits.';
        }catch(e){refNote=' Referrals could not be saved to the patient.';}
      }
      if(ctx!==savedCtx||ctx.expectedVersion!==savedVersion||ctx.saveOwner!==owner)return;
      const results=await Promise.allSettled([boundedRequest(()=>fetchPatientById(ctx.patient.id)),boundedRequest(signal=>cancellable(SB.from('clinical_records').select('*').eq('patient_id',ctx.patient.id).eq('kind','episode').order('record_date',{ascending:false}),signal))]);
      if(ctx!==savedCtx||ctx.expectedVersion!==savedVersion||ctx.saveOwner!==owner)return;
      if(results[0].status==='fulfilled'&&results[0].value.data)ctx.patient=results[0].value.data;
      if(results[1].status==='fulfilled'&&results[1].value.data)ctx.episodes=results[1].value.data;
      if(refNote){ctx.message+=refNote;render();}
      if(typeof refreshReminders==='function')Promise.resolve(refreshReminders()).catch(()=>{});
    }catch(e){if(ctx===savedCtx&&ctx.saveOwner===owner){ctx.saving=false;render();const retry=ctx.pendingSave?' The save has not been confirmed. Press Save again to check or retry the same encounter.':'';error((e.message||'Could not reach the clinic server.')+retry+' Your changes remain on this screen.');}}
    finally{if(ctx===savedCtx&&ctx.saveOwner===owner){ctx.saving=false;ctx.saveOwner=null;}}
  }
  async function attach(rows){
    if(!enabled()||!rows.length)return;const ids=rows.map(p=>String(p.id));
    const {rows:records,error:readError}=await fetchAllRows(()=>SB.from('encounters').select('id,patient_id,episode_id,assessment,created_at').in('patient_id',ids).order('created_at',{ascending:false}).order('id'));
    if(readError)throw readError;latestByPatient.clear();
    for(const r of records||[])if(!latestByPatient.has(String(r.patient_id)))latestByPatient.set(String(r.patient_id),r);
  }
  function handoverCell(p,line){
    const comp=handoverComplicationLine(p),rod=p.rod_removal_date&&!p.rod_removed_date?'In place · removal '+p.rod_removal_date:'';
    const text=String(p.inpatient_nurse_notes||'');
    const due=p.flange_due?String(p.flange_due).slice(0,10):'';
    const flange=typeof applianceLineIsTwoPiece==='function'&&applianceLineIsTwoPiece(line)?'<div class="hv-flangebox"><span class="hv-flange-cap">Flange due</span><span class="jenc-meta">'+esc(due||'Not recorded')+'</span><input type="hidden" class="hv-flange-date" value="'+esc(due)+'"></div>':'';
    return '<span class="hv-appl jenc-handover-appliance" data-appliance="'+esc(line)+'">'+esc(line||'Awaiting first review')+'</span>'+flange+handoverRodPrintCarrier(p)+
      '<div class="jenc-handover-summary">'+(comp?'<div><strong>Complication:</strong> <span class="hv-cmp-line">'+esc(comp)+'</span></div>':'')+(rod?'<div><strong>Rod:</strong> '+esc(rod)+'</div>':'')+(text?'<div>'+esc(text)+'</div>':'')+'</div><input type="hidden" class="hv-note hv-nnote" value="'+esc(text)+'">'+
      '<button type="button" class="ncb-btn hv-enc-btn'+(hvEncounteredToday.has(String(p.id))?' is-done':'')+'" onclick="openEncounter(\''+String(p.id).replace(/[^a-z0-9-]/gi,'')+'\')">📝 Encounter'+(hvEncounteredToday.has(String(p.id))?' ✓':'')+'</button>';
  }
  window.JasonEncounters={open,save,back,dismiss,attach,handoverCell,isJason,signedIn,versions,report,diffHTML,nilExclusive,changedAppliances,code:encounterCode,stomaName,patientReferrals,referralChipsHTML,normReferral,mergedReferrals,setupFields,isFistulaCol,professions:PROFESSIONS,
    get state(){return ctx;},colours:COLOURS,outputs:OUTPUTS,skinProblems:SKIN,healthySkin:HEALTHY_SKIN,rodCapable,options,addOption,loadOptions,isSkinProblem,skinName};
  window.openEncounter=open;
  const priorSwitch=window.switchTab;
  if(priorSwitch)window.switchTab=function(name){if(name!=='manual'&&document.body.classList.contains('jenc-open')&&!dismiss())return;return priorSwitch.apply(this,arguments);};
  const priorLogout=window.doLogout;
  if(priorLogout)window.doLogout=async function(){if(!dismiss())return;latestByPatient.clear();return priorLogout();};
  window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
})();
