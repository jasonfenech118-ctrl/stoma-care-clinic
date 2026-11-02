const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(process.env.ARCHIVE_TEST_SOURCE||path.join(__dirname,'../../assets/discharge-archive.js'),'utf8');
function context(){let n=0;const c=vm.createContext({console,crypto:{randomUUID:()=>`letter-${++n}`},htmlSafe:s=>String(s??'').replace(/[&<>"']/g,x=>'&#'+x.charCodeAt(0)+';'),jsSafe:String});vm.runInContext(source,c);return c;}
const snapshot={patient:{id:'123M'},stomas:[{uid:'base'}]};
const payload={patientIdNo:'123M',html:'<html><body>Saved wording</body></html>',text:'Saved wording',filename:'Example_123M',date:'29/10/2026',author:'Nurse'};
test('save retains the selected patient and stoma, avoids duplicate saves and creates changed copies',async()=>{const c=context(),win={},writes=[];c.document={getElementById:()=>null};c.SB={auth:{getUser:async()=>({data:{user:{id:'staff',email:'staff@example.test'}}})},from:table=>({insert:async row=>{assert.equal(table,'patient_discharge_letters');writes.push(row);return{};}})};c.registerDischargeLetterWindow('token','patient-1',win,snapshot);const id=await c.savePatientDischargeLetter('token',win,payload);assert.equal(await c.savePatientDischargeLetter('token',win,payload),id);assert.equal(writes.length,1);assert.equal(writes[0].patient_id,'patient-1');assert.equal(writes[0].created_by,'staff');assert.deepEqual(Array.from(writes[0].stoma_uids),['base']);assert.equal(writes[0].letter_html,payload.html);await c.savePatientDischargeLetter('token',win,{...payload,html:'<html>Changed wording</html>'});assert.equal(writes.length,2);assert.notEqual(writes[0].id,writes[1].id);});
test('wrong window and mismatched patient ID cannot save a letter',async()=>{const c=context(),win={};c.registerDischargeLetterWindow('token','patient-1',win,snapshot);await assert.rejects(c.savePatientDischargeLetter('token',{},payload),/Reopen/);await assert.rejects(c.savePatientDischargeLetter('token',win,{...payload,patientIdNo:'OTHER'}),/ID number differs/);});
test('autosave inserts one row then updates it in place on later changes, skipping unchanged content',async()=>{
  const c=context(),win={},writes=[],updates=[],filters=[];
  c.document={getElementById:()=>null};
  const q={insert:async row=>{writes.push(row);return{};},
    update(row){this._row=row;return this;},eq(k,v){filters.push([k,v]);if(k==='patient_id')updates.push(this._row);return this;}};
  c.SB={auth:{getUser:async()=>({data:{user:{id:'staff',email:'staff@example.test'}}})},from:()=>q};
  c.registerDischargeLetterWindow('token','patient-1',win,snapshot);
  const id1=await c.autosaveDischargeLetter('token',win,payload);          // first change → insert
  assert.equal(writes.length,1);
  assert.equal(writes[0].patient_id,'patient-1');
  assert.equal(writes[0].letter_html,payload.html);
  const id2=await c.autosaveDischargeLetter('token',win,payload);          // unchanged → no write
  assert.equal(id2,id1);
  assert.equal(writes.length,1);assert.equal(updates.length,0);
  await c.autosaveDischargeLetter('token',win,{...payload,html:'<html>Changed wording</html>'}); // change → update same row
  assert.equal(writes.length,1,'no second insert');
  assert.equal(updates.length,1,'the same row is updated');
  assert.equal(updates[0].letter_html,'<html>Changed wording</html>');
  assert(filters.some(([k,v])=>k==='id'&&v===id1));
  assert(filters.some(([k,v])=>k==='patient_id'&&v==='patient-1'));
});
test('autosave refuses the wrong window or a mismatched patient ID',async()=>{
  const c=context(),win={};c.registerDischargeLetterWindow('token','patient-1',win,snapshot);
  await assert.rejects(c.autosaveDischargeLetter('token',{},payload),/Reopen/);
  await assert.rejects(c.autosaveDischargeLetter('token',win,{...payload,patientIdNo:'OTHER'}),/ID number differs/);
});
test('past letter list is patient scoped and safely displays labels',()=>{const c=context();const out=c.dischargeArchiveHTML({id:'p',first_name:'<script>',id_card:'123M'},[{id:'old',letter_date:'28/10/2026',created_at:'2026-10-28T12:00:00Z',created_by_name:'Nurse'}]);assert.match(out,/Past discharge letters/);assert.match(out,/Create new discharge letter/);assert.match(out,/Open letter/);assert.doesNotMatch(out,/<script>/);});
test('saved letter viewer filters by patient and uses a script-free sandbox',async()=>{const c=context(),filters=[],frames=[];const host={innerHTML:'',append:f=>frames.push(f),scrollIntoView:()=>{}};c.document={getElementById:()=>host,createElement:()=>({style:{},setAttribute(k,v){this[k]=v;}})};vm.runInContext("dischargeArchiveContext={patientId:'patient-1'}",c);const q={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},single:async()=>({data:{id:'letter',letter_html:'<html>Past wording</html>'}})};c.SB={from:()=>q};await c.viewSavedDischargeLetter('letter');assert(filters.some(([k,v])=>k==='patient_id'&&v==='patient-1'));assert(filters.some(([k,v])=>k==='id'&&v==='letter'));assert.equal(frames.length,1);assert.equal(frames[0].srcdoc,'<html>Past wording</html>');assert(!frames[0].sandbox.includes('allow-scripts'));});
test('a saved letter is gzip-compressed and round-trips; old plain letters still read back',async()=>{
  const c=vm.createContext({CompressionStream,DecompressionStream,Response,TextEncoder,TextDecoder,Uint8Array,btoa,atob,String,Array,Promise});
  vm.runInContext(source,c);
  const html='<html><head><style>body{font:14px Arial}</style></head><body>'+'<p>Dear Community Nurses, discharged well.</p>'.repeat(300)+'</body></html>';
  const stored=await c.dischargeCompress(html);
  assert.ok(stored.startsWith('GZ:'),'stored value is marked compressed');
  assert.ok(stored.length<html.length/3,'compressed copy is much smaller');
  assert.equal(await c.dischargeDecompress(stored),html);                                   // round-trips exactly
  assert.equal(await c.dischargeDecompress('<html>plain old letter</html>'),'<html>plain old letter</html>');  // legacy rows unchanged
});
test('editing a saved letter re-aims autosave at that row, so the first change updates it (no new copy)',async()=>{
  const c=context(),win={},writes=[],updates=[],filters=[];
  c.document={getElementById:()=>null};
  const q={insert:async row=>{writes.push(row);return{};},
    update(row){this._row=row;return this;},eq(k,v){filters.push([k,v]);if(k==='patient_id')updates.push(this._row);return this;}};
  c.SB={auth:{getUser:async()=>({data:{user:{id:'staff',email:'s@x'}}})},from:()=>q};
  // Register the window pre-aimed at an existing saved letter id.
  c.registerDischargeLetterWindow('token','patient-1',win,snapshot,'letter-42');
  const id=await c.autosaveDischargeLetter('token',win,{...payload,html:'<html>Edited in the full editor</html>'});
  assert.equal(id,'letter-42','autosave keeps the same row id');
  assert.equal(writes.length,0,'no new row inserted');
  assert.equal(updates.length,1,'the existing row is updated');
  assert.equal(updates[0].letter_html,'<html>Edited in the full editor</html>');
  assert(filters.some(([k,v])=>k==='id'&&v==='letter-42'));
  assert(filters.some(([k,v])=>k==='patient_id'&&v==='patient-1'));
});
test('the saved row stores the compressed html and drops the unused letter_text',async()=>{
  const c=vm.createContext({console,crypto:{randomUUID:()=>'letter-x'},CompressionStream,DecompressionStream,Response,TextEncoder,TextDecoder,Uint8Array,btoa,atob,String,Array,Promise,JSON,Object});
  vm.runInContext(source,c);
  const win={},writes=[];
  c.document={getElementById:()=>null};
  c.SB={auth:{getUser:async()=>({data:{user:{id:'staff',email:'s@x'}}})},from:()=>({insert:async row=>{writes.push(row);return{};}})};
  c.registerDischargeLetterWindow('t','p1',win,{patient:{id:'123M'},stomas:[{uid:'base'}]});
  await c.savePatientDischargeLetter('t',win,{patientIdNo:'123M',html:'<html><body>'+'x'.repeat(2000)+'</body></html>',text:'plain text copy',filename:'f',date:'29/10/2026',author:'Nurse'});
  assert.equal(writes.length,1);
  assert.ok(String(writes[0].letter_html).startsWith('GZ:'),'html stored compressed');
  assert.equal(writes[0].letter_text,'','letter_text is not stored');
  assert.equal(await c.dischargeDecompress(writes[0].letter_html),'<html><body>'+'x'.repeat(2000)+'</body></html>');
});
