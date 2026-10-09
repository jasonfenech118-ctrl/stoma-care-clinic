// Exercise the real encounter screen together with the app's background refresh
// and navigation. All patients and database responses are synthetic.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {boot}=require('./jason-encounters.fixture.cjs');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const moduleSource=fs.readFileSync(path.join(__dirname,'../../assets/jason-encounters.js'),'utf8');
function source(name){
 const match=html.match(new RegExp('(?:async )?function '+name+'\\('));assert.ok(match,name);
 return html.slice(match.index,html.indexOf('\n}',match.index)+2);
}
function setup(t){
 const dom=new JSDOM('<!doctype html><body><div id="app"><main class="main"><section id="page-handover" class="page active"><table><tbody id="hv-body"></tbody></table></section><section id="page-patients" class="page"></section><section id="page-patient-record" class="page"></section></main></div><div id="mo"></div></body>',{pretendToBeVisual:true,runScripts:'outside-only',url:'https://example.test'});
 t.after(()=>dom.window.close());const w=dom.window;boot(w);
 const timers=new Map(),intervals=new Map();let next=1,refreshes=0,confirms=0,reminders=0,broadcast;
 w.setTimeout=fn=>{const id=next++;timers.set(id,fn);return id;};w.clearTimeout=id=>timers.delete(id);
 w.setInterval=fn=>{const id=next++;intervals.set(id,fn);return id;};w.clearInterval=id=>intervals.delete(id);
 w.renderPrimaryTabs=w.renderSubTabs=w.renderMobileNav=w.loadPatientDirectory=w.invalidateAvailabilityCaches=()=>{};
 // The top-bar Back history lives outside the sliced switchTab; stub it here.
 w.pushNavHistory=w.renderNavBack=()=>{};w.currentView=()=>({type:'tab',name:w.currentTabName()});
 w.loadHandover=async()=>{refreshes++;};w.refreshReminders=async()=>{reminders++;};w.confirm=()=>{confirms++;return true;};w.clrState={patient:null};w.TAB_LABELS={};
 w.SB.realtime={setAuth:async()=>{}};
 w.SB.channel=()=>{const ch={on(_type,_filter,fn){broadcast=fn;return ch;},subscribe(fn){fn('SUBSCRIBED');return ch;}};return ch;};w.SB.removeChannel=()=>{};
 w.eval('let plLoaded=true;');w.eval(source('currentTabName'));w.eval(source('switchTab'));
 const begin=html.indexOf('const CLINIC_REALTIME_TABLES='),end=html.indexOf('async function loadHolidays(',begin);w.eval(html.slice(begin,end));
 w.eval(moduleSource);
 return {w,timers,intervals,async drain(){const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)await fn();},
  async poll(){for(const fn of intervals.values())fn();await this.drain();},broadcast:table=>broadcast({payload:{table}}),
  refreshes:()=>refreshes,confirms:()=>confirms,reminders:()=>reminders};
}
async function ready(t){const s=setup(t);await s.w.startClinicRealtime();await s.drain();await s.w.JasonEncounters.open(s.w.fixture.patient.id);return s;}
function active(w){return Array.from(w.document.querySelectorAll('.main > .page.active'),p=>p.id);}
function assertOpen(s,state){assert.equal(s.w.JasonEncounters.state,state);assert.equal(s.w.document.body.classList.contains('jenc-open'),true);assert.deepEqual(active(s.w),['page-jason-encounters']);}

test('idle encounter survives a clinical broadcast and the 30-second handover poll without navigation',async t=>{
 const s=await ready(t),state=s.w.JasonEncounters.state,before=s.refreshes();
 s.broadcast('clinical_records');await s.drain();await s.poll();assertOpen(s,state);assert.equal(s.refreshes(),before);assert.equal(s.confirms(),0);
});

test('blurring written notes and returning focus keeps the exact draft and never asks to discard it',async t=>{
 const s=await ready(t),state=s.w.JasonEncounters.state,notes=s.w.document.getElementById('jenc-notes-0');
 notes.value='Unfinished observations.\nKeep this wording.';notes.dispatchEvent(new s.w.Event('input',{bubbles:true}));notes.focus();
 s.broadcast('patients');await s.drain();notes.blur();s.w.dispatchEvent(new s.w.Event('focus'));s.w.document.dispatchEvent(new s.w.Event('visibilitychange'));await s.drain();
 assertOpen(s,state);assert.equal(s.w.document.getElementById('jenc-notes-0').value,'Unfinished observations.\nKeep this wording.');assert.equal(s.confirms(),0);assert.equal(s.w.fixture.calls.length,0);
});

