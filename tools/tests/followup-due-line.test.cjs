// The follow-up due month lives on the patient record, not the appointment, so
// the visit review and the "Follow-up decision" card used to show no month at
// all ("Review due in a selected month"). followupDueLine reads the patient's
// due month, and plFollowupCardHTML names it on a review-month decision.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};

function ctx(){
  const c=vm.createContext({});
  vm.runInContext(`const FOLLOWUP_STATUSES=['active','awaiting_feedback','paused','relocated_overseas','discharged_gozo','reversed','deceased'];
    const FOLLOWUP_STATUS_ALIASES={reversal:'reversed',gozo:'discharged_gozo',overseas:'relocated_overseas'};`,c);
  ['normaliseFollowupStatus','isClosedFollowupStatus','followupMonthName','followupDueLine','plFollowupActionLabel'].forEach(n=>vm.runInContext(fn(n),c));
  return c;
}

test('shows the recorded due month for an active patient',()=>{
  const c=ctx();
  const line=c.followupDueLine({followup_status:'active',followup_due_month:1,followup_year:2027});
  assert.match(line,/Next follow-up due:/);
  assert.match(line,/January 2027/);
});

test('is empty when there is no valid due month',()=>{
  const c=ctx();
  assert.equal(c.followupDueLine({followup_status:'active',followup_due_month:0,followup_year:2027}),'');
  assert.equal(c.followupDueLine({followup_status:'active',followup_due_month:5,followup_year:null}),'');
  assert.equal(c.followupDueLine(null),'');
});

test('is empty for a closed (deceased / reversed) follow-up — nothing is due',()=>{
  const c=ctx();
  assert.equal(c.followupDueLine({followup_status:'deceased',followup_due_month:5,followup_year:2027}),'');
  assert.equal(c.followupDueLine({followup_status:'reversed',followup_due_month:5,followup_year:2027}),'');
});

// The card label itself is independent of followupDueLine, but the review-month
// branch in plFollowupCardHTML builds its text the same way; guard the label.
test('plFollowupActionLabel still gives the review-month base label',()=>{
  const c=ctx();
  assert.equal(c.plFollowupActionLabel('review-month'),'Review due in a selected month');
});

// The review-month decision names the actual month in the rendered card.
test('plFollowupCardHTML names the due month on a review-month decision',()=>{
  // Minimal slice test: confirm the source branch builds "Review due · <month> <year>".
  assert.match(html,/Review due · \$\{followupMonthName\(m\)\} \$\{y\}/);
});
