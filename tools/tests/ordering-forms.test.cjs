// The two exported order forms reproduce the official MDH sheets and the email
// goes to the right recipients.
const test=require('node:test');
const assert=require('node:assert/strict');
const O=require('../../assets/ordering.js');

test('the catalogues match the official forms',()=>{
  assert.equal(O.PART1.length,21,'disposables list');
  assert.equal(O.PART2.length,92,'cleaning consumables list');
  assert.equal(O.PART1[0].code,'P2019');
  assert.equal(O.PART1[0].desc,'ALCOHOL WIPES');
  assert.equal(O.PART2[0].code,'10FOIL-005');
  // The form legitimately repeats some lines; they must be preserved, not merged.
  const aprons=O.PART2.filter(it=>it.code==='15APRON015');
  assert.ok(aprons.length>=2,'repeated apron lines kept');
});

test('Part 1 (disposables) exports with its header, items and office footer',()=>{
  const o=O.defaultOrder('2026-11-14');
  o.part1[0]='9';
  const aoa=O.buildPart1Aoa(o);
  const flat=aoa.map(r=>r.join('|'));
  assert.ok(flat.some(l=>l.includes('M.M.M.U. - IRO Top-Up System List, Disposables')),'title');
  const header=aoa.find(r=>r[0]==='EQ Number');
  assert.deepEqual(header,['EQ Number','Item Description','Top Up Quantity','Required','Supplied']);
  const first=aoa.find(r=>r[0]==='P2019');
  assert.equal(first[1],'ALCOHOL WIPES');
  assert.equal(first[2],2,'top-up as a number');
  assert.equal(first[3],9,'entered required quantity as a number');
  assert.ok(flat.some(l=>l.includes('For Office Use Only')),'office-use footer present');
});

test('Part 2 (cleaning) exports with its header block and six columns',()=>{
  const o=O.defaultOrder('2026-11-14');
  o.part2[2]='4';
  const aoa=O.buildPart2Aoa(o);
  const flat=aoa.map(r=>r.join('|'));
  assert.ok(flat.some(l=>l.startsWith('CLEANING CONSUMABLES ORDER LIST')),'title');
  assert.ok(flat.some(l=>l.includes('STOMA CARE CLINIC')),'ward line');
  const header=aoa.find(r=>r[0]==='SLH General Stores Stock Codes');
  assert.deepEqual(header,['SLH General Stores Stock Codes','STOCK ITEM DESCRIPTION','UNIT','QUOTA','DEMAND','SUPPLY']);
  const bags=aoa.find(r=>r[0]==='11BAGS-070');
  assert.equal(bags[4],4,'entered demand lands in the DEMAND column');
});

test('the email addresses and subject are correct',()=>{
  assert.equal(O.ORDER_TO,'disposablessupplies.mdh@gov.mt');
  assert.equal(O.ORDER_CC,'stomacare.mdh@gov.mt');
  const o=O.defaultOrder('2026-11-14');
  assert.match(O.mailSubject(o),/Weekly stores order/);
  assert.match(O.mailBody(o),/two files/);
  assert.match(O.mailBody(o),/attach the two Excel files/i);
});

test('the two attachments have distinct, dated filenames',()=>{
  const o=O.defaultOrder('2026-11-14');
  assert.notEqual(O.part1FileName(o),O.part2FileName(o));
  assert.match(O.part1FileName(o),/Disposables.*20261114\.xlsx$/);
  assert.match(O.part2FileName(o),/Cleaning.*20261114\.xlsx$/);
});
