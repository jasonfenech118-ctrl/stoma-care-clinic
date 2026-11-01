// A follow-up visit's clinical review now reads inline in the patient history
// (apptReviewInlineText), and the "What was written" modal has a Print button
// backed by printVisitReview.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};

function ctx(rows){
  const c=vm.createContext({window:{VisitStomaReview:{rowsOf:()=>rows||[]}}});
  // apptReviewInlineText reads a bare `VisitStomaReview` too — mirror the global.
  c.VisitStomaReview=c.window.VisitStomaReview;
  vm.runInContext(fn('apptReviewInlineText'),c);
  return c;
}

test('the clinical notes and complication review read inline',()=>{
  const c=ctx([{notes:'Stoma settled, skin intact.'},{notes:''}]);
  const out=c.apptReviewInlineText({stoma_assessment:{},complication_review:'existing-reviewed'});
  assert.match(out,/Stoma settled, skin intact\./);
  assert.match(out,/Complications: existing reviewed/);
});

test('an empty visit yields an empty inline review (falls back to the status line)',()=>{
  const c=ctx([]);
  assert.equal(c.apptReviewInlineText({}),'');
});

test('the review inline text never throws when VisitStomaReview is absent',()=>{
  const c=vm.createContext({window:{}});
  vm.runInContext(fn('apptReviewInlineText'),c);
  assert.equal(c.apptReviewInlineText({complication_review:'retraction'}),'Complications: retraction');
});

test('the "What was written" modal offers a Print button wired to printVisitReview',()=>{
  assert.match(html,/onclick="printVisitReview\(/);
  assert.match(html,/🖨 Print/);
  assert.match(html,/function printVisitReview\(/);
  // The printed sheet drops the action buttons so only the review prints.
  assert.match(html,/clone\.querySelectorAll\('\.mact,button'\)\.forEach/);
});
