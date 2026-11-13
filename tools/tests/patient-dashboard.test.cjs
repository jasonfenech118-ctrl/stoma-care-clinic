const {JSDOM}=require('jsdom');const fs=require('fs'),assert=require('assert/strict');
const dom=new JSDOM(`<div id="page-patient-record"><div class="psm-page"><div class="psm-page-bar"><button>Back</button><button>Registry</button></div><div class="psm"><header class="psm-head"><button class="psm-close">Close</button></header><div class="doc-status-card">Patient records</div><nav class="psm-tabs"></nav><section id="psm-demographics"><div class="psm-ov-cols"><div><h3>Patient details</h3><p>Fixture details</p></div><div>Complications</div></div></section><section id="psm-stomas" hidden>Stoma content</section><section id="psm-outcomes" hidden><input type="date"></section><section id="psm-episodes"></section><section id="psm-appts"></section><footer class="psm-foot"></footer></div></div></div>`,{runScripts:'outside-only'});const w=dom.window;
w.htmlSafe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));w.jsSafe=x=>String(x).replace(/'/g,"\\'");w.statusLabel=x=>x;w.fmtShortDate=x=>x;w.openEpisodeIn=rows=>rows.find(r=>r.is_current);w.canPlanReversal=()=>true;
// The patient in this fixture has no stoma recorded, so every record groups under
// the "needs a stoma link" care list. Stub the stoma helpers accordingly.
w.stomaTimeline=()=>[];w.prettyStomaType=x=>x;w.parseEpisodeApplianceRows=()=>[];w.recCode=()=>'';w.clrMeta=x=>x;w.episodeWardBed=r=>r.detail||'';w.patientStomaList=()=>[];w.parseInitialStomas=()=>[];w.parseStomas=()=>[];w.parseRefashionings=()=>[];w.stomaOperationHistory=()=>[];w.wb=()=>'';w.encounterVersionsControl=()=>'';w.visitReviewVersionsControl=()=>'';
w.parseNameList=v=>Array.isArray(v)?v.map(x=>String(x).trim()).filter(Boolean):String(v==null?'':v).split(/[,\n]/).map(s=>s.trim()).filter(Boolean);w.followupMonthName=m=>['','January','February','March','April','May','June','July','August','September','October','November','December'][Number(m)]||'';
w.isFistulaPatient=()=>false;w.normaliseFollowupStatus=s=>s||'active';w.normaliseFollowupType=t=>String(t||'follow_up');
w.clrState={patient:{id:'p',proposed_reversal_date:'2026-12-01'},appts:[{id:'a',appt_date:'2026-11-01',status:'booked',staff:{full_name:'Nurse'}}],rows:[{id:'e',kind:'episode',record_date:'2026-09-01',title:'Admission',notes:'<script>unsafe</script>'}],encounters:[{id:'n',encounter_date:'2026-10-20',nursing_report:'Reviewed',created_by_name:'Nurse'}]};
const appSource=fs.readFileSync(require('path').join(__dirname,'../../index.html'),'utf8');w.eval(appSource.slice(appSource.indexOf('/* The patient record is a full page;'),appSource.indexOf('function switchPatientPanel(which){')));w.arrangePatientDashboard();
assert.equal(w.document.querySelector('.pd-patient-details').parentElement.className,'psm');assert.equal(w.document.querySelectorAll('.pd-home-actions button').length,8);assert.equal(w.document.querySelectorAll('.psm-page-bar button').length,1);assert.equal(w.document.querySelectorAll('.pd-care-list').length,1);assert.equal(w.document.querySelectorAll('.pd-history-table tbody tr').length,3);assert.equal(w.document.querySelector('#psm-appts').hidden,true);assert.equal(w.document.querySelector('#psm-stomas').hidden,false);assert.ok(w.document.querySelector('#psm-stomas').closest('details'));
// The added home-action buttons are present; Siting is hidden with no siting session.
{const homeActs=w.document.querySelector('.pd-home-actions').textContent;
 ['Education','Informative literature','Schedule 5','Treatment','Switch to tele follow-up'].forEach(l=>assert.match(homeActs,new RegExp(l)));
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
// The 📍 Siting button (shown only when a siting session exists) opens the
// patient's siting-session list modal. The old single-session opener that
// collided with that modal's name was removed, so the button no longer runs the
// wrong function and wrongly reports "No siting sessions on record".
assert.match(appSource,/onclick="openPatientSitingSessions\(\)">📍 Siting/,'Siting button wired to the siting-session list');
assert.doesNotMatch(appSource,/function\s+openPatientSiting\s*\(/,'the colliding openPatientSiting opener is gone');
let html=w.patientDashboardHistoryHTML();let tmp=w.document.createElement('div');tmp.innerHTML=html;assert.ok(tmp.querySelector('tbody tr'));assert.equal(tmp.querySelector('script'),null);assert.match(tmp.textContent,/<script>unsafe/);w.arrangePatientDashboard();assert.equal(w.document.querySelectorAll('#pd-history').length,1);
w.clrState.appts.push({id:'b',appt_date:'2026-12-01',status:'booked'});w.refreshPatientDashboardHistory();assert.equal(w.document.querySelectorAll('.pd-history-table tbody tr').length,4);
// Handover / ward appliance changes appear as their own rows in the timeline;
// follow-up appliance changes do not (they already show as appointment rows).
{const M=new Map();M.set('u1',[
   {source:'inpatient',first:false,added:['Salts XND1352'],stopped:['Lentell 201108-1'],appliances:['Salts XND1352'],accessories:['Stoma Belt'],ward:'SW4',date:'2026-09-28',order:2},
   {source:'inpatient',first:true,added:['Lentell 201108-1'],stopped:[],appliances:['Lentell 201108-1'],accessories:[],ward:'ITU',date:'2026-09-16',order:0},
   {source:'follow-up',first:false,added:['FollowupOnlyBag'],stopped:[],appliances:['FollowupOnlyBag'],accessories:[],ward:'',date:'2026-09-20',order:9}]);
 w.stomaApplianceHistory=()=>M;
 const h2=w.patientDashboardHistoryHTML();
 assert.match(h2,/Now using:/);
 assert.match(h2,/Salts XND1352/);
 assert.match(h2,/No longer needed/);
 assert.match(h2,/Lentell 201108-1/);
 assert.match(h2,/Appliance recorded:/);
 assert.doesNotMatch(h2,/FollowupOnlyBag/,'follow-up appliance change is not added as an appliance row');
 w.stomaApplianceHistory=()=>new Map();}
// A community (Comcare) appointment shows as a "Tele follow-up" pathway with its feedback.
{w.clrState.appts=[{id:'tf',patient_id:'p',appt_date:'2026-11-08',status:'booked',community_followup:true,comcare_email_sent_date:'2026-11-08',comcare_feedback:'Stoma healthy per images'}];
 const h3=w.patientDashboardHistoryHTML();
 assert.match(h3,/Tele follow-up/);
 assert.match(h3,/Imaging request emailed to Comcare/);
 assert.match(h3,/Comcare feedback/);
 assert.match(h3,/Stoma healthy per images/);
 assert.doesNotMatch(h3,/See what was written/,'community appt is not shown as a normal follow-up');}
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
// 📋 Schedule 5 (Schedule V): colostomy/ileostomy pages are built from the
// stoma's selected appliance; quantities follow the 1-piece/2-piece rules.
{w.APPLIANCE_CATALOGUE=[
   {name:'Stomahesive Flange 45mm',system:'two',part:'flange'},
   {name:'Microporous 45mm',system:'two',part:'flange'},
   {name:'Closed Bag 45mm',system:'two',part:'bag'},
   {name:'Drainable Bag 45mm',system:'two',part:'bag'},
   {name:'Uro/transparent Bag 45mm',system:'two',part:'bag'},
   {name:'Salts XND1352',system:'one',group:'Salts',bagType:'drainable'},
   {name:'Salts XNL1352',system:'one',group:'Salts',bagType:'closed'},
   {name:'Salts NDAL13',system:'one',group:'Salts',bagType:'drainable',purpose:'urostomy'},
   {name:'Lentell 201108-1 (70mm trans)',system:'one',group:'Lentell',postop:true},
   {name:'Generic OnePiece',system:'one',group:'Other'}];
 w.daStomaGroup=t=>/colo/i.test(t)?'Colostomy':/ileo/i.test(t)?'Ileostomy':/uro/i.test(t)?'Urostomy':'Other';
 const q=(rows,label)=>{const r=rows.find(x=>x[0].indexOf(label)===0);return r&&r[1];};
 // Bag-kind detection: catalogue tag wins, then name.
 assert.equal(w.s5BagKind({name:'Closed Bag 45mm'}),'closed');
 assert.equal(w.s5BagKind({name:'Drainable Bag 45mm'}),'drainable');
 assert.equal(w.s5BagKind({name:'Uro/transparent Bag 45mm'}),'urostomy');
 assert.equal(w.s5BagKind({name:'Salts XNL1352',bagType:'closed'}),'closed');
 // 2-piece colostomy, stomahesive flange + closed bag → the actual flange named at 15, closed 60, adhesive 1/month.
 let rows=w.s5AutoItems('End colostomy',['Stomahesive Flange 45mm','Closed Bag 45mm'],[]);
 assert.equal(q(rows,'Stomahesive Flange 45mm'),'15 per month');
 assert.equal(q(rows,'Pouches – Closed'),'60 per month');
 assert.equal(q(rows,'Adhesive remover'),'1 per month');
 assert.equal(q(rows,'Deodorizing Agent'),'1 per month');
 assert.equal(q(rows,'Gauze for cleaning'),'1 per month');
 // 2-piece, microporous flange → adhesive 2/month.
 rows=w.s5AutoItems('End colostomy',['Microporous 45mm','Closed Bag 45mm'],[]);
 assert.equal(q(rows,'Adhesive remover'),'2 per month');
 // 1-piece drainable (Salts XND1352) → no flange line; 30/month; adhesive 2/month + extra box.
 rows=w.s5AutoItems('Loop ileostomy',['Salts XND1352'],[]);
 assert.ok(!rows.some(r=>/flange/i.test(r[0])),'no flange line for one-piece');
 assert.match(q(rows,'Salts XND1352'),/30 per month/);
 assert.equal(q(rows,'Adhesive remover'),'2 per month');
 assert.ok(rows.some(r=>/extra box/i.test(r[0])&&/4 months/.test(r[1])),'1-piece has a separate extra adhesive-box line');
 // 1-piece tagged closed (Salts XNL1352) on a colostomy → 60/month.
 assert.equal(q(w.s5AutoItems('End colostomy',['Salts XNL1352'],[]),'Salts XNL1352'),'60 per month');
 // 1-piece with no tag: colostomy default closed (60), ileostomy default drainable (30).
 assert.equal(q(w.s5AutoItems('End colostomy',['Generic OnePiece'],[]),'Generic OnePiece'),'60 per month');
 assert.equal(q(w.s5AutoItems('Loop ileostomy',['Generic OnePiece'],[]),'Generic OnePiece'),'30 per month');
 // A urostomy-tagged one-piece (Salts NDAL13) is treated as a urostomy.
 rows=w.s5AutoItems('End colostomy',['Salts NDAL13'],[]);
 assert.equal(q(rows,'Night drainage bags'),'4 per month','NDAL13 (purpose urostomy) → night bags');
 // A post-operative one-piece (Lentell 201108-1) is flagged, not priced.
 rows=w.s5AutoItems('End colostomy',['Lentell 201108-1 (70mm trans)'],[]);
 const appl=rows.find(r=>/post-operative appliance/.test(r[0]));
 assert.ok(appl,'post-op appliance line present');
 assert.equal(appl[1],'','post-op appliance has no quantity');
 // Urostomy is appliance-driven too: 2-piece shows the urostomy pouch at 30/month
 // (1 per day) plus night drainage bags 4/month, and no deodorizing line.
 rows=w.s5AutoItems('Urostomy',['Stomahesive Flange 45mm','Uro/transparent Bag 45mm'],[]);
 assert.equal(q(rows,'Stomahesive Flange 45mm'),'15 per month');
 assert.equal(q(rows,'Urostomy pouch'),'30 per month');
 assert.equal(q(rows,'Night drainage bags'),'4 per month');
 assert.ok(!rows.some(r=>/deodorizing/i.test(r[0])),'no deodorizing line for urostomy');
 // One-piece urostomy → single appliance line at 30/month, still with night bags.
 rows=w.s5AutoItems('Urostomy',[],[]);
 assert.equal(q(rows,'One-piece appliance'),'30 per month');
 assert.equal(q(rows,'Night drainage bags'),'4 per month');
 // Accessories: powder omitted; belt 1 per 2 months; hydrocolloid 15 per month.
 rows=w.s5AutoItems('End colostomy',['Stomahesive Flange 45mm','Closed Bag 45mm'],['Powder','Stoma Belt','Hydrocolloid 5x20','Protective Wipes']);
 assert.ok(!rows.some(r=>/powder/i.test(r[0])),'powder left out');
 assert.equal(q(rows,'Stoma belt'),'1 per 2 months');
 assert.equal(q(rows,'Hydrocolloid 5x20'),'15 per month');
 // Protective wipes: 2-piece 15/month, 1-piece 30/month (one a day).
 assert.equal(q(rows,'Protective wipes'),'15 per month');  // rows above are a 2-piece system
 const pw1=w.s5AutoItems('End colostomy',['Salts XNL1352'],['Protective Wipes']);
 assert.equal(pw1.find(r=>r[0].indexOf('Protective wipes')===0)[1],'30 per month');
 // The printed page carries the phone number and the renamed header.
 const page=w.s5PrintPageHTML({title:'Colostomy',rows},{name:'Mr Michael John',id:'29544A',dob:'1964-05-08',phone:'79000000'},'logo.png',true);
 assert.match(page,/Tel: 79000000/);
 assert.match(page,/Items from pharmacy: – <u>Colostomy<\/u>/);
 assert.doesNotMatch(page,/page-break-before/,'first page has no leading break');}
// 📄 Informative literature: wired to stoma type + paediatrics, English & Maltese.
{w.TODAY='2026-11-03';
 // Adult colostomy → the managing booklet AND the diet leaflet, both EN+MT.
 w.stomasPresentOn=()=>[{type:'End colostomy'}];w.ageYearsBetween=()=>60;
 let docs=w.patientLiteratureDocs({date_of_birth:'1966-01-01'});
 assert.equal(docs.length,2);
 assert.ok(docs.some(d=>/managing-colostomy-en\.pdf/.test(d.en)&&/managing-colostomy-mt\.pdf/.test(d.mt)));
 assert.ok(docs.some(d=>/colostomy-diet-en\.pdf/.test(d.en)));
 // Ileostomy → managing booklet, English + Maltese.
 w.stomasPresentOn=()=>[{type:'Loop ileostomy'}];
 docs=w.patientLiteratureDocs({date_of_birth:'1966-01-01'});
 assert.equal(docs.length,1);
 assert.match(docs[0].en,/managing-ileostomy-en\.pdf/);
 assert.match(docs[0].mt,/managing-ileostomy-mt\.pdf/);
 // Urostomy → managing booklet EN+MT.
 w.stomasPresentOn=()=>[{type:'Urostomy'}];
 docs=w.patientLiteratureDocs({date_of_birth:'1966-01-01'});
 assert.ok(docs.some(d=>/managing-urostomy-en\.pdf/.test(d.en)&&/managing-urostomy-mt\.pdf/.test(d.mt)));
 // A child with a colostomy → colostomy leaflets AND the paediatric guide.
 w.ageYearsBetween=()=>5;w.stomasPresentOn=()=>[{type:'End colostomy'}];
 docs=w.patientLiteratureDocs({date_of_birth:'2021-01-01'});
 assert.ok(docs.some(d=>/stoma-in-children-en\.pdf/.test(d.en)),'paediatric guide included for a child');
 // The modal shows both English and Maltese buttons when both PDFs exist.
 w.ageYearsBetween=()=>60;w.stomasPresentOn=()=>[{type:'End colostomy'}];
 w.openPatientLiterature();
 const lm=w.document.getElementById('mb').innerHTML;
 assert.match(lm,/English/);assert.match(lm,/Malti/);assert.match(lm,/managing-colostomy-mt\.pdf/);}
const source=appSource;for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new Function(m[1]);
console.log('PASS: details placement, three home actions, retained sections, grouped history, sorting, safe text, refresh, empty history, idempotent layout and script parsing');dom.window.close();
