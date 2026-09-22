const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

function sourceBetween(startText,endText){
  const start=html.indexOf(startText);
  const end=html.indexOf(endText,start);
  assert.ok(start>=0&&end>start,`Source block not found: ${startText}`);
  return html.slice(start,end);
}

test('legacy admin appliance rows are not treated as real appointments',()=>{
  const source=sourceBetween('const LEGACY_ADMIN_APPT_START=','function uniqueNonEmpty');
  const context=vm.createContext({Date,JSON,Object,Array,Number,String});
  vm.runInContext(source,context);
  const base={
    status:'attended',appt_date:'2026-09-22',appt_slot:'09:00:00',
    assigned_to:null,bank_staff_id:null,
    outcome_recorded_at:'2026-09-22T15:45:00.000Z',
    appliances:['Lentell 70mm'],accessories:[],stoma_appliances:[]
  };
  assert.equal(context.isLegacyAdminAppliancePlaceholder(base),true);
  assert.equal(context.isLegacyAdminAppliancePlaceholder({...base,status:'booked'}),false);
  assert.equal(context.isLegacyAdminAppliancePlaceholder({...base,assigned_to:'nurse-1'}),false);
  assert.equal(context.isLegacyAdminAppliancePlaceholder({...base,outcome_recorded_at:'2026-09-23T10:00:00.000Z'}),false);
  assert.equal(context.isLegacyAdminAppliancePlaceholder({...base,appliances:[]}),false);
});

test('Needs Checking flags two registry rows with the exact same ID card',()=>{
  const source=sourceBetween('function computeDuplicateGroups(){','function renderDuplicates(){');
  const context=vm.createContext({
    duplicateRows:[
      {id:'one',id_card:'25605M',first_name:'Catherine',surname:'Zammit'},
      {id:'two',id_card:'25605m ',first_name:'Catherine',surname:'Zammit'}
    ],
    importNameKey:p=>`${p.first_name}|${p.surname}`.toLowerCase(),
    normaliseIdCard:v=>String(v||'').trim().toUpperCase().replace(/\s+/g,'')
  });
  vm.runInContext(source,context);
  const groups=vm.runInContext('computeDuplicateGroups()',context);
  assert.equal(groups.length,1);
  assert.equal(groups[0].strong,true);
  assert.equal(groups[0].reason,'same ID card entered twice');
  assert.equal(groups[0].members.length,2);
});

test('postop worklist counts only real booked or attended follow-ups',()=>{
  assert.match(html,/if\(!\['booked','attended'\]\.includes\(String\(a\.status\|\|''\)\)\)return;/);
  assert.match(html,/\$\{rows\.length\} awaiting · \$\{bookedCount\} booked/);
  assert.doesNotMatch(html,/\$\{waiting\} already booked/);
});

test('postop worklist keeps only the latest discharge for one patient or ID card',()=>{
  const source=sourceBetween('function latestPostopEpisodes(','/* ------------------------------------------------------------------------- *\n * Siting sessions');
  const context=vm.createContext({
    normaliseIdCard:v=>String(v||'').trim().toUpperCase().replace(/\s+/g,'')
  });
  vm.runInContext(source,context);
  const rows=[
    {id:'ep-old',patient_id:'p1',record_date:'2026-09-01',discharge_date:'2026-09-07'},
    {id:'ep-new',patient_id:'p2',record_date:'2026-09-12',discharge_date:'2026-09-19'},
    {id:'ep-other',patient_id:'p3',record_date:'2026-09-17',discharge_date:'2026-09-20'}
  ];
  const patients={
    p1:{id_card:'25605M'},
    p2:{id_card:'25605m '},
    p3:{id_card:'999M'}
  };
  const result=context.latestPostopEpisodes(rows,patients);
  assert.deepEqual(Array.from(result,r=>r.id).sort(),['ep-new','ep-other']);
});
