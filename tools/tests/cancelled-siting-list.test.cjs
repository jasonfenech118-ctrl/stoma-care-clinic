const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{
  const i=html.indexOf('function '+name+'(');
  assert.ok(i>=0,name);
  return html.slice(html.lastIndexOf('\n',i)+1,html.indexOf('\n}',i)+2);
};
const block=html.slice(html.indexOf('/* Cancellation history keeps'),html.indexOf('/* The Siting view on a patient record.'));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

function setup(records=[],patches={},error=null,deleteOptions={}){
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,calls=[];
  Object.assign(w,{
    htmlSafe:esc,SLOTS:['08:00','08:30','09:00','09:30'],
    attachPatientProfilesByIdCard:async rows=>rows,
    patientAvatarHTML:()=>'<span class="test-avatar"></span>',
    handoverMissingHTML:message=>'<div class="missing">'+message+'</div>',
    openMo(){w.document.getElementById('mo').classList.add('open');},
    closeModal(){w.document.getElementById('mo').classList.remove('open');},
    logAudit(entry){calls.push({action:'audit',entry});},
    refreshRecordSiting(){calls.push({action:'refresh-record'});},
    loadAppts(){calls.push({action:'refresh-appointments'});},
    SB:{from(table){
      const query={table,filters:[],filterValues:[],orders:[]};
      const q={
        select(columns){query.columns=columns;return q;},
        delete(){query.action='delete';return q;},
        eq(column,value){query.filters.push(r=>r[column]===value);query.filterValues.push([column,value]);return q;},
        in(column,values){query.filters.push(r=>values.includes(r[column]));return q;},
        order(column,{ascending}){query.orders.push({column,ascending});return q;},
        then(resolve,reject){
          return (async()=>{
            calls.push({table,action:query.action,filters:query.filterValues,columns:query.columns});
            if(deleteOptions.beforeDelete)await deleteOptions.beforeDelete();
            if(deleteOptions.throwError)throw new Error(deleteOptions.throwError);
            if(deleteOptions.error)return {data:null,error:deleteOptions.error};
            if(deleteOptions.zeroRows)return {data:[],error:null};
            const removed=records.filter(r=>query.filters.every(f=>f(r)));
            records.splice(0,records.length,...records.filter(r=>!removed.includes(r)));
            return {data:removed.map(r=>({id:r.id})),error:null};
          })().then(resolve,reject);
        },
        async range(from,to){
          calls.push({table,from,to});
          if(error)return {data:null,error};
          const rows=records.filter(r=>query.filters.every(f=>f(r))).sort((a,b)=>{
            for(const {column,ascending} of query.orders){
              const cmp=String(a[column]||'').localeCompare(String(b[column]||''));
              if(cmp)return ascending?cmp:-cmp;
            }
            return 0;
          });
          return {data:rows.slice(from,to+1).map(r=>({...r})),error:null};
        }
      };
      return q;
    }}
  });
  w.eval('var SUPABASE_PAGE_SIZE=1000;var sitingLocalPatches={};var sitingState={rows:[]};'
    +"var SITING_CANCEL_REASONS={patient:'due to patient',hospital:'hospital complication'};"
    +fn('fetchAllRows')+'\n'+fn('applySitingPatches')+'\n'+fn('sitingCancelReasonLabel')+'\n'
    +fn('fmtShortDate')+'\n'+fn('sitingSlotLabel')+'\n'+fn('addHour')+'\n'+fn('emptyStateHTML')+'\n'
    +block.replace('let cancelledSitingState=','var cancelledSitingState='));
  w.sitingLocalPatches=patches;
  return {w,calls,close:()=>w.close()};
}
const row=(id,status='cancelled',extra={})=>({id,status,session_date:'2026-10-09',session_slot:'08:00',
  first_name:'Test',surname:'Patient',id_card:'TEST-'+id,...extra});
const trs=w=>[...w.document.querySelectorAll('#siting-cancelled-table tbody tr')];

