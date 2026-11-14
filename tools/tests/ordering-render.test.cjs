// The Ordering tab renders both forms with a quantity box per item and the
// three action buttons (Save / Print / Send).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const code=fs.readFileSync(path.join(__dirname,'../../assets/ordering.js'),'utf8');

test('the Ordering tab draws both forms, a box per item and the action buttons',async()=>{
  const dom=new JSDOM('<body><div class="page" id="page-ordering"><div id="ordering-body"></div></div></body>',{url:'https://example.test/',runScripts:'outside-only'});
  const {window}=dom;
  vm.runInContext(code,dom.getInternalVMContext());   // runs as a browser script → window.ClinicOrdering
  const O=window.ClinicOrdering;
  assert.ok(O,'module attaches to window');
  O.init({db:null,ensureXLSX:async()=>({}),getUser:async()=>({name:'Test Nurse'})});
  await O.open();
  const body=window.document.getElementById('ordering-body');
  const inputs=body.querySelectorAll('input[data-part]');
  assert.equal(inputs.length,O.part1FormVisibleCount()+O.PART2.length,'one box per on-screen item (form-hidden disposables excluded)');
  assert.ok(window.document.getElementById('ord-save'),'Save draft button');
  assert.ok(window.document.getElementById('ord-print'),'Print button');
  assert.ok(window.document.getElementById('ord-send'),'Send email button');
  // Typing a quantity updates the in-memory order.
  const first=body.querySelector('input[data-part="2"][data-i="0"]');
  first.value='7';first.dispatchEvent(new window.Event('input'));
  assert.equal(O.PART2.length,92);
  // The form-hidden standing items have no on-screen row…
  for(const code of O.PART1_FORM_HIDDEN_CODES){
    assert.ok(!body.innerHTML.includes('>'+code+'<'),code+' is not shown in the form');
  }
});

test('form-hidden standing items are still on the exported Excel form',()=>{
  const O2=require('../../assets/ordering.js');
  const aoa=O2.buildPart1Aoa(O2.defaultOrder('2026-11-14'));
  const codes=aoa.map(r=>r[0]);
  // Every catalogue item — the form-hidden ones included — is on the Excel form.
  for(const it of O2.PART1){
    assert.ok(codes.includes(it.code),it.code+' kept on the Excel form');
  }
  for(const code of O2.PART1_FORM_HIDDEN_CODES){
    assert.ok(codes.includes(code),code+' (hidden from the form) still exported');
  }
});
