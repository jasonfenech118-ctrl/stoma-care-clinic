// The Monthly Roster Overtime / Time-in-Lieu sections (both add forms and both
// monthly lists) are shown only to administrators (Jason and Jacqueline).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function grab(start,end){const i=html.indexOf(start);assert.ok(i>=0,start);const j=html.indexOf(end,i);assert.ok(j>i,end);return html.slice(i,j);}

const IDS=['roster-ot-bar','roster-ot-note','roster-til-bar','roster-til-note','roster-ot-list','roster-til-list'];

function setup(isAdmin){
  const dom=new JSDOM('<body>'+IDS.map(id=>`<div id="${id}"></div>`).join('')+'</body>');
  const w=dom.window;
  w.ClinicAccount={isAdmin:()=>isAdmin};
  const ctx=vm.createContext({window:w,document:w.document});
  vm.runInContext(grab('function canManageRosterOTTIL(){','async function renderRoster(){'),ctx);
  ctx.applyRosterOTTILVisibility();
  return {w};
}

test('a non-admin sees none of the roster OT/TIL sections',()=>{
  const {w}=setup(false);
  for(const id of IDS)assert.equal(w.document.getElementById(id).hidden,true,id+' must be hidden');
});

test('an admin (Jason / Jacqueline) sees every roster OT/TIL section',()=>{
  const {w}=setup(true);
  for(const id of IDS)assert.equal(w.document.getElementById(id).hidden,false,id+' must be visible');
});

test('the gating fails safe (hidden) when the account helper is unavailable',()=>{
  const dom=new JSDOM('<body>'+IDS.map(id=>`<div id="${id}"></div>`).join('')+'</body>');
  const w=dom.window;   // no window.ClinicAccount
  const ctx=vm.createContext({window:w,document:w.document});
  vm.runInContext(grab('function canManageRosterOTTIL(){','async function renderRoster(){'),ctx);
  ctx.applyRosterOTTILVisibility();
  for(const id of IDS)assert.equal(w.document.getElementById(id).hidden,true);
});

// Daily Attendance is locked to today for non-admins (no browsing other days).
function setupDA(isAdmin,startValue){
  const dom=new JSDOM('<body><div id="da-day-controls"></div><button id="da-today-btn"></button><input id="da-date" value="'+startValue+'"></body>');
  const w=dom.window;
  w.ClinicAccount={isAdmin:()=>isAdmin};
  const ctx=vm.createContext({window:w,document:w.document,TODAY:'2026-11-12'});
  vm.runInContext(
    grab('function canManageRosterOTTIL(){','function applyRosterOTTILVisibility(')
    +grab('function applyDailyAttendanceDayLock(){','function loadDailyAttendance('),ctx);
  ctx.applyDailyAttendanceDayLock();
  return w;
}

test('Daily Attendance is pinned to today and its day controls hidden for a non-admin',()=>{
  const w=setupDA(false,'2026-11-20');
  assert.equal(w.document.getElementById('da-date').value,'2026-11-12','date pinned to today');
  assert.equal(w.document.getElementById('da-date').dataset.initialized,'true','marked initialized so load keeps today');
  assert.equal(w.document.getElementById('da-day-controls').style.display,'none','date nav hidden');
  assert.equal(w.document.getElementById('da-today-btn').style.display,'none','Today button hidden');
});

test('Daily Attendance keeps full day navigation for an admin',()=>{
  const w=setupDA(true,'2026-11-20');
  assert.equal(w.document.getElementById('da-date').value,'2026-11-20','admin date left untouched');
  assert.notEqual(w.document.getElementById('da-day-controls').style.display,'none','date nav visible');
  assert.notEqual(w.document.getElementById('da-today-btn').style.display,'none','Today button visible');
});
