const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function psmAge('),html.indexOf('\nfunction switchPatientPanel'));
const ctx={patientIsDeceased:p=>!!p.deceased_date||p.followup_status==='deceased'};vm.createContext(ctx);vm.runInContext(source,ctx);
test('age at death is fixed to the recorded death date',()=>{assert.equal(ctx.psmPatientAge({date_of_birth:'1934-06-21',deceased_date:'2012-12-08'}),78);});
test('completed years respect the birthday',()=>{assert.equal(ctx.psmAge('1960-06-21','2020-06-20'),59);assert.equal(ctx.psmAge('1960-06-21','2020-06-21'),60);assert.equal(ctx.psmAge('1960-06-21','2020-06-22'),60);});
test('unknown and invalid dates do not produce a misleading age',()=>{for(const deceased_date of [null,'bad','2012-02-31','1930-01-01'])assert.equal(ctx.psmPatientAge({date_of_birth:'1934-06-21',followup_status:'deceased',deceased_date}),null);assert.equal(ctx.psmAge(null,'2020-01-01'),null);});
test('living patients still use current age',()=>{const t=new Date();const dob=`${t.getFullYear()-30}-01-01`;assert.equal(ctx.psmPatientAge({date_of_birth:dob}),30);});
