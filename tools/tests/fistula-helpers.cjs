// The fistula helpers from index.html, for harnesses that run functions sliced
// out of the page: every patient list and the handover now ask whether a
// patient is a fistula patient. `let` becomes `var` so it also survives a
// window.eval() in jsdom.
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fnEnd=name=>html.indexOf('\n}',html.indexOf('function '+name+'('))+2;
const line=start=>{const i=html.indexOf(start);return html.slice(i,html.indexOf('\n',i));};
const core=html.slice(html.indexOf('function isFistulaPatient('),fnEnd('stomaPatientCount'));
const source=[core,line('function fistulaTagHTML('),line('const FISTULA_APPLIANCE_GROUP='),
  html.slice(html.indexOf('function onePieceGroupsFor('),fnEnd('onePieceGroupsFor'))].join('\n')
  .replace(/^let /gm,'var ').replace(/^const FISTULA_APPLIANCE_GROUP/m,'var FISTULA_APPLIANCE_GROUP');
module.exports={fistulaHelpers:source};
