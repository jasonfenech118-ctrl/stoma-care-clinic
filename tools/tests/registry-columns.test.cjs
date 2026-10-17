// Patient Registry: the Surgery Date and Stoma Type columns fall back to the
// patient's stoma history when the top-level fields are blank (e.g. a patient
// whose only stoma is a later / new stoma recorded in the operation history).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {fistulaHelpers}=require('./fistula-helpers.cjs');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};

function ctx(){
  const c=vm.createContext({console,Date,Set,Map,Math,Array,Object,String,JSON,
    fmtShortDate:d=>d,stomaShortType:t=>t?'Colo':'',stomaQuadrant:()=>''});
  vm.runInContext(fistulaHelpers,c);
  for(const name of ['parseStomas','parseRefashionings','parseInitialStomas','stomaOperationHistory','stomaTimeline','registrySurgeryDate','registryStomaType','patientFieldFilled','patientMissingFields','patientIsIncomplete'])vm.runInContext(fn(name),c);
  // The required-field list is a const in index.html; mirror it for the test.
  vm.runInContext(`const PATIENT_REQUIRED_FIELDS=[['first_name','First name'],['surname','Surname'],['sex','Sex'],['locality','Locality'],['date_of_birth','Date of birth'],['consultant','Firm (consultant)'],['surgery_date','Date of surgery'],['stoma_type','Stoma type'],['procedure_performed','Operation performed']];`,c);
  return c;
}

test('registry Surgery Date / Stoma Type use the top-level fields when they are set',()=>{
  const c=ctx();
  const p={surgery_date:'2026-09-01',stoma_type:'End colostomy'};
  assert.equal(c.registrySurgeryDate(p),'2026-09-01');
  assert.equal(c.registryStomaType(p),'End colostomy');
});

test('registry columns fall back to a later / new stoma kept in the operation history',()=>{
  const c=ctx();
  // No top-level surgery_date / stoma_type; the only stoma is a "new" one.
  const p={extra_stomas:JSON.stringify([{uid:'n1',type:'End colostomy',formed_date:'2004-01-12'}])};
  assert.equal(c.registrySurgeryDate(p),'2004-01-12');
  assert.equal(c.registryStomaType(p),'End colostomy');
});

test('the earliest stoma date and each distinct type are shown',()=>{
  const c=ctx();
  const p={extra_stomas:JSON.stringify([
    {uid:'a',type:'Loop ileostomy',formed_date:'2020-05-04'},
    {uid:'b',type:'End colostomy',formed_date:'2018-02-01'}])};
  assert.equal(c.registrySurgeryDate(p),'2018-02-01');                 // earliest wins
  assert.equal(c.registryStomaType(p),'End colostomy, Loop ileostomy'); // both distinct types, oldest first
});

test('registry columns stay blank when there is no stoma on record',()=>{
  const c=ctx();
  assert.equal(c.registrySurgeryDate({}),'');
  assert.equal(c.registryStomaType({}),'');
});

test('a surgery date recorded only on a stoma does NOT count as missing',()=>{
  const c=ctx();
  // The date lives on a later / new stoma, not the top-level surgery_date column.
  const p={first_name:'A',surname:'B',sex:'Male',locality:'Mosta',date_of_birth:'1950-01-01',
    consultant:'Mr X',procedure_performed:'Formation of colostomy',
    extra_stomas:JSON.stringify([{uid:'n1',type:'End colostomy',formed_date:'2004-01-12'}])};
  assert.equal(c.patientFieldFilled(p,'surgery_date'),true,'surgery date is on file via the stoma');
  assert.equal(c.patientFieldFilled(p,'stoma_type'),true,'stoma type is on file via the stoma');
  assert.equal(c.patientMissingFields(p).length,0,'nothing is reported as still to complete');
  assert.equal(c.patientIsIncomplete(p),false);
});

test('a patient with no surgery date anywhere is still flagged',()=>{
  const c=ctx();
  const p={first_name:'A',surname:'B',sex:'Male',locality:'Mosta',date_of_birth:'1950-01-01',
    consultant:'Mr X',procedure_performed:'Formation of colostomy'};
  assert.equal(c.patientFieldFilled(p,'surgery_date'),false);
  assert.ok(c.patientMissingFields(p).includes('Date of surgery'));
  assert.ok(c.patientMissingFields(p).includes('Stoma type'));
});

test('a top-level surgery date still counts as filled',()=>{
  const c=ctx();
  const p={surgery_date:'2026-09-01',stoma_type:'End colostomy'};
  assert.equal(c.patientFieldFilled(p,'surgery_date'),true);
  assert.equal(c.patientFieldFilled(p,'stoma_type'),true);
});
