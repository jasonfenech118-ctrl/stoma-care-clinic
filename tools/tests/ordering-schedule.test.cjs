// The weekly stores order schedule: due every Saturday after 06:30, and the
// reminder keeps firing until the week's order is marked sent.
const test=require('node:test');
const assert=require('node:assert/strict');
const O=require('../../assets/ordering.js');

test('the due Saturday follows the 06:30 cut-off',()=>{
  const at=s=>O.mostRecentDueSaturday(new Date(s));
  assert.equal(at('2026-11-14T06:30:00'),'2026-11-14','06:30 on Saturday is due that day');
  assert.equal(at('2026-11-14T07:00:00'),'2026-11-14','after 06:30 Saturday');
  assert.equal(at('2026-11-14T06:00:00'),'2026-11-07','before 06:30 Saturday → previous week');
  assert.equal(at('2026-11-15T10:00:00'),'2026-11-14','Sunday stays on this week’s Saturday');
  assert.equal(at('2026-11-18T10:00:00'),'2026-11-14','mid-week stays on this week’s Saturday');
  assert.equal(at('2026-11-13T23:59:00'),'2026-11-07','Friday night is still last Saturday');
});

test('addDays moves whole weeks correctly',()=>{
  assert.equal(O.addDays('2026-11-14',7),'2026-11-21');
  assert.equal(O.addDays('2026-11-14',-7),'2026-11-07');
});

test('a fresh order starts with every required/demand quantity blank',()=>{
  const o=O.defaultOrder('2026-11-14');
  assert.equal(o.week_ending,'2026-11-14');
  assert.equal(o.status,'draft');
  assert.equal(o.part1.length,O.PART1.length);
  assert.equal(o.part2.length,O.PART2.length);
  assert.ok(o.part1.every(v=>v===''),'disposables Required starts empty — the nurse adds amounts');
  assert.ok(o.part2.every(v=>v===''),'cleaning demand starts blank');
});

function dbReturning(row){
  return {from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:row,error:null})})})})};
}

test('the order is due (so the tab auto-opens) until it is marked sent',async()=>{
  O.init({db:dbReturning(null)});                       // nothing saved yet
  assert.equal(await O.isDue(),true,'due while unsent');

  O.init({db:dbReturning({week_ending:'2026-11-14',status:'sent'})});
  assert.equal(await O.isDue(),false,'not due once this week’s order is sent');
  O.init({db:null});
});

test('normaliseOrder keeps per-row quantities (duplicate codes are not merged)',()=>{
  // Part 2 has repeated codes (e.g. 15APRON015); storage is by row index.
  const o=O.defaultOrder('2026-11-14');
  o.part2=O.PART2.map((_,i)=>String(i));
  const n=O.normaliseOrder(o,'2026-11-14');
  assert.equal(n.part2.length,O.PART2.length);
  assert.equal(n.part2[86],'86','each row keeps its own quantity by index');
});
