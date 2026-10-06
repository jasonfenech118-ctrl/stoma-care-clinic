// The patient record lists Jason's encounters under the episode they belong to.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {boot}=require('./jason-encounters.fixture.cjs');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const moduleSource=fs.readFileSync(path.join(__dirname,'../../assets/jason-encounters.js'),'utf8');
function source(name){const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);}

test('each episode lists its own encounters newest first, coded and versioned, opening the exact record',t=>{
  const dom=new JSDOM('<div id="app"><main class="main"></main></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;boot(w);w.eval(moduleSource);
  w.htmlSafe=x=>String(x??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');w.jsSafe=x=>String(x??'').replace(/['\\]/g,'');w.fmtShortDate=d=>d;
  const v=n=>({schema:2,current_version:n,versions:Array.from({length:n},(_,i)=>({version:i+1,snapshot:{}}))});
  w.clrState={patient:{id:'pat-1',id_card:'404261M'},encounters:[
    {id:'e1',episode_id:'ep-old',encounter_date:'2026-09-02',created_at:'2026-09-02T09:00:00Z',created_by_name:'Jason Fenech',assessment:v(1)},
    {id:'e2',episode_id:'ep-new',encounter_date:'2026-10-05',created_at:'2026-10-05T09:00:00Z',created_by_name:'Jason Fenech',assessment:v(2)},
    {id:'e3',episode_id:'ep-new',encounter_date:'2026-10-06',created_at:'2026-10-06T09:00:00Z',created_by_name:'Jason Fenech',assessment:v(1)}]};
  w.eval(source('episodeEncountersHTML'));
  const el=w.document.createElement('div');el.innerHTML=w.episodeEncountersHTML({id:'ep-new'});
  assert.match(el.querySelector('.clr-enc-head').textContent,/Encounters\s*2/);
  const rows=[...el.querySelectorAll('.clr-enc-row')];
  assert.deepEqual(rows.map(r=>r.querySelector('.clr-code').textContent),['ENC-404261M-061026','ENC-404261M-051026']);
  assert.deepEqual(rows.map(r=>r.querySelector('.clr-enc-v').textContent),['V1','V2']);
  assert.equal(rows[1].getAttribute('onclick'),"openEncounter('pat-1','e2')");
  assert.equal(w.episodeEncountersHTML({id:'ep-none'}),'');
  el.innerHTML=w.episodeEncountersHTML({id:'ep-old'});assert.equal(el.querySelectorAll('.clr-enc-row').length,1);
});
