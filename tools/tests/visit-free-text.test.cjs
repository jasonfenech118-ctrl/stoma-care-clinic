const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync('assets/visit-stoma-review.js','utf8');
async function setup(t){const d=new JSDOM('<div id="host"></div>',{runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;w.TODAY=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Malta'});w.isEncounterUser=()=>true;w.stomasPresentOn=()=>[{uid:'a',type:'End colostomy'}];w.complicationTypesList=['Candidiasis','C++ rash'];w.eval(src);const host=w.document.querySelector('#host');await w.VisitStomaReview.mount(host,{appt:{id:'1',appt_date:w.TODAY},patient:{id:'p'}});return {w,host,api:w.VisitStomaReview,el:host.querySelector('textarea')};}
function type(w,el,value){el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));}
test('free text, font, undo redo and list actions survive saving/reopening',async t=>{const {w,host,api,el}=await setup(t);assert.equal(host.querySelector('[data-vsr="output"]'),null);assert.equal(host.querySelector('input[type=checkbox]'),null);type(w,el,'No prolapse.');type(w,el,'No prolapse. Skin healthy.');host.querySelector('[data-vsr-command=undo]').click();assert.equal(el.value,'No prolapse.');host.querySelector('[data-vsr-command=redo]').click();assert.equal(el.value,'No prolapse. Skin healthy.');el.setSelectionRange(0,el.value.length);host.querySelector('[data-vsr-command=bullets]').click();assert.equal(el.value,'• No prolapse. Skin healthy.');const size=host.querySelector('[data-vsr=font]');size.value='18';size.dispatchEvent(new w.Event('change',{bubbles:true}));let rows=api.payloadFor('1');assert.equal(rows[0].notes_font_size,18);assert.equal(rows[0].notes,el.value);let saved=api.storedFor('1',rows,{name:'Nurse'});await api.mount(host,{appt:{id:'1',appt_date:w.TODAY,stoma_assessment:saved},patient:{id:'p'}});assert.equal(host.querySelector('textarea').value,rows[0].notes);assert.match(api.reviewHTML(rows),/vsr-term/);assert.equal(api.versionsOf({stoma_assessment:saved}).length,1);});
test('red underlines match complete terms case insensitively and escape unsafe text',async t=>{const {w,api}=await setup(t);const s=api.highlighted('PROLAPSE prolapsed candidiasis <img src=x> C++ rash');assert.equal((s.match(/class="vsr-term"/g)||[]).length,3);assert.match(s,/&lt;img src=x&gt;/);w.complicationTypesList.push('New term');assert.match(api.highlighted('new term'),/vsr-term/);});
test('draft survives appliance navigation and legacy assessments remain readable without patient complication writes',async t=>{const {host,api,w,el}=await setup(t);type(w,el,'Review retained');await api.mount(host,{appt:{id:'1'},patient:{id:'p'},resume:true});assert.equal(host.querySelector('textarea').value,'Review retained');assert.match(api.reviewHTML([{uid:'a',type:'End colostomy',colour:'Healthy pink',output:['Liquid stools'],skin:{status:'Healthy'},notes:'Old review'}]),/Healthy pink/);assert.equal(api.skinFor('1').problems.length,0);});
test('the live editor overlay renders bold, italic, underline and colour, keeping aligned markers',async t=>{
  const {api}=await setup(t);
  const html=api.overlayFormat('wound *tender* and **swollen** __marked__ {red}note{/red}');
  // Bold/italic use width-preserving classes (not <strong>/<em>) so the caret stays put.
  assert.match(html,/<span class="vsr-ov-i">tender<\/span>/);assert.match(html,/<span class="vsr-ov-b">swollen<\/span>/);assert.match(html,/<u>marked<\/u>/);assert.match(html,/color:#dc2626">note</);
  assert.match(html,/vsr-mk/);   // markers are kept (shown faint) so the caret stays aligned
  // The visible text (tags stripped, entities decoded) equals the raw text exactly.
  const visible=html.replace(/<[^>]+>/g,'').replace(/&#42;/g,'*').replace(/&#95;/g,'_').replace(/&#123;/g,'{').replace(/&#125;/g,'}');
  assert.equal(visible,'wound *tender* and **swollen** __marked__ {red}note{/red}');
});
test('the Bold/Italic/Underline buttons wrap the selection and the overlay shows the formatting live',async t=>{
  const {w,host,el}=await setup(t);
  el.value='healthy skin';el.dispatchEvent(new w.Event('input',{bubbles:true}));
  el.setSelectionRange(0,7);                                  // select "healthy"
  host.querySelector('[data-vsr-command=bold]').click();
  assert.equal(el.value,'**healthy** skin');                  // markers inserted around the selection
  const overlay=el.previousElementSibling;                    // the .vsr-overlay backdrop
  assert.match(overlay.innerHTML,/<span class="vsr-ov-b">healthy<\/span>/); // renders as bold immediately
  el.setSelectionRange(2,9);host.querySelector('[data-vsr-command=underline]').click();
  assert.match(el.value,/__healthy__/);
});
