const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync('assets/visit-stoma-review.js','utf8');
async function setup(t){const d=new JSDOM('<div id="host"></div>',{runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;w.TODAY=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Malta'});w.isEncounterUser=()=>true;w.stomasPresentOn=()=>[{uid:'a',type:'End colostomy'}];w.complicationTypesList=['Candidiasis','C++ rash'];w.eval(src);const host=w.document.querySelector('#host');await w.VisitStomaReview.mount(host,{appt:{id:'1',appt_date:w.TODAY},patient:{id:'p'}});return {w,host,api:w.VisitStomaReview,el:host.querySelector('.vsr-rich[data-vsr="notes"]')};}
// The editor is now a contenteditable; "typing" sets its text and fires input.
function type(w,el,value){el.textContent=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));}
test('free text, font and undo/redo survive saving/reopening',async t=>{const {w,host,api,el}=await setup(t);assert.equal(host.querySelector('[data-vsr="output"]'),null);assert.equal(host.querySelector('input[type=checkbox]'),null);type(w,el,'No prolapse.');type(w,el,'No prolapse. Skin healthy.');host.querySelector('[data-vsr-command=undo]').click();assert.equal(api.payloadFor('1')[0].notes,'No prolapse.');assert.equal(el.textContent,'No prolapse.');host.querySelector('[data-vsr-command=redo]').click();assert.equal(api.payloadFor('1')[0].notes,'No prolapse. Skin healthy.');const size=host.querySelector('[data-vsr=font]');size.value='18';size.dispatchEvent(new w.Event('change',{bubbles:true}));let rows=api.payloadFor('1');assert.equal(rows[0].notes_font_size,18);assert.equal(rows[0].notes,'No prolapse. Skin healthy.');let saved=api.storedFor('1',rows,{name:'Nurse'});await api.mount(host,{appt:{id:'1',appt_date:w.TODAY,stoma_assessment:saved},patient:{id:'p'}});assert.equal(host.querySelector('.vsr-rich[data-vsr="notes"]').textContent,rows[0].notes);assert.match(api.reviewHTML(rows),/vsr-term/);assert.equal(api.versionsOf({stoma_assessment:saved}).length,1);});
test('red underlines match complete terms case insensitively and escape unsafe text',async t=>{const {w,api}=await setup(t);const s=api.highlighted('PROLAPSE prolapsed candidiasis <img src=x> C++ rash');assert.equal((s.match(/class="vsr-term"/g)||[]).length,3);assert.match(s,/&lt;img src=x&gt;/);w.complicationTypesList.push('New term');assert.match(api.highlighted('new term'),/vsr-term/);});
test('draft survives appliance navigation and legacy assessments remain readable without patient complication writes',async t=>{const {host,api,w,el}=await setup(t);type(w,el,'Review retained');await api.mount(host,{appt:{id:'1'},patient:{id:'p'},resume:true});assert.equal(host.querySelector('.vsr-rich[data-vsr="notes"]').textContent,'Review retained');assert.match(api.reviewHTML([{uid:'a',type:'End colostomy',colour:'Healthy pink',output:['Liquid stools'],skin:{status:'Healthy'},notes:'Old review'}]),/Healthy pink/);assert.equal(api.skinFor('1').problems.length,0);});
test('notes convert between markers and editor HTML without losing wording or showing ** markers',async t=>{
  const {w,api}=await setup(t);
  const raw='Follow up. **Stoma seal** used. *mild* redness __noted__ with {red}XNL1352{/red}.';
  const html=api.markersToHtml(raw);
  // Real formatting tags (no ** visible), then back to markers with nothing lost.
  assert.match(html,/<b>Stoma seal<\/b>/);assert.match(html,/<i>mild<\/i>/);assert.match(html,/<u>noted<\/u>/);assert.match(html,/color:#dc2626">XNL1352</);
  assert.doesNotMatch(html,/\*\*|__/);
  const d=w.document.createElement('div');d.innerHTML=html;
  assert.equal(api.htmlToMarkers(d),raw);
  // Line breaks round-trip too.
  const multi='line one\nline two';const back=api.htmlToMarkers((()=>{const x=w.document.createElement('div');x.innerHTML=api.markersToHtml(multi);return x;})());
  assert.equal(back,multi);
});
test('the Bold button runs the rich-text bold command on the editor (no ** inserted)',async t=>{
  const {w,host,el}=await setup(t);
  el.textContent='healthy skin';el.dispatchEvent(new w.Event('input',{bubbles:true}));
  const calls=[];w.document.execCommand=(name)=>{calls.push(name);return true;};
  host.querySelector('[data-vsr-command=bold]').click();
  assert.ok(calls.includes('bold'));
});
