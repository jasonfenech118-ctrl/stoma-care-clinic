'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const match=source.match(/const LOCALITY_FLAG_TITLES=Object\.freeze\((\{[\s\S]*?\})\);/);
if(!match)throw Error('Locality flag mapping is missing from index.html');
const flags=vm.runInNewContext('('+match[1]+')');

test('every licensed Malta and Gozo council flag has a local mapping',()=>{
  assert.equal(Object.keys(flags).length,67);
  assert.equal(flags.Kalkara,'Flag of Kalkara (2009-).svg');
  assert.equal(flags['Żebbuġ (Malta)'],'Flag of Zebbug, Malta.svg');
  assert.equal(flags['Żebbuġ (Gozo)'],'Flag of Żebbuġ, Gozo.svg');
  assert.equal(Object.hasOwn(flags,'Paola'),false);
});

test('the rendered flag keeps a source link and a Commons fallback',()=>{
  assert.match(source,/function localityFlagHTML\(/);
  assert.match(source,/assets\/locality-flags\//);
  assert.match(source,/Special:FilePath/);
  assert.match(source,/Flag unavailable/);
});
