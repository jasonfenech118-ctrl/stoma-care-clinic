// The patient profile lists every saved version of an encounter in a dropdown
// (newest on top, each opening that exact version) and offers Print buttons for
// the whole profile and for a single inpatient admission.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const je=fs.readFileSync(path.join(__dirname,'../../assets/jason-encounters.js'),'utf8');
function fn(name){let i=html.indexOf('async function '+name+'(');if(i<0)i=html.indexOf('function '+name+'(');assert.ok(i>=0,name+' not found');return html.slice(i,html.indexOf('\n}',i)+2);}

function ctx(extra={}){
  const c=vm.createContext({Number,String,Array,JSON,Boolean,
    htmlSafe:v=>String(v==null?'':v).replaceAll('&','&amp;').replaceAll('<','&lt;'),
    jsSafe:v=>String(v==null?'':v),
    fmtShortDate:d=>String(d),
    TODAY:'2026-11-01',
    ...extra});
  return c;
}

test('a single-version encounter shows no versions dropdown',()=>{
  const c=ctx({window:{JasonEncounters:{versions:()=>[{version:1,saved_at:'2026-10-01',author_name:'Nurse A'}]}}});
  vm.runInContext(fn('encounterVersionsControl'),c);
  assert.equal(c.encounterVersionsControl('p1',{id:'e1'}),'');
});

test('multiple versions list newest first and open that exact version',()=>{
  const vs=[{version:1,saved_at:'2026-10-01',author_name:'Nurse A'},
            {version:2,saved_at:'2026-10-03',author_name:'Nurse B'},
            {version:3,saved_at:'2026-10-05',author_name:'Nurse C'}];
  const c=ctx({window:{JasonEncounters:{versions:()=>vs}}});
  vm.runInContext(fn('encounterVersionsControl'),c);
  const out=c.encounterVersionsControl('p1',{id:'e9',created_at:'2026-10-01'});
  assert.match(out,/All versions/);
  assert.match(out,/class="clr-count">3</);
  // newest (V3) appears before V2 and V1
  assert.ok(out.indexOf('V3')<out.indexOf('V2'));
  assert.ok(out.indexOf('V2')<out.indexOf('V1'));
  // each button opens its own version number for the right patient + encounter
  assert.match(out,/openEncounter\('p1','e9',3\)/);
  assert.match(out,/openEncounter\('p1','e9',2\)/);
  assert.match(out,/openEncounter\('p1','e9',1\)/);
});

test('a seen visit with one review version shows no versions dropdown',()=>{
  const c=ctx({window:{VisitStomaReview:{versionsOf:()=>[{version:1,saved_at:'2026-10-01',author_name:'Nurse A',stomas:[]}]}}});
  vm.runInContext(fn('visitReviewVersionsControl'),c);
  assert.equal(c.visitReviewVersionsControl({id:'a1',appt_date:'2026-10-01'}),'');
});

test('a seen visit review with several versions lists newest first and opens that exact version',()=>{
  const vs=[{version:1,saved_at:'2026-10-01',author_name:'Nurse A',stomas:[]},
            {version:2,saved_at:'2026-10-03',author_name:'Nurse B',stomas:[]},
            {version:3,saved_at:'2026-10-05',author_name:'Nurse C',stomas:[]}];
  const c=ctx({window:{VisitStomaReview:{versionsOf:()=>vs}}});
  vm.runInContext(fn('visitReviewVersionsControl'),c);
  const out=c.visitReviewVersionsControl({id:'a9',appt_date:'2026-10-01'});
  assert.match(out,/All versions/);
  assert.match(out,/class="clr-count">3</);
  assert.ok(out.indexOf('V3')<out.indexOf('V2'));
  assert.ok(out.indexOf('V2')<out.indexOf('V1'));
  // each button opens its own version index (0-based) for the right appointment
  assert.match(out,/openVisitReview\('a9',\{version:2\}\)/);
  assert.match(out,/openVisitReview\('a9',\{version:1\}\)/);
  assert.match(out,/openVisitReview\('a9',\{version:0\}\)/);
});