test('broadcast received while encounter data is loading cannot return to handover',async t=>{
 const s=setup(t);await s.w.startClinicRealtime();await s.drain();let release,reached;
 const started=new Promise(resolve=>reached=resolve),read=s.w.fetchPatientById;
 s.w.fetchPatientById=async id=>{reached();await new Promise(resolve=>release=resolve);return read(id);};
 const opening=s.w.JasonEncounters.open(s.w.fixture.patient.id);await started;s.broadcast('patients');await s.drain();
 assert.equal(s.w.document.body.classList.contains('jenc-open'),true);assert.deepEqual(active(s.w),['page-jason-encounters']);
 release();await opening;assertOpen(s,s.w.JasonEncounters.state);
});

test('saved encounter and History stay open across reconnect and visibility refreshes',async t=>{
 const s=await ready(t);const notes=s.w.document.getElementById('jenc-notes-0');notes.value='Saved assessment.';notes.dispatchEvent(new s.w.Event('input',{bubbles:true}));await s.w.JasonEncounters.save();
 s.broadcast('clinical_records');await s.drain();assertOpen(s,s.w.JasonEncounters.state);assert.equal(s.w.JasonEncounters.state.editable,false);
 s.w.document.querySelector('[data-action="history"]').click();const state=s.w.JasonEncounters.state;s.w.document.dispatchEvent(new s.w.Event('visibilitychange'));await s.drain();
 assertOpen(s,state);assert.equal(state.mode,'history');assert.equal(s.w.document.querySelectorAll('[data-action="view"]').length,1);
});

test('Back refreshes handover and queued broadcasts resume after leaving the encounter',async t=>{
 const s=await ready(t),before=s.refreshes();s.broadcast('clinical_records');await s.drain();assert.equal(s.refreshes(),before);
 await s.w.JasonEncounters.back();assert.equal(s.w.JasonEncounters.state,null);assert.deepEqual(active(s.w),['page-handover']);assert.equal(s.refreshes(),before+1);
 await s.w.flushClinicRealtime();assert.equal(s.refreshes(),before+2);assert.equal(s.w.document.body.classList.contains('jenc-open'),false);
});

test('an explicit tab change still confirms unsaved changes and can be cancelled',async t=>{
 const s=await ready(t),state=s.w.JasonEncounters.state,notes=s.w.document.getElementById('jenc-notes-0');notes.value='Draft';notes.dispatchEvent(new s.w.Event('input',{bubbles:true}));
 let asks=0;s.w.confirm=()=>{asks++;return false;};s.w.switchTab('patients');assertOpen(s,state);assert.equal(asks,1);
 s.w.confirm=()=>{asks++;return true;};s.w.switchTab('patients');assert.equal(s.w.JasonEncounters.state,null);assert.deepEqual(active(s.w),['page-patients']);assert.equal(asks,2);
});

test('a broadcast during an in-flight save neither navigates away nor interrupts the saved encounter',async t=>{
 const s=await ready(t);let release,reached;const started=new Promise(resolve=>reached=resolve),rpc=s.w.SB.rpc;
 s.w.SB.rpc=async(...args)=>{reached();await new Promise(resolve=>release=resolve);return rpc(...args);};
 const notes=s.w.document.getElementById('jenc-notes-0');notes.value='Ready to save';notes.dispatchEvent(new s.w.Event('input',{bubbles:true}));
 const state=s.w.JasonEncounters.state,saving=s.w.JasonEncounters.save();await started;s.broadcast('clinical_records');await s.drain();assertOpen(s,state);assert.equal(state.saving,true);
 release();await saving;assertOpen(s,state);assert.equal(state.record.assessment.versions.length,1);assert.equal(s.w.fixture.calls.length,1);assert.equal(s.confirms(),0);
});

test('an encounter opened from a patient record stays open and Back returns to that record',async t=>{
 const s=setup(t),w=s.w;w.document.getElementById('page-handover').classList.remove('active');w.document.getElementById('page-patient-record').classList.add('active');
 let reopened;w.openPatientRecord=async id=>{reopened=id;w.document.getElementById('page-patient-record').classList.add('active');};
 await w.startClinicRealtime();await w.JasonEncounters.open(w.fixture.patient.id);const state=w.JasonEncounters.state;
 s.broadcast('patients');await s.drain();assertOpen(s,state);assert.equal(state.returnPage,'page-patient-record');
 await w.JasonEncounters.back();assert.equal(reopened,w.fixture.patient.id);assert.deepEqual(active(w),['page-patient-record']);
});
