const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){
  const match=html.match(new RegExp('(?:async )?function '+name+'\\('));
  assert.ok(match,name+' not found');
  return html.slice(match.index,html.indexOf('\n}',match.index)+2);
}
const patient=extra=>({id:'p1',first_name:'Alex',surname:'Example',followup_owner:'Common',followup_due_month:10,followup_year:2026,followup_status:'active',surgery_date:'2025-03-01',stoma_type:'End colostomy',...extra});
const appt=(id,date,status='booked',extra={})=>({id,patient_id:'p1',appt_date:date,appt_slot:'09:00',status,...extra});
function context({patients=[patient()],appointments=[]}={}){
  const root={innerHTML:'',dataset:{},querySelector:()=>null},modal={innerHTML:''};
  const elements={'bookcal-root':root,'followup-year':{value:'2026'},'followup-month':{value:'10'},mb:modal};
  const c=vm.createContext({TODAY:'2026-10-01',SUPABASE_PAGE_SIZE:2,selectedFollowupOwner:'Common',bookCalState:{},staffList:[{id:'nurse'}],bcDrag:null,
    document:{getElementById:id=>elements[id]||null,querySelectorAll:()=>[]},
    normaliseFollowupStatus:v=>v||'active',normaliseFollowupOwner:v=>v||'Common',fixText:v=>v,
    loadClinicStaffingIndex:async()=>({}),bcOwnerStaff:()=>null,renderBookingCalendar:()=>{c.rendered++;},rendered:0,
    enrichAppointments:async rows=>rows,followupStatusBadge:()=>'',visitPillsByStomaHTML:()=>'',cancellationSourceLabel:()=> 'Cancelled',
    openMo:()=>{c.opened++;},opened:0,alert:v=>{c.alerts.push(v);},alerts:[],invalidateAvailabilityCaches:()=>{},bcClearDropHi:()=>{},
    failRead:null,queries:[]});
  c.SB={from(table){
    const q={table,cols:'',filters:[],orders:[],from:0,to:Infinity,
      select(cols){this.cols=cols;return this;},
      eq(k,v){this.filters.push(r=>r[k]===v);return this;},
      neq(k,v){this.filters.push(r=>r[k]!==v);return this;},
      gte(k,v){this.filters.push(r=>r[k]>=v);return this;},
      lte(k,v){this.filters.push(r=>r[k]<=v);return this;},
      in(k,v){this.filters.push(r=>v.includes(r[k]));return this;},
      order(k,{ascending=true}={}){this.orders.push({k,ascending});return this;},
      range(from,to){this.from=from;this.to=to;return this;},
      insert(row){this.row=row;return this;},
      async single(){const data={id:'created-booking',...this.row};appointments.push(data);return{data,error:null};},
      result(){
        c.queries.push({table,cols:this.cols,from:this.from,to:this.to});
        if(c.failRead&&c.failRead(this))return{data:null,error:{message:'Read unavailable'}};
        const data=(table==='patients'?patients:appointments).filter(r=>this.filters.every(f=>f(r))).slice();
        data.sort((a,b)=>{for(const {k,ascending} of this.orders){const d=String(a[k]||'').localeCompare(String(b[k]||''));if(d)return ascending?d:-d;}return 0;});
        return{data:data.slice(this.from,this.to+1),error:null};
      },
      async maybeSingle(){const result=this.result();return{data:result.data?.[0]||null,error:result.error};},
      then(resolve,reject){return Promise.resolve(this.result()).then(resolve,reject);}
    };return q;
  }};
  for(const name of ['htmlSafe','jsSafe','fmtShortDate','followupMonthName','statusLabel','fetchAllRows','getAppointmentHistoryLite','futureBookingDatesByPatient','isUpcomingFollowupBooking','bcLastFollowupAppointment','bcLastFollowupLabel','loadBookingCalendar','bcStomaLabel','bcListHTML','openFollowupHistory','bcBook','bcSelectPatient','bcPointerDown','bcPointerMove','bcPointerUp'])vm.runInContext(source(name),c);
  return{c,root,modal};
}
const ids=c=>Array.from(c.bookCalState.duePatients,p=>p.id);

test('any upcoming live booking hides the patient, including another month or nurse',async()=>{
  for(const date of ['2026-10-01','2026-10-14','2026-12-20','2027-01-10']){
    const {c}=context({appointments:[appt('booking',date,'booked',{assigned_to:'different-nurse'})]});
    await c.loadBookingCalendar();assert.deepEqual(ids(c),[]);assert.equal(c.rendered,1);
  }
});

test('past bookings, cancellations, DNTUs and attended visits keep a patient eligible',async()=>{
  const {c}=context({appointments:[appt('past','2026-09-10'),appt('cancel','2026-10-14','cancelled'),appt('dntu','2026-10-15','did_not_attend'),appt('seen','2026-10-16','attended')]});
  await c.loadBookingCalendar();assert.deepEqual(ids(c),['p1']);
});

test('nurse, due month, year and active-status filters remain in force and names remain alphabetical',async()=>{
  const {c}=context({patients:[patient({id:'z',first_name:'Zoe'}),patient(),patient({id:'other-owner',followup_owner:'Other'}),patient({id:'other-month',followup_due_month:11}),patient({id:'other-year',followup_year:2027}),patient({id:'paused',followup_status:'paused'})]});
  await c.loadBookingCalendar();assert.deepEqual(ids(c),['p1','z']);
});

