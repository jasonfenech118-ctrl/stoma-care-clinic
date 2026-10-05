// Synthetic data only, shared by the DOM tests and browser layout checks.
function boot(w) {
  const clone = x => JSON.parse(JSON.stringify(x));
  const patient = {id:'11111111-1111-4111-8111-111111111111', first_name:'Alex',surname:'Sample',id_card:'DEMO-001',inpatient_ward:'SW1',inpatient_bed:'12',complications:'[]',inpatient_nurse_notes:'',rod_stoma_uid:'stoma-one',rod_removal_date:'2026-10-07',rod_removed_date:null};
  const stomas = [{uid:'stoma-one',code:'S1',type:'Loop ileostomy',typeLabel:'Loop ileostomy',shortLabel:'Ileo',origin:'initial'}, {uid:'stoma-two',code:'S2',type:'Urostomy',typeLabel:'Urostomy',shortLabel:'Uro',origin:'initial'}];
  const episode = {id:'22222222-2222-4222-8222-222222222222',patient_id:patient.id,kind:'episode',record_date:'2026-10-01',episode_ref:'EP-DEMO',is_current:true,discharge_date:null,appliances:[{stoma_uid:'stoma-one',changed_on:'2026-10-02',appliances:['Drainable pouch'],accessories:['Barrier ring']},{stoma_uid:'stoma-two',changed_on:'2026-10-02',appliances:['Urostomy pouch'],accessories:['Night drainage bag']}]};
  const f = w.fixture = {patient,episode,records:[],calls:[],reads:0,email:'jason.fenech@gov.mt',enabled:true,failSave:false};
  w.TODAY='2026-10-05';w.isEncounterUser=()=>f.enabled;w.attDisplayName=()=> 'Jason Fenech';
  w.APPLIANCE_CATALOGUE=[{name:'Drainable pouch',system:'one',part:'bag'},{name:'Urostomy pouch',system:'one',part:'bag'},{name:'Convex drainable pouch',system:'one',part:'bag'},{name:'Baseplate 57 mm',system:'two',part:'flange',coupling:'57'},{name:'Two-piece pouch 57 mm',system:'two',part:'bag',coupling:'57'}];
  w.complicationCatalogue=[{name:'Mucocutaneous separation',scope:'all',active:true},{name:'Retraction',scope:'all',active:true}];
  w.complicationScopeForStoma=()=> 'all';w.stomaTypeCanHaveRod=type=>type==='Loop ileostomy';w.accessoryChoices=extras=>['None','Barrier ring','Paste','Powder','Night drainage bag',...extras];
  w.stomaTimeline=()=>clone(stomas);w.stomasPresentOn=()=>clone(stomas);w.patientStomaList=()=>stomas.map((s,i)=>({...s,slot:'stoma'+(i+1),number:i+1}));
  w.parseEpisodeApplianceRows=ep=>clone(ep.appliances||[]);w.applianceStomaUid=r=>r.stoma_uid||'';w.parseComplications=p=>JSON.parse(p.complications||'[]');
  w.currentApplianceNoteRows=(p,rows)=>stomas.map(s=>rows.filter(r=>r.stoma_uid===s.uid).at(-1)).filter(Boolean);w.looseApplianceRows=()=>[];
  w.episodeApplianceNote=rows=>rows.map(r=>(r.appliances||[]).join(', ')).join(' / ');w.episodeFlangeDueDate=()=>null;
  w.dateAddStr=(d,n)=>{const v=new Date(d);v.setUTCDate(v.getUTCDate()+n);return v.toISOString().slice(0,10);};
  w.handoverComplicationLine=()=>'';w.flangeDueChipHTML=()=>'';w.handoverRodPrintCarrier=()=>'';w.hvEncounteredToday=new Set();
  w.closeModal=()=>{};w.loadHandover=async()=>{};w.refreshReminders=async()=>{};w.switchTab=()=>{};w.doLogout=async()=>{};w.confirm=()=>true;w.scrollTo=()=>{};
  w.fetchPatientById=async()=>{f.reads++;return {data:clone(patient),error:null};};
  w.fetchAllRows=async()=>({rows:clone(f.records),error:null});
  w.SB={auth:{getUser:async()=>({data:{user:{email:f.email}},error:null})},from:()=>{
    const q={select:()=>q,eq:()=>q,order:()=>q,then:(a,b)=>Promise.resolve({data:[clone(episode)],error:null}).then(a,b)};return q;
  },rpc:async(name,args)=>{
    f.calls.push({name,args:clone(args)});if(f.failSave)return {data:null,error:{message:'Simulated save failure'}};
    const old=f.records.find(r=>r.id===args.p_encounter_id),version=args.p_expected_version+1;
    const rec=old||{id:'33333333-3333-4333-8333-333333333333',patient_id:patient.id,episode_id:episode.id,episode_ref:episode.episode_ref,encounter_date:w.TODAY,created_at:'2026-10-05T10:00:00Z',created_by_name:'Jason Fenech',created_by_email:f.email};
    const revision={version,saved_at:'2026-10-05T11:00:00Z',author_name:'Jason Fenech',author_email:f.email,snapshot:clone(args.p_snapshot),report:args.p_report};
    const versions=old?.assessment?.versions||[];rec.assessment={schema:2,current_version:version,snapshot:clone(args.p_snapshot),versions:versions.concat(revision)};rec.nursing_report=args.p_report;
    if(!old)f.records.unshift(rec);return {data:clone(rec),error:null};
  }};
}
module.exports={boot};
