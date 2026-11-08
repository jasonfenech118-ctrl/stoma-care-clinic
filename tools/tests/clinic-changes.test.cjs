// Clinic "Changes": default quantity + unit for a changed appliance / accessory.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};
const ctx=vm.createContext({
  APPLIANCE_CATALOGUE:[
    {name:'Stomahesive Flange 45mm',system:'two',part:'flange'},
    {name:'Closed Bag 45mm',system:'two',part:'bag'},
    {name:'Drainable Bag 45mm',system:'two',part:'bag'},
    {name:'Salts XNL1352',system:'one',bagType:'closed'},
    {name:'Generic OnePiece',system:'one'}],
  s5BagKind:item=>{if(!item)return '';if(item.bagType)return item.bagType;const n=String(item.name||'').toLowerCase();if(/uro|transparent/.test(n))return 'urostomy';if(/closed/.test(n))return 'closed';if(/drainable/.test(n))return 'drainable';return '';},
  daStomaGroup:t=>/colo/i.test(t)?'Colostomy':/ileo/i.test(t)?'Ileostomy':'Other'
});
vm.runInContext(fn('changesDefaultQty')+'\nthis.changesDefaultQty=changesDefaultQty;',ctx);
const q=(name,accessory,stomaType)=>ctx.changesDefaultQty({name,accessory:!!accessory,stomaType});
const eq=(r,qty,unit)=>{assert.equal(r.qty,qty);assert.equal(r.unit,unit);};

test('appliance defaults: flange 15/month, closed 60/month, drainable 30/month',()=>{
  eq(q('Stomahesive Flange 45mm'),'15','per month');
  eq(q('Closed Bag 45mm'),'60','per month');
  eq(q('Drainable Bag 45mm'),'30','per month');
  eq(q('Salts XNL1352'),'60','per month');
});

test('one-piece with no tag defaults by stoma type (colostomy 60, ileostomy 30)',()=>{
  assert.equal(q('Generic OnePiece',false,'End colostomy').qty,'60');
  assert.equal(q('Generic OnePiece',false,'Loop ileostomy').qty,'30');
});

test('accessory defaults: adhesive 2, hydrocolloid 15, belt 1; unknown blank',()=>{
  eq(q('Adhesive remover',true),'2','per month');
  eq(q('Hydrocolloid 5x20',true),'15','per month');
  eq(q('Stoma Belt',true),'1','per month');
  eq(q('Filler Paste',true),'','per month');
});
