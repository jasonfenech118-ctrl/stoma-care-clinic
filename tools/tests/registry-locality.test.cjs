// The Locality filter derives the canonical Maltese town from the stored
// address text (which is often a full street address, not a clean locality).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function grab(start,end){const i=html.indexOf(start);assert.ok(i>=0,start);const j=html.indexOf(end,i);assert.ok(j>i,end);return html.slice(i,j);}
function ctx(){
  const c=vm.createContext({});
  vm.runInContext(grab('const LOCALITIES_DEFAULT=','let localityList=')+grab('function locNormKey(','function patientLocalityCached('),c);
  return c;
}

test('a full street address resolves to its canonical locality',()=>{
  const c=ctx();const loc=t=>c.patientLocality({locality:t});
  assert.equal(loc('103A Viani Str Slima'),'Sliema');          // short spelling "Slima"
  assert.equal(loc('13 Sqaq Rigu B Kara'),'Birkirkara');       // abbreviation "B Kara"
  assert.equal(loc("10 triq in-naghal st'Venera"),'Santa Venera');
  assert.equal(loc('100 Panache Triq Gafa Mosta'),'Mosta');
  assert.equal(loc('105 Triq Lia Zabbar'),'Żabbar');           // diacritic-insensitive
  assert.equal(loc('14/16 Triq K Mifsud Pieta'),'Pietà');
  assert.equal(loc('39 triq ir-Raddiena Zebbug'),'Żebbuġ (Malta)');
});

test('the town wins over a street that merely contains another town name',()=>{
  const c=ctx();
  // "St Venera Str Msida": the town is Msida (at the end), not Santa Venera.
  assert.equal(c.patientLocality({locality:'115 St Venera Str Msida'}),'Msida');
});

test('an address with no recognised town returns empty (kept out of the dropdown)',()=>{
  const c=ctx();
  assert.equal(c.patientLocality({locality:'26 Triq San Nikola'}),'');
  assert.equal(c.patientLocality({locality:''}),'');
  assert.equal(c.patientLocality(null),'');
});

test('a clean locality value still resolves to itself',()=>{
  const c=ctx();
  assert.equal(c.patientLocality({locality:'Sliema'}),'Sliema');
  assert.equal(c.patientLocality({locality:'Mosta'}),'Mosta');
});
