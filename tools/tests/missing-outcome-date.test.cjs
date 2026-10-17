const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../index.html'),'utf8');
const start=html.indexOf('function missingSavedOutcomeDate(');
const end=html.indexOf('async function savePatientDates(',start);
function context(p){
 const calls=[];
 const c={calls,clrState:{patient:p},patientIsDeceased:p=>p.followup_status==='deceased'||!!p.deceased_date,
 normaliseFollowupStatus:s=>s,croStatusDate:(p)=>p.reversal_date||'',
 openPatientRecord:async()=>calls.push('record'),switchPatientPanel:k=>calls.push(k),
 patientStomaList:p=>p.stomas||[],openStomaModal:async(id,slot)=>calls.push(slot),
 croAsk:k=>calls.push('ask:'+k),croConfirm:k=>calls.push('date:'+k),document:{getElementById:()=>null}};
 vm.createContext(c);vm.runInContext(html.slice(start,end),c);return c;
}
test('only undated deceased and reversed outcomes need entry',()=>{
 const c=context();
 assert.equal(c.missingSavedOutcomeDate({followup_status:'deceased'}),'deceased');
 assert.equal(c.missingSavedOutcomeDate({followup_status:'deceased',deceased_date:'2026-10-01'}),null);
 assert.equal(c.missingSavedOutcomeDate({followup_status:'reversed'}),'reversed');
 assert.equal(c.missingSavedOutcomeDate({followup_status:'reversed',reversal_date:'2026-10-01'}),null);
 assert.equal(c.missingSavedOutcomeDate({followup_status:'active'}),null);
});
test('opens the date form directly for the saved patient',async()=>{
 for(const key of ['deceased','reversed']){
 const c=context({id:'p1',followup_status:key});await c.promptSavedOutcomeDate('p1',key);
 assert.deepEqual(c.calls,['record','outcomes','ask:'+key,'date:'+key]);}
});
test('undated operation history opens its existing stoma for correction',async()=>{
 const c=context({id:'p1',followup_status:'reversed',stomas:[{slot:'later:x',reversal_unknown:true}]});
 await c.promptSavedOutcomeDate('p1','reversed');assert.deepEqual(c.calls,['record','outcomes','later:x']);
});
test('freshly recorded dates are not prompted again',async()=>{
 const c=context({id:'p1',followup_status:'deceased',deceased_date:'2026-10-01'});
 await c.promptSavedOutcomeDate('p1','deceased');assert.deepEqual(c.calls,['record']);
});
