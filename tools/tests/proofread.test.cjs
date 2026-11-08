// Proofread: the offline spelling / grammar / wording checker for clinical reviews.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../../assets/proofread.js'),'utf8');
// The module assigns window.Proofread and attaches a document click listener on load.
const win={};
const ctx=vm.createContext({window:win,document:{addEventListener(){},createElement:()=>({style:{},appendChild(){}}),body:{appendChild(){}}},alert(){}});
vm.runInContext(src,ctx);
const check=win.Proofread.check;
const find=(text,original,suggestion)=>check(text).find(i=>i.original===original&&i.suggestion===suggestion);

test('it fixes clinical and common misspellings, keeping capitalisation',()=>{
  assert.ok(find('The peristomial skin is red','peristomial','peristomal'));
  assert.ok(find('Recieved the patient','Recieved','Received'));
  assert.ok(find('colostmy reviewed','colostmy','colostomy'));
});

test('it flags repeated words and extra spaces',()=>{
  assert.ok(check('the the stoma').some(i=>i.type==='grammar'&&i.suggestion==='the'));
  assert.ok(check('stoma  is pink').some(i=>i.type==='mechanics'&&i.suggestion===' '));
});

test('it fixes spacing around punctuation',()=>{
  assert.ok(check('seen ,reviewed').some(i=>i.type==='mechanics'));      // space before comma
  assert.ok(find('pink,healthy','',undefined)===undefined);              // sanity: no empty match
  assert.ok(check('pink,healthy').some(i=>i.suggestion===', '));         // missing space after comma
  assert.ok(check('seen.The patient').some(i=>i.suggestion==='. T'));    // missing space after period (upper)
  assert.ok(check('protect.the area').some(i=>i.suggestion==='. T'));    // missing space after period (lower)
  assert.equal(check('see stomacare.mdh@gov.mt').some(i=>i.type==='mechanics'&&/\. /.test(i.suggestion)),false,'emails are left alone');
});

test('a / an is corrected by sound, leaving acronyms and u-words alone',()=>{
  assert.ok(find('There was an colostomy','an','a'));
  assert.ok(find('There was a erythema noted','a','an'));
  assert.equal(find('There was a urostomy formed','a','an'),undefined,'urostomy sounds like a consonant');
  assert.equal(check('Did a MRI scan').some(i=>i.original==='a'&&i.suggestion==='an'),false,'acronyms are left alone');
});

test('wordy phrases get meaning-preserving concision suggestions (type style)',()=>{
  const i=find('Reviewed in order to assess','in order to','to');
  assert.ok(i&&i.type==='style');
  assert.ok(find('utilised the convex flange','utilised','used'));
});

test('clean text yields no suggestions',()=>{
  // Compare length, not the array itself: check() returns a vm-realm Array, so a
  // cross-realm deepEqual against [] fails on prototype even when it is empty.
  assert.equal(check('The stoma is pink and healthy. The peristomal skin is intact.').length,0);
});