test('last follow-up comes from the latest past appointment and paging does not lose records',async()=>{
  const appointments=Array.from({length:8},(_,i)=>appt('past-'+i,'2026-09-'+String(i+1).padStart(2,'0'),'attended'));
  appointments.push(appt('morning','2026-09-30','attended'),appt('afternoon','2026-09-30','did_not_attend',{appt_slot:'11:00'}),appt('cancelled-future','2026-10-20','cancelled'));
  const {c}=context({appointments});await c.loadBookingCalendar();
  assert.equal(c.bookCalState.lastFollowupByPatient.p1.id,'afternoon');
  const card=c.bcListHTML();assert.match(card,/30 Sept 2026|30 Sep 2026/);assert.match(card,/DNTU/);assert.doesNotMatch(card,/2025|Surgery/);
  assert.ok(c.queries.filter(q=>q.cols==='id,patient_id,appt_date,appt_slot,status').length>1);
});

test('no previous appointments is shown explicitly without inventing a follow-up date',async()=>{
  const {c}=context();await c.loadBookingCalendar();assert.match(c.bcListHTML(),/Last follow-up:<\/strong> None recorded/);
});

test('an appointment-read error is shown instead of treating an unknown booking status as awaiting',async()=>{
  const {c,root}=context();c.failRead=q=>q.cols==='patient_id,appt_date,status';
  await c.loadBookingCalendar();assert.equal(c.rendered,0);assert.match(root.innerHTML,/Read unavailable/);
});

test('last-follow-up read failures do not produce a false None recorded result',async()=>{
  const {c,root}=context();c.failRead=q=>q.cols==='id,patient_id,appt_date,appt_slot,status';
  await c.loadBookingCalendar();assert.equal(c.rendered,0);assert.match(root.innerHTML,/Read unavailable/);
});

test('patient window separates all past history from upcoming bookings in chronological order',async()=>{
  const appointments=[appt('next-later','2026-11-10'),appt('next-sooner','2026-10-10'),appt('seen-past','2026-09-30','attended'),appt('dntu-past','2026-09-10','did_not_attend'),appt('cancel-past','2026-08-10','cancelled')];
  const {c,modal}=context({appointments});await c.openFollowupHistory('p1');
  const upcoming=modal.innerHTML.match(/<section aria-label="Upcoming follow-up appointments">([\s\S]*?)<\/section>/)[1];
  const history=modal.innerHTML.match(/<section aria-label="Follow-up history">([\s\S]*?)<\/section>/)[1];
  assert.match(upcoming,/Booked appointments/);assert.ok(upcoming.indexOf('next-sooner')<upcoming.indexOf('next-later'));
  assert.doesNotMatch(upcoming,/seen-past|dntu-past|cancel-past/);
  for(const id of ['seen-past','dntu-past','cancel-past'])assert.match(history,new RegExp(id));
  assert.doesNotMatch(history,/next-later|next-sooner/);assert.equal(c.opened,1);
});

test('patient window shows Awaiting appointment when bookings are cancelled or already past',async()=>{
  const {c,modal}=context({appointments:[appt('cancel','2026-10-10','cancelled'),appt('past','2026-09-10')]});
  await c.openFollowupHistory('p1');assert.match(modal.innerHTML,/Awaiting appointment/);assert.doesNotMatch(modal.innerHTML,/>Booked appointments</);
});

test('failed history reads leave booking status unknown instead of displaying Awaiting appointment',async()=>{
  const {c,modal}=context();c.failRead=q=>q.table==='appointments';
  await c.openFollowupHistory('p1');assert.equal(c.opened,0);assert.equal(modal.innerHTML,'');assert.match(c.alerts[0],/Read unavailable/);
});

test('booking removes the patient from both cached list modes and updates their upcoming booking',async()=>{
  const {c}=context();const p=patient(),other=patient({id:'p2'});
  Object.assign(c.bookCalState,{patients:[p,other],duePatients:[p,other],flexPatients:[p,other],bookings:[],calOwner:'Common',mode:'due',selId:'p1'});
  await c.bcBook('2026-10-10','09:00','p1');
  for(const key of ['patients','duePatients','flexPatients'])assert.deepEqual(Array.from(c.bookCalState[key],p=>p.id),['p2']);
  assert.equal(c.bookCalState.earliestFuture.p1,'2026-10-10');assert.equal(c.bookCalState.selId,null);
});

test('a patient tap opens history, Select to book selects, and cancelled gestures do neither',()=>{
  const {c}=context();let opened=null;c.openFollowupHistory=id=>opened=id;
  const el={getAttribute:()=> 'p1'},down={button:0,target:{closest:()=>null},currentTarget:el,clientX:0,clientY:0,pointerId:1};
  c.bcPointerDown(down);c.bcPointerUp({type:'pointerup',clientX:0,clientY:0});assert.equal(opened,'p1');assert.equal(c.bookCalState.selId,undefined);
  opened=null;c.bcSelectPatient('p1');assert.equal(c.bookCalState.selId,'p1');assert.equal(opened,null);
  c.bcPointerDown(down);c.bcPointerUp({type:'pointercancel'});assert.equal(opened,null);assert.equal(c.bookCalState.selId,'p1');
});
