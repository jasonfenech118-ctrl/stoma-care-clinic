const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'../..');
function fixture(t){
  const dom=new JSDOM('<table id="hv-table"><tbody><tr><td>Sample</td></tr></tbody></table>',{runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  dom.window.eval(fs.readFileSync(path.join(root,'assets/surgical-rotation.js'),'utf8'));
  return dom.window;
}
const directory=rows=>({sections:[{name:'Surgery',rows}]});
const row=(name,rs='Senior 1111',hst='Trainee 2222',bst='Basic 3333')=>[name,rs,hst,bst,''];
const plain=v=>JSON.parse(JSON.stringify(v));

test('firm contacts resolve titles, initials and compound surnames without guessing another person',t=>{
  const w=fixture(t),lookup=w.SurgicalRotation.handoverContacts;
  const data=directory([row('Mr. Alex Example 79000001'),row('Ms. Beatrice Sample-Name 79000002')]);
  assert.equal(lookup(data,'Mr.A.Example').status,'matched');
  assert.equal(lookup(data,'Ms. B. Sample Name').status,'matched');
  assert.equal(lookup(data,'Mr. B. Example').status,'unmatched');
  assert.equal(lookup(data,'Mr. Example').status,'unmatched','a surname alone does not select a team');
  assert.equal(lookup(data,'').status,'unmatched');
  const ambiguous=directory([row('Mr. Alex Example'),row('Mr. Andrew Example')]);
  assert.equal(lookup(ambiguous,'Mr. A. Example').status,'ambiguous');
  assert.equal(lookup(ambiguous,'Mr. Alex Example').status,'matched','an exact full name resolves its own team');
});

test('HST is preferred, RS is the fallback, and shared numbers are retained only for the matched firm',t=>{
  const w=fixture(t),lookup=w.SurgicalRotation.handoverContacts;
  const data=directory([row('Mr. Alex Example','Senior 1111','First 2222 Second 2345','Basic 3333'),
    row('Mr. Bruno Other','Senior 4444','','Basic 5555'),row('Mr. Alex Example','Senior 1111','First 2222','Extra 3456')]);
  assert.deepEqual(plain(lookup(data,'Mr. A. Example')),{status:'matched',senior:{role:'HST',numbers:['2222','2345']},bst:['3333','3456']});
  assert.deepEqual(plain(lookup(data,'Mr. B. Other')),{status:'matched',senior:{role:'RS',numbers:['4444']},bst:['5555']});
  const missing=lookup(directory([row('Mr. Alex Example','Senior only','Trainee only','')]),'Mr. A. Example');
  assert.deepEqual(plain(missing.senior.numbers),[]);assert.deepEqual(plain(missing.bst),[]);
});

test('excluded specialties cannot supply printed contact matches',t=>{
  const w=fixture(t);
  const data={sections:[{name:'Urology Surgery',rows:[row('Mr. Alex Example')]},{name:'Surgery',rows:[row('Mr. Bruno Other')]}]};
  assert.equal(w.SurgicalRotation.handoverContacts(data,'Mr. A. Example').status,'unmatched');
  assert.equal(w.SurgicalRotation.handoverContacts(data,'Mr. B. Other').status,'matched');
});

test('a fresh read works without opening the rotation page and never reuses contacts after a failed read',async t=>{
  const w=fixture(t),reads=[];let result={data:{data:directory([row('Mr. Alex Example')]),updated_at:'2026-10-27T16:06:00Z'},error:null};
  const db={from:table=>{reads.push(table);return {select:columns=>{assert.equal(columns,'data,updated_at');return {eq:(key,value)=>{
    assert.equal(key,'id');assert.equal(value,1);return {maybeSingle:async()=>result};
  }};}};}};
  assert.equal((await w.SurgicalRotation.handoverDirectory(db)).updated_at,'2026-10-27T16:06:00Z');
  result={data:null,error:{message:'Offline'}};
  assert.equal(await w.SurgicalRotation.handoverDirectory(db),null);
  assert.equal(await w.SurgicalRotation.handoverDirectory({from(){throw Error('Offline');}}),null);
  assert.deepEqual(reads,['surgical_rotation_current','surgical_rotation_current']);
  assert.equal(w.document.getElementById('sr-file'),null);
});

test('printing opens its window during the click, then includes the fresh directory in the paired document',async t=>{
  const w=fixture(t),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const start=source.indexOf('async function printHandover(');
  w.eval(source.slice(start,source.indexOf('\n}',start)+2));
  let release,readStarted=false,options;const writes=[];
  const popup={closed:false,document:{write:html=>writes.push(html),close(){},open(){}}};
  w.open=()=>{assert.equal(readStarted,false);return popup;};
  w.alert=message=>assert.fail(message);
  w.SB={};w.handoverSheetDocHTML=opts=>{options=opts;return '<!DOCTYPE html><p>paired sheet</p>';};
  w.SurgicalRotation.handoverDirectory=async()=>{readStarted=true;return new Promise(resolve=>{release=resolve;});};
  const printing=w.printHandover();assert.equal(writes.length,1);assert.match(writes[0],/Preparing Care Handover and Surgical Details/);
  const saved={data:directory([row('Mr. Alex Example')])};release(saved);await printing;
  assert.equal(options.rotation,saved);assert.equal(options.autoPrint,true);assert.equal(writes.length,2);
});
