const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){
  const match=html.match(new RegExp('(?:async )?function '+name+'\\('));
  assert.ok(match,name+' not found');
  return html.slice(match.index,html.indexOf('\n}',match.index)+2);
}
const copy=value=>JSON.parse(JSON.stringify(value));
function database(){
  const listeners=new Set();
  const db={broadcasts:true,failReads:false,failWrites:false,listeners,
    patients:[{id:'patient-1',first_name:'Example',surname:'Patient',is_inpatient:true,
      inpatient_ward:'SW1',inpatient_bed:'1',inpatient_notes:'Flange Deep, Drainable Bag',flange_due:'2026-10-02',
      _stomas:[{uid:'base',origin:'initial',type:'End colostomy',shortLabel:'Colo',formed:'2026-01-01'}]}],
    clinical_records:[{id:'episode-1',patient_id:'patient-1',kind:'episode',record_date:'2026-09-29',is_current:true,discharge_date:null,
      appliances:[{stoma_uid:'base',appliances:['Flange Deep','Drainable Bag'],accessories:['None'],flange_due:'2026-10-02',changed_on:'2026-09-29'}]}]};
  db.client={
    realtime:{setAuth:async()=>{}},
    channel(){
      const channel={on(_type,_opts,callback){channel.callback=callback;return channel;},
        subscribe(callback){listeners.add(channel.callback);callback('SUBSCRIBED');return channel;}};
      return channel;
    },
    removeChannel(channel){listeners.delete(channel.callback);},
    from(table){
      const filters=[];let patch=null,single=false,limit=Infinity,selection='';
      const q={
        select(cols){selection=cols;return q;},update(value){patch=value;return q;},
        eq(key,value){filters.push(row=>row[key]===value);return q;},
        is(key,value){filters.push(row=>(row[key]??null)===value);return q;},
        in(key,values){filters.push(row=>values.includes(row[key]));return q;},
        order(){return q;},limit(value){limit=value;return q;},maybeSingle(){single=true;return q;},
        then(resolve,reject){
          return Promise.resolve().then(()=>{
            if(db.failReads&&table==='clinical_records'&&selection.includes('appliances'))return {data:null,error:{message:'Connection interrupted'}};
            if(db.failWrites&&patch&&table==='clinical_records')return {data:null,error:{message:'Save failed'}};
            const matches=(db[table]||[]).filter(row=>filters.every(f=>f(row))).slice(0,limit);
            if(patch){matches.forEach(row=>Object.assign(row,copy(patch)));if(db.broadcasts)listeners.forEach(fn=>fn({payload:{table}}));}
            return {data:single?(copy(matches)[0]||null):copy(matches),error:null};
          }).then(resolve,reject);
        }
      };
      return q;
    }
  };
  return db;
}
function session(db,name='Nurse A'){
  const dom=new JSDOM('<body><div id="app"></div><div id="mo"></div><div id="mb"></div><div id="hv-body"></div></body>',{pretendToBeVisual:true});
  const timeouts=new Map(),intervals=new Map(),pending=[];let nextTimer=1,activeTab='handover';
  const alerts=[];
  const c=vm.createContext({window:dom.window,document:dom.window.document,SB:db.client,TODAY:'2026-10-01',Date,Map,Set,
    console:{warn(){},error(){}},alert:msg=>alerts.push(msg),
    setTimeout:fn=>{const id=nextTimer++;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),
    setInterval:(fn,ms)=>{assert.equal(ms,30000);const id=nextTimer++;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),
    APPLIANCE_CATALOGUE:[{name:'Flange Deep',system:'two'},{name:'Drainable Bag',system:'two'},{name:'Lentell',system:'one'}],TWO_PIECE_NAMES:['Flange Deep','Drainable Bag'],
    parseNameList:value=>value||[],stomaTimeline:p=>p?._stomas||[],stomasPresentOn:(p,date)=>(p?._stomas||[]).filter(s=>!s.ended||s.ended>=date),stomaOperationHistory:()=>[],
    htmlSafe:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),jsSafe:v=>v,
    fmtShortDate:v=>v,fmtLabel:v=>v,parseComplications:()=>[],hvIsInfectionNote:()=>false,
    wardBlockStyle:()=>'',wardBlockTitle:()=>'',flangeDueChipHTML:()=>'',rodChipHTML:()=>'',handoverDocButtonHTML:()=>'',
    handoverShouldAutoLeave:()=>false,handoverByWard:()=>0,normaliseIdCard:v=>v,
    handoverAwaitingSitings:async()=>[],handoverAwaitingReversals:async()=>[],handoverAwaitingSurgery:async()=>[],
    handoverAwaitingRowHTML:()=>'',handoverReversalRowHTML:()=>'',handoverSurgeryRowHTML:()=>'',
    fitAllWardBed(){},handoverIsPhone:()=>false,applyHandoverLocks(){},missingColumnFromError:()=>null,
    currentTabName:()=>activeTab,switchTab:()=>pending.push(c.loadHandover()),invalidateAvailabilityCaches(){},refreshReminders:async()=>{},
    getCurrentUserForAudit:async()=>({name}),clrState:{patient:null,patientId:null},
    closeModal:()=>dom.window.document.getElementById('mo').classList.remove('open')
  });
  const names=['parseEpisodeApplianceRows','applianceStomaUid','currentApplianceNoteRows','looseApplianceRows',
    'shortAppliance','shortApplianceList','episodeApplianceNote','applianceRowIsTwoPiece','applianceLineIsTwoPiece',
    'handoverApplianceRowText','handoverStomaLine','stripHandoverFlangeDue','handoverComplicationLine','handoverRowHTML',
    'attachHandoverApplianceLines','loadHandover','currentInpatientEpisode','commitEpisodeAppliances'];
  vm.runInContext('let handoverLoadVersion=0;let handoverWasPhone=false;let plLoaded=true;',c);
  names.forEach(n=>vm.runInContext(source(n),c));
  const start=html.indexOf('const CLINIC_REALTIME_TABLES=');
  const end=html.indexOf('async function loadHolidays(',start);
  vm.runInContext(html.slice(start,end),c);
  return {c,dom,alerts,intervals,
    line:()=>dom.window.document.querySelector('.hv-appl')?.dataset.appliance||'',
    setTab:tab=>{activeTab=tab;},
    async drain(){const callbacks=[...timeouts.values()];timeouts.clear();callbacks.forEach(fn=>fn());await Promise.all(pending.splice(0));},
    async poll(){[...intervals.values()].forEach(fn=>fn());await this.drain();}
  };
}
const pending={patientId:'patient-1',ward:'SW1',bed:'1'};
const onePiece=[{uid:'base',short:'Colo',stoma_type:'End colostomy',appliances:['Lentell'],accessories:['None']}];

