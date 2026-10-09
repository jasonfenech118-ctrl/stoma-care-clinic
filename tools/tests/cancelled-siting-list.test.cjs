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

function setup(records=[],patches={},error=null){
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,calls=[];
  Object.assign(w,{
    htmlSafe:esc,SLOTS:['08:00','08:30','09:00','09:30'],
    attachPatientProfilesByIdCard:async rows=>rows,
    patientAvatarHTML:()=>'<span class="test-avatar"></span>',
    handoverMissingHTML:message=>'<div class="missing">'+message+'</div>',
    SB:{from(table){
      const query={table,filters:[],orders:[]};
      const q={
        select(){return q;},
        eq(column,value){query.filters.push(r=>r[column]===value);return q;},
        in(column,values){query.filters.push(r=>values.includes(r[column]));return q;},
        order(column,{ascending}){query.orders.push({column,ascending});return q;},
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
  w.eval('var SUPABASE_PAGE_SIZE=1000;var sitingLocalPatches={};'
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
