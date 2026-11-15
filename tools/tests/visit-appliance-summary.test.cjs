// The Complete-visit header fills the Appliance (and Last follow-up) from the
// patient's appointment history. It must work even when the appointment's joined
// patient object came back without an id (a cold-open enrich miss) — using the
// appointment's own patient_id — so the appliance no longer shows "None recorded"
// until the patient profile is opened.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function slice(){
  const s=html.indexOf('async function esFillSummaryExtras(');
  const e=html.indexOf('/* ── The Edit-appointment stepper',s);
  assert.ok(s>=0&&e>s,'esFillSummaryExtras not found');
  return html.slice(s,e);
}

// A chainable Supabase stub. The appliance query selects the appliance columns
// and ends in .limit(); the last-follow-up query selects '*'. Both are keyed by
// patient_id, which we capture to prove the right id was used.
function makeSB(captured){
  const builder=()=>{
    const b={_cols:'',_pid:''};
    b.select=c=>{b._cols=c;return b;};
    b.eq=(k,v)=>{if(k==='patient_id'){b._pid=v;captured.pid=v;}return b;};
    b.neq=()=>b;
    b.order=()=>b;
    b.limit=()=>{
      const appliance=b._cols.includes('stoma_appliances')&&b._cols.startsWith('appt_date');
      if(appliance&&b._pid==='P1')return Promise.resolve({data:[{appliances:['Lentell 201102M (70mm)'],accessories:['Filler Paste']}]});
      return Promise.resolve({data:[]});
    };
    return b;
  };
  return {from:()=>builder()};
}

function run(p,appt){
  const dom=new JSDOM('<body><span id="es-summary-lastfu">…</span><span id="es-summary-appliance">…</span></body>');
  const captured={};
  const ctx=vm.createContext({
    document:dom.window.document,
    SB:makeSB(captured),
    parseNameList:v=>Array.isArray(v)?v.map(x=>String(x).trim()).filter(Boolean):String(v==null?'':v).split(/[,\n]/).map(s=>s.trim()).filter(Boolean),
    fmtShortDate:s=>s,
    esLastOutcomeLabel:()=>'Seen',
    esResume:null,esState:null,console
  });
  vm.runInContext(slice()+'\n;globalThis.__run=esFillSummaryExtras;',ctx);
  return ctx.__run(p,[],appt).then(()=>({doc:dom.window.document,captured}));
}

test('appliance loads from appt.patient_id when the joined patient has no id',async()=>{
  const {doc,captured}=await run({},{id:'A1',patient_id:'P1'});
  assert.equal(captured.pid,'P1','queried by the appointment’s patient_id');
  assert.equal(doc.getElementById('es-summary-appliance').textContent,'Lentell 201102M (70mm), Filler Paste');
});

test('appliance still loads when the joined patient has an id',async()=>{
  const {doc}=await run({id:'P1'},{id:'A1',patient_id:'P1'});
  assert.equal(doc.getElementById('es-summary-appliance').textContent,'Lentell 201102M (70mm), Filler Paste');
});

test('with no patient id anywhere it shows None recorded (no crash)',async()=>{
  const {doc}=await run({},{id:'A1'});
  assert.equal(doc.getElementById('es-summary-appliance').textContent,'None recorded');
});
