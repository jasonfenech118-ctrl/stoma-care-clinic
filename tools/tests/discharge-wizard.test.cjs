const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function sourceBetween(startText,endText){
  const start=html.indexOf(startText);
  const end=html.indexOf(endText,start);
  assert.ok(start>=0&&end>start,`Source block not found: ${startText}`);
  return html.slice(start,end);
}
function ctx(){
  const c=vm.createContext({});
  vm.runInContext(sourceBetween('function dischargeSeq(c){','function dischargeEmailDraft('),c);
  return c;
}

// The returned array lives in the vm realm, so compare joined strings rather
// than deepStrictEqual against a host-realm [] (which would always differ).
const seq=(c,arg)=>c.dischargeSeq(arg).join(',');

test('Gozo and overseas discharges keep the three core steps',()=>{
  const c=ctx();
  assert.equal(seq(c,{choice:'discharged_gozo'}),'outcome,check,confirm');
  assert.equal(seq(c,{choice:'relocated_overseas'}),'outcome,check,confirm');
});

test('a home discharge adds the referral step; No keeps it short, Yes adds letter/copy/send',()=>{
  const c=ctx();
  assert.equal(seq(c,{choice:'postop'}),'outcome,check,referral,confirm');
  assert.equal(seq(c,{choice:'postop',community:'no'}),'outcome,check,referral,confirm');
  assert.equal(seq(c,{choice:'postop',community:'yes'}),'outcome,check,referral,letter,copy,send,confirm');
  assert.equal(seq(c,{choice:'old',community:'yes'}),'outcome,check,referral,letter,copy,send,confirm');
});

test('dischargeCopyLabel reads the preset with an optional name in brackets',()=>{
  const c=ctx();
  assert.equal(c.dischargeCopyLabel({copyPreset:'Patient'}),'Patient');
  assert.equal(c.dischargeCopyLabel({copyPreset:'Ward nurse',copyName:'Mary Borg'}),'Ward nurse (Mary Borg)');
  assert.equal(c.dischargeCopyLabel({copyPreset:'Other',copyName:'Mater Dei GP clinic'}),'Mater Dei GP clinic');
  assert.equal(c.dischargeCopyLabel({copyPreset:''}),'');
  assert.equal(c.dischargeCopyLabel(null),'');
});
