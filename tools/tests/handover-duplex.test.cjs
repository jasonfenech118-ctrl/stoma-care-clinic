const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function source(name){
  const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);
  const lineEnd=html.indexOf('\n',start);
  return html.slice(start,html.slice(start,lineEnd).trim().endsWith('}')?lineEnd:html.indexOf('\n}',start)+2);
}
function fixture(t,patients,options={}){
  const dom=new JSDOM('<body><table id="hv-table"><tbody></tbody></table></body>',{runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window;
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent;}});
  Object.assign(w,{TODAY:'2026-10-28',fmtLabel:d=>d,fmtShortDate:d=>d,initialStomaCode:d=>d,
    htmlSafe:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    hvIsInfectionNote:s=>/CRE|VRE|\+ve/i.test(s),handoverManualFont:options.manualFont??null,HANDOVER_FONT_PX:13,HANDOVER_ROWS_PER_PAGE:16});
  for(const name of ['parseInitialStomas','parseRefashionings','parseStomas','stomaOperationHistory','patientStomaList','handoverSheetDocHTML'])w.eval(source(name));
  w.eval(fs.readFileSync(path.join(__dirname,'../../assets/surgical-rotation.js'),'utf8'));
  const body=w.document.querySelector('tbody');
  patients.forEach((p,i)=>{
    const tr=w.document.createElement('tr');tr.className=p._rowClass||'';
    tr.innerHTML=`<td><input class="hv-ward"><input class="hv-bed"></td><td></td><td><strong></strong></td><td></td>
      <td><button class="hv-appl"></button><input class="hv-note"></td><td><button class="hs-btn" data-value="done"></button></td><td></td>`;
    tr.querySelector('.hv-ward').value=p.inpatient_ward||'SW4';
    tr.querySelector('.hv-bed').value=String(i+1);
    tr.children[1].textContent=p.id_card||'TEST-'+i;
    tr.querySelector('strong').textContent=p.surname||'Example';
    tr.children[3].textContent=p.first_name||'Patient';
    tr.querySelector('.hv-appl').dataset.appliance=p._appliance||'Example appliance';
    tr.querySelector('.hv-note').value=p._note||'Routine review';
    tr._handoverPrintPatient=p;body.appendChild(tr);
  });
  const out=w.handoverSheetDocHTML({autoPrint:false,...options});
  const printed=new JSDOM(out);t.after(()=>printed.window.close());
  return {w,out,document:printed.window.document};
}
const patient=extra=>({first_name:'Sample',surname:'Patient',id_card:'TEST-ONLY',inpatient_ward:'SW4',
  stoma_type:'End colostomy',surgery_date:'2026-10-12',procedure_performed:'Recorded resection',consultant:'Example firm',...extra});
