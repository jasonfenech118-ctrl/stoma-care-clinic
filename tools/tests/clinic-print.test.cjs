const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM,VirtualConsole}=require('jsdom');
function setup(t){const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>{if(!/Could not parse CSS stylesheet/.test(e.message))throw e;});const dom=new JSDOM('<!doctype html><html><head><title>Ward report</title></head><body><h1>Ward report</h1><div id="clinical">Signed by Nurse A · 1 October 2026</div></body></html>',{runScripts:'outside-only',virtualConsole});t.after(()=>dom.window.close());dom.window.eval(fs.readFileSync(path.join(__dirname,'../../assets/clinic-print.js'),'utf8'));return dom.window;}
test('print metadata preserves the original heading and clinical sign-off and is installed only once',t=>{
 const w=setup(t),P=w.ClinicPrint;P.decorateDocument(w.document,{patientName:'Alex <Sample>',patientId:'DEMO-001',preparedBy:'Nurse A'});P.decorateDocument(w.document);
 assert.equal(w.document.querySelectorAll('[data-clinic-print]').length,1);assert.equal(w.document.querySelector('.cp-header,.cp-footer,.cp-patient'),null);
 assert.equal(w.document.querySelector('h1').textContent,'Ward report');assert.equal(w.document.getElementById('clinical').textContent,'Signed by Nurse A · 1 October 2026');
 assert.match(w.document.querySelector('[data-clinic-print]').textContent,/Generated.*Malta time/);assert.match(P.pageCSS(),/counter\(page\).*counter\(pages\)/);
});
test('long raster sheets cover all source pixels while reserving the footer on every PDF page',t=>{
 const w=setup(t),slices=[],images=[];w.HTMLCanvasElement.prototype.getContext=function(){return {drawImage:(...args)=>slices.push(args.slice(1))};};w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,test';
 const pdf={internal:{scaleFactor:1,pageSize:{getWidth:()=>600,getHeight:()=>800}},addPage(){this.pages=(this.pages||1)+1;},addImage(...args){images.push(args);}};
 w.ClinicPrint.addRasterPages(pdf,{width:568,height:2000});assert.equal(pdf.pages,3);assert.deepEqual(slices.map(s=>[s[1],s[3]]),[[0,750],[750,750],[1500,500]]);
 assert.ok(images.every(a=>a[2]===16&&a[3]===16&&a[5]<=750));assert.equal(slices.reduce((n,s)=>n+s[3],0),2000);
});
test('PDF page counts use the final count and respect millimetre units',t=>{
 const w=setup(t),text=[],pages=[],k=72/25.4;
 const pdf={internal:{scaleFactor:k,getNumberOfPages:()=>3,pageSize:{getWidth:()=>210,getHeight:()=>297}},setPage:n=>pages.push(n),setDrawColor(){},setLineWidth(){},line(){},setFont(){},setFontSize(){},setTextColor(){},getTextWidth:s=>s.length, text:(...a)=>text.push(a)};
 w.ClinicPrint.stampPdf(pdf,{preparedBy:'Nurse A',generated:'08 Oct 2026, 16:00'});assert.deepEqual(pages,[1,2,3]);assert.deepEqual(text.filter(t=>/^Page/.test(t[0])).map(t=>t[0]),['Page 1 of 3','Page 2 of 3','Page 3 of 3']);
 assert.ok(text.every(t=>t[2]>290&&t[2]<294));assert.ok(text.some(t=>/08 Oct 2026/.test(t[0])));
});
