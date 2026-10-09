// A deceased patient's record can be "minimised": only the siting photographs
// are removed, and a compact self-contained HTML summary of the whole profile is
// saved first. These tests cover that summary builder — it must be a standalone
// HTML document carrying the identity, stoma history and the photo-removed count.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const block=html.slice(html.indexOf('function deceasedArchiveHTML('),html.indexOf('async function deceasedSitingIds('));

function build(){
  const sandbox={
    htmlSafe:s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    fmtShortDate:d=>d?('D:'+d):'',
    fmtLabel:d=>'L:'+d,
    psmAge:dob=>dob?57:null,
    patientOutcome:p=>[p.deceased_date?'Deceased on D:'+p.deceased_date:'Deceased','cr-out-deceased'],
    stomaTimeline:p=>p.__stomas||[],
  };
  const fn=new Function(...Object.keys(sandbox),block+';return deceasedArchiveHTML;');
  return fn(...Object.values(sandbox));
}

const PAT={id:'p1',first_name:'Mary',surname:'Borg',id_card:'123M',date_of_birth:'1969-01-01',
  sex:'Female',locality:'Mosta',phone_number:'79000000',consultant:'Mr Grech',deceased_date:'2026-10-01',
  __stomas:[{formed:'2020-03-02',type:'End colostomy',location:'LIF'},
            {formed:'2018-06-01',type:'Loop ileostomy',location:'RIF',ended:'2019-01-01'}]};

test('the summary is a self-contained HTML document for that patient',()=>{
  const out=build()(PAT,{photoCount:2,apptCount:4,encounterCount:3,episodeCount:1,generatedBy:'Nurse X'});
  assert.match(out,/^<!DOCTYPE html>/);
  assert.match(out,/Mary Borg/);
  assert.match(out,/123M/);
  assert.match(out,/End colostomy/);
  assert.match(out,/Deceased/);
});

test('it records how many photographs were removed, pluralised',()=>{
  const two=build()(PAT,{photoCount:2});
  assert.match(two,/2 stoma-siting photographs removed/);
  const one=build()(PAT,{photoCount:1});
  assert.match(one,/1 stoma-siting photograph removed/);
});

test('a blank field reads "Not recorded", never undefined',()=>{
  const out=build()({id:'p2',first_name:'Jo',surname:'Doe',deceased_date:'2026-10-05'},{photoCount:0});
  assert.match(out,/Not recorded/);
  assert.doesNotMatch(out,/undefined/);
});
