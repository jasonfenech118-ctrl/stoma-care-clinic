// A refashioning's "Same admission as the previous operation?" answer defaults to
// "No — separate admission" when the surgery date is evidently far from the
// previous operation's date. A short gap or unknown date is left for the nurse,
// and a manual choice is never overwritten.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function grab(start,end){const i=html.indexOf(start);assert.ok(i>=0,start);const j=html.indexOf(end,i);assert.ok(j>i,end);return html.slice(i,j);}

function setup(){
  const dom=new JSDOM(`<body>
    <select id="so-admission"><option value=""></option><option value="no"></option><option value="yes"></option><option value="unknown"></option></select>
    <p id="so-admission-auto" hidden></p>
    <input type="checkbox" id="so-unknown">
    <input type="date" id="so-date">
    <select id="so-target"><option value="t1">t1</option></select>
  </body>`);
  const w=dom.window;
  const ctx=vm.createContext({
    window:w,document:w.document,Date,isFinite,Math,String,
    stomaOperationCtx:{kind:'refashion',pat:{}},
    patientStomaList:()=>[{uid:'t1',formed_date:'2010-08-12'}]
  });
  vm.runInContext(grab('const REFASHION_SEPARATE_ADMISSION_DAYS=','function changeStomaOperationKind(){'),ctx);
  return {w,ctx};
}

test('a years-apart surgery date auto-marks a separate admission',()=>{
  const {w,ctx}=setup();
  w.document.getElementById('so-date').value='2015-11-06';
  ctx.maybeAutoMarkRefashionAdmission();
  assert.equal(w.document.getElementById('so-admission').value,'no');
  assert.equal(w.document.getElementById('so-admission').dataset.auto,'1');
  assert.equal(w.document.getElementById('so-admission-auto').hidden,false,'explanatory note shown');
});

test('a close surgery date (possible single long admission) is left unanswered',()=>{
  const {w,ctx}=setup();
  w.document.getElementById('so-date').value='2010-09-01';   // 20 days later
  ctx.maybeAutoMarkRefashionAdmission();
  assert.equal(w.document.getElementById('so-admission').value,'','left for the nurse');
  assert.equal(w.document.getElementById('so-admission-auto').hidden,true);
});

test('changing an auto-filled far date back to a close one clears the default',()=>{
  const {w,ctx}=setup();
  const adm=w.document.getElementById('so-admission');
  w.document.getElementById('so-date').value='2015-11-06';
  ctx.maybeAutoMarkRefashionAdmission();
  assert.equal(adm.value,'no');
  w.document.getElementById('so-date').value='2010-08-20';   // now close
  ctx.maybeAutoMarkRefashionAdmission();
  assert.equal(adm.value,'','auto default removed when the gap is no longer evident');
});

test('a manual answer is never overwritten',()=>{
  const {w,ctx}=setup();
  const adm=w.document.getElementById('so-admission');
  adm.value='yes';ctx.markRefashionAdmissionManual();
  w.document.getElementById('so-date').value='2015-11-06';   // far date
  ctx.maybeAutoMarkRefashionAdmission();
  assert.equal(adm.value,'yes','manual choice kept');
});

test('an unknown surgery date does not auto-mark',()=>{
  const {w,ctx}=setup();
  w.document.getElementById('so-date').value='2015-11-06';
  w.document.getElementById('so-unknown').checked=true;
  ctx.maybeAutoMarkRefashionAdmission();
  assert.equal(w.document.getElementById('so-admission').value,'');
});

test('a non-refashion operation is left alone',()=>{
  const {w,ctx}=setup();
  ctx.stomaOperationCtx.kind='new';
  w.document.getElementById('so-date').value='2015-11-06';
  ctx.maybeAutoMarkRefashionAdmission();
  assert.equal(w.document.getElementById('so-admission').value,'');
});
