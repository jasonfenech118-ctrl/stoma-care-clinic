// The "Remove this stoma" button works for the first stoma too, and
// confirmRemoveStoma clears the patient's base stoma columns for slot 'base'.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

test('the Remove this stoma button is no longer hidden for the first stoma',()=>{
  const i=html.indexOf('class="btn-cancel sm-remove"');
  assert.ok(i>=0,'remove button present');
  const line=html.slice(i,html.indexOf('>',i)+1);
  assert.doesNotMatch(line,/hidden/,'the button must not carry a hidden gate');
});

test('removing a stoma always asks first via an explicit in-app confirmation',()=>{
  // The footer button opens the prompt; it never deletes straight away.
  const btn=html.indexOf('class="btn-cancel sm-remove" onclick="promptRemoveStoma()"');
  assert.ok(btn>=0,'remove button opens the confirmation prompt');
  const ps=html.indexOf('function promptRemoveStoma(');
  assert.ok(ps>=0,'promptRemoveStoma exists');
  const body=html.slice(ps,html.indexOf('\n}',ps)+2);
  assert.match(body,/Yes, delete this stoma/);
  assert.match(body,/onclick="confirmRemoveStoma\(\)"/);
  // The actual deletion runs only from that Yes button — not on the first tap.
  const crs=html.indexOf('async function confirmRemoveStoma(');
  const crsBody=html.slice(crs,html.indexOf('\n}',crs)+2);
  assert.doesNotMatch(crsBody,/confirm\(/,'no reliance on the native confirm dialog');
});

test('confirmRemoveStoma clears the base stoma columns and guards same-operation stomas',()=>{
  const start=html.indexOf('async function confirmRemoveStoma(');
  assert.ok(start>=0);
  const body=html.slice(start,html.indexOf('\n}',start)+2);
  // Handles the base (first-stoma) slot by clearing the patient's own columns.
  assert.match(body,/where==='base'/);
  ['stoma_type:null','surgery_date:null','reversal_date:null','procedure_performed:null','findings:null']
    .forEach(f=>assert.match(body,new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))));
  // Blocks removal when other stomas were formed at the same first operation.
  assert.match(body,/parseInitialStomas\(ctx\.pat\)\.length/);
  // Recomputes the follow-up status and records the change in the audit trail.
  assert.match(body,/followup_status=derivedFollowupStatus/);
  assert.match(body,/logAudit\(/);
});
