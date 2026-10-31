// Appliances, flanges and bags are one selection per stoma; accessories stay
// multiple-selection. onApplianceChange enforces this in the picker panels.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};

function setup(t){
  const chk=(v)=>'<label class="ap-chk"><input type="checkbox" class="ap-box" value="'+v+'" onchange="onApplianceChange(this)"></label>';
  const dom=new JSDOM(
    '<div class="ap-panel" id="of-onepiece">'+chk('A')+chk('B')+chk('C')+'</div>'+
    '<div class="ap-panel" id="of-flanges">'+chk('F1')+chk('F2')+'</div>'+
    '<div class="ap-panel" id="of-accessories">'+chk('None')+chk('Paste')+chk('Powder')+'</div>',
    {runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;
  w.eval('function filterApplianceList(){} function updateApplianceSummary(){}');
  w.eval(fn('onApplianceChange'));
  return w;
}
const box=(w,v)=>w.document.querySelector('.ap-box[value="'+v+'"]');
// JSDOM (outside-only) does not fire inline onchange handlers, so drive the
// handler directly — as the other appliance tests do.
const tick=(w,v)=>{const b=box(w,v);b.checked=true;w.onApplianceChange(b);};

test('a one-piece appliance panel keeps only the latest choice',t=>{
  const w=setup(t);
  tick(w,'A');assert.equal(box(w,'A').checked,true);
  tick(w,'B');
  assert.equal(box(w,'B').checked,true);
  assert.equal(box(w,'A').checked,false,'picking B clears A');
  tick(w,'C');
  assert.equal(box(w,'C').checked,true);
  assert.equal(box(w,'B').checked,false);
});

test('a flange panel is independent and also single-selection',t=>{
  const w=setup(t);
  tick(w,'F1');tick(w,'F2');
  assert.equal(box(w,'F2').checked,true);
  assert.equal(box(w,'F1').checked,false);
  // a one-piece choice does not clear the flange panel (separate panels)
  tick(w,'A');
  assert.equal(box(w,'F2').checked,true,'flange stays when an appliance is picked');
});

test('accessories remain multiple-selection, with the None exclusivity intact',t=>{
  const w=setup(t);
  tick(w,'Paste');tick(w,'Powder');
  assert.equal(box(w,'Paste').checked,true);
  assert.equal(box(w,'Powder').checked,true,'two accessories can both be selected');
  tick(w,'None');
  assert.equal(box(w,'Paste').checked,false);
  assert.equal(box(w,'Powder').checked,false,'None clears the others');
  tick(w,'Paste');
  assert.equal(box(w,'None').checked,false,'picking an accessory clears None');
});
