// The patient record's 📍 Siting button must open the patient's siting-session
// list. Regression test for a name collision: a second `function
// openPatientSiting(...)` once shadowed the no-arg opener, so the button ran the
// list modal with undefined args and always reported "No siting sessions".
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

test('there is no duplicate openPatientSiting declaration',()=>{
  const dupes=(html.match(/function\s+openPatientSiting\s*\(/g)||[]).length;
  assert.equal(dupes,0,'the colliding openPatientSiting name must be gone');
});

test('the siting-session list modal has exactly one declaration',()=>{
  const n=(html.match(/function\s+openPatientSitingSessions\s*\(/g)||[]).length;
  assert.equal(n,1,'openPatientSitingSessions must be declared exactly once');
});

test('the patient record Siting button calls openPatientSitingSessions',()=>{
  assert.match(html,/onclick="openPatientSitingSessions\(\)"[^`]*📍 Siting/,
    'the 📍 Siting button must be wired to openPatientSitingSessions()');
});

test('openPatientSitingSessions falls back to the open patient when called with no args',()=>{
  const i=html.indexOf('async function openPatientSitingSessions(');
  assert.ok(i>=0);
  const body=html.slice(i,i+600);
  assert.match(body,/patientId===undefined/,'must default its args from clrState.patient');
  assert.match(body,/clrState\.patient\.id_card/,'must take the ID card from the open patient');
});
