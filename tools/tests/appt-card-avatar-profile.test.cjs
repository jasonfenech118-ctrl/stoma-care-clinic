// On a Daily Clinic appointment card, the patient avatar + name opens the
// patient profile (the separate 👤 profile button was removed).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

// The appointment-card rendering region (the booked/attended cell).
function cardBlock(){
  const s=html.indexOf('html+=`<td class="appt-cell-card');
  const e=html.indexOf('}else if(vacationBlocked){',s);
  assert.ok(s>=0&&e>s,'appointment card block not found');
  return html.slice(s,e);
}

test('the appointment card avatar/name is a clickable profile opener',()=>{
  const block=cardBlock();
  assert.match(block,/class="patient-name-avatar\$\{appt\.patient_id\?' appt-open-profile'/,'avatar row carries the clickable class when there is a patient');
  assert.match(block,/appt-open-profile[\s\S]*?onclick="openPatientRecord\('\$\{jsSafe\(appt\.patient_id\)\}'\)"/,'the avatar row opens the patient record');
  assert.match(block,/role="button" tabindex="0"[\s\S]*?onkeydown=/,'keyboard accessible');
});

test('the standalone profile button is gone from the card',()=>{
  const block=cardBlock();
  assert.doesNotMatch(block,/>👤<\/button>/,'no 👤 profile button remains');
  assert.doesNotMatch(block,/title="Open patient profile"[^>]*>👤/,'no profile icon button');
});

test('the clickable avatar has a hover/focus affordance in CSS',()=>{
  assert.match(html,/\.appt-open-profile:hover\{/);
  assert.match(html,/\.appt-open-profile:focus-visible\{/);
});
