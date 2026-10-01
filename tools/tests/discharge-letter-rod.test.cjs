const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const root=path.join(__dirname,'../..');
const app=fs.readFileSync(path.join(root,'index.html'),'utf8');
const letter=fs.readFileSync(path.join(root,'discharge-letter.html'),'utf8');
const appBuild=app.match(/const APP_BUILD='([^']+)'/)[1];
function source(name){
  const match=app.match(new RegExp('(?:async )?function '+name+'\\('));
  assert.ok(match,name+' not found');
  return app.slice(match.index,app.indexOf('\n}',match.index)+2);
}
function letterSession(params={}){
  const q=new URLSearchParams({fn:'Example',sn:'Patient',id:'FAKE',type:'Loop ileostomy',
    opdate:'2026-09-28',appliance:'Appliance A and Appliance B',...params});
  const dom=new JSDOM(letter,{url:'https://example.test/discharge-letter.html?'+q,runScripts:'outside-only'});
  dom.window.alert=()=>{};
  dom.window.print=()=>{};
  dom.window.eval(fs.readFileSync(path.join(root,'assets/discharge-record.js'),'utf8'));
  dom.window.document.querySelectorAll('script:not([src])').forEach(script=>dom.window.eval(script.textContent));
  return {dom,w:dom.window,plan:()=>dom.window.document.getElementById('planList').textContent};
}
const patient={id:'patient-1',first_name:'Example',surname:'Patient',stoma_type:'Loop ileostomy',
  rod_removal_date:'2026-10-05',rod_removed_date:null,rod_stoma_uid:'base'};
function appSession(overrides={}){
  const dom=new JSDOM('<body><div id="host"></div><div id="cmp-rod-body"></div></body>');
  const writes=[],opened=[],alerts=[],snapshots=[];
  let reminders=0,refreshes=0;
  const c=vm.createContext({window:{open:(url,target)=>{
      const tab={url,target,document:{},location:{},sessionStorage:{setItem:(_key,value)=>snapshots.push(JSON.parse(value))},
        close(){this.closed=true;}};opened.push(tab);return tab;
    }},document:dom.window.document,location:{href:'https://example.test/index.html'},crypto:require('node:crypto').webcrypto,
    URL,URLSearchParams,Map,Date,TODAY:'2026-10-01',APP_BUILD:appBuild,
    clrState:{patient:{...patient}},
    fetchPatientById:async()=>({data:{...patient},error:null}),
    updatePatientTolerant:async(id,patch)=>{writes.push({id,patch});return {error:null,dropped:[]};},
    refreshReminders:async()=>{reminders++;},refreshRodHost:async()=>{refreshes++;},
    closeReminderPanel(){},closeModal(){},confirm:()=>true,alert:msg=>alerts.push(msg),
    htmlSafe:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    fmtShortDate:v=>v,flangeDueMeta:()=>({cls:'soon',note:'Due in 4 days'}),stomasPresentOn:()=>[],
    parseNameList:v=>Array.isArray(v)?v:[],parseEpisodeApplianceRows:ep=>ep.appliances||[],
    composeApplianceSentence:(a,b)=>[...a,...b].join(' and '),
    fetchAllRows:async()=>({rows:[],error:null}),stomaTimeline:p=>[{uid:'base',type:p.stoma_type}],
    patientStomaList:p=>[{uid:'base',type:p.stoma_type,kind:'first',number:1,present:true}],
    stomaApplianceHistory:()=>new Map(),parseComplications:()=>[],APPLIANCE_CATALOGUE:[],
    applianceStomaUid:row=>row.stoma_uid,
    SB:{from(){const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},
      then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject);}};return q;}},
    ...overrides});
  ['dischargeLetterRodData','dischargeLetterRecord','openDischargeLetterFor','rodChipHTML','markRodRemoved','undoRodRemoved','saveRodDueInline']
    .forEach(name=>vm.runInContext(source(name),c));
  return {c,dom,writes,opened,alerts,snapshots,get reminders(){return reminders;},get refreshes(){return refreshes;}};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('a present rod carries its planned date into the letter before and after finishing the wizard',()=>{
  const s=letterSession({rod:'present',rodDue:'2026-10-05'});
  assert.match(s.plan(),/Rod in situ, due for removal on 5 October 2026/);
  s.w.applyWizard();
  assert.match(s.plan(),/Rod in situ, due for removal on 5 October 2026/);
  assert.equal((s.plan().match(/Rod in situ, due for removal/g)||[]).length,1);
  assert.equal(s.w.WZ.applianceFromRecord,true);
  assert.match(s.dom.window.document.querySelector('.body').textContent,/Appliance A and Appliance B/);
  s.dom.window.close();
});

