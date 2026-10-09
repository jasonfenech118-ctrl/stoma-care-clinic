// The daily handover is archived as its own self-contained HTML (text, a few KB)
// instead of a PNG. The same builder prints the sheet (auto-print) and saves it
// (no auto-print), so a saved day never prints itself when it is opened.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const block=html.slice(html.indexOf('function handoverSheetDocHTML('),html.indexOf('// Open the ward sheet in a new tab'));

function win(withTable=true){
  const dom=new JSDOM('<table id="hv-table"><tbody>'
    +(withTable?'<tr><td>SW5</td><td>1M</td><td><strong>Borg</strong></td><td>Mary</td><td class="capp">Salts XND1352</td><td></td><td></td></tr>':'')
    +'</tbody></table>',{runScripts:'outside-only'});
  const w=dom.window;
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent;}}); // jsdom has no innerText
  Object.assign(w,{htmlSafe:String,fmtLabel:d=>d,fmtShortDate:d=>d,TODAY:'2026-10-09',
    hvIsInfectionNote:()=>false,handoverManualFont:null,HANDOVER_FONT_PX:9,HANDOVER_ROWS_PER_PAGE:20});
  w.eval(block);
  return w;
}

test('a saved handover is a self-contained HTML document for that day',()=>{
  const w=win();
  const out=w.handoverSheetDocHTML({autoPrint:false});
  assert.match(out,/^<!DOCTYPE html>/);
  assert.match(out,/Inpatients Handover/);
  assert.match(out,/2026-10-09/);
  assert.match(out,/Salts XND1352/);      // the appliance text is baked in, not a picture
});

test('saving does not auto-print, but printing does',()=>{
  const w=win();
  assert.match(w.handoverSheetDocHTML({autoPrint:false}),/if\(false\)setTimeout\(function\(\)\{window\.focus\(\);window\.print\(\)/);
  assert.match(w.handoverSheetDocHTML({autoPrint:true}),/if\(true\)setTimeout\(function\(\)\{window\.focus\(\);window\.print\(\)/);
});

test('an empty handover yields nothing to save or print',()=>{
  const dom=new JSDOM('<div></div>',{runScripts:'outside-only'});
  const w=dom.window;Object.defineProperty(w.HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent;}});
  Object.assign(w,{htmlSafe:String,fmtLabel:d=>d,fmtShortDate:d=>d,TODAY:'2026-10-09',hvIsInfectionNote:()=>false,handoverManualFont:null,HANDOVER_FONT_PX:9,HANDOVER_ROWS_PER_PAGE:20});
  w.eval(block);
  assert.equal(w.handoverSheetDocHTML({autoPrint:false}),null);  // no #hv-table
});
