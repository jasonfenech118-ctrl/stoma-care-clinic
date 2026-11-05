const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');return html.slice(i,html.indexOf('\n}',i)+2);};
test('single-year filters and configurations retain unknown types and exclude other years',()=>{
 const dom=new JSDOM('<div id="da-body"></div>');
 const year=new Date().getFullYear();
 const c=vm.createContext({document:dom.window.document,Date,daYearsBack:'current',daView:'stoma-types',htmlSafe:String,daSubTabs:()=>'',daCard:(k,t,s,b)=>s+b,daStomaGroup:t=>/ileostomy/i.test(t)?'Ileostomy':/colostomy/i.test(t)?'Colostomy':'Other',dataAnalysisRows:[
 {stoma_type:'End Ileostomy',surgery_date:`${year}-01-01`},
 {stoma_type:'Double barrel Colostomy',surgery_date:`${year}-01-01`},
 {stoma_type:'Loop sigmoid Colostomy',surgery_date:`${year-1}-01-01`},
 {stoma_type:'Ileostomy',surgery_date:`${year}-01-01`},
 {stoma_type:'Urostomy',surgery_date:`${year}-01-01`},
 {stoma_type:'Loop Ileostomy'}]});
 vm.runInContext(['daYear','daYearRange','daRangeLabel','daStomaConfiguration','renderDataAnalysisStomaTypes'].map(fn).join('\n'),c);
 assert.equal(c.daRangeLabel(),String(year));
 c.renderDataAnalysisStomaTypes();
 const rows=()=>[...dom.window.document.querySelectorAll('tbody tr')].map(r=>[...r.cells].map(x=>x.textContent));
 assert.deepEqual(rows(),[['End','1','0','1'],['Double-barrel','0','1','1'],['Loop','0','0','0'],['Not specified','1','0','1'],['Total','2','1','3']]);
 c.daYearsBack='last';assert.equal(c.daRangeLabel(),String(year-1));c.renderDataAnalysisStomaTypes();
 assert.deepEqual(rows()[2],['Loop','0','1','1']);
 for(const text of ['Double-barrel ileostomy','Double–barrelled colostomy','double barrel loop colostomy'])assert.equal(c.daStomaConfiguration(text),'Double-barrel');
});
test('inline scripts parse',()=>{
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
});
test('reasons use explicit operation information and retain ambiguous records for review',()=>{
 const c=vm.createContext({});
 vm.runInContext(fn('patientOperationText')+'\n'+fn('daFormationReasons'),c);
 const classify=(procedure_performed,findings)=>Array.from(c.daFormationReasons({procedure_performed,findings}));
 assert.deepEqual(classify('Hartmann procedure'),['Needs review']);
 assert.deepEqual(classify('Hartmann for perforated diverticulitis'),['Complicated diverticulitis','Bowel emergencies']);
 assert.deepEqual(classify('Anterior resection for rectal cancer with bowel obstruction'),['Cancer','Bowel emergencies']);
 assert.deepEqual(classify('Loop ileostomy to protect bowel anastomosis'),['Protecting a bowel anastomosis']);
 assert.deepEqual(classify('',"Crohn’s disease"),['Inflammatory bowel disease']);
 assert.deepEqual(classify('Hirschsprung disease'),['Congenital conditions']);
 assert.deepEqual(classify('Bowel trauma'),['Injury']);
 assert.deepEqual(classify('Severe faecal incontinence'),['Severe faecal incontinence']);
 assert.deepEqual(classify('No cancer, suspected obstruction'),['Needs review']);
 assert.deepEqual(classify(''),['Not recorded']);
});
