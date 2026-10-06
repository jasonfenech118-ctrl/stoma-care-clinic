// Complete visit › Appliances: the picker offers "Keep same appliance" only when
// the stoma has an appliance on record, and keeping it records it unchanged.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
function setup(t,{prev,mode='',stomas=[{uid:'s1',code:'S1',typeLabel:'End colostomy'}]}){
  const dom=new JSDOM('<div id="mb"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  w.eval(`var TODAY='2026-10-08',APPLIANCE_CATALOGUE=[];var committed=null;
    function htmlSafe(x){return String(x??'');} function jsSafe(x){return String(x??'');} function fmtShortDate(x){return x;}
    function parseNameList(v){return Array.isArray(v)?v.filter(Boolean):String(v||'').split(',').map(x=>x.trim()).filter(Boolean);}
    function openMo(){} function visitStomaBannerHTML(){return '';} function visitStomaLabel(st){return st.typeLabel;}
    function commitVisitFromWizard(){committed=JSON.parse(JSON.stringify(Object.values(visitWizard.rows)));}
    var visitWizard=null;`);
  w.eval(fn('visitStoma')+fn('renderVisitStep')+fn('visitKeepSame'));
  w.eval(`visitWizard=${JSON.stringify({pending:{mode,date:'2026-10-08',slot:'08:30'},patient:{first_name:'Stephen',surname:'Fava'},stomas,prev,rows:{},chosen:stomas[0].uid,step:'system',system:'',work:{appliances:[],accessories:[]}})};renderVisitStep();`);
  return w;
}
const keep=w=>w.document.querySelector('.iv-keep-btn');

test('first appliance: no Keep same button — only one-piece, two-piece or dressing',t=>{
  const w=setup(t,{prev:{s1:{appliances:[],accessories:[]}}});
  assert.equal(keep(w),null);assert.equal(w.document.querySelectorAll('.iv-sys-btn').length,3);
});

test('an appliance on record offers Keep same appliance, which records it unchanged',t=>{
  const w=setup(t,{prev:{s1:{appliances:['Little Ones'],accessories:['Barrier ring'],flange_due:''}}});
  assert.ok(keep(w));assert.match(keep(w).textContent,/Keep same appliance/);assert.match(keep(w).textContent,/Little Ones · Barrier ring/);
  assert.equal(keep(w).getAttribute('onclick'),'visitKeepSame()');w.visitKeepSame();
  assert.deepEqual(JSON.parse(JSON.stringify(w.eval('committed').map(r=>({app:r.appliances,acc:r.accessories,kept:r.kept})))),[{app:['Little Ones'],acc:['Barrier ring'],kept:true}]);
});

test('the ward handover picker never offers Keep same (nothing to keep there)',t=>{
  const w=setup(t,{mode:'episode',prev:{s1:{appliances:['Little Ones'],accessories:[]}}});
  assert.equal(keep(w),null);
});
