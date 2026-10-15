// A pending rod (recorded, not yet removed) must be VISIBLE on the handover row
// as a colour-coded chip — and still carry the hidden print data so the ward
// sheet prints "rod due <date>". A removed rod, or none, shows nothing.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};

function ctx(){
  const c=vm.createContext({
    htmlSafe:v=>String(v==null?'':v),
    fmtShortDate:v=>String(v||''),
    daysUntilDate:()=>2   // "Due in 2 days" → hv-flange-soon
  });
  ['flangeDueMeta','handoverRodPrintCarrier'].forEach(n=>vm.runInContext(fn(n),c));
  return c;
}

test('a pending rod renders a visible chip carrying the print data',()=>{
  const c=ctx();
  const out=c.handoverRodPrintCarrier({id:'p1',rod_removal_date:'2026-10-17',rod_removed_date:null});
  assert.match(out,/hv-rod-print/);                 // print still reads it
  assert.match(out,/data-rodprint="rod due 2026-10-17"/);
  assert.match(out,/hv-rodchip/);                   // visible chip class
  assert.doesNotMatch(out,/hidden/);                // not hidden any more
  assert.match(out,/🔩 Rod due/);
  assert.match(out,/openComplicationPicker\('p1','Handover'\)/);
});

test('a removed rod, or no rod, shows nothing',()=>{
  const c=ctx();
  assert.equal(c.handoverRodPrintCarrier({id:'p1',rod_removal_date:'2026-10-17',rod_removed_date:'2026-10-18'}),'');
  assert.equal(c.handoverRodPrintCarrier({id:'p1',rod_removal_date:null,rod_removed_date:null}),'');
});