function layout(t,out,fixedRows=false){
  const dom=new JSDOM(out,{runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;
  Object.defineProperty(d,'readyState',{get:()=> 'complete'});
  w.HTMLElement.prototype.getBoundingClientRect=function(){
    const fs=parseFloat(d.documentElement.style.getPropertyValue('--fs'))||14;
    const tableWidth=1080;
    const cellWidth=cell=>tableWidth*parseFloat(cell.closest('table').querySelectorAll('col')[Array.from(cell.parentElement.children).indexOf(cell)].style.width)/100;
    if(this.tagName==='TABLE')return {width:tableWidth};
    if(this.tagName==='TD'||this.tagName==='TH')return {width:cellWidth(this)};
    if(this.classList.contains('hv-fit-text'))return {width:this.textContent.length*(parseFloat(this.style.fontSize)||fs)*0.55};
    if(this.classList.contains('hv-team-contact'))return {width:this.textContent.length*fs*0.55};
    if(this.classList.contains('hv-team-contacts'))return {width:cellWidth(this.closest('td'))-fs*0.6-1};
    if(this.classList.contains('hv-contacts-bottom'))return {height:fs*1.15};
    if(this.classList.contains('hv-operation-cell')){
      const text=this.querySelector('.hv-operation-text');
      return {height:Math.max(parseFloat(this.style.height)||0,fs*1.25*(text.textContent.length>180?4:1)+(parseFloat(text.style.paddingBottom)||0))};
    }
    if(this.tagName==='TR'){
      const frame=this.querySelector('.hv-operation-cell');
      return {height:Math.max(parseFloat(this.style.height)||0,(this.textContent.length>180?80:28)*(fixedRows?1:fs/14),frame?frame.getBoundingClientRect().height+fs*.34+1:0)};
    }
    if(this.classList.contains('handover-content')){
      const scale=Number(this.style.transform.match(/scale\(([^)]+)\)/)?.[1]||1);
      return {height:scale*(35*fs/14+[...this.querySelectorAll('tr')].reduce((n,tr)=>n+tr.getBoundingClientRect().height,0))};
    }
    return {height:199*96/25.4};
  };
  w.eval(d.querySelector('script').textContent);
  return {w,d,pages:[...d.querySelectorAll('.handover-page')]};
}

test('printing always includes a reverse with the same identifiers, ward blocks and writing rows',t=>{
  const f=fixture(t,[patient(),patient({id_card:'TEST-TWO',surname:'Other',inpatient_ward:'SW5'})],{includeReverse:false});
  const front=f.document.querySelector('.handover-front'),back=f.document.querySelector('.handover-reverse');
  assert.ok(front);assert.ok(back,'there is no opt-out from the reverse');
  assert.deepEqual([...back.querySelectorAll('th')].map(th=>th.textContent),['Ward','IDNO','Surname','First Name','Performed operation','Surgeon / firm','Surgery date']);
  assert.equal(front.querySelector('h1').textContent,'Care Handover');
  assert.equal(back.querySelector('h1').textContent,'Surgical Details');
  assert.doesNotMatch(back.textContent,/Reverse|Reversal/i);
  const a=front.querySelectorAll('tbody tr'),b=back.querySelectorAll('tbody tr');
  assert.equal(a.length,16);assert.equal(b.length,a.length);
  a.forEach((row,i)=>{
    assert.equal(row.className,b[i].className);
    for(let j=0;j<4;j++)assert.equal(row.children[j].textContent,b[i].children[j].textContent);
  });
  assert.match(front.textContent,/Example appliance.*Routine review/s);
  assert.doesNotMatch(back.textContent,/Example appliance|Routine review|Appliance \+ notes/);
  assert.equal(b[0].querySelector('.hv-operation-text').textContent,'Recorded resection');
  assert.equal(b[0].querySelector('.hv-firm-name').textContent,'Example firm');
  assert.equal(b[0].children[6].textContent,'2026-10-12');
  assert.equal(f.w.document.querySelectorAll('.handover-reverse').length,0,'the app receives no extra page');
});

test('the consultant pager prints under Surgeon / firm, with RS, HST and BST under the operation',t=>{
  const rotation={updated_at:'2026-10-27T16:06:00Z',data:{sections:[{name:'Surgery',rows:[
    ['Mr. Alex Example 79000001','Mr. Adrian Example 1111','Miss Beatrice Sample 2222','Dr. Clara Other 3333',''],
    ['Mr. Bruno Other 79000002','Mr. Daniel Person 4444','','Miss Emma Sample 5555','']
  ]}]}};
  const f=fixture(t,[patient({consultant:'Mr. A. Example'}),patient({consultant:'Mr. B. Other'}),
    patient({consultant:'Mr. U. Unlisted'})],{rotation});
  const a=f.document.querySelector('.handover-front'),b=f.document.querySelector('.handover-reverse');
  const rows=b.querySelectorAll('tbody tr');
  assert.deepEqual([...rows[0].children[4].querySelectorAll('.hv-team-contact')].map(e=>e.textContent),['RS: Mr. A. Example — 1111','HST: Miss B. Sample — 2222','BST: Dr. C. Other — 3333']);
  assert.deepEqual([...rows[1].children[4].querySelectorAll('.hv-team-contact')].map(e=>e.textContent),['RS: Mr. D. Person — 4444','BST: Miss E. Sample — 5555']);
  assert.equal(rows[0].children[4].querySelectorAll('.hv-team-contact').length,3);
  assert.equal(rows[0].children[5].querySelector('.hv-consultant-name').textContent,'Mr. A. Example');
  assert.equal(rows[0].children[5].querySelector('.hv-team-number').textContent,'79000001');
  assert.equal(rows[1].children[5].querySelector('.hv-team-number').textContent,'79000002');
  assert.equal(rows[0].querySelector('.hv-consultant-pager').textContent,'79000001');
  assert.doesNotMatch(b.textContent,/Consultant:/);
  assert.equal(rows[0].children[4].querySelector('.hv-consultant-pager'),null);
  assert.equal(rows[0].querySelector('.hv-operation-text').textContent,'Recorded resection');
  const styles=f.document.defaultView;
  assert.equal(styles.getComputedStyle(rows[0].querySelector('.hv-consultant-name')).fontWeight,'700');
  for(const label of rows[0].querySelectorAll('.hv-team-contact b'))assert.equal(styles.getComputedStyle(label).fontWeight,'700');
  for(const number of rows[0].querySelectorAll('.hv-team-number'))assert.equal(styles.getComputedStyle(number).fontWeight,'400');
  assert.equal(rows[2].querySelector('.hv-contacts-bottom').textContent,'');
  assert.equal(rows[2].children[5].textContent,'Mr. U. Unlisted');
  assert.doesNotMatch(a.textContent,/2222|3333|4444|5555|Team contacts/);
  assert.equal(b.querySelector('.hv-legend'),null);
  assert.ok(a.querySelector('.hv-legend'));
  rotation.data.sections[0].rows[0][2]='New trainee 9999';
  assert.match(rows[0].textContent,/2222/,'saved HTML retains the contacts captured at the time');
  assert.doesNotMatch(rows[0].textContent,/9999/);
});

test('missing, ambiguous and empty directory contacts leave the printout blank without losing the firm or operation',t=>{
  for(const data of [null,{sections:[]},{sections:[{name:'Surgery',rows:[['Mr. Alex Example','','','','']]}]},
    {sections:[{name:'Surgery',rows:[['Mr. Alex Example','Senior 1111','','',''],['Mr. Andrew Example','Other 2222','','','']]}]}]){
    const f=fixture(t,[patient({consultant:'Mr. A. Example'})],{rotation:data?{data}:null});
    const row=f.document.querySelector('.handover-reverse tbody tr');
    assert.equal(row.querySelector('.hv-contacts-bottom').innerHTML,'');
    assert.equal(row.children[5].textContent,'Mr. A. Example');
    assert.equal(row.querySelector('.hv-operation-text').textContent,'Recorded resection');
    assert.doesNotMatch(row.textContent,/not matched|unavailable|Check firm|Consultant:|RS:|HST:|BST:/i);
  }
});

test('compact identifier columns adapt to the list and doctor names with pagers fit one horizontal line',t=>{
  const short=layout(t,fixture(t,[patient({id_card:'9X',surname:'Li',first_name:'Jo'})]).out);
  const rotation={data:{sections:[{name:'Surgery',rows:[[
    'Mr. Alex Example 79000001','Mr. Adrian Example-Longsurname 79000111','Miss Beatrice Other-Longsurname 79000222','Dr. Clara Sample-Longsurname 79000333',''
  ]]}]}};
  const f=fixture(t,[patient({id_card:'TEST99999Z',surname:'Example-Longname',first_name:'Alexandria-Elisabeth',consultant:'Mr. A. Example'})],{rotation});
  const long=layout(t,f.out),front=long.pages[0],back=long.pages[1];
  const a=[...front.querySelectorAll('col')].map(c=>parseFloat(c.style.width));
  const b=[...back.querySelectorAll('col')].map(c=>parseFloat(c.style.width));
  const small=[...short.pages[0].querySelectorAll('col')].map(c=>parseFloat(c.style.width));
  assert.deepEqual(a.slice(0,4),b.slice(0,4));
  for(const i of [1,2,3])assert.ok(a[i]>small[i],'short fields release space to the operation');
  assert.ok(b[4]>53.5);assert.ok(b[5]<16);assert.ok(b[6]<10.5);
  assert.ok(Math.abs(b.reduce((n,w)=>n+w,0)-100)<0.0001);
  const fs=parseFloat(long.d.documentElement.style.getPropertyValue('--fs'));
  assert.ok(fs<14,'the shared font responds to horizontal contact space, even for a short list');
  for(const page of long.pages){
    const id=page.querySelector('tbody .hv-id-value');
    assert.equal(id.textContent,'TEST99999Z');
    assert.equal(long.w.getComputedStyle(id).whiteSpace,'nowrap');
    assert.ok(id.getBoundingClientRect().width<=id.parentElement.getBoundingClientRect().width-fs*0.6-1+.1);
  }
  const group=back.querySelector('.hv-team-contacts'),doctors=[...group.children];
  assert.ok(doctors.reduce((n,e)=>n+e.getBoundingClientRect().width,0)+2*fs*.45<=group.getBoundingClientRect().width+.1);
  for(const entry of doctors)assert.equal(long.w.getComputedStyle(entry).whiteSpace,'nowrap');
  assert.equal(long.pages.length,2);
});

test('latest refashioning uses its own operation/date and an unknown date never inherits the original date',t=>{
  const refashion={uid:'new-stoma',type:'End colostomy',formed_date:'2026-10-20',operation:'Recorded refashioning',target_uid:'base'};
  const f=fixture(t,[patient({extra_refashionings:[refashion]}),patient({stoma_operation_history:[
    {kind:'refashion',date_unknown:true,operation:'Latest unknown-date operation',affected:[]}
  ]})]);
  const rows=f.document.querySelectorAll('.handover-reverse tbody tr');
  assert.equal(rows[0].querySelector('.hv-operation-text').textContent,'Recorded refashioning');assert.equal(rows[0].children[6].textContent,'2026-10-20');
  assert.equal(rows[1].querySelector('.hv-operation-text').textContent,'Latest unknown-date operation');assert.equal(rows[1].children[6].textContent,'Not recorded');
});

test('legacy Findings print when the operation field is blank, keeping the recorded surgery date',t=>{
  const finding='Example laparotomy and stoma formation after an earlier operation on 04/08/2026';
  const f=fixture(t,[patient({procedure_performed:null,findings:finding,surgery_date:'2026-08-16'}),
    patient({procedure_performed:'Current operation description',findings:'Earlier wording'}),
    patient({procedure_performed:'   ',findings:'  Saved legacy operation  '})]);
  const rows=f.document.querySelectorAll('.handover-reverse tbody tr');
  assert.equal(rows[0].querySelector('.hv-operation-text').textContent,finding);
  assert.equal(rows[0].children[6].textContent,'2026-08-16','a date mentioned inside the text is not the surgery-date field');
  assert.equal(rows[1].querySelector('.hv-operation-text').textContent,'Current operation description');
  assert.equal(rows[2].querySelector('.hv-operation-text').textContent,'Saved legacy operation');
});

test('later and refashioned stomas use their own Findings and never inherit the original operation',t=>{
  const f=fixture(t,[patient({findings:'Original operation',refashion_formed_date:'2026-10-20',refashion_findings:'Legacy refashioning description'}),
    patient({findings:'Original operation',newstoma_formed_date:'2026-10-22',newstoma_findings:'Legacy later-stoma description'}),
    patient({findings:'Original operation',extra_stomas:[{uid:'later',type:'End ileostomy',formed_date:'2026-10-23'}]})]);
  const rows=f.document.querySelectorAll('.handover-reverse tbody tr');
  assert.equal(rows[0].querySelector('.hv-operation-text').textContent,'Legacy refashioning description');assert.equal(rows[0].children[6].textContent,'2026-10-20');
  assert.equal(rows[1].querySelector('.hv-operation-text').textContent,'Legacy later-stoma description');assert.equal(rows[1].children[6].textContent,'2026-10-22');
  assert.equal(rows[2].querySelector('.hv-operation-text').textContent,'Not recorded');assert.equal(rows[2].children[6].textContent,'2026-10-23');
});

test('operation-history entries can use Findings from their exact stoma without borrowing older text',t=>{
  const f=fixture(t,[patient({findings:'Original operation',extra_stomas:[{uid:'later',type:'End ileostomy',formed_date:'2026-10-23',findings:'Saved later operation'}],
    stoma_operation_history:[{kind:'new',new_uid:'later',date:'2026-10-23',operation:null,affected:[]}]}),
    patient({findings:'Original operation',stoma_operation_history:[{kind:'reversal',date:'2026-10-24',operation:null,affected:[]}]})]);
  const rows=f.document.querySelectorAll('.handover-reverse tbody tr');
  assert.equal(rows[0].querySelector('.hv-operation-text').textContent,'Saved later operation');assert.equal(rows[0].children[6].textContent,'2026-10-23');
  assert.equal(rows[1].querySelector('.hv-operation-text').textContent,'Reversal / closure');assert.equal(rows[1].children[6].textContent,'2026-10-24');
});

test('fistula operation text stored in Findings retains the fistula operation date',t=>{
  const f=fixture(t,[{patient_kind:'fistula',findings:'Saved fistula operation',fistula_operation_date:'2026-10-21'}]);
  const row=f.document.querySelector('.handover-reverse tbody tr');
  assert.equal(row.querySelector('.hv-operation-text').textContent,'Saved fistula operation');assert.equal(row.children[6].textContent,'2026-10-21');
});

test('automatic fitting always keeps the full list on exactly two pages, including a large manual font',t=>{
  for(const manualFont of [null,24]){
    const f=fixture(t,Array.from({length:60},(_,i)=>patient({id_card:'TEST-'+i,
      procedure_performed:i%4===0?'Long operation description. '.repeat(8):'Recorded operation'})),{manualFont});
    const {w,d,pages}=layout(t,f.out);
    assert.equal(pages.length,2);assert.equal(pages[0].dataset.side,'front');assert.equal(pages[1].dataset.side,'reverse');
    const a=[...pages[0].querySelectorAll('tbody tr')],b=[...pages[1].querySelectorAll('tbody tr')];
    assert.equal(a.length,60);assert.equal(b.length,60);
    assert.deepEqual(a.map(row=>row.children[1].textContent),Array.from({length:60},(_,i)=>'TEST-'+i));
    a.forEach((row,i)=>{assert.equal(row.children[1].textContent,b[i].children[1].textContent);assert.equal(row.style.height,b[i].style.height);});
    assert.ok(parseFloat(d.documentElement.style.getPropertyValue('--fs'))<(manualFont||14));
    for(const page of pages)assert.ok(page.querySelector('.handover-content').getBoundingClientRect().height<=(199-4)*96/25.4-2+0.01);
    assert.equal(w.getComputedStyle(pages[1]).display,'none');
  }
});

test('the final scale fallback keeps every patient on both pages when row borders cannot shrink further',t=>{
  const f=fixture(t,Array.from({length:120},(_,i)=>patient({id_card:'TEST-'+i})));
  const {d,pages}=layout(t,f.out,true);
  assert.equal(pages.length,2);assert.ok(Number(d.documentElement.dataset.handoverFitScale)<1);
  for(const page of pages){assert.equal(page.querySelectorAll('tbody tr').length,120);assert.ok(page.querySelector('.handover-content').getBoundingClientRect().height<=(199-4)*96/25.4-2+0.01);}
});

test('spare writing rows give way before reducing the patient text size',t=>{
  const f=fixture(t,Array.from({length:5},(_,i)=>patient({id_card:'TEST-'+i})),{manualFont:24});
  const {d,pages}=layout(t,f.out);
  assert.equal(d.documentElement.style.getPropertyValue('--fs'),'24px');
  assert.equal(pages.length,2);
  for(const page of pages){assert.equal(page.querySelectorAll('tbody tr:not(.wgblank)').length,5);assert.ok(page.querySelectorAll('tbody tr').length<16);}
});

test('future and reverted operations do not replace the latest performed operation',t=>{
  const f=fixture(t,[patient({stoma_operation_history:[
    {kind:'refashion',date:'2026-10-19',operation:'Performed operation',affected:[]},
    {kind:'new',date:'2026-10-27',operation:'Reverted entry',reverted_at:'2026-10-28',affected:[]},
    {kind:'new',date:'2026-11-12',operation:'Future entry',affected:[]}
  ]})]);
  const row=f.document.querySelector('.handover-reverse tbody tr');
  assert.equal(row.querySelector('.hv-operation-text').textContent,'Performed operation');assert.equal(row.children[6].textContent,'2026-10-19');
});

test('all pending-surgery row types distinguish a plan from a performed operation',t=>{
  const f=fixture(t,[patient({_rowClass:'hv-awaiting',surgery_date:'2026-10-28'}),
    patient({_rowClass:'hv-awaiting hv-surgery',upcoming_surgery_date:'2026-10-28'}),
    patient({_rowClass:'hv-awaiting hv-reversal',proposed_reversal_date:'2026-10-28'})]);
  for(const row of [...f.document.querySelectorAll('.handover-reverse tbody tr')].slice(0,3)){
    assert.match(row.querySelector('.hv-operation-text').textContent,/Awaiting .*not yet performed/);
    assert.equal(row.children[6].textContent,'Planned 2026-10-28');
    assert.doesNotMatch(row.querySelector('.hv-operation-text').textContent,/Recorded resection/);
  }
});

test('fistula surgery and missing fields print without inventing details or interpreting markup',t=>{
  const f=fixture(t,[{patient_kind:'fistula',procedure_performed:'Recorded fistula procedure',fistula_operation_date:'2026-10-21'},
    {},patient({procedure_performed:'<img src=x onerror="alert(1)"> & review',consultant:'<Example>'})]);
  const rows=f.document.querySelectorAll('.handover-reverse tbody tr');
  assert.equal(rows[0].querySelector('.hv-operation-text').textContent,'Recorded fistula procedure');assert.equal(rows[0].children[6].textContent,'2026-10-21');
  assert.deepEqual([rows[1].querySelector('.hv-operation-text').textContent,rows[1].querySelector('.hv-firm-name').textContent,rows[1].children[6].textContent],['Not recorded','Not recorded','Not recorded']);
  assert.equal(rows[2].querySelector('.hv-operation-text').textContent,'<img src=x onerror="alert(1)"> & review');
  assert.equal(rows[2].querySelector('.hv-firm-name').textContent,'<Example>');assert.equal(f.document.querySelector('img'),null);
});

test('empty handover returns no print document',t=>{
  const dom=new JSDOM('<table id="hv-table"><tbody></tbody></table>',{runScripts:'outside-only'});t.after(()=>dom.window.close());
  dom.window.eval(source('handoverSheetDocHTML'));assert.equal(dom.window.handoverSheetDocHTML(),null);
});
