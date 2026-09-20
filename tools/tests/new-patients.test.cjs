const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const start=html.indexOf('let newPatientRows=[];');
const end=html.indexOf('function renderNewPatients(){',start);
assert.ok(start>=0&&end>start,'New Patients source block was not found');
const source=html.slice(start,end);

function fixture(initialRows){
  let databaseRows=initialRows;
  let reads=0;
  let renders=0;
  const body={innerHTML:''};
  const context=vm.createContext({
    patientDirectoryRows:[{
      id:'stale',id_card:'OLD',first_name:'Stale',surname:'Snapshot',
      surgery_date:'1999-01-01',stoma_type:'End colostomy'
    }],
    document:{getElementById:id=>id==='np-body'?body:null},
    fetchPatientsSelect:async()=>({rows:databaseRows,error:null}),
    fetchAllRows:async()=>({rows:databaseRows,error:null}),
    SB:{from:()=>({select(){return this;}})},
    derivedFollowupStatus:()=> 'active',
    parseRefashionings:()=>[],
    parseStomas:()=>[],
    htmlSafe:String,
    renderNewPatients:()=>{renders++;}
  });
  // Count the actual database helper calls without changing the result.
  context.fetchPatientsSelect=async()=>{reads++;return{rows:databaseRows,error:null};};
  vm.runInContext(source,context);
  return{
    context,body,
    setRows:rows=>{databaseRows=rows;},
    reads:()=>reads,
    renders:()=>renders,
    rows:()=>JSON.parse(JSON.stringify(vm.runInContext('newPatientRows.map(r=>({...r}))',context)))
  };
}

test('New Patients ignores a stale Registry screen cache and reads the database',async()=>{
  const app=fixture([{
    id:'fresh',id_card:'123M',first_name:'Joseph',surname:'Ellul',
    surgery_date:'2003-06-10',stoma_type:'End colostomy'
  }]);
  await app.context.loadNewPatients();
  assert.equal(app.reads(),1);
  assert.equal(app.renders(),1);
  assert.deepEqual(app.rows().map(r=>r.id),['fresh']);
  assert.equal(app.rows()[0].date,'2003-06-10');
});

test('Refresh replaces the previous results, including retrospective surgeries',async()=>{
  const app=fixture([{
    id:'one',id_card:'1M',first_name:'First',surname:'Patient',
    surgery_date:'2026-09-01',stoma_type:'Loop ileostomy'
  }]);
  await app.context.loadNewPatients();
  app.setRows([{
    id:'historic',id_card:'2M',first_name:'Historic',surname:'Patient',
    surgery_date:'1988-04-03',stoma_type:'End colostomy'
  }]);
  await app.context.loadNewPatients();
  assert.equal(app.reads(),2);
  assert.deepEqual(app.rows().map(r=>r.id),['historic']);
  assert.equal(app.rows()[0].date,'1988-04-03');
});
