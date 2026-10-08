const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
function setup(t){const dom=new JSDOM('<body><div id="cw-tasks"></div><div id="mb"></div></body>',{runScripts:'outside-only',url:'https://clinic.test'});t.after(()=>dom.window.close());const w=dom.window;
 w.ClinicWorkspace={esc:x=>String(x||'').replace(/</g,'&lt;'),name:p=>[p?.first_name,p?.surname].filter(Boolean).join(' ')||'Patient',beginSave(){},endSave(){}};w.TODAY='2026-10-08';w.fmtShortDate=x=>x;
 w.eval(fs.readFileSync(path.join(__dirname,'../../assets/clinic-tasks.js'),'utf8'));return w;}
test('task views separate personal assignment, completion history and patient links without dropping overdue work',t=>{
 const w=setup(t),rows=[{id:'late',task_text:'Review skin',assigned_name:'Jason Fenech',patient_id:'p',due_date:'2026-10-01'},{id:'other',assigned_name:'Lorraine Nurse',patient_id:'p',due_date:'2026-10-02'},{id:'done',assigned_name:'Jason Fenech',patient_id:'p',is_completed:true},{id:'general',task_text:'Clinic supplies'}];
 assert.deepEqual(Array.from(w.ClinicTasks.visible(rows,{scope:'my',user:{email:'jason.fenech@gov.mt'},status:'open'}),x=>x.id),['late']);
 assert.deepEqual(Array.from(w.ClinicTasks.visible(rows,{status:'completed'}),x=>x.id),['done']);
 assert.equal(w.ClinicTasks.visible(rows,{status:'all',patientId:'p'}).length,3);assert.equal(w.ClinicTasks.visible(rows,{query:'supplies'}).length,1);
});
test('a task source failure displays an error, rather than claiming that the team has no tasks',async t=>{
 const w=setup(t);w.getCurrentUserForAudit=async()=>({email:'jason.fenech@gov.mt'});w.attDisplayName=()=> 'Jason Fenech';w.SB={from:table=>({table,select(){return this;}})};w.fetchAllRows=async build=>({rows:[],error:build().table==='clinic_pending_tasks'?{message:'Unavailable'}:null});
 await w.ClinicTasks.page();assert.match(w.document.getElementById('cw-tasks').textContent,/Could not load/);assert.doesNotMatch(w.document.getElementById('cw-tasks').textContent,/No tasks match/);
});
