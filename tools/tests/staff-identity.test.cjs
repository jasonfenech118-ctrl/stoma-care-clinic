// Tracey Galea (roster core staff) is one person however she signs in or was
// recorded — a previous surname (Bartolo) or an email built from it all resolve
// to the one roster name, so her signatures, column and owner stay consistent.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const fn=name=>{const i=html.indexOf('function '+name+'(');const a=html.lastIndexOf('\n',i);return html.slice(a+1,html.indexOf('\n}',i)+2);};
const ctx={};
new Function('g',fn('canonicalStaffName')+';g.canonicalStaffName=canonicalStaffName;'+fn('normaliseFollowupOwner')+';g.normaliseFollowupOwner=normaliseFollowupOwner;')(ctx);

test('name variants for Tracey all resolve to the roster name Tracey Galea',()=>{
  for(const v of ['Tracey Galea','Tracey Bartolo','tracey bartolo','T Bartolo','Tgalea','tracey'])
    assert.equal(ctx.canonicalStaffName(v),'Tracey Galea',v);
});

test('other names are left untouched',()=>{
  for(const v of ['Jacqueline Sammut','Jason','Lorraine','Erika Psaila',''])
    assert.equal(ctx.canonicalStaffName(v),v,v);
});

test('the follow-up owner folds Tracey / Galea / Bartolo onto one owner',()=>{
  for(const v of ['Tracey','Tracey Galea','Tracey Bartolo','bartolo'])
    assert.equal(ctx.normaliseFollowupOwner(v),'Tracey',v);
  assert.equal(ctx.normaliseFollowupOwner('Jason'),'Jason');
  assert.equal(ctx.normaliseFollowupOwner('someone else'),'Common');
});
