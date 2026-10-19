const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const a=html.indexOf('const PATIENT_REQUIRED_FIELDS='),b=html.indexOf('// Each stoma refashioning',a);
function setup(){
  const c={patientStomaList:p=>p.stomas||[],registrySurgeryDate:p=>(p.stomas||[]).find(s=>s.formed_date)?.formed_date||'',registryStomaType:p=>(p.stomas||[]).find(s=>s.type)?.type||''};
  vm.createContext(c);vm.runInContext(html.slice(a,b),c);return c;
}
const demo={first_name:'Test',surname:'Patient',sex:'Female',locality:'Mosta',date_of_birth:'1950-01-01',consultant:'Test firm'};
test('updated case becomes complete when surgery, type and operation are on its stoma',()=>{
  const c=setup(),p={...demo,stomas:[{formed_date:'2020-01-01',type:'End colostomy',operation:'Operation recorded'}]};
  assert.equal(c.patientIsIncomplete(p),false);assert.equal(c.patientMissingFields(p).length,0);
});
test('closed and refashioned stoma operation notes still count as history',()=>{
  const c=setup();for(const kind of ['first','initial','later','refashion']){
    const p={...demo,stomas:[{kind,formed_date:'2020-01-01',type:'End colostomy',present:false,comments:'Operation and findings recorded'}]};
    assert.equal(c.patientIsIncomplete(p),false,kind);
  }
});
test('a stoma without operation details remains incomplete and names the missing field',()=>{
  const c=setup(),p={...demo,stomas:[{formed_date:'2020-01-01',type:'End colostomy',operation:'  ',comments:''}]};
  assert.equal(c.patientIsIncomplete(p),true);assert.equal(c.patientMissingFields(p).join(', '),'Operation performed');
});
test('legacy operation fields still count while other missing demographics remain incomplete',()=>{
  const c=setup(),p={...demo,surgery_date:'2020-01-01',stoma_type:'End colostomy',findings:'Legacy operation'};
  assert.equal(c.patientIsIncomplete(p),false);p.locality='';assert.equal(c.patientIsIncomplete(p),true);
  assert.equal(c.patientMissingFields(p).join(', '),'Locality');
});
