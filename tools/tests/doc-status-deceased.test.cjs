// A deceased patient is a closed record: the automatic "Patient records" status
// (electronic-notes coverage / "History not checked") is not shown for them, so
// a closed case is never nagged about documentation history.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const docScript=fs.readFileSync(path.join(__dirname,'../../assets/documentation-status.js'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};

function setup(t){
  const dom=new JSDOM('',{runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window;
  w.eval(docScript);                         // defines window.DocumentationStatus
  w.eval(`var FOLLOWUP_STATUSES=['active','awaiting_feedback','paused','relocated_overseas','discharged_gozo','reversed','deceased'];var FOLLOWUP_STATUS_ALIASES={};`);
  ['normaliseFollowupStatus','rawExtraStatuses','patientIsDeceased','docStatusBadgeHTML','docStatusCardHTML'].forEach(n=>w.eval(fn(n)));
  return w;
}

// A patient whose electronic notes are incomplete — classify would return a real
// status that normally shows as a badge.
const docs={surgery_date:'2005-04-23',first_episode_date:null,first_encounter_date:null,
  first_episode_entered_date:null,first_encounter_entered_date:null};

test('a living patient still shows the documentation badge and card',t=>{
  const w=setup(t);
  const p={followup_status:'active',documentation_dates:docs};
  assert.match(w.docStatusBadgeHTML(p),/documentation-badge/);
  assert.match(w.docStatusCardHTML(p),/Patient records/);
});

test('a deceased patient (by status) shows no documentation badge or card',t=>{
  const w=setup(t);
  const p={followup_status:'deceased',documentation_dates:docs};
  assert.equal(w.docStatusBadgeHTML(p),'');
  assert.equal(w.docStatusCardHTML(p),'');
});

test('a deceased patient (by date of death only) is also suppressed',t=>{
  const w=setup(t);
  const p={followup_status:'active',deceased_date:'2024-01-01',documentation_dates:docs};
  assert.equal(w.docStatusBadgeHTML(p),'');
  assert.equal(w.docStatusCardHTML(p),'');
});

test('the deceased hide does not depend on documentation_dates being present',t=>{
  const w=setup(t);
  const p={followup_status:'deceased'};        // no documentation_dates at all
  assert.equal(w.docStatusBadgeHTML(p),'');
  assert.equal(w.docStatusCardHTML(p),'');
});

// Guard the registry filter wiring: deceased records are excluded from any
// specific "Patient records" filter (only "All patient records" lists them).
test('the registry documentation filter excludes deceased records',()=>{
  assert.match(html,/patientIsDeceased\(p\)\|\|DocumentationStatus\.classify\(p\.documentation_dates\)\.status!==docs/);
});