test('recorded removal overrides the planned date and removes in-situ instructions',()=>{
  const s=letterSession({rod:'removed',rodDue:'2026-10-05',rodRemoved:'2026-10-01'});
  assert.equal(s.w.WZ.rodRemovalDate,'');
  s.w.applyWizard();
  assert.match(s.plan(),/Rod removed on 1 October 2026/);
  assert.doesNotMatch(s.plan(),/in situ|expected removal|5 October 2026/);
  s.dom.window.close();
});

test('no rod and older or standalone letters do not infer one from loop stoma type',()=>{
  for(const params of [{rod:'none'},{rod:'unknown',rodDue:'2026-10-05'},{}]){
    const s=letterSession(params);
    assert.equal(s.w.rodApplies(),false);
    s.w.applyWizard();
    assert.doesNotMatch(s.plan(),/\brod\b/i);
    s.dom.window.close();
  }
});

test('every wizard step omits rod presence and date questions while retaining stoma assessment',()=>{
  const s=letterSession({rod:'present',rodDue:'2026-10-05'});
  for(const [type,subtype] of [['ileostomy','loop'],['colostomy','loop'],['colostomy','transverse'],['urostomy','']]){
    s.w.wzPick('type',type);s.w.wzPick('subtype',subtype);
    for(const step of s.w.stepsForWizard()){
      assert.doesNotMatch(s.w.wzStepHTML(step),/rodInSitu|rodRemovalDate|rod option|Expected date of rod removal/i);
    }
    const stoma=s.w.wzStepHTML('stoma');
    assert.match(stoma,/stomaColour|stomaFunction/);
    if(type==='urostomy')assert.match(stoma,/urostomyStents/);
  }
  assert.equal(s.w.WZ.rodInSitu,'yes');
  assert.equal(s.w.WZ.rodRemovalDate,'2026-10-05');
  s.dom.window.close();
});

test('invalid dates cannot be printed and no removal date is invented',()=>{
  for(const date of ['2026-02-30','invalid','<img src=x onerror=alert(1)>']){
    const s=letterSession({rod:'present',rodDue:date});
    assert.equal(s.w.WZ.rodRemovalDate,'');
    assert.match(s.w.automaticRodPlan().join(''),/planned removal date has not been recorded/);
    assert.doesNotMatch(s.w.automaticRodPlan().join(''),/2026-02-30|<img/);
    s.dom.window.close();
  }
});

test('opening a letter reads the latest removal instead of an old patient card',async()=>{
  let reads=0;
  const s=appSession({fetchPatientById:async()=>{reads++;return {data:{...patient,rod_removed_date:'2026-10-01'},error:null};}});
  await s.c.openDischargeLetterFor(patient.id);
  assert.equal(reads,1);assert.equal(s.opened.length,1);
  const q=new URL(s.opened[0].location.href).searchParams;
  assert.ok(q.get('record'));assert.equal(q.get('v'),appBuild);
  assert.equal(q.has('rod'),false);assert.equal(q.has('rodDue'),false);
  assert.deepEqual(s.snapshots[0].stomas[0].rod,{inSitu:false,removalDate:'',removedDate:'2026-10-01'});
});

test('a failed latest-record read prevents a letter containing stale rod details',async()=>{
  const s=appSession({fetchPatientById:async()=>({data:null,error:{message:'Offline'}})});
  await s.c.openDischargeLetterFor(patient.id);
  assert.equal(s.opened.length,1);assert.equal(s.opened[0].closed,true);
  assert.equal(s.snapshots.length,0);assert.equal(s.alerts.length,1);
});

