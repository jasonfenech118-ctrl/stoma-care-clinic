// The Handover keeps its editable appliance cell for every nurse; the Encounter
// button sits beside it rather than replacing it.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};
function row(encounterUser,done=false){
  const dom=new JSDOM('<table><tbody id="t"></tbody></table>');
  const c=vm.createContext({isEncounterUser:()=>encounterUser,hvEncounteredToday:new Set(done?['p1']:[]),
    JasonEncounters:{handoverCell:()=>'<span class="replaced-cell"></span>'},window:{},
    htmlSafe:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),jsSafe:v=>String(v??''),
    parseComplications:()=>[],hvIsInfectionNote:()=>false,wardBlockStyle:()=>'',wardBlockTitle:()=>'',wardHospitalLabel:()=>'',
    patientRodApplies:()=>false,handoverRodPrintCarrier:()=>'',flangeDueChipHTML:()=>'',handoverDocButtonHTML:()=>'',
    handoverComplicationLine:()=>'',stripHandoverFlangeDue:v=>v});
  c.window.JasonEncounters=c.JasonEncounters;
  vm.runInContext(fn('handoverRowHTML'),c);
  dom.window.document.getElementById('t').innerHTML=c.handoverRowHTML({id:'p1',inpatient_ward:'SW4',inpatient_bed:'3',id_card:'1M',surname:'Ciantar',first_name:'Saviour',inpatient_notes:'Little Ones',inpatient_nurse_notes:'Skin intact'},'');
  return dom.window.document.querySelector('td.hv-appl-cell');
}

test('every nurse can still set the appliance, write notes and open complications from the handover, with Encounter beside them',()=>{
  const cell=row(true,true);
  assert.equal(cell.querySelector('.replaced-cell'),null,'the cell is not replaced by a read-only encounter summary');
  assert.match(cell.querySelector('button.hv-appl').getAttribute('onclick'),/openHandoverAppliance\('p1'\)/);
  assert.equal(cell.querySelector('input.hv-note').value,'Skin intact');
  assert.match(cell.querySelector('.hv-cmp-btn').getAttribute('onclick'),/openComplicationsManager/);
  const enc=cell.querySelector('.hv-enc-btn');assert.match(enc.textContent,/Encounter ✓/);assert.ok(cell.classList.contains('hv-encountered'));
});

test('no Encounter button when nobody is signed in for encounters',()=>{
  const cell=row(false);assert.ok(cell.querySelector('button.hv-appl'));assert.equal(cell.querySelector('.hv-enc-btn'),null);
});
