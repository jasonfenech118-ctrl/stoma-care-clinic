// Data Analysis › Registry › "Incomplete records by year": the pickers and the
// bars only cover years that actually have incomplete records — no empty decades,
// so a lone very old record no longer stretches the chart back to 1966.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const plain=x=>JSON.parse(JSON.stringify(x));
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};

function render(rows){
  const dom=new JSDOM('<div id="da-body"></div>');
  const charts={};
  const c=vm.createContext({
    document:dom.window.document,Date,Math,Map,Set,Number,String,
    dataAnalysisRows:rows,patientDatesAvailable:true,
    PATIENT_REQUIRED_FIELDS:[['surgery_date','Date of surgery']],
    patientIsIncomplete:p=>!!p.inc,
    daSubTabs:()=>'',annualKpi:()=>'',
    daCard:(id,title,note,inner)=>`<section data-card="${id}">${inner}</section>`,
    makeMultiChart:(id,type,labels,datasets)=>{charts[id]={type,labels,data:datasets[0].data};},
    daIncompleteClick:()=>null,openIncompleteList:()=>{},
    Chart:class{},
  });
  vm.runInContext('var daRegFrom=null,daRegTo=null,daRegYear=null;',c);
  vm.runInContext(fn('daYear')+'\n'+fn('renderDataAnalysisRegistry'),c);
  c.renderDataAnalysisRegistry();
  const body=dom.window.document.getElementById('da-body');
  const fromSel=body.querySelector('select[onchange^="setDaRegFrom"]');
  const opts=sel=>[...sel.options].map(o=>o.value);
  return {charts,body,c,chart:id=>({labels:plain(charts[id].labels),data:plain(charts[id].data)}),fromOptions:opts(fromSel),selectedFrom:fromSel.value,
    toOptions:opts(body.querySelector('select[onchange^="setDaRegTo"]')),
    yearOptions:opts(body.querySelector('select[onchange^="setDaRegYear"]'))};
}
const row=(year,inc)=>({id:year+'-'+Math.random(),surgery_date:year?`${year}-06-15`:'',inc});

test('a lone 1966 record no longer drags the chart: only years with incomplete records are shown, gap-free', t=>{
  const rows=[
    row(1966,true),              // one ancient incomplete record
    row(1980,false),             // a complete record in an empty-for-incomplete year
    row(2010,true),row(2010,true),
    row(2011,true),
    row('',true),                // incomplete with no surgery date → Unknown
  ];
  const {chart,fromOptions,toOptions,yearOptions,selectedFrom}=render(rows);
  // The From / To pickers offer only years that have incomplete records.
  assert.deepEqual(fromOptions,['1966','2010','2011']);
  assert.deepEqual(toOptions,['1966','2010','2011']);
  assert.deepEqual(yearOptions,['1966','2010','2011']);
  // 1980 (complete only) and every empty year between are absent — no 1967..2009.
  assert.equal(fromOptions.includes('1980'),false);
  assert.equal(fromOptions.includes('1967'),false);
  // The default spans the first..last incomplete year.
  assert.equal(selectedFrom,'1966');
  // The yearly bars are gap-free: 1966, 2010, 2011, then Unknown — not 1966..2011.
  assert.deepEqual(chart('da-reg-year').labels,['1966','2010','2011','Unknown']);
  assert.deepEqual(chart('da-reg-year').data,[1,2,1,1]);
});

test('with no incomplete surgery years the picker falls back to the current year and never 1966', t=>{
  const nowY=new Date().getFullYear();
  const {fromOptions,chart}=render([row(1990,false),row('',true)]);  // only an undated incomplete
  assert.deepEqual(fromOptions,[String(nowY)]);
  // Only the Unknown bucket has anything to show.
  assert.deepEqual(chart('da-reg-year').labels,['Unknown']);
  assert.deepEqual(chart('da-reg-year').data,[1]);
});

test('the From / To range narrows to the years that have incomplete records', t=>{
  const rows=[row(2008,true),row(2015,true),row(2020,true)];
  const r=render(rows);
  assert.deepEqual(r.chart('da-reg-year').labels,['2008','2015','2020']);
  // Narrow the range and re-render — the bars drop the years outside it.
  r.c.daRegFrom=2015;r.c.daRegTo=2020;
  r.c.renderDataAnalysisRegistry();
  assert.deepEqual(r.chart('da-reg-year').labels,['2015','2020']);
  assert.deepEqual(r.chart('da-reg-year').data,[1,1]);
});
