// The unified Discharge modal offers "Postop discharge" only while an operation
// is still open for discharge this admission. A patient already postop-discharged
// before, with no new operation, is offered only old case / Gozo / overseas. But
// if a NEW stoma / operation was formed during the CURRENT episode — including a
// refashioning that pickPostopDischargePatch alone cannot see — "Postop discharge"
// must reappear, because dischargeOptionsHTML also checks the whole stomaTimeline
// against inpatient_since.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {fistulaHelpers}=require('./fistula-helpers.cjs');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};

function options(patient){
  const c=vm.createContext({TODAY:'2026-10-12',fmtShortDate:v=>String(v||''),stomaShortType:()=>'',stomaQuadrant:()=>''});
  vm.runInContext(fistulaHelpers,c);
  ['parseInitialStomas','parseStomas','parseRefashionings','stomaOperationHistory','stomaTimeline',
   'pickPostopDischargePatch','dischargeOptionsHTML'].forEach(n=>vm.runInContext(fn(n),c));
  return c.dischargeOptionsHTML({id:'p1',surname:'X',first_name:'Y',...patient});
}

// Postop-discharged before (primary has a discharge date); this admission is a
// plain review — no operation. "Postop discharge" must not be offered; the other
// three outcomes still are.
test('a patient postop-discharged before, with no new operation this episode, is not offered Postop discharge',()=>{
  const out=options({surgery_date:'2026-01-01',stoma_type:'End colostomy',discharge_date:'2026-02-01',
    inpatient_since:'2026-10-10'});
  assert.doesNotMatch(out,/Postop discharge</);
  assert.match(out,/Discharge \(old case\)/);
  assert.match(out,/Discharged to Gozo/);
  assert.match(out,/Relocated overseas/);
});

// Same patient, but a refashioning (a new operation) was done during the current
// episode. pickPostopDischargePatch does not see refashionings, so only the
// timeline check re-enables the option — it must be offered again.
test('a new operation (refashioning) during the current episode re-offers Postop discharge',()=>{
  const out=options({surgery_date:'2026-01-01',stoma_type:'End colostomy',discharge_date:'2026-02-01',
    inpatient_since:'2026-10-10',extra_refashionings:[{formed_date:'2026-10-11',type:'End colostomy'}]});
  assert.match(out,/Postop discharge</);
});

// A brand-new stoma patient who has never been discharged is always offered the
// postop discharge.
test('a never-discharged stoma patient is offered Postop discharge',()=>{
  const out=options({surgery_date:'2026-10-05',stoma_type:'End colostomy',inpatient_since:'2026-10-05'});
  assert.match(out,/Postop discharge</);
});
