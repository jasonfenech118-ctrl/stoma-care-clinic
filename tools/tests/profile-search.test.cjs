// The patient profile has one search box over the whole care history —
// encounters, follow-up appointments and correspondence are rows in the same
// table. Typing highlights matches, hides the rest and floats matches up; a
// type dropdown narrows it to one kind.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name+' not found');return html.slice(i,html.indexOf('\n}',i)+2);}

function fixture(){
  const dom=new JSDOM(`<section id="pd-history"><details class="pd-section" open><summary>Appointments &amp; episodes</summary>
    <div class="pd-search"><input id="pd-search-q" value=""><select id="pd-search-type"><option value="" selected></option><option value="Follow-up appointment"></option><option value="Inpatient"></option><option value="Correspondence"></option></select><span id="pd-search-count"></span></div>
    <div id="pd-history-body">
      <details class="pd-care-list pd-section"><summary>Stoma 1</summary>
        <table class="pd-history-table pd-pathway-table"><tbody>
          <tr><td>Follow-up appointment</td><td><div class="pd-record-text">Reviewed in clinic, sent an email to the GP</div></td><td>1 Oct 2026</td></tr>
          <tr><td>Inpatient</td><td><div class="pd-record-text">Stoma healthy, output good</div></td><td>2 Oct 2026</td></tr>
          <tr><td>Correspondence</td><td><div class="pd-record-text">Email from community nurse about supplies</div></td><td>3 Oct 2026</td></tr>
        </tbody></table>
      </details>
      <details class="pd-care-list pd-section"><summary>Records needing a stoma link</summary>
        <table class="pd-history-table pd-pathway-table"><tbody>
          <tr><td>Inpatient</td><td><div class="pd-record-text">Dressing changed</div></td><td>4 Oct 2026</td></tr>
        </tbody></table>
      </details>
    </div></details></section>`,{runScripts:'outside-only'});
  return dom;
}
function load(dom){
  const w=dom.window;
  ['pdHighlight','pdClearHighlights','filterPatientProfile'].forEach(n=>w.eval(source(n)));
  return w;
}

test('a text search highlights matches, hides the rest and reports the count',()=>{
  const dom=fixture();const w=load(dom);const d=w.document;
  d.getElementById('pd-search-q').value='email';
  w.filterPatientProfile();
  const rows=[...d.querySelectorAll('.pd-history-table tbody tr')];
  // The two rows mentioning "email"/"Email" show; the others hide.
  assert.deepEqual(rows.map(r=>r.hidden),[false,true,false,true]);
  assert.equal(d.querySelectorAll('mark.pd-hit').length,2);
  assert.equal(d.getElementById('pd-search-count').textContent,'2 matches');
  // The group with no match collapses away; the one with matches opens.
  const groups=[...d.querySelectorAll('details.pd-care-list')];
  assert.equal(groups[0].hidden,false);assert.equal(groups[0].open,true);
  assert.equal(groups[1].hidden,true);
});

test('the type dropdown limits the search to one record kind',()=>{
  const dom=fixture();const w=load(dom);const d=w.document;
  d.getElementById('pd-search-type').value='Correspondence';
  w.filterPatientProfile();
  const rows=[...d.querySelectorAll('.pd-history-table tbody tr')];
  assert.deepEqual(rows.map(r=>r.hidden),[true,true,false,true]);   // only the Correspondence row
  assert.equal(d.getElementById('pd-search-count').textContent,'1 match');
});

test('type and text combine, and clearing both restores every row',()=>{
  const dom=fixture();const w=load(dom);const d=w.document;
  d.getElementById('pd-search-type').value='Inpatient';
  d.getElementById('pd-search-q').value='healthy';
  w.filterPatientProfile();
  let rows=[...d.querySelectorAll('.pd-history-table tbody tr')];
  assert.deepEqual(rows.map(r=>r.hidden),[true,false,true,true]);
  assert.equal(d.querySelectorAll('mark.pd-hit').length,1);
  // Clear everything — nothing hidden, no highlights, no count.
  d.getElementById('pd-search-type').value='';
  d.getElementById('pd-search-q').value='';
  w.filterPatientProfile();
  rows=[...d.querySelectorAll('.pd-history-table tbody tr')];
  assert.deepEqual(rows.map(r=>r.hidden),[false,false,false,false]);
  assert.equal(d.querySelectorAll('mark.pd-hit').length,0);
  assert.equal(d.getElementById('pd-search-count').textContent,'');
});

test('a repeat search still matches after highlights are cleared and text re-joined',()=>{
  const dom=fixture();const w=load(dom);const d=w.document;
  const q=d.getElementById('pd-search-q');
  q.value='email';w.filterPatientProfile();
  q.value='community';w.filterPatientProfile();   // different term over re-joined text
  const rows=[...d.querySelectorAll('.pd-history-table tbody tr')];
  assert.deepEqual(rows.map(r=>r.hidden),[true,true,false,true]);
  assert.equal(d.querySelectorAll('mark.pd-hit').length,1);
});

test('the search bar is wired into the dashboard and re-applied on refresh',()=>{
  assert.match(html,/id="pd-search-q"[^>]*oninput="filterPatientProfile\(\)"/);
  assert.match(html,/id="pd-search-type"[^>]*onchange="filterPatientProfile\(\)"/);
  assert.match(source('refreshPatientDashboardHistory'),/filterPatientProfile\(\)/);
});