test('lists only cancellations, including unregistered and older patients, newest appointment first',async()=>{
  const {w,close}=setup([
    row('old','cancelled',{session_date:'2026-09-01'}),
    row('new','cancelled',{cancellation_reason:'hospital',cancellation_note:'Theatre postponed.',cancelled_by:'Test Nurse',cancelled_at:'2026-10-08T22:30:00Z'}),
    row('dntu','did_not_attend'),row('booked','booked'),row('done','done',{stoma_formed:true})
  ]);
  await w.loadCancelledSitingSessions();
  assert.equal(trs(w).length,2);
  assert.match(trs(w)[0].textContent,/TEST-new/);
  assert.match(trs(w)[0].textContent,/hospital complication.*Theatre postponed.*09 Oct 2026.*Test Nurse/s); // Malta date, across UTC midnight.
  assert.match(trs(w)[1].textContent,/Not recorded/);
  assert.ok(!w.document.getElementById('siting-cancelled-body').textContent.includes('TEST-dntu'));
  assert.equal(w.cancelledSitingState.rows[0].patient_id,undefined);
  close();
});

test('search and reason filters combine, and filters survive refresh',async()=>{
  const {w,close}=setup([
    row('p','cancelled',{first_name:'Example',surname:'Borg',cancellation_reason:'patient'}),
    row('h','cancelled',{cancellation_reason:'hospital'}),row('legacy')
  ]);
  await w.loadCancelledSitingSessions();
  const search=w.document.getElementById('siting-cancelled-search');
  const reason=w.document.getElementById('siting-cancelled-reason');
  search.value='borg example';reason.value='patient';
  w.renderCancelledSitingSessions();
  assert.equal(trs(w).length,1);
  await w.loadCancelledSitingSessions();
  assert.equal(trs(w).length,1);
  search.value='test-h';reason.value='hospital';w.renderCancelledSitingSessions();
  assert.equal(trs(w).length,1);
  search.value='';reason.value='unrecorded';w.renderCancelledSitingSessions();
  assert.equal(trs(w).length,1);assert.match(trs(w)[0].textContent,/TEST-legacy/);
  reason.value='patient';search.value='missing';w.renderCancelledSitingSessions();
  assert.match(w.document.getElementById('siting-cancelled-body').textContent,/No matching/);
  close();
});

test('history loads beyond the Supabase 1000-row limit',async()=>{
  const {w,calls,close}=setup(Array.from({length:1001},(_,i)=>row(String(i).padStart(4,'0'))));
  await w.loadCancelledSitingSessions();
  assert.equal(w.cancelledSitingState.rows.length,1001);
  assert.equal(trs(w).length,1001);
  assert.deepEqual(calls.map(c=>c.from),[0,1000]);
  close();
});

test('a newly cancelled session remains visible through a stale status-filtered read',async()=>{
  const {w,calls,close}=setup([row('lag','booked')],{
    lag:{status:'cancelled',cancellation_reason:'patient',cancellation_note:'Patient requested cancellation.'}
  });
  await w.loadCancelledSitingSessions();
  assert.equal(trs(w).length,1);
  assert.match(trs(w)[0].textContent,/due to patient.*Patient requested cancellation/s);
  assert.equal(calls.length,2);
  assert.equal(w.sitingLocalPatches.lag.status,'cancelled');
  close();
});

test('names, notes and signatures render as text, and missing tables and load failures are explicit',async()=>{
  const {w,close}=setup([row('escaped','cancelled',{
    surname:'<img src=x onerror=alert(1)>',cancellation_note:'<script>bad()</script>',cancelled_by:'<b>Test Nurse</b>'
  })]);
  await w.loadCancelledSitingSessions();
  const body=w.document.getElementById('siting-cancelled-body');
  assert.equal(body.querySelector('script, img, b'),null);
  assert.match(body.textContent,/<script>bad\(\)<\/script>/);
  close();
  for(const error of [{code:'42P01',message:'relation siting_sessions does not exist'}, {message:'Network unavailable'}]){
    const ctx=setup([],{},error);await ctx.w.loadCancelledSitingSessions();
    const message=ctx.w.document.getElementById('siting-cancelled-body').textContent;
    assert.match(message,error.code?/add-siting-sessions\.sql/:/Network unavailable/);
    ctx.w.renderCancelledSitingSessions();
    assert.equal(ctx.w.document.getElementById('siting-cancelled-body').textContent,message);
    ctx.close();
  }
  const empty=setup();await empty.w.loadCancelledSitingSessions();
  assert.match(empty.w.document.getElementById('siting-cancelled-body').textContent,/No cancelled stoma appointments/);
  empty.close();
});

