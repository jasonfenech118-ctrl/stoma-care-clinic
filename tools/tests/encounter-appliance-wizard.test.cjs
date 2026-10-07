// Encounter › Appliances & accessories › "Modify appliance" walks through the
// same picker pages as an appointment, for that one stoma, and hands the pick
// back to the encounter instead of saving it anywhere.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
const plain=x=>JSON.parse(JSON.stringify(x));
function setup(t){
  const dom=new JSDOM('<div id="mb"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  w.eval(`var TODAY='2026-10-08',closed=0,saved=[],picked=[];
    var APPLIANCE_CATALOGUE=[{name:'Salts XND 1338',system:'one',group:'Salts'},{name:'Hollister 24730',system:'one',group:'Hollister'},
      {name:'SH flange 57mm',system:'two',part:'flange',coupling:57},{name:'SH bag 57mm',system:'two',part:'bag',coupling:57},{name:'Gauze',system:'dressing'}];
    var APPLIANCES=APPLIANCE_CATALOGUE.map(a=>a.name),APPLIANCE_ONEPIECE_GROUPS=['Salts','Hollister'];
    function htmlSafe(x){return String(x??'');} function jsSafe(x){return String(x??'');} function fmtShortDate(x){return x;}
    function parseNameList(v){return Array.isArray(v)?v.filter(Boolean):String(v||'').split(',').map(x=>x.trim()).filter(Boolean);}
    function openMo(){} function closeModal(){closed++;} function alert(){} function visitStomaLabel(st){return st.typeLabel;}
    function visitStomaBannerHTML(st){return '<div class="vw-stoma">'+st.typeLabel+'</div>';}
    function stomasPresentOn(){return [{uid:'s1',code:'S1',typeLabel:'End colostomy',meta:'Formed 2026-09-30'}];}
    function applianceGroupHTML(title,items,selected){return items.length?'<div class="ap-group">'+items.map(a=>applianceChkHTML(a.name,selected.includes(a.name))).join('')+'</div>':'';}
    function applianceFamilyGroupsHTML(part,all,selected){return applianceGroupHTML('',all.filter(a=>a.part===part),selected);}
    function applianceCouplings(){return [57];} function accessoryChoices(x){return ['None','Barrier ring','Paste'];}
    function filterApplianceList(){} function updateApplianceSummary(){} function scrollPanelsToTicked(){}
    async function commitEpisodeAppliances(p,rows){saved.push(rows);} async function commitOutcomeFollowup(p,rows){saved.push(rows);}
    var visitWizard=null,esPickerSkipFor=null;`);
  w.eval(['openEncounterApplianceWizard','visitStoma','startVisitStoma','vaFlangeCouplings','vaBagPanelHTML','renderVisitStep','isoPlusDays','flangeDueFieldHTML',
    'visitChooseSystem','captureVisitStep','visitSubSteps','visitNext','visitBack','visitBackToAppointment','commitVisitFromWizard',
    'visitPanelHTML','applianceChkHTML','applianceValues','selectedAppliances'].map(fn).join('\n'));
  return w;
}
const open=(w,current)=>w.eval(`openEncounterApplianceWizard({patient:{id:'p1',first_name:'Alex',surname:'Sample'},uid:'s1',type:'End colostomy',current:${JSON.stringify(current)},onDone:x=>picked.push(x)})`);
const tick=(w,value,on=true)=>{const b=w.document.querySelector('.ap-box[value="'+value+'"]');assert.ok(b,value);b.checked=on;};
const foot=w=>w.document.querySelector('#mb .btn-save');
const back=w=>w.document.querySelector('#mb .btn-cancel');

test('opens on the system page of that stoma, with the current appliance ticked and no Keep same inside the picker',t=>{
  const w=setup(t);open(w,{appliances:['Salts XND 1338'],accessories:['Barrier ring'],flange_due:''});
  const mb=w.document.getElementById('mb');
  assert.match(mb.querySelector('.edit-seen-section').textContent,/Appliance system/);assert.match(mb.textContent,/End colostomy/);
  assert.equal(mb.querySelector('.iv-keep-btn'),null);assert.equal(mb.querySelectorAll('.iv-sys-btn').length,3);
  assert.match(mb.querySelector('.iv-sys-btn.active').textContent,/One-piece/);assert.equal(back(w).textContent,'Back to encounter');
  w.visitNext();assert.equal(w.document.querySelector('.ap-box[value="Salts XND 1338"]').checked,true);
});

test('a one-piece change returns the new appliance and accessories to the encounter, saving nothing',async t=>{
  const w=setup(t);open(w,{appliances:['Salts XND 1338'],accessories:['Barrier ring'],flange_due:''});
  w.visitNext();tick(w,'Salts XND 1338',false);tick(w,'Hollister 24730');w.visitNext();
  assert.equal(foot(w).textContent,'Use in encounter');assert.equal(w.document.querySelector('.ap-box[value="Barrier ring"]').checked,true);
  tick(w,'Paste');w.visitNext();await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(plain(w.eval('picked')),[{uid:'s1',code:'S1',short:'',label:'End colostomy',stoma_type:'End colostomy',appliances:['Hollister 24730'],accessories:['Barrier ring','Paste'],flange_due:'',system:'one'}]);
  assert.equal(w.eval('closed'),1);assert.deepEqual(plain(w.eval('saved')),[]);assert.equal(w.eval('visitWizard'),null);
});

test('a two-piece goes flange (with its due date) → bag → accessories, like an appointment',async t=>{
  const w=setup(t);open(w,{appliances:['Salts XND 1338'],accessories:['None'],flange_due:''});
  w.visitChooseSystem('two');assert.match(w.document.querySelector('.edit-seen-section').textContent,/flange/);
  assert.equal(w.document.getElementById('of-flange-due').value,'2026-10-09');tick(w,'SH flange 57mm');w.document.getElementById('of-flange-due').value='2026-10-11';
  w.visitNext();assert.match(w.document.querySelector('.edit-seen-section').textContent,/bag/);tick(w,'SH bag 57mm');
  w.visitNext();w.visitNext();await new Promise(r=>setTimeout(r,0));
  const got=plain(w.eval('picked'))[0];assert.deepEqual(got.appliances,['SH flange 57mm','SH bag 57mm']);assert.deepEqual(got.accessories,['None']);
  assert.equal(got.flange_due,'2026-10-11');assert.equal(got.system,'two');
});

test('Back to encounter leaves the encounter exactly as it was',async t=>{
  const w=setup(t);open(w,{appliances:['Salts XND 1338'],accessories:['None'],flange_due:''});
  w.visitBack();await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(plain(w.eval('picked')),[]);assert.equal(w.eval('closed'),1);assert.equal(w.eval('visitWizard'),null);assert.equal(w.eval('esPickerSkipFor'),null);
});

test('a stoma with nothing on record starts with no system chosen',t=>{
  const w=setup(t);open(w,{appliances:[],accessories:[],flange_due:''});
  assert.equal(w.document.querySelector('.iv-sys-btn.active'),null);assert.equal(foot(w).disabled,true);
});