test('openVisitReview honours a passed version index instead of defaulting to the latest',()=>{
  const open=fn('openVisitReview');
  assert.match(open,/opts\.version!=null\?opts\.version:null/);
});

test('the patient dashboard orders Appointments & episodes above Stomas and Outcome',()=>{
  // The history section is moved directly under the patient overview, so it sits
  // above Stomas & surgery and Outcome.
  assert.match(html,/const histSection=patientDashboardSection\(history,'Appointments & episodes',false\);/);
  assert.match(html,/if\(home&&histSection\)home\.after\(histSection\);/);
});

test('JasonEncounters.open accepts a version number and resolves it to an index',()=>{
  // The open() handler maps a passed version number to the version index it
  // then selects, so the profile can open V2 directly rather than the latest.
  const open=je.slice(je.indexOf('async function open('),je.indexOf('\n  }',je.indexOf('async function open('))+4);
  assert.match(open,/versionNumber=null/);
  assert.match(open,/versionNumber!=null/);
  assert.match(open,/selectRecord\(recordId,idx\)/);
});

test('the profile and admission Print buttons are wired to their functions',()=>{
  assert.match(html,/onclick="printPatientProfile\(\)"/);
  assert.match(html,/onclick="printCareEpisode\(\)"/);
  assert.ok(html.includes('function printPatientProfile('),'printPatientProfile defined');
  assert.ok(html.includes('function printCareEpisode('),'printCareEpisode defined');
});

test('printPatientProfile warns and does nothing when no profile is open',()=>{
  let alerted='',opened=0;
  const c=ctx({
    document:{querySelector:()=>null},
    clrState:{patient:null},
    alert:m=>{alerted=m;},
    window:{open:()=>{opened++;return null;}}
  });
  vm.runInContext(fn('printPatientProfile'),c);
  c.printPatientProfile();
  assert.match(alerted,/Open a patient profile/);
  assert.equal(opened,0);
});

test('prepPrintClone opens sections, reveals panels and drops interactive chrome',()=>{
  // A tiny fake DOM node tree exercising the clone/strip contract.
  function node(tag,attrs={},kids=[]){
    const n={tag,attrs:{...attrs},kids:kids.slice(),open:attrs.open||false,
      cloneNode(){return node(tag,{...this.attrs},this.kids.map(k=>k.cloneNode()));},
      removeAttribute(a){delete this.attrs[a];},
      _all(sel,acc){this.kids.forEach(k=>{if(k._match(sel))acc.push(k);k._all(sel,acc);});return acc;},
      _match(sel){ // supports 'details','[hidden]','button'
        if(sel==='details')return this.tag==='details';
        if(sel==='[hidden]')return 'hidden' in this.attrs;
        return this.tag===sel;},
      querySelectorAll(sel){
        // multiple comma selectors: handle 'details', '[hidden]', and the button bundle
        if(sel==='details')return this._all('details',[]);
        if(sel==='[hidden]')return this._all('[hidden]',[]);
        const names=sel.split(',').map(s=>s.trim());
        const out=[];this.kids.forEach(k=>{if(names.some(nm=>k._match(nm)))out.push(k);k.querySelectorAll(sel).forEach(x=>out.push(x));});return out;},
      remove(){/* detached from parent via filter below */ this._removed=true;},
      get innerHTML(){return 'clone';}
    };
    return n;
  }
  const det=node('details',{},[]);
  const hid=node('section',{hidden:''},[]);
  const btn=node('button',{},[]);
  const root=node('div',{},[det,hid,btn]);
  // remove() marks nodes; verify the selectors reach them
  const c=ctx();vm.runInContext(fn('prepPrintClone'),c);
  const clone=c.prepPrintClone(root);
  // details opened, hidden revealed, button flagged removed
  assert.equal(clone.kids[0].open,true);
  assert.ok(!('hidden' in clone.kids[1].attrs));
  assert.equal(clone.kids[2]._removed,true);
});
