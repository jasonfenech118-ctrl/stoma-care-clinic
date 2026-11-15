// The patient record's Surgical details column now also shows the current
// appliance & accessories for each stoma (the newest recorded entry).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync(path.join(__dirname,'../../assets/visit-stoma-review.js'),'utf8');

function build(applHist){
  const dom=new JSDOM(`<body><div id="page-patient-record"><div class="pd-page">
    <div class="psm-head"><div class="psm-head-main">Sr. Tarcisia Cortis</div><div class="psm-identity-row"></div></div>
    <div class="pd-patient-details"><div class="psm-audit">Last seen</div></div>
    <div class="psm"></div><div class="psm-foot"></div>
  </div></div></body>`,{runScripts:'outside-only'});
  const w=dom.window;
  Object.assign(w,{
    TODAY:'2026-11-15',isEncounterUser:()=>false,stomasPresentOn:()=>[],complicationTypesList:[],
    htmlSafe:x=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    fmtShortDate:s=>s,patientOperationText:p=>p.procedure_performed||'',
    localityFlagHTML:()=>'',
    patientStomaList:()=>[{uid:'base',type:'End colostomy',consultant:'Mr R Farrugia',formed_date:'2026-04-05'}],
    stomaApplianceHistory:()=>applHist,
    clrState:{patient:{id:'p',address:'Dar Betania',locality:'Msida',phone_number:'79992464',date_of_birth:'1941-11-03',consultant:'Mr R Farrugia',surgery_date:'2026-04-05',stoma_type:'End colostomy',procedure_performed:'Hartmann'},rows:[],appts:[],available:true}
  });
  w.eval(src);
  // The module waits for DOMContentLoaded before wiring the identity integration.
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w.document.querySelector('.pd-patient-details');
}

test('the current appliance and accessories show in Surgical details',()=>{
  const hist=new Map([['base',[{appliances:['Lentell 201102M (70mm)'],accessories:['Filler Paste','Hydrocolloid 20×20'],date:'2026-09-06'}]]]);
  const details=build(hist);
  assert.ok(details,'patient details column exists');
  assert.match(details.innerHTML,/Surgical details/);
  assert.match(details.innerHTML,/Current appliance &amp; accessories/);
  assert.match(details.innerHTML,/Lentell 201102M \(70mm\), Filler Paste, Hydrocolloid 20×20/);
});

test('with no appliance recorded it reads Not recorded, without crashing',()=>{
  const details=build(new Map());
  assert.match(details.innerHTML,/Current appliance &amp; accessories/);
  // The field falls back to "Not recorded" like the other surgical fields.
  const after=details.innerHTML.split('Current appliance &amp; accessories')[1]||'';
  assert.match(after,/Not recorded/);
});
