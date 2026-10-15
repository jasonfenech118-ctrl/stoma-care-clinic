// A patient whose operation is recorded only on a stoma (a "new"/"later" stoma
// or refashioning) has no top-level surgery_date. The documentation RPC then
// reports "Surgery date missing" even though the date is on file — so
// patchDocSurgeryDates fills the evidence from the effective stoma date.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};

function ctx(){
  const c=vm.createContext({stomaTimeline:p=>p.__timeline||[]});
  ['registrySurgeryDate','patchDocSurgeryDates'].forEach(n=>vm.runInContext(fn(n),c));
  return c;
}

test('fills the documentation surgery date from the earliest stoma when the top-level one is blank',()=>{
  const c=ctx();
  const p={surgery_date:'',__timeline:[{formed:'2005-07-02'},{formed:'2009-01-01'}],
    documentation_dates:{surgery_date:null,first_episode_date:null}};
  c.patchDocSurgeryDates({data:[p]});
  assert.equal(p.documentation_dates.surgery_date,'2005-07-02');   // no longer "missing"
});

test('a single-object result (fetchPatientById) is patched too',()=>{
  const c=ctx();
  const p={surgery_date:null,__timeline:[{formed:'2005-07-02'}],documentation_dates:{surgery_date:''}};
  c.patchDocSurgeryDates({data:p});
  assert.equal(p.documentation_dates.surgery_date,'2005-07-02');
});

test('an existing documentation surgery date is left alone, and null evidence never throws',()=>{
  const c=ctx();
  const kept={surgery_date:'2010-01-01',__timeline:[{formed:'2005-07-02'}],documentation_dates:{surgery_date:'2010-01-01'}};
  const none={__timeline:[],documentation_dates:null};
  c.patchDocSurgeryDates({data:[kept,none]});
  assert.equal(kept.documentation_dates.surgery_date,'2010-01-01');
  assert.equal(none.documentation_dates,null);
});