test('handover offers add, remove, or undo according to the saved rod state',()=>{
  const s=appSession();
  const none=s.c.rodChipHTML({...patient,rod_removal_date:null});
  assert.match(none,/Rod: No/);assert.match(none,/openComplicationPicker/);assert.doesNotMatch(none,/markRodRemoved/);
  const present=s.c.rodChipHTML(patient);
  assert.match(present,/Rod: Yes/);assert.match(present,/2026-10-05/);assert.match(present,/markRodRemoved/);
  const removed=s.c.rodChipHTML({...patient,rod_removed_date:'2026-10-01'});
  assert.match(removed,/Rod out/);assert.match(removed,/2026-10-01/);assert.match(removed,/undoRodRemoved/);
  assert.doesNotMatch(removed,/markRodRemoved/);
  assert.deepEqual(plain(s.c.dischargeLetterRodData({id:patient.id})),{state:'unknown',due:'',removed:''});
});

test('the handover removal button records today once and refreshes the saved state',async()=>{
  let resolveWrite,calls=0;
  const s=appSession({updatePatientTolerant:async(id,patch)=>{
    calls++;assert.equal(id,patient.id);assert.deepEqual(plain(patch),{rod_removed_date:'2026-10-01'});
    return new Promise(resolve=>{resolveWrite=resolve;});
  }});
  const button=s.dom.window.document.createElement('button');
  const first=s.c.markRodRemoved(patient.id,button);
  assert.equal(button.disabled,true);
  await s.c.markRodRemoved(patient.id,button);assert.equal(calls,1);
  resolveWrite({error:null,dropped:[]});await first;
  assert.equal(button.disabled,false);assert.equal(s.reminders,1);assert.equal(s.refreshes,1);
});

test('a rejected rod removal restores the button and leaves the displayed record unchanged',async()=>{
  const s=appSession({updatePatientTolerant:async()=>({error:{message:'Save failed'}})});
  const button=s.dom.window.document.createElement('button');
  await s.c.markRodRemoved(patient.id,button);
  assert.equal(button.disabled,false);assert.equal(s.alerts.length,1);assert.equal(s.refreshes,0);
});

test('undoing removal requires confirmation and retains the planned date',async()=>{
  const s=appSession({confirm:()=>false});
  await s.c.undoRodRemoved(patient.id);assert.equal(s.writes.length,0);
  s.c.confirm=()=>true;
  await s.c.undoRodRemoved(patient.id);
  assert.deepEqual(plain(s.writes),[{id:patient.id,patch:{rod_removed_date:null}}]);
  assert.equal(s.reminders,1);assert.equal(s.refreshes,1);
});

test('changing and clearing a handover rod date updates the reminder and rod label',async()=>{
  const s=appSession(),host=s.dom.window.document.getElementById('host');
  host.innerHTML=s.c.rodChipHTML(patient);
  const input=host.querySelector('input');input.value='2026-10-06';
  await s.c.saveRodDueInline(patient.id,input);
  assert.equal(host.querySelector('.hv-flangebox').dataset.rodDue,'2026-10-06');
  input.value='';await s.c.saveRodDueInline(patient.id,input);
  assert.match(host.textContent,/Rod: No/);
  assert.deepEqual(plain(s.writes.at(-1).patch),{rod_removal_date:null,rod_stoma_uid:null});
  assert.equal(s.reminders,2);
});

test('an unsuccessful date edit restores the previously saved date',async()=>{
  const s=appSession({updatePatientTolerant:async()=>({error:{message:'Save failed'}})});
  const host=s.dom.window.document.getElementById('host');host.innerHTML=s.c.rodChipHTML(patient);
  const input=host.querySelector('input');input.value='2026-10-06';
  await s.c.saveRodDueInline(patient.id,input);
  assert.equal(input.value,'2026-10-05');assert.equal(s.reminders,0);assert.equal(s.alerts.length,1);
});
