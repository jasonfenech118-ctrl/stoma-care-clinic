// The pharmacy-dispensary "appliance changes" note has a Send email button that
// opens the PDF to save and an Outlook draft to the two pharmacy contacts
// (CC the stoma clinic) with an "Appliance changes — <date>" subject.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

function slice(from,to){const i=html.indexOf(from);const j=html.indexOf(to,i);assert.ok(i>=0&&j>i,from);return html.slice(i,j);}

test('Send email opens an Outlook draft to the two recipients, CC the clinic',()=>{
  let href='',winOpened=false;
  const ctx=vm.createContext({
    clinicChangesState:{patients:[{}],date:'2026-11-15'},
    fmtShortDate:d=>'15 Nov 2026',
    STOMA_CARE_EMAIL:'stomacare.mdh@gov.mt',
    openMailtoLink:h=>{href=h;},
    window:{open:()=>{winOpened=true;}},
    encodeURIComponent,setTimeout:()=>{},alert:()=>{}
  });
  vm.runInContext(slice('const DISPENSARY_EMAILS=','function arrangePatientDashboard'),ctx);
  ctx.clinicChangesEmail();
  // The email is opened on its own — no pop-up window beforehand (blocked on mobile).
  assert.equal(winOpened,false,'no pop-up window is opened before the mailto');
  assert.ok(href.startsWith('mailto:m-rose.gatt@gov.mt,cherise.chircop@contractors.gov.mt?'),'both recipients, literal commas');
  assert.match(href,/[?&]cc=stomacare\.mdh%40gov\.mt/,'CC the stoma clinic');
  assert.match(href,/subject=Appliance%20changes%20%E2%80%94%2015%20Nov%202026/,'subject with the automated date');
  const bodyText=decodeURIComponent(href);
  assert.match(bodyText,/Dear both,/);
  assert.match(bodyText,/Attached to this email are today's clinic appliance and accessories changes\./);
  assert.match(bodyText,/Sincerely,/);
});

test('the Changes modal renders a Send email button next to Print',()=>{
  assert.match(html,/onclick="clinicChangesEmail\(\)"[^>]*>✉ Send email/);
  // It sits in the same action row as Print / Download PDF.
  assert.match(html,/clinicChangesPrint\(\)">🖨 Print \/ Download PDF<\/button><button[^>]*onclick="clinicChangesEmail\(\)"/);
});
