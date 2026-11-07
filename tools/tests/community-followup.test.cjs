// Community (Comcare) follow-up: the auto-filled imaging-request email.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n}',i)+2);};
const ctx=vm.createContext({});
vm.runInContext(fn('comcareSubject')+fn('comcareImagingBody')+'\nthis.comcareSubject=comcareSubject;this.comcareImagingBody=comcareImagingBody;',ctx);
const pat={first_name:'Charlene',surname:'Tanti',id_card:'92188M',sex:'F'};

test('the subject is built from the patient name, surname and ID card',()=>{
  const s=ctx.comcareSubject(pat,'imaging feedback request');
  assert.match(s,/Charlene Tanti/);
  assert.match(s,/ID 92188M/);
  assert.match(s,/imaging feedback request/);
});

test('the imaging-request body is auto-filled with the patient and signer',()=>{
  const b=ctx.comcareImagingBody(pat,'Jason Fenech');
  assert.match(b,/Dear community nurses,/);
  assert.match(b,/request imaging feedback of this patient, Ms Charlene Tanti \(92188M\)/);
  assert.match(b,/Kindly provide images\./);
  assert.match(b,/Kind regards,\nJason Fenech\nStoma Team/);
});

test('without a signer the body still closes for the Stoma Team',()=>{
  const b=ctx.comcareImagingBody({first_name:'A',surname:'B'},'');
  assert.match(b,/this patient, A B\b/);
  assert.match(b,/Kind regards,\nStoma Team/);
});