test('two separate users see the same saved replacement through database broadcasts',async()=>{
  const db=database(),a=session(db),b=session(db,'Nurse B');
  await a.c.startClinicRealtime();await b.c.startClinicRealtime();await a.drain();await b.drain();
  assert.match(b.line(),/Flange Deep/);
  await a.c.commitEpisodeAppliances(pending,onePiece);await b.drain();
  assert.match(a.line(),/Lentell/);assert.equal(b.line(),a.line());assert.doesNotMatch(b.line(),/Flange Deep|Drainable Bag/);
  assert.equal(db.patients[0].flange_due,null);assert.equal(db.clinical_records[0].appliances[0].appliances[0],'Flange Deep');
  assert.equal(db.clinical_records[0].appliances.at(-1).changed_by,'Nurse A');assert.deepEqual(a.alerts,[]);
});

test('a newer peer save during readback cannot be overwritten by the saving user’s local note',async()=>{
  const db=database(),a=session(db),realLoad=a.c.loadHandover;
  a.c.loadHandover=async()=>{
    db.clinical_records[0].appliances.at(-1).appliances=['Peer’s latest pouch'];
    return realLoad();
  };
  await a.c.commitEpisodeAppliances(pending,onePiece);
  assert.match(a.line(),/Peer’s latest pouch/);assert.doesNotMatch(a.line(),/Lentell/);
  const b=session(db,'Nurse B');await b.c.loadHandover();assert.equal(b.line(),a.line());
});

test('background refresh waits while another nurse edits a handover note',async()=>{
  const db=database(),a=session(db),b=session(db,'Nurse B');
  await b.c.startClinicRealtime();await b.drain();
  const input=b.dom.window.document.querySelector('.hv-note');input.value='Unfinished note';input.focus();
  await a.c.commitEpisodeAppliances(pending,onePiece);await b.drain();
  assert.match(b.line(),/Flange Deep/);assert.equal(input.value,'Unfinished note');
  input.blur();await b.drain();assert.match(b.line(),/Lentell/);
});

