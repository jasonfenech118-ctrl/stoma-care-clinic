const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const start=html.indexOf('function handoverSheetDocHTML(');
const builder=html.slice(start,html.indexOf('// Open the ward sheet in a new tab',start));
function fixture(t,count=3,autoPrint=false){
  const app=new JSDOM('<table id="hv-table"><tbody>'+Array.from({length:count},(_,i)=>
    `<tr><td>SW4</td><td>TEST-${i}</td><td>Example</td><td>Sample</td><td>Example appliance</td><td></td><td></td></tr>`).join('')+'</tbody></table>',{runScripts:'outside-only'});
  t.after(()=>app.window.close());
  const w=app.window;
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  Object.assign(w,{htmlSafe:v=>String(v??''),fmtLabel:d=>d,fmtShortDate:d=>d,TODAY:'2026-10-28',
    hvIsInfectionNote:()=>false,handoverManualFont:null,HANDOVER_FONT_PX:13,HANDOVER_ROWS_PER_PAGE:16});
  w.eval(builder);
  const out=w.handoverSheetDocHTML({autoPrint});
  const dom=new JSDOM(out,{runScripts:'outside-only'});t.after(()=>dom.window.close());
  const win=dom.window,d=win.document,callbacks=[],seen=[],instances=[];
  Object.defineProperty(d,'readyState',{get:()=> 'complete'});
  win.setTimeout=(fn,ms)=>{callbacks.push({fn,ms});return callbacks.length;};
  win.HTMLElement.prototype.getBoundingClientRect=function(){
    return {height:this.tagName==='TR'?28:70+28*this.querySelectorAll('tr').length};
  };
  win.URL.createObjectURL=blob=>{seen.push({blob});return 'about:blank#pdf-preview';};
  class PDF{
    constructor(options){this.options=options;this.pages=1;this.images=[];
      this.internal={pageSize:{getWidth:()=>297,getHeight:()=>210}};
      this.__private__={setPdfVersion:v=>{this.version=v;}};instances.push(this);}
    viewerPreferences(value){this.preferences=value;}
    setProperties(value){this.properties=value;}
    addPage(format,orientation){assert.equal(format,'a4');assert.equal(orientation,'landscape');this.pages++;}
    addImage(...args){this.images.push(args);}
    autoPrint(options){this.autoPrintOptions=options;}
    output(type){assert.equal(type,'blob');return new win.Blob(['%PDF-example'],{type:'application/pdf'});}
  }
  const canvas=(page,options)=>{
    const clone=d.cloneNode(true);options.onclone(clone);
    assert.equal(clone.querySelector('.handover-reverse').style.display,'block');
    assert.equal(win.getComputedStyle(d.querySelector('.handover-reverse')).display,'none','capturing must not expose the reverse on screen');
    seen.push({side:page.dataset.side,sheet:page.dataset.sheet,scale:options.scale});
    return {width:3210,height:1800,toDataURL:type=>{assert.equal(type,'image/png');return 'data:image/png;base64,example';}};
  };
  win.jspdf={jsPDF:PDF};win.html2canvas=async(page,options)=>canvas(page,options);
  win.eval(d.querySelector('script').textContent);
  return {win,d,seen,instances,callbacks,out,canvas};
}

test('handover PDF requests short-edge duplex and actual size, retaining every front/reverse pair',async t=>{
  const f=fixture(t,60);
  const blob=await f.win.handoverPdf.build(),pdf=f.instances[0];
  assert.equal(blob.type,'application/pdf');
  assert.equal(pdf.version,'1.7');assert.equal(pdf.options.orientation,'landscape');
  assert.equal(pdf.preferences.Duplex,'DuplexFlipShortEdge');assert.equal(pdf.preferences.PrintScaling,'None');
  assert.equal(pdf.autoPrintOptions.variant,'javascript');
  const pages=[...f.d.querySelectorAll('#sheet > .handover-page')];
  assert.ok(pages.length>2);assert.equal(pdf.pages,pages.length);assert.equal(pdf.images.length,pages.length);
  assert.deepEqual(f.seen.map(x=>x.side),pages.map(page=>page.dataset.side));
  assert.ok(f.seen.every(x=>x.scale===3));
  for(const image of pdf.images){assert.equal(image[2],7);assert.equal(image[3],7);assert.equal(image[4],283);assert.ok(image[5]<=196);}
  assert.equal(f.d.documentElement.dataset.handoverReady,'1');
});

test('Print / PDF creates the PDF once while busy, then opens its preview',async t=>{
  const f=fixture(t);let release,started;
  const waiting=new Promise(resolve=>{started=resolve;});let first=true;
  f.win.html2canvas=async(page,options)=>{
    if(first){first=false;started();await new Promise(resolve=>{release=resolve;});}
    return f.canvas(page,options);
  };
  const job=f.win.handoverPdf.print();await waiting;
  assert.equal(f.d.getElementById('hv-pdf-button').disabled,true);
  await f.win.handoverPdf.print();assert.equal(f.instances.length,1);
  release();await job;
  assert.equal(f.win.location.hash,'#pdf-preview');
  assert.equal(f.seen.filter(x=>x.blob).length,1);assert.equal(f.d.getElementById('hv-basic-print').hidden,true);
});

test('a PDF preparation failure keeps the sheet and offers an explicit manual-settings fallback',async t=>{
  const f=fixture(t);
  f.win.html2canvas=async()=>{throw Error('Example conversion failure');};
  await f.win.handoverPdf.print();
  assert.match(f.d.getElementById('hv-pdf-status').textContent,/Example conversion failure.*select double-sided manually/);
  assert.equal(f.d.getElementById('hv-basic-print').hidden,false);
  assert.equal(f.d.getElementById('hv-pdf-button').disabled,false);
  assert.equal(f.d.querySelectorAll('.handover-page').length,2);assert.equal(f.win.location.hash,'');
  assert.equal(f.win.getComputedStyle(f.d.querySelector('.handover-reverse')).display,'none');
});

test('PDF creation rejects missing reverse pages and oversized captures instead of dropping data',async t=>{
  const f=fixture(t);f.d.querySelector('.handover-reverse').remove();
  await assert.rejects(f.win.handoverPdf.build(),/matching front and reverse/);assert.equal(f.instances.length,0);
  const g=fixture(t);
  g.win.html2canvas=async()=>({width:100,height:1000});
  await assert.rejects(g.win.handoverPdf.build(),/too large to print safely/);assert.equal(g.instances[0].images.length,0);
});

test('automatic printing uses the PDF route after layout, while saved sheets wait for their print button',t=>{
  const saved=fixture(t,3,false);assert.equal(saved.callbacks.length,0);
  assert.equal(saved.d.getElementById('hv-pdf-button').textContent,'Print / PDF');
  const live=fixture(t,3,true);let calls=0,native=0;
  live.win.handoverPdf.print=()=>{calls++;};live.win.print=()=>{native++;};
  assert.equal(live.callbacks.length,1);assert.equal(live.callbacks[0].ms,60);
  live.callbacks[0].fn();assert.equal(calls,1);assert.equal(native,0);
});
