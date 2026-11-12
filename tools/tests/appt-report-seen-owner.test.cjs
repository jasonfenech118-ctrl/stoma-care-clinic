// The follow-up appointment report shows who saw the patient (attended visits)
// and the patient's nurse owner.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){const m=html.match(new RegExp('(?:async )?function '+name+'\\('));assert(m,name);const s=m.index;const e=html.indexOf('\n}',s);return html.slice(s,e+2);}
function ctx(owner){
  const c=vm.createContext({
    htmlSafe:x=>String(x==null?'':x),
    statusLabel:s=>s==='attended'?'Attended':String(s||''),
    apptReviewInlineText:()=>'',apptApplianceParts:()=>[],apptDueText:()=>'',
    normaliseFollowupOwner:o=>String(o||'Common'),
    clrState:{patient:{followup_owner:owner}},window:{}
  });
  vm.runInContext(source('apptReportSectionsHTML'),c);
  return c;
}

test('an attended visit shows Seen by (outcome recorder) and the nurse owner',()=>{
  const out=ctx('Jason').apptReportSectionsHTML({status:'attended',outcome_recorded_by_name:'Erika Psaila'},true,[]);
  assert.match(out,/Seen by/);assert.match(out,/Erika Psaila/);
  assert.match(out,/Nurse owner/);assert.match(out,/Jason/);
});

test('Seen by falls back to the booked nurse, then to Common',()=>{
  const viaStaff=ctx('Common').apptReportSectionsHTML({status:'attended',assigned_to:'n1',staff:{full_name:'Tracey Galea'}},true,[]);
  assert.match(viaStaff,/Seen by/);assert.match(viaStaff,/Tracey Galea/);
  const common=ctx('Common').apptReportSectionsHTML({status:'attended'},true,[]);
  assert.match(common,/Seen by/);assert.match(common,/Common/);
});

test('a not-attended appointment shows no Seen by',()=>{
  const booked=ctx('Lorraine').apptReportSectionsHTML({status:'booked',assigned_to:'n1',staff:{full_name:'Tracey Galea'}},false,[]);
  assert.doesNotMatch(booked,/Seen by/);
  // The owner still shows.
  assert.match(booked,/Nurse owner/);assert.match(booked,/Lorraine/);
});