test('a missed broadcast is recovered by the 30-second handover check',async()=>{
  const db=database();db.broadcasts=false;
  const a=session(db),b=session(db,'Nurse B');await b.c.startClinicRealtime();await b.drain();
  await a.c.commitEpisodeAppliances(pending,onePiece);assert.match(b.line(),/Flange Deep/);
  await b.poll();assert.equal(b.line(),a.line());assert.match(b.line(),/Lentell/);
});

test('polling still works when the realtime connection cannot start and stops on logout',async()=>{
  const db=database();db.client.realtime.setAuth=async()=>{throw Error('Offline websocket');};
  const a=session(db),b=session(db,'Nurse B');await b.c.startClinicRealtime();await b.c.loadHandover();
  assert.equal(b.intervals.size,1);await a.c.commitEpisodeAppliances(pending,onePiece);await b.poll();assert.match(b.line(),/Lentell/);
  b.c.stopClinicRealtime();assert.equal(b.intervals.size,0);
});

test('returning to the handover refreshes it even without a connected channel',async()=>{
  const db=database(),a=session(db),b=session(db,'Nurse B');await b.c.loadHandover();
  await a.c.commitEpisodeAppliances(pending,onePiece);
  b.dom.window.dispatchEvent(new b.dom.window.Event('focus'));await b.drain();assert.match(b.line(),/Lentell/);
});

test('the handover poll leaves other tabs and hidden devices alone',async()=>{
  const db=database(),b=session(db);await b.c.startClinicRealtime();await b.drain();
  b.setTab('patients');db.clinical_records[0].appliances[0].appliances=['Changed pouch'];await b.poll();assert.match(b.line(),/Flange Deep/);
  b.setTab('handover');Object.defineProperty(b.dom.window.document,'hidden',{value:true,configurable:true});await b.poll();assert.match(b.line(),/Flange Deep/);
  Object.defineProperty(b.dom.window.document,'hidden',{value:false,configurable:true});
  b.dom.window.document.dispatchEvent(new b.dom.window.Event('visibilitychange'));await b.drain();assert.match(b.line(),/Changed pouch/);
});

test('an older slower refresh cannot replace a newer saved appliance',async()=>{
  const db=database(),b=session(db);let release,arrived;
  const reached=new Promise(resolve=>{arrived=resolve;}),gate=new Promise(resolve=>{release=resolve;});let first=true;
  b.c.handoverAwaitingSurgery=async()=>{if(first){first=false;arrived();await gate;}return [];};
  const oldLoad=b.c.loadHandover();await reached;
  db.clinical_records[0].appliances.push({stoma_uid:'base',appliances:['Lentell'],changed_on:'2026-10-01'});
  await b.c.loadHandover();assert.match(b.line(),/Lentell/);release();await oldLoad;assert.match(b.line(),/Lentell/);
});

test('a failed current-appliance read shows an error instead of a stale copied note',async()=>{
  const db=database(),b=session(db);db.failReads=true;await b.c.loadHandover();
  assert.equal(b.line(),'');assert.match(b.dom.window.document.getElementById('hv-body').textContent,/Could not load the current appliances/);
  assert.doesNotMatch(b.dom.window.document.getElementById('hv-body').textContent,/Flange Deep/);
});

test('a cleared latest appliance cannot resurrect an older copied ward note',async()=>{
  const db=database(),b=session(db);
  db.clinical_records[0].appliances.push({stoma_uid:'base',appliances:[],accessories:['None'],changed_on:'2026-10-01'});
  await b.c.loadHandover();assert.match(b.line(),/Appliance not yet selected/);assert.doesNotMatch(b.line(),/Flange Deep/);
});

test('a failed appliance save leaves the shared handover unchanged',async()=>{
  const db=database(),a=session(db);await a.c.loadHandover();const before=copy(db.clinical_records[0].appliances);
  db.failWrites=true;await a.c.commitEpisodeAppliances(pending,onePiece);
  assert.deepEqual(db.clinical_records[0].appliances,before);assert.match(a.line(),/Flange Deep/);assert.match(a.alerts[0],/Could not record what was set/);
});
