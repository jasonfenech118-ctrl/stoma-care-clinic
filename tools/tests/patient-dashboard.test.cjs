const {JSDOM}=require('jsdom');const fs=require('fs'),assert=require('assert/strict');
const dom=new JSDOM(`<div id="page-patient-record"><div class="psm-page"><div class="psm-page-bar"><button>Back</button><button>Registry</button></div><div class="psm"><header class="psm-head"><button class="psm-close">Close</button></header><div class="doc-status-card">Patient records</div><nav class="psm-tabs"></nav><section id="psm-demographics"><div class="psm-ov-cols"><div><h3>Patient details</h3><p>Fixture details</p></div><div>Complications</div></div></section><section id="psm-stomas" hidden>Stoma content</section><section id="psm-outcomes" hidden><input type="date"></section><section id="psm-episodes"></section><section id="psm-appts"></section><footer class="psm-foot"></footer></div></div></div>`,{runScripts:'outside-only'});const w=dom.window;
w.htmlSafe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));w.jsSafe=x=>String(x).replace(/'/g,"\\'");w.statusLabel=x=>x;w.fmtShortDate=x=>x;w.openEpisodeIn=rows=>rows.find(r=>r.is_current);w.canPlanReversal=()=>true;
// The patient in this fixture has no stoma recorded, so every record groups under
// the "needs a stoma link" care list. Stub the stoma helpers accordingly.
w.stomaTimeline=()=>[];w.prettyStomaType=x=>x;w.parseEpisodeApplianceRows=()=>[];w.recCode=()=>'';w.clrMeta=x=>x;w.episodeWardBed=r=>r.detail||'';w.patientStomaList=()=>[];w.parseInitialStomas=()=>[];w.parseStomas=()=>[];w.parseRefashionings=()=>[];w.stomaOperationHistory=()=>[];w.wb=()=>'';w.encounterVersionsControl=()=>'';w.visitReviewVersionsControl=()=>'';
w.clrState={patient:{id:'p',proposed_reversal_date:'2026-12-01'},appts:[{id:'a',appt_date:'2026-11-01',status:'booked',staff:{full_name:'Nurse'}}],rows:[{id:'e',kind:'episode',record_date:'2026-09-01',title:'Admission',notes:'<script>unsafe</script>'}],encounters:[{id:'n',encounter_date:'2026-10-20',nursing_report:'Reviewed',created_by_name:'Nurse'}]};
const appSource=fs.readFileSync(require('path').join(__dirname,'../../index.html'),'utf8');w.eval(appSource.slice(appSource.indexOf('/* The patient record is a full page;'),appSource.indexOf('function switchPatientPanel(which){')));w.arrangePatientDashboard();
assert.equal(w.document.querySelector('.pd-patient-details').parentElement.className,'psm');assert.equal(w.document.querySelectorAll('.pd-home-actions button').length,7);assert.equal(w.document.querySelectorAll('.psm-page-bar button').length,1);assert.equal(w.document.querySelectorAll('.pd-care-list').length,1);assert.equal(w.document.querySelectorAll('.pd-history-table tbody tr').length,3);assert.equal(w.document.querySelector('#psm-appts').hidden,true);assert.equal(w.document.querySelector('#psm-stomas').hidden,false);assert.ok(w.document.querySelector('#psm-stomas').closest('details'));
// The added home-action buttons are present; Siting is hidden with no siting session.
{const homeActs=w.document.querySelector('.pd-home-actions').textContent;
 ['Education','Informative literature','Schedule 5','Treatment'].forEach(l=>assert.match(homeActs,new RegExp(l)));
 assert.doesNotMatch(homeActs,/Siting/,'Siting button hidden when the patient has no siting session');}
// Section order under the overview: Appointments & episodes, then Stomas, then Outcome.
{const labels=[...w.document.querySelectorAll('.pd-section>summary')].map(s=>s.textContent);
 assert.ok(labels.indexOf('Appointments & episodes')<labels.indexOf('Stomas & surgery'),'Appointments above Stomas');
 assert.ok(labels.indexOf('Stomas & surgery')<labels.indexOf('Outcome'),'Stomas above Outcome');}
// The Patient records card hides while Appointments & episodes is open.
{const card=w.document.querySelector('.doc-status-card');
 const hist=[...w.document.querySelectorAll('.pd-section')].find(d=>d.querySelector('summary')?.textContent==='Appointments & episodes');
 assert.ok(card&&hist,'doc-status-card and Appointments section present');
 assert.equal(card.hidden,false,'card shown while section is closed');
 hist.open=true;hist.dispatchEvent(new w.Event('toggle'));
 assert.equal(card.hidden,true,'card hidden once the section is open');
 hist.open=false;hist.dispatchEvent(new w.Event('toggle'));
 assert.equal(card.hidden,false,'card shown again when the section closes');}
// Siting button opens the patient's existing siting session for viewing/amending.
{let editId=null;w.openSitingEdit=id=>{editId=id;};
 w.clrState.siting={id:'s9',id_card:'X'};w.openPatientSiting();
 assert.equal(editId,'s9','opens the existing siting session by id');}
let html=w.patientDashboardHistoryHTML();let tmp=w.document.createElement('div');tmp.innerHTML=html;assert.ok(tmp.querySelector('tbody tr'));assert.equal(tmp.querySelector('script'),null);assert.match(tmp.textContent,/<script>unsafe/);w.arrangePatientDashboard();assert.equal(w.document.querySelectorAll('#pd-history').length,1);
w.clrState.appts.push({id:'b',appt_date:'2026-12-01',status:'booked'});w.refreshPatientDashboardHistory();assert.equal(w.document.querySelectorAll('.pd-history-table tbody tr').length,4);
w.clrState.appts=[];w.clrState.rows=[];w.clrState.encounters=[];assert.match(w.patientDashboardHistoryHTML(),/No stomas or clinical records recorded yet/);
// 📚 Education: the booklet is wired to the patient's stoma type.
{assert.equal(w.educationKeyForStoma('End urostomy'),'urostomy');
 assert.equal(w.educationKeyForStoma('Ileal conduit'),'urostomy');
 assert.equal(w.educationKeyForStoma('Loop ileostomy'),'ileostomy');
 assert.equal(w.educationKeyForStoma('End colostomy'),'colostomy');
 assert.equal(w.educationKeyForStoma('End colostomy',10),'paediatric','under 14 gets the paediatric booklet');
 assert.equal(w.educationKeyForStoma('End colostomy',14),'colostomy','14 and over is not paediatric');
 // Adult urostomy patient: the urostomy booklet is offered with Open/Download.
 if(!w.document.getElementById('mb'))w.document.body.insertAdjacentHTML('beforeend','<div id="mb"></div>');
 w.TODAY='2026-11-03';w.APP_BUILD='test';w.openMo=()=>{};w.closeModal=()=>{};
 w.stomasPresentOn=()=>[{type:'End urostomy'}];w.ageYearsBetween=()=>60;
 w.openPatientEducation();
 let em=w.document.getElementById('mb').innerHTML;
 assert.match(em,/Managing your urostomy/);
 assert.match(em,/managing-your-urostomy\.pdf/);
 assert.match(em,/Download/);
 // A colostomy patient has no booklet file yet → shown as being added.
 w.stomasPresentOn=()=>[{type:'End colostomy'}];w.ageYearsBetween=()=>60;
 w.openPatientEducation();
 em=w.document.getElementById('mb').innerHTML;
 assert.match(em,/Booklet being added/);
 assert.doesNotMatch(em,/\.pdf/);}
// 📋 Schedule 5 (Schedule V pharmacy entitlement): one page per recognised
// present stoma type, wired to the type, on the Mater Dei letterhead.
{w.TODAY='2026-11-03';
 const pat={sex:'M',first_name:'Michael',surname:'John',id_card:'29544A',date_of_birth:'1964-05-08'};
 // Urostomy patient → the urostomy entitlement page with its specific items.
 w.stomasPresentOn=()=>[{type:'Urostomy'}];w.ageYearsBetween=()=>62;
 let pages=w.schedule5PagesFor(pat,'logo.png');
 assert.equal(pages.length,1,'one page for one stoma type');
 assert.match(pages[0],/Items from pharmacy: – <u>Urostomy<\/u>/);
 assert.match(pages[0],/Night drainage bags/);
 assert.match(pages[0],/ID No: 29544A/);
 assert.match(pages[0],/DOB: 08\/05\/1964/);
 assert.match(pages[0],/Support Room at Outpatient/);
 assert.doesNotMatch(pages[0],/page-break-before/,'first page has no leading page break');
 // Two stomas of the same type collapse to a single entitlement page.
 w.stomasPresentOn=()=>[{type:'End colostomy'},{type:'Loop colostomy'}];
 pages=w.schedule5PagesFor(pat,'logo.png');
 assert.equal(pages.length,1,'duplicate types de-duplicated');
 assert.match(pages[0],/<u>Colostomy<\/u>/);
 // A double stoma of different types yields one page each, the second breaking.
 w.stomasPresentOn=()=>[{type:'End colostomy'},{type:'Urostomy'}];
 pages=w.schedule5PagesFor(pat,'logo.png');
 assert.equal(pages.length,2,'two distinct types → two pages');
 assert.match(pages[1],/page-break-before:always/,'second page starts a new sheet');
 // Under 14 → the paediatric list regardless of stoma type.
 w.ageYearsBetween=()=>6;w.stomasPresentOn=()=>[{type:'Loop ileostomy'}];
 pages=w.schedule5PagesFor(pat,'logo.png');
 assert.match(pages[0],/<u>Paediatric<\/u>/);
 assert.match(pages[0],/One piece paediatric stoma bags/);
 // No recognised stoma → no page (the button shows a message instead).
 w.ageYearsBetween=()=>62;w.stomasPresentOn=()=>[{type:'Fistula'}];
 assert.equal(w.schedule5PagesFor(pat,'logo.png').length,0);}
const source=appSource;for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new Function(m[1]);
console.log('PASS: details placement, three home actions, retained sections, grouped history, sorting, safe text, refresh, empty history, idempotent layout and script parsing');dom.window.close();