test('the Siting tab opens on desktop and mobile, and refreshes after shared siting changes',()=>{
  const {w,close}=setup();let loaded=0;
  Object.assign(w,{loadCancelledSitingSessions:()=>loaded++,clinicReminderBadgeTotal:()=>0,updateReminderBadges(){},
    pushNavHistory(){},currentView:()=>({}),renderNavBack(){},clinicRealtimeBusy:()=>false,
    CLINIC_ROSTER_TABLES:new Set(),CLINIC_REMINDER_TABLES:new Set(),clinicRealtimeDirty:new Set(['siting_sessions'])});
  w.eval(html.slice(html.indexOf('const TAB_GROUPS='),html.indexOf('function groupForTab('))
    .replace('const TAB_GROUPS=','var TAB_GROUPS=').replace('const TAB_LABELS=','var TAB_LABELS=')
    +['groupForTab','currentTabName','hexAlpha','tabIconHTML','badgeHTML','alertDotHTML','renderPrimaryTabs',
      'renderSubTabs','renderMobileNav','switchTab','flushClinicRealtime'].map(fn).join('\n'));
  w.switchTab('siting-cancelled');
  assert.equal(loaded,1);
  assert.equal(w.groupForTab('siting-cancelled').key,'siting');
  assert.ok(w.document.querySelector('#tabs-sub [data-tab="siting-cancelled"].active'));
  assert.ok(w.document.querySelector('#mob-drawer-nav [data-tab="siting-cancelled"].active'));
  assert.equal(w.document.getElementById('mob-current-tab').textContent,'Cancelled Stoma Appointments');
  assert.ok(w.document.getElementById('page-siting-cancelled').classList.contains('active'));
  w.flushClinicRealtime();assert.equal(loaded,2);
  close();
});

test('every row has Delete, and confirmation identifies the entry before any write',async()=>{
  const {w,calls,close}=setup([row('first'),row('duplicate')]);
  await w.loadCancelledSitingSessions();
  const buttons=[...w.document.querySelectorAll('#siting-cancelled-table button.ncb-del')];
  assert.equal(buttons.length,2);
  assert.equal(w.document.querySelector('#siting-cancelled-table .hv-bannerrow th').colSpan,9);
  w.confirmDeleteCancelledSiting(buttons.find(b=>b.dataset.sitingId==='duplicate').dataset.sitingId);
  const modal=w.document.getElementById('mb');
  assert.match(modal.textContent,/Test Patient.*TEST-duplicate.*09 Oct 2026.*08:00–09:00/s);
  assert.match(modal.textContent,/cannot be undone/);
  assert.equal(calls.filter(c=>c.action==='delete').length,0);
  w.closeModal();
  await w.executeDeleteCancelledSiting();
  assert.equal(calls.filter(c=>c.action==='delete').length,0);
  w.confirmDeleteCancelledSiting('not-a-row');
  assert.ok(!w.document.getElementById('mo').classList.contains('open'));
  close();
});

