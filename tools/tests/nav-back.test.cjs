// A universal top-bar "‹ Back" button: every screen remembers the page you came
// from, so one tap returns there. These cover the history stack and the button.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
// The whole back-navigation block (history + currentView + navBack), up to switchTab.
const block=html.slice(html.indexOf('let navHistory=[]'),html.indexOf('function switchTab(name,opts){'));

function setup(){
  const dom=new JSDOM('<button id="nav-back" style="display:none;"></button>'
    +'<div class="page active" id="page-roster"></div>'
    +'<div class="page" id="page-patient-record"></div>',{runScripts:'outside-only'});
  const w=dom.window;const calls=[];
  Object.assign(w,{
    clrState:{},
    __tab:'roster',
    currentTabName:()=>w.__tab,
    switchTab:(name,opts)=>calls.push(['tab',name,opts]),
    openPatientRecord:(id,opts)=>calls.push(['patient',id,opts]),
  });
  w.eval(block.replace('let navHistory=[]','var navHistory=[]'));
  w.__calls=calls;
  return w;
}
const back=w=>w.document.getElementById('nav-back');

test('the Back button is hidden until you have navigated, then appears', ()=>{
  const w=setup();
  assert.equal(back(w).style.display,'none');
  w.pushNavHistory({type:'tab',name:'handover'});
  assert.equal(w.navHistory.length,1);
  assert.notEqual(back(w).style.display,'none');
});

test('the same page is never stacked on itself', ()=>{
  const w=setup();
  w.pushNavHistory({type:'tab',name:'handover'});
  w.pushNavHistory({type:'tab',name:'handover'});
  assert.equal(w.navHistory.length,1);
});

test('Back returns to the previous tab and hides again when there is nowhere left', ()=>{
  const w=setup();
  w.pushNavHistory({type:'tab',name:'handover'});
  w.navBack();
  assert.deepEqual(plain(w.__calls.at(-1)),['tab','handover',{fromBack:true}]);
  assert.equal(w.navHistory.length,0);
  assert.equal(back(w).style.display,'none');
});

test('Back with empty history does nothing and never throws', ()=>{
  const w=setup();
  const before=w.__calls.length;
  w.navBack();
  assert.equal(w.__calls.length,before);
});

test('currentView reads the open patient record, else the active tab', ()=>{
  const w=setup();
  assert.deepEqual(plain(w.currentView()),{type:'tab',name:'roster'});
  w.__tab='handover';
  assert.deepEqual(plain(w.currentView()),{type:'tab',name:'handover'});
  // Open a patient record: the view becomes that patient, not the tab.
  w.document.getElementById('page-patient-record').classList.add('active');
  w.clrState.patient={id:'p9'};
  assert.deepEqual(plain(w.currentView()),{type:'patient',id:'p9'});
});

test('Back re-opens a remembered patient record', ()=>{
  const w=setup();
  w.pushNavHistory({type:'patient',id:'p9'});
  w.navBack();
  assert.deepEqual(plain(w.__calls.at(-1)),['patient','p9',{fromBack:true}]);
});

test('multiple levels pop one at a time, newest first', ()=>{
  const w=setup();
  w.pushNavHistory({type:'tab',name:'patients'});
  w.pushNavHistory({type:'patient',id:'p1'});
  w.pushNavHistory({type:'tab',name:'handover'});
  w.navBack();assert.deepEqual(plain(w.__calls.at(-1)),['tab','handover',{fromBack:true}]);
  w.navBack();assert.deepEqual(plain(w.__calls.at(-1)),['patient','p1',{fromBack:true}]);
  w.navBack();assert.deepEqual(plain(w.__calls.at(-1)),['tab','patients',{fromBack:true}]);
  assert.equal(w.navHistory.length,0);
});
