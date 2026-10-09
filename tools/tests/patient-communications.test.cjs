const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../../assets/patient-communications.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const PAT = '11111111-1111-4111-8111-111111111111';
function setup(t, rows = []) {
  const dom = new JSDOM('<div id="app"></div><div id="psm-episodes"></div><div id="mo"><div id="mb"></div></div>', {runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/'});
  t.after(() => dom.window.close());
  const w = dom.window, f = {rows, calls: [], renders: 0, closed: 0, guard: null, fail: false};
  w.confirm = () => false;
  w.psmIc = name => '<svg data-icon="' + name + '"></svg>';
  w.fmtShortDate = value => value;
  w.eval(source);
  const config = {patient: {id: PAT, first_name: 'Alex', surname: 'Sample', id_card: 'DEMO-001'},
    fetchRows: async () => ({rows: f.rows, error: f.readError || null}),
    db: {from: () => {}, rpc: async (name, args) => {
      f.calls.push({name, args});
      if (f.pending) await f.pending;
      if (f.fail) return {data: null, error: f.failure || {message: 'Simulated save failure'}};
      if (f.savedResult) return {data: f.savedResult, error: null};
      return {data: {id: args.p_record_id, patient_id: args.p_patient_id, kind: args.p_kind, version: args.p_expected_version + 1, created_by_name: 'Test Nurse', created_at: '2026-10-09T10:00:00Z', versions: [], ...args.p_payload}, error: null};
    }}, onChange: () => f.renders++, setGuard: value => f.guard = value,
    openModal: () => {}, closeModal: () => f.closed++};
  return {w, f, config, api: w.PatientCommunications};
}
function fill(w, values) {
  const form = w.document.getElementById('pc-form');
  Object.entries(values).forEach(([key, value]) => {const el=form.elements.namedItem(key);if(key==='reminder_enabled')el.checked=value;else el.value=value;});
}
const required = {contact_name: 'Community Nurse', service: 'Community nursing', subject: 'Appliance advice', notes: 'Advice recorded.', communication_date: '2026-10-09'};

test('both actions sit beside the inpatient action with history below, including during an open admission', async t => {
  const {w, api, config} = setup(t);
  await api.load(PAT, config);
  w.clrState = {available: true, rows: [], expanded: {}};
  w.openEpisodeIn = rows => rows.find(r => r.kind === 'episode') || null;
  w.recCode = () => 'EP-DEMO';w.clrMeta = x => x;w.episodeCategoryHTML = () => '<div id="admissions">Admissions</div>';w.htmlSafe = x => x;w.fmtShortDate = x => x;
  const start = html.indexOf('function renderEpisodesPanel(');
  w.eval(html.slice(start, html.indexOf('\n}', start) + 2));
  w.renderEpisodesPanel();
  assert.deepEqual([...w.document.querySelectorAll('.pc-actions button')].map(b => b.textContent.trim()), ['Open inpatient visit', 'Community correspondence', 'Patient communication']);
  assert.equal(w.document.querySelectorAll('.pc-history').length, 2);
  w.clrState.rows = [{id: 'episode', kind: 'episode'}];
  w.renderEpisodesPanel();
  assert.equal(w.document.querySelectorAll('.pc-actions button').length, 2);
  assert.match(w.document.querySelector('.clr-head-open').textContent, /Inpatient visit open/);
  w.clrState.available = false;w.renderEpisodesPanel();assert.equal(w.document.querySelectorAll('.pc-actions button').length, 2);
});
test('patient communication prefills the patient and saves without a ward or episode', async t => {
  const {w, f, api, config} = setup(t);await api.load(PAT, config);api.open('patient');
  assert.equal(w.document.querySelector('[name="contact_name"]').value, 'Alex Sample');
  assert.equal(w.document.querySelector('[name="service"]').type, 'hidden');
  fill(w, {subject: 'Telephone review', notes: 'Patient asked about pouch supply.'});await api.save();
  assert.equal(f.calls[0].name, 'save_patient_communication');assert.equal(f.calls[0].args.p_patient_id, PAT);assert.equal(f.calls[0].args.p_kind, 'patient');
  assert.equal(f.calls[0].args.p_expected_version, 0);assert.equal(f.calls[0].args.p_payload.service, '');assert.equal(f.closed, 1);assert.equal(f.renders, 1);
  assert.match(api.historyHTML(), /Patient asked about pouch supply/);
});
test('failed saves retain wording, use the same request id when retried, and do not claim success', async t => {
  const {w, f, api, config} = setup(t);await api.load(PAT, config);api.open('community');fill(w, required);f.fail = true;await api.save();
  assert.match(w.document.getElementById('pc-form-error').textContent, /Simulated save failure/);assert.equal(w.document.querySelector('[name="notes"]').value, required.notes);assert.equal(f.closed, 0);assert.equal(f.renders, 0);
  f.fail = false;await api.save();assert.equal(f.calls[0].args.p_record_id, f.calls[1].args.p_record_id);assert.equal(f.closed, 1);
});
test('duplicate save clicks make one request and cannot close a form while saving', async t => {
  const {w, f, api, config} = setup(t);await api.load(PAT, config);api.open('community');fill(w, required);
  let release;f.pending = new Promise(resolve => release = resolve);
  const save = api.save();await api.save();api.cancel();assert.equal(f.calls.length, 1);assert.equal(f.closed, 0);release();await save;
});
test('required and whitespace-only fields and an earlier follow-up date prevent writes', async t => {
  const {w, f, api, config} = setup(t);await api.load(PAT, config);api.open('community');
  await api.save();assert.equal(f.calls.length, 0);
  fill(w, {...required, notes: '   '});await api.save();assert.equal(f.calls.length, 0);
  fill(w, {...required, followup_date: '2026-10-08'});await api.save();assert.equal(f.calls.length, 0);assert.match(w.document.getElementById('pc-form-error').textContent, /cannot be before/);
});
test('cancel protects unsaved wording and editing sends the saved version', async t => {
  const row = {id: '33333333-3333-4333-8333-333333333333',patient_id: PAT,kind: 'community',version: 2,...required,communication_time:'13:05:00',method:'Email',direction:'Outgoing',status:'Awaiting response',created_at:'2026-10-09',versions:[]};
  const {w, f, api, config} = setup(t, [row]);await api.load(PAT, config);api.open('community', row.id);
  assert.equal(w.document.querySelector('[name="communication_time"]').value, '13:05');assert.equal(f.guard(), true);
  fill(w, {notes: 'Corrected advice.'});api.cancel();assert.equal(f.closed, 0);await api.save();assert.equal(f.calls[0].args.p_expected_version, 2);assert.equal(f.calls[0].args.p_record_id, row.id);
});
test('history is separated, escapes notes and contact data, retains previous wording and excludes other patients', async t => {
  const rows = [
    {id:'b',patient_id:PAT,kind:'patient',version:1,subject:'Earlier',communication_date:'2026-10-08',created_at:'2026-10-08',method:'Telephone',direction:'Incoming',status:'Recorded',notes:'Earlier advice',created_by_name:'Nurse',versions:[]},
    {id:'a',patient_id:PAT,kind:'community',version:2,subject:'<img src=x onerror=alert(1)>',communication_date:'2026-10-09',created_at:'2026-10-09',method:'Email',direction:'Outgoing',status:'Completed',notes:'<script>alert(1)</script>',created_by_name:'Nurse',versions:[{version:1,author_name:'Nurse',saved_at:'2026-10-08',snapshot:{notes:'Original advice'}}]},
    {id:'x',patient_id:'another-patient',kind:'patient',subject:'Private other record'}];
  const {w, api, config} = setup(t, rows);await api.load(PAT, config);const el = w.document.createElement('div');el.innerHTML = api.historyHTML();
  assert.equal(el.querySelectorAll('.pc-record').length, 2);assert.equal(el.querySelector('img'), null);assert.equal(el.querySelector('script'), null);assert.match(el.textContent, /Original advice/);assert.doesNotMatch(el.textContent, /Private other record/);
});
test('read failures are visible and disable add actions instead of showing an empty history', async t => {
  const {api, f, config} = setup(t);f.readError = {message:'Permission denied'};await api.load(PAT, config);
  assert.match(api.historyHTML(), /Could not load communication history/);assert.match(api.historyHTML(), /Permission denied/);assert.equal((api.actionsHTML().match(/ disabled/g)||[]).length, 2);
});
test('a late patient history response cannot replace the next patient history', async t => {
  const {api, config} = setup(t);let finish;
  const first = api.load(PAT, {...config,fetchRows:()=>new Promise(r=>finish=r)});
  await api.load('second', {...config,fetchRows:async()=>({rows:[{id:'2',patient_id:'second',kind:'patient',version:1,subject:'Second patient',communication_date:'2026-10-09',created_at:'2026-10-09',versions:[]}],error:null})});
  finish({rows:[{id:'1',patient_id:PAT,kind:'patient',subject:'First patient'}],error:null});await first;
  assert.match(api.historyHTML(), /Second patient/);assert.doesNotMatch(api.historyHTML(), /First patient/);
});
test('a conflict loads the latest history while preserving the unsaved correction in the form', async t => {
  const row = {id:'33333333-3333-4333-8333-333333333333',patient_id:PAT,kind:'community',version:1,...required,communication_time:'13:05',method:'Email',direction:'Outgoing',status:'Recorded',created_at:'2026-10-09',versions:[]};
  const {w, f, api, config} = setup(t,[row]);await api.load(PAT,config);api.open('community',row.id);fill(w,{notes:'My unsaved correction.'});
  f.fail = true;f.failure = {code:'40001',message:'This communication has a newer saved version.'};f.rows = [{...row,version:2,notes:'Another nurse saved this.'}];await api.save();
  assert.equal(w.document.querySelector('[name="notes"]').value,'My unsaved correction.');assert.equal(f.closed,0);assert.match(api.historyHTML(),/Another nurse saved this/);assert.match(w.document.getElementById('pc-form-error').textContent,/newer saved version/);
});
test('communication broadcasts wait for an open form and update only the history after closing', async t => {
  const {w,f} = setup(t);let loads=0,opened=0,reminderRefreshes=0;
  w.refreshReminders=async()=>reminderRefreshes++;
  w.currentTabName=()=> 'patient-record';w.clrState={patient:{id:PAT}};w.loadPatientCommunications=async()=>loads++;w.renderEpisodesPanel=()=>f.renders++;w.openPatientRecord=()=>opened++;
  const start=html.indexOf('const CLINIC_REALTIME_TABLES=');const end=html.indexOf('async function loadHolidays(',start);w.eval(html.slice(start,end));
  w.document.getElementById('mo').classList.add('open');w.queueClinicRealtime('patient_communications');w.flushClinicRealtime();assert.equal(loads,0);assert.equal(reminderRefreshes,0);
  w.document.getElementById('mo').classList.remove('open');w.flushClinicRealtime();await Promise.resolve();assert.equal(loads,1);assert.equal(f.renders,1);assert.equal(opened,0);assert.equal(reminderRefreshes,1);
});

const ISSUE='33333333-3333-4333-8333-333333333333',CONTACT='55555555-5555-4555-8555-555555555555';
function issue(extra={}) {return {id:ISSUE,patient_id:PAT,kind:'community',parent_id:null,version:1,...required,communication_time:'13:00',method:'Telephone',direction:'Outgoing',status:'Awaiting response',followup_action:'Check response from community nurse',followup_date:'2026-10-12',reminder_enabled:true,created_at:'2026-10-09T10:00:00Z',updated_at:'2026-10-09T10:00:00Z',created_by_name:'Test Nurse',updated_by_name:'Test Nurse',versions:[],...extra};}
test('contacts group under one open issue and completed issues retain their separate history',async t=>{
  const root=issue(),child={...issue(),id:CONTACT,parent_id:ISSUE,subject:'Community reply',notes:'Reply received.',created_at:'2026-10-10T10:00:00Z'},resolved=issue({id:'77777777-7777-4777-8777-777777777777',kind:'patient',status:'Completed',reminder_enabled:false});
  const {w,api,config}=setup(t,[root,child,resolved]);await api.load(PAT,config);
  const el=w.document.createElement('div');el.innerHTML=api.historyHTML();
  assert.equal(el.querySelectorAll('.pc-issue').length,2);assert.equal(el.querySelectorAll('.pc-record').length,3);
  assert.equal(el.querySelector('#pc-issue-'+ISSUE).querySelectorAll('.pc-record').length,2);
  assert.match(el.querySelector('#pc-issue-'+ISSUE+' > summary').textContent,/2 contacts/);
  assert.equal(el.querySelectorAll('.pc-reminder-link').length,1);assert.equal(el.querySelectorAll('.pc-resolved .pc-issue').length,1);
  assert.match(el.textContent,/Reply received/);assert.match(el.textContent,/Open issues/);
});
test('adding a contact retains the issue id, checks its version and refreshes the current reminder',async t=>{
  const root=issue({version:3}),{w,f,api,config}=setup(t,[root]);await api.load(PAT,config);api.open('community',null,ISSUE);
  assert.equal(w.document.querySelector('[name="notes"]').value,'');assert.equal(w.document.querySelector('[name="service"]').value,root.service);assert.equal(w.document.querySelector('[name="reminder_enabled"]').checked,true);
  fill(w,{...required,subject:'Community reply',notes:'The nurse will review supplies.',followup_date:'2026-10-15',followup_action:'Call community nurse again'});
  const updated=issue({version:4,followup_date:'2026-10-15',followup_action:'Call community nurse again'});
  f.savedResult={...updated,id:CONTACT,parent_id:ISSUE,version:1,subject:'Community reply',notes:'The nurse will review supplies.',issue:updated};
  await api.save();const payload=f.calls[0].args.p_payload;
  assert.equal(payload.parent_id,ISSUE);assert.equal(payload.parent_version,3);assert.equal(f.calls[0].args.p_expected_version,0);
  const el=w.document.createElement('div');el.innerHTML=api.historyHTML();assert.equal(el.querySelectorAll('.pc-issue').length,1);assert.equal(el.querySelectorAll('.pc-record').length,2);assert.match(el.querySelector('.pc-reminder-link').textContent,/2026-10-15/);
});
test('reminders require action and date; resolving clears them and reopening keeps the saved history',async t=>{
  const root=issue(),{w,f,api,config}=setup(t,[root]);await api.load(PAT,config);api.open('community',ISSUE);
  fill(w,{followup_action:'   '});await api.save();assert.equal(f.calls.length,0);assert.match(w.document.getElementById('pc-form-error').textContent,/Enter a reminder/);
  fill(w,{followup_action:root.followup_action});api.cancel();w.confirm=()=>true;
  f.savedResult={...root,status:'Completed',reminder_enabled:false,version:2,resolved_at:'2026-10-09T14:00:00Z'};
  await api.setResolved(ISSUE,true);assert.equal(f.calls[0].args.p_payload.status,'Completed');assert.equal(f.calls[0].args.p_payload.reminder_enabled,false);
  const el=w.document.createElement('div');el.innerHTML=api.historyHTML();assert.equal(el.querySelectorAll('.pc-reminder-link').length,0);assert.equal(el.querySelectorAll('.pc-resolved .pc-issue').length,1);assert.match(el.textContent,/Advice recorded/);
  f.savedResult={...root,status:'Recorded',reminder_enabled:false,version:3,resolved_at:null};await api.setResolved(ISSUE,false);
  assert.equal(f.calls[1].args.p_payload.reminder_enabled,false);assert.match(api.historyHTML(),/1 open · 0 resolved/);
});
test('correcting a historical contact cannot change current issue status or reminder',async t=>{
  const root=issue({status:'Completed',reminder_enabled:false,version:4}),child=issue({id:CONTACT,parent_id:ISSUE,subject:'Earlier contact'});
  const {w,f,api,config}=setup(t,[root,child]);await api.load(PAT,config);api.open('community',CONTACT);
  assert.equal(w.document.querySelector('[name="status"]').disabled,true);assert.equal(w.document.querySelector('[name="reminder_enabled"]').disabled,true);
  fill(w,{notes:'Corrected historical wording.'});f.savedResult={...child,version:2,notes:'Corrected historical wording.',issue:root};await api.save();
  assert.equal(f.calls[0].args.p_payload.parent_id,ISSUE);assert.equal(f.calls[0].args.p_payload.parent_version,undefined);assert.match(api.historyHTML(),/0 open · 1 resolved/);assert.match(api.historyHTML(),/Corrected historical wording/);
});
test('bell reminders include only due open issue roots and keep both categories distinguishable',async t=>{
  const {api,config}=setup(t),root=issue({followup_date:'2026-10-09',patient:{first_name:'Alex',surname:'Sample',id_card:'DEMO-001'}});
  const result=await api.loadReminders({...config,today:'2026-10-09',fetchRows:async()=>({rows:[root,{...root,id:'patient-issue',kind:'patient'},{...root,id:'future',followup_date:'2026-10-10'},{...root,id:'closed',status:'Completed'},{...root,id:'disabled',reminder_enabled:false},{...root,id:'contact',parent_id:ISSUE}],error:null})});
  assert.equal(result.items.length,2);assert.match(api.remindersHTML(result,'community'),/Community correspondence/);assert.doesNotMatch(api.remindersHTML(result,'community'),/Patient communication/);
  const failure=await api.loadReminders({...config,today:'2026-10-09',fetchRows:async()=>({rows:[],error:{message:'Permission denied'}})});assert.match(api.remindersHTML(failure),/could not be checked/);
});
test('clinic bell counts both communication types and displays each category with a direct issue link',async t=>{
  const {w,api}=setup(t),root=issue({patient:{first_name:'Alex',surname:'Sample',id_card:'DEMO-001'}});
  w.TODAY='2026-10-12';w.communicationReminders={items:[root,{...root,id:'patient-issue',kind:'patient'}],error:null,today:w.TODAY};
  w.sitingReminders={total:0};w.datedClinicReminders={items:[]};w.pendingReminderOpenCount=()=>0;w.remItemsByCategory=()=>({ward:[],reversal:[],siting:[]});w.reminderActiveTab='community';
  for(const name of ['communicationReminderCount','clinicReminderBadgeTotal','renderReminderTabs']){const start=html.indexOf('function '+name+'(');w.eval(html.slice(start,html.indexOf('\n}',start)+2));}
  assert.equal(w.clinicReminderBadgeTotal(),2);
  const el=w.document.createElement('div');el.innerHTML=w.renderReminderTabs();assert.equal(el.querySelectorAll('.rem-tab').length,6);
  assert.match(el.querySelector('.rem-tab-body').textContent,/Community correspondence/);assert.doesNotMatch(el.querySelector('.rem-tab-body').textContent,/Patient communication/);
  assert.match(el.querySelector('.rem-tab-body button').getAttribute('onclick'),/openCommunicationReminder/);
  w.reminderActiveTab='patient';el.innerHTML=w.renderReminderTabs();assert.match(el.querySelector('.rem-tab-body').textContent,/Patient communication/);
  w.communicationReminders={items:[],error:{message:'Read failed'}};w.renderSitingReminderList=()=>'<p>Ward reminder retained</p>';w.remItemsByCategory=()=>({ward:[{eff:w.TODAY}],reversal:[],siting:[]});
  el.innerHTML=w.renderReminderTabs();assert.match(el.textContent,/Ward reminder retained/);assert.match(el.textContent,/could not be checked/);
});