test('confirmed deletion removes the exact cancelled duplicate, updates counts and clears only its patch',async()=>{
  const records=[row('first'),row('duplicate'),row('active','booked')];
  const {w,calls,close}=setup(records);
  await w.loadCancelledSitingSessions();
  w.sitingLocalPatches={duplicate:{status:'cancelled'},first:{status:'cancelled'}};
  w.sitingState.rows=[{...records[1]}, {...records[2]}];
  const search=w.document.getElementById('siting-cancelled-search');search.value='test';
  w.confirmDeleteCancelledSiting('duplicate');
  await w.executeDeleteCancelledSiting();
  const deletes=calls.filter(c=>c.action==='delete');
  assert.equal(deletes.length,1);
  assert.deepEqual(deletes[0],{table:'siting_sessions',action:'delete',filters:[['id','duplicate'],['status','cancelled']],columns:'id'});
  assert.deepEqual(records.map(r=>r.id),['first','active']);
  assert.equal(trs(w).length,1);
  assert.match(w.document.querySelector('.hv-count').textContent,/1 of 1 cancelled/);
  assert.equal(w.sitingLocalPatches.duplicate,undefined);
  assert.equal(w.sitingLocalPatches.first.status,'cancelled');
  assert.equal(w.sitingState.rows.length,1);
  assert.equal(w.sitingState.rows[0].id,'active');
  assert.equal(search.value,'test');
  assert.ok(!w.document.getElementById('mo').classList.contains('open'));
  const audit=calls.find(c=>c.action==='audit').entry;
  assert.equal(audit.entity,'siting_session');assert.equal(audit.entity_id,'duplicate');
  assert.ok(calls.some(c=>c.action==='refresh-record'));
  await w.loadCancelledSitingSessions();
  assert.equal(trs(w).length,1);
  close();
});

test('failed, thrown and zero-row deletes retain the entry and allow retry; a changed status is not deleted',async()=>{
  for(const options of [{error:{message:'Permission denied'}},{throwError:'Network unavailable'},{zeroRows:true},{}]){
    const records=[row('one')];
    const {w,calls,close}=setup(records,{},null,options);
    await w.loadCancelledSitingSessions();
    w.confirmDeleteCancelledSiting('one');
    if(!Object.keys(options).length)records[0].status='booked'; // Changed on another device.
    await w.executeDeleteCancelledSiting();
    assert.equal(records.length,1);
    assert.equal(trs(w).length,1);
    assert.equal(w.document.getElementById('siting-delete-error').hidden,false);
    assert.match(w.document.getElementById('siting-delete-error').textContent,/Could not delete/);
    assert.equal(w.document.getElementById('siting-delete-save').disabled,false);
    assert.equal(calls.filter(c=>c.action==='audit').length,0);
    options.error=null;options.throwError=null;options.zeroRows=false;records[0].status='cancelled';
    await w.executeDeleteCancelledSiting();
    assert.equal(records.length,0);
    assert.match(w.document.getElementById('siting-cancelled-body').textContent,/No cancelled stoma appointments/);
    close();
  }
});

test('repeated confirm taps make one delete request, and an older refresh cannot restore the row',async()=>{
  let releaseDelete;
  const waitDelete=new Promise(resolve=>{releaseDelete=resolve;});
  const {w,calls,close}=setup([row('one')],{},null,{beforeDelete:()=>waitDelete});
  await w.loadCancelledSitingSessions();
  w.confirmDeleteCancelledSiting('one');
  const deleting=w.executeDeleteCancelledSiting();
  await Promise.resolve();
  assert.equal(w.document.getElementById('siting-delete-save').disabled,true);
  await w.executeDeleteCancelledSiting();
  assert.equal(calls.filter(c=>c.action==='delete').length,1);
  let releaseRefresh;
  w.attachPatientProfilesByIdCard=rows=>new Promise(resolve=>{releaseRefresh=()=>resolve(rows);});
  const refresh=w.loadCancelledSitingSessions();
  while(!releaseRefresh)await Promise.resolve();
  releaseDelete();await deleting;
  releaseRefresh();await refresh;
  assert.equal(w.cancelledSitingState.rows.length,0);
  assert.match(w.document.getElementById('siting-cancelled-body').textContent,/No cancelled stoma appointments/);
  close();
});

test('delete confirmation renders names and IDs as text',async()=>{
  const {w,close}=setup([row('one','cancelled',{surname:'<img src=x onerror=alert(1)>',id_card:'<b>TEST</b>'})]);
  await w.loadCancelledSitingSessions();
  w.confirmDeleteCancelledSiting('one');
  const modal=w.document.getElementById('mb');
  assert.equal(modal.querySelector('img,b,script'),null);
  assert.match(modal.textContent,/<b>TEST<\/b>/);
  close();
});
