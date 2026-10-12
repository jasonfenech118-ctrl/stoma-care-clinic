// A patient already postop-discharged before normally shows only "Discharge
// (old case)" on a later admission. But if a NEW stoma / operation was formed
// during the CURRENT episode, "Postop discharge" must reappear — including an
// operation (a refashioning) that pickPostopDischargePatch alone cannot see, so
// the visibility also checks the whole stomaTimeline against inpatient_since.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {fistulaHelpers}=require('./fistula-helpers.cjs');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};

function rowHTML(patient){
  const dom=new JSDOM('<table><tbody id="t"></tbody></table>');
  const c=vm.createContext({isEncounterUser:()=>false,hvEncounteredToday:new Set(),TODAY:'2026-10-12',window:{},
    htmlSafe:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),jsSafe:v=>String(v??''),
    parseComplications:()=>[],hvIsInfectionNote:()=>false,wardBlockStyle:()=>'',wardBlockTitle:()=>'',wardHospitalLabel:()=>'',
    patientRodApplies:()=>false,handoverRodPrintCarrier:()=>'',flangeDueChipHTML:()=>'',handoverDocButtonHTML:()=>'',
    handoverComplicationLine:()=>'',stripHandoverFlangeDue:v=>v,
    fmtShortDate:v=>String(v||''),stomaShortType:()=>'',stomaQuadrant:()=>''});
  vm.runInContext(fistulaHelpers,c);
  ['parseInitialStomas','parseStomas','parseRefashionings','stomaOperationHistory','stomaTimeline',
   'pickPostopDischargePatch','handoverRowHTML'].forEach(n=>vm.runInContext(fn(n),c));
  dom.window.document.getElementById('t').innerHTML=c.handoverRowHTML({
    id:'p1',inpatient_ward:'SW4',inpatient_bed:'3',id_card:'1M',surname:'X',first_name:'Y',...patient},'');
  return dom.window.document.querySelector('tr').innerHTML;
}

// Postop-discharged before (primary has a discharge date); this admission just a
// plain review — no operation. Only "Discharge (old case)" should show.
test('a patient postop-discharged before, with no new operation this episode, hides Postop discharge',()=>{
  const out=rowHTML({surgery_date:'2026-01-01',stoma_type:'End colostomy',discharge_date:'2026-02-01',
    inpatient_since:'2026-10-10'});
  assert.doesNotMatch(out,/>Postop discharge</);
  assert.match(out,/Discharge \(old case\)/);
});

// Same patient, but a refashioning (a new operation) was done during the current
// episode. pickPostopDischargePatch does not see refashionings, so only the
// timeline check re-enables the button — it must be visible again.
test('a new operation (refashioning) during the current episode re-shows Postop discharge',()=>{
  const out=rowHTML({surgery_date:'2026-01-01',stoma_type:'End colostomy',discharge_date:'2026-02-01',
    inpatient_since:'2026-10-10',extra_refashionings:[{formed_date:'2026-10-11',type:'End colostomy'}]});
  assert.match(out,/>Postop discharge</);
});
