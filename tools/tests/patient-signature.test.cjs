// A signature on the patient details card: who entered the record and who last
// edited it. Stamped on create and on every details save; shown on the record.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;');

function ctx(extra={}){
  const dom=new JSDOM('<div></div>');
  const c=vm.createContext({document:dom.window.document,htmlSafe:esc,fmtShortDate:d=>d,...extra});
  return {c,dom};
}

test('the signature line shows who entered it, and a later edit by someone else', t=>{
  const {c}=ctx();
  vm.runInContext(fn('patientSignatureHTML'),c);
  // Entered and never edited by anyone new.
  let h=c.patientSignatureHTML({created_by:'Jason Fenech',created_at:'2026-10-08T09:00:00Z',updated_by:'Jason Fenech',updated_at:'2026-10-08T09:00:00Z'});
  assert.match(h,/Entered by <strong>Jason Fenech<\/strong> · 2026-10-08/);
  assert.doesNotMatch(h,/last edited/);
  // A later edit by a different nurse adds the "last edited" clause.
  h=c.patientSignatureHTML({created_by:'Jason Fenech',created_at:'2026-10-08',updated_by:'Lorraine Stivala',updated_at:'2026-10-09'});
  assert.match(h,/Entered by <strong>Jason Fenech<\/strong> · 2026-10-08/);
  assert.match(h,/last edited by <strong>Lorraine Stivala<\/strong> · 2026-10-09/);
  // Old record with nothing recorded says so, never a blank line.
  h=c.patientSignatureHTML({});
  assert.match(h,/Author not recorded/);
});

// A minimal harness around saveNewPatient's save tail: who entered is stamped.
test('creating a patient stamps created_by / created_at and the same as the first editor', async t=>{
  const dom=new JSDOM('<div id="ap-error"></div>',{runScripts:'outside-only'});const w=dom.window;let inserted;
  Object.assign(w,{
    readPatientForm:()=>({first_name:'Mary',surname:'Borg',id_card:'77M'}),
    normaliseFollowupType:()=>'new_case',patientMissingFields:()=>[],refashioningError:()=>'',
    findRegistryPatientsByIdCard:async()=>({matches:[],error:null}),
    insertPatientTolerant:async p=>{inserted=p;return{data:{id:'p9'},error:null,dropped:[]};},
    getCurrentUserForAudit:async()=>({email:'jason.fenech@gov.mt'}),staffList:[],
    htmlSafe:esc,alert:()=>{},say:()=>{},
    openPatientRecord:()=>{},openPatientDatesModal:()=>{},renderAddPatientForm:()=>{},refreshReminders:()=>{},patientOutcome:()=>['Active','active'],patientSaveError:e=>String(e),loadPatientDirectory:()=>{},loadNewPatients:()=>{},switchTab:()=>{},
  });
  w.eval(fn('attDisplayName')+'\n'+fn('patientSignatureName')+'\n'+fn('saveNewPatient'));
  await w.saveNewPatient();
  assert.equal(inserted.created_by,'Jason Fenech');
  assert.equal(inserted.updated_by,'Jason Fenech');
  assert.ok(inserted.created_at&&inserted.updated_at);
  assert.equal(inserted.created_at,inserted.updated_at);
});

test('no signed-in name means no *_by is written, only the timestamps', async t=>{
  const dom=new JSDOM('<div id="ap-error"></div>',{runScripts:'outside-only'});const w=dom.window;let inserted;
  Object.assign(w,{
    readPatientForm:()=>({first_name:'Mary',surname:'Borg',id_card:'77M'}),
    normaliseFollowupType:()=>'new_case',patientMissingFields:()=>[],refashioningError:()=>'',
    findRegistryPatientsByIdCard:async()=>({matches:[],error:null}),
    insertPatientTolerant:async p=>{inserted=p;return{data:{id:'p9'},error:null,dropped:[]};},
    getCurrentUserForAudit:async()=>({email:''}),staffList:[],htmlSafe:esc,
    alert:()=>{},say:()=>{},openPatientRecord:()=>{},openPatientDatesModal:()=>{},renderAddPatientForm:()=>{},refreshReminders:()=>{},patientOutcome:()=>['Active','active'],patientSaveError:e=>String(e),loadPatientDirectory:()=>{},loadNewPatients:()=>{},switchTab:()=>{},
  });
  w.eval(fn('attDisplayName')+'\n'+fn('patientSignatureName')+'\n'+fn('saveNewPatient'));
  await w.saveNewPatient();
  assert.equal(inserted.created_by,undefined);
  assert.equal(inserted.updated_by,undefined);
  assert.ok(inserted.created_at,'timestamps are still stamped');
});
