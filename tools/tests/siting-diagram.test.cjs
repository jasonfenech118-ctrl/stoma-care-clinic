const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert.ok(a>=0&&b>a,`Missing source: ${start}`);
  return html.slice(a,b);
}
function context(){
  let printed='';
  const image={src:''},note={classList:{contains:()=>true},remove(){this.removed=true;}};
  const box={querySelector:()=>image,previousElementSibling:note};
  const c=vm.createContext({URL,location:{href:'https://example.test/clinic/index.html'},
    APP_BUILD:'test-build',SITING_CHECKLIST_ITEMS:[],htmlSafe:s=>s,fmtShortDate:s=>s,
    document:{getElementById:id=>id==='sit-bodymap'?box:null,querySelector:()=>null,querySelectorAll:()=>[]},
    window:{open:()=>({document:{write:s=>{printed=s;},close(){}},print(){}})},
    sitingSeenCtx:{ss:{id:'session',id_card:'TEST',first_name:'Test',surname:'Patient'}},
    renderStomaMarks(){},setTimeout(){},alert:s=>{throw new Error(s);}});
  vm.runInContext(source('const STOMA_MARK_SVG=','/* One marker per stoma'),c);
  vm.runInContext(source('function clearStomaMark(){','// Show the per-item notes'),c);
  vm.runInContext(source('function readSitingChecklist(){','/* Saving the assessment'),c);
  vm.runInContext(source('function printSitingChecklist(){','async function sitingDNTU('),c);
  return {c,image,note,printed:()=>printed};
}
test('unmarked assessments use the replacement; legacy multi-site and single-site assessments retain their diagram',()=>{
  const {c}=context();
  for(const checklist of [null,{}, {stoma_marks:[]}])assert.equal(c.preopBodyMapVersion(checklist),'torso-2026-10');
  for(const checklist of [{stoma_marks:[{x:.4,y:.7},{x:.6,y:.7}]},{stoma_mark:{x:.4,y:.7}}]){
    const version=c.preopBodyMapVersion(checklist);
    assert.equal(version,'legacy');
    assert.match(c.preopBodyMapSrc(version),/\/assets\/preop-abdomen\.jpg\?v=test-build$/);
  }
});
test('save and reload retain the selected diagram with the same marker coordinates',()=>{
  const {c}=context();
  for(const version of ['torso-2026-10','legacy']){
    vm.runInContext(`sitingBodyMapVersion='${version}';sitingStomaMarks=[{x:.42,y:.75},{x:.61,y:.78}];`,c);
    const saved=JSON.parse(JSON.stringify(c.readSitingChecklist()));
    assert.equal(saved.body_map_version,version);
    assert.equal(c.preopBodyMapVersion(saved),version);
    assert.deepEqual(saved.stoma_marks,[{x:.42,y:.75},{x:.61,y:.78}]);
    assert.deepEqual(saved.stoma_mark,saved.stoma_marks[0]);
  }
});
test('printing uses the selected diagram and preserves every marker location',()=>{
  const {c,printed}=context();
  for(const [version,file] of [['torso-2026-10','preop-abdomen-torso.png'],['legacy','preop-abdomen.jpg']]){
    vm.runInContext(`sitingBodyMapVersion='${version}';sitingStomaMarks=[{x:.42,y:.75},{x:.61,y:.78}];`,c);
    c.printSitingChecklist();
    assert.ok(printed().includes(`https://example.test/clinic/assets/${file}?v=test-build`));
    assert.ok(printed().includes('left:42.00%;top:75.00%'));
    assert.ok(printed().includes('left:61.00%;top:78.00%'));
  }
});
test('clearing historical sites starts a new assessment map using the replacement image',()=>{
  const {c,image,note}=context();
  vm.runInContext("sitingBodyMapVersion='legacy';sitingStomaMarks=[{x:.4,y:.7}];",c);
  c.clearStomaMark();
  assert.match(image.src,/preop-abdomen-torso\.png\?v=test-build$/);
  assert.equal(note.removed,true);
  const saved=JSON.parse(JSON.stringify(c.readSitingChecklist()));
  assert.equal(saved.body_map_version,'torso-2026-10');
  assert.deepEqual(saved.stoma_marks,[]);
});
